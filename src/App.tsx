import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { initial, validate, upgradeData, type Data } from "./domain";
import { FinanceHome } from "./FinanceHome";
import "./App.css";

const STORAGE = "mbfinancas.v1";
function readLocalData(): { data: Data; error: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE);
    return {
      data: raw
        ? upgradeData(validate(JSON.parse(raw)))
        : structuredClone(initial),
      error: false,
    };
  } catch {
    return { data: structuredClone(initial), error: true };
  }
}
const field = (form: FormData, name: string) => String(form.get(name) ?? "");

function App() {
  const [local] = useState(readLocalData);
  const [data, setData] = useState<Data>(local.data);
  const [storageError, setStorageError] = useState(local.error);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [revision, setRevision] = useState(0);
  const [household, setHousehold] = useState("");
  const [authMode, setAuthMode] = useState<
    "login" | "signup" | "reset" | "password"
  >("login");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let knownUser: string | null | undefined;
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, next) => {
        if (!active) return;
        if (event === "PASSWORD_RECOVERY") setAuthMode("password");
        const userId = next?.user.id ?? null;
        if (knownUser === userId) return;
        knownUser = userId;
        setSession(next);
        setHousehold("");
        setLoading(!!next);
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    const client = supabase;
    let active = true;
    async function boot() {
      try {
        const token = new URLSearchParams(location.search).get("invite");
        if (token) {
          const { error } = await client.rpc("accept_invitation", {
            p_token: token,
          });
          if (error) throw error;
          history.replaceState({}, "", location.pathname);
        }
        const { data: row, error } = await client.rpc("bootstrap_household", {
          p_initial: initial,
        });
        if (error) throw error;
        if (active) {
          setData(upgradeData(validate(row.data)));
          setRevision(row.version);
          setHousehold(row.id);
          setLoadError(false);
        }
      } catch (error) {
        if (active) {
          setMessage((error as Error).message);
          setLoadError(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void boot();
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!supabase || !household || busy) return;
    const client = supabase;
    let active = true;
    async function refresh() {
      const { data: row, error } = await client
        .from("households")
        .select("data,version")
        .eq("id", household)
        .single();
      if (active && error)
        setMessage(
          "Não foi possível atualizar os dados compartilhados: " +
            error.message,
        );
      if (active && row && row.version !== revision) {
        try {
          setData(upgradeData(validate(row.data)));
          setRevision(row.version);
          setMessage("Os dados da casa foram atualizados.");
        } catch {
          setMessage("Os dados da nuvem são incompatíveis.");
        }
      }
    }
    const timer = setInterval(() => void refresh(), 15000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [household, revision, busy]);

  useEffect(() => {
    if (supabase) return;
    const handler = (event: StorageEvent) => {
      if (event.key === STORAGE && event.newValue) {
        try {
          setData(upgradeData(validate(JSON.parse(event.newValue))));
        } catch {
          setMessage("Outra aba gravou dados inválidos.");
        }
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  async function save(next: Data) {
    setBusy(true);
    setMessage("");
    try {
      const normalized = upgradeData(validate(next));
      if (supabase) {
        if (!household)
          throw new Error("A casa compartilhada ainda não foi carregada.");
        const { data: version, error } = await supabase.rpc("save_household", {
          p_id: household,
          p_version: revision,
          p_data: normalized,
        });
        if (error) {
          const { data: latest, error: refreshError } = await supabase
            .from("households")
            .select("data,version")
            .eq("id", household)
            .single();
          if (!refreshError && latest && latest.version !== revision) {
            setData(upgradeData(validate(latest.data)));
            setRevision(latest.version);
            setMessage(
              "Os dados foram atualizados por outra pessoa. Confira e salve novamente.",
            );
            return false;
          }
          throw error;
        }
        setRevision(version);
      } else {
        if (storageError)
          throw new Error(
            "Há dados locais ilegíveis. Exporte o arquivo original antes de recuperar o armazenamento.",
          );
        localStorage.setItem(STORAGE, JSON.stringify(normalized));
      }
      setData(normalized);
      return true;
    } catch (error) {
      setMessage("Não foi possível salvar: " + (error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function restore(next: Data) {
    if (storageError && !supabase) {
      try {
        const normalized = upgradeData(validate(next));
        localStorage.setItem(STORAGE, JSON.stringify(normalized));
        setData(normalized);
        setStorageError(false);
        setMessage("Cópia de segurança restaurada.");
        return true;
      } catch (error) {
        setMessage("Não foi possível restaurar: " + (error as Error).message);
        return false;
      }
    }
    return save(next);
  }

  async function inviteMember(email: string) {
    if (!supabase || !household)
      throw new Error("A casa compartilhada ainda não foi carregada.");
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("invite-member", {
        body: { email, householdId: household },
      });
      if (error) {
        let message = error.message;
        const context = (error as { context?: unknown }).context;
        if (context instanceof Response) {
          const body = (await context.clone().json().catch(() => null)) as
            | { error?: unknown }
            | null;
          if (typeof body?.error === "string") message = body.error;
        }
        throw new Error(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function auth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const email = field(values, "email");
      const password = field(values, "password");
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              location.origin + location.pathname + location.search,
          },
        });
        if (error) throw error;
        setMessage(
          "Cadastro enviado. Confira seu e-mail para confirmar o acesso.",
        );
      } else if (authMode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + location.pathname,
        });
        if (error) throw error;
        setMessage(
          "Se o endereço estiver cadastrado, você receberá um link de recuperação.",
        );
      } else if (authMode === "password") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setAuthMode("login");
        setMessage("Senha atualizada.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <main className="auth-shell">
        <div className="panel">
          <h1>MB Finanças</h1>
          <p>Carregando sua casa…</p>
        </div>
      </main>
    );
  if (supabase && (!session || authMode === "password"))
    return (
      <main className="auth-shell">
        <section className="panel auth">
          <div className="brand">
            mb<span>Finanças da casa</span>
          </div>
          <h1>
            {authMode === "signup"
              ? "Criar conta"
              : authMode === "reset"
                ? "Recuperar acesso"
                : authMode === "password"
                  ? "Definir nova senha"
                  : "Bem-vindos de volta"}
          </h1>
          <p>Um lugar para cuidar das finanças de vocês.</p>
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          <form onSubmit={auth}>
            {authMode !== "password" && (
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
            )}
            {authMode !== "reset" && (
              <label>
                Senha
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                  minLength={8}
                  required
                />
              </label>
            )}
            <button disabled={busy}>
              {busy
                ? "Aguarde…"
                : authMode === "login"
                  ? "Entrar"
                  : "Continuar"}
            </button>
          </form>
          <div className="actions">
            <button
              className="ghost"
              onClick={() =>
                setAuthMode(authMode === "login" ? "signup" : "login")
              }
            >
              {authMode === "login" ? "Criar conta" : "Voltar ao login"}
            </button>
            <button className="ghost" onClick={() => setAuthMode("reset")}>
              Esqueci a senha
            </button>
          </div>
        </section>
      </main>
    );
  if (loadError)
    return (
      <main className="auth-shell">
        <section className="panel">
          <h1>Não foi possível abrir sua casa</h1>
          <p role="alert">{message}</p>
          <button onClick={() => location.reload()}>Tentar novamente</button>
          <button onClick={() => void supabase?.auth.signOut()}>Sair</button>
        </section>
      </main>
    );

  return (
    <FinanceHome
      data={data}
      save={save}
      restore={restore}
      busy={busy}
      message={message}
      setMessage={setMessage}
      shared={!!supabase}
      storageError={storageError}
      onInvite={supabase ? inviteMember : undefined}
      onSignOut={supabase ? () => void supabase!.auth.signOut() : undefined}
    />
  );
}

export default App;
