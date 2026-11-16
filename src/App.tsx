import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import {
  initial,
  groups,
  money,
  today,
  uid,
  cents,
  schedule,
  balance,
  invoices,
  validate,
  type Data,
  type Entry,
  type Account,
  type Group,
} from "./domain";
import "./App.css";

const STORAGE = "mbfinancas.v1";
function localData() {
  try {
    const raw = localStorage.getItem(STORAGE);
    return raw ? validate(JSON.parse(raw)) : structuredClone(initial);
  } catch {
    return null;
  }
}
const labels = [
  "Visão geral",
  "Movimentações",
  "Contas e cartões",
  "Faturas",
  "Planejamento",
  "Configurações",
];
const field = (f: FormData, k: string) => String(f.get(k) ?? "");
function App() {
  const [data, setData] = useState<Data>(
    () => localData() ?? structuredClone(initial),
  );
  const [storageError, setStorageError] = useState(() => !localData());
  const [page, setPage] = useState("Visão geral");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [revision, setRevision] = useState(0);
  const [household, setHousehold] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [type, setType] = useState<Entry["type"]>("expense");
  const [account, setAccount] = useState("");
  const [search, setSearch] = useState("");
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
          setData(validate(row.data));
          setRevision(row.version);
          setHousehold(row.id);
          setLoadError(false);
        }
      } catch (e) {
        if (active) {
          setMessage((e as Error).message);
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
    if (!supabase || !household || busy || formOpen) return;
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
          setData(validate(row.data));
          setRevision(row.version);
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
  }, [household, revision, busy, formOpen]);
  useEffect(() => {
    if (supabase) return;
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE && e.newValue) {
        try {
          setData(validate(JSON.parse(e.newValue)));
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
      validate(next);
      if (supabase) {
        if (!household)
          throw new Error("A casa compartilhada ainda não foi carregada.");
        const { data: v, error } = await supabase.rpc("save_household", {
          p_id: household,
          p_version: revision,
          p_data: next,
        });
        if (error) throw error;
        setRevision(v);
      } else {
        if (storageError)
          throw new Error(
            "Há dados locais ilegíveis. Exporte o arquivo original antes de recuperar o armazenamento.",
          );
        localStorage.setItem(STORAGE, JSON.stringify(next));
      }
      setData(next);
      return true;
    } catch (e) {
      setMessage("Não foi possível salvar: " + (e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function auth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const email = field(f, "email");
      const password = field(f, "password");
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
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function openEntry(e?: Entry) {
    setEditing(e ?? null);
    setType(e?.type ?? "expense");
    setAccount(
      e?.account ??
        data.accounts.find((a) => a.type !== "card")?.id ??
        data.accounts[0]?.id ??
        "",
    );
    setFormOpen(true);
    setPage("Movimentações");
    setMessage("");
  }
  async function submitEntry(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const a = data.accounts.find((a) => a.id === account);
      if (!a) throw new Error("Cadastre uma conta antes do lançamento.");
      const amount = cents(field(f, "amount"));
      if (!amount) throw new Error("O valor deve ser maior que zero.");
      const date = field(f, "date");
      if (date > today())
        throw new Error(
          "Registre compras e recebimentos realizados. As parcelas futuras são calculadas automaticamente.",
        );
      const count =
        type === "expense" && a.type === "card"
          ? Number(field(f, "installments"))
          : 1;
      const originalSame =
        editing &&
        editing.account === account &&
        editing.amount === amount &&
        editing.date === date &&
        editing.installments === count;
      const entry: Entry = {
        id: editing?.id ?? uid(),
        type,
        amount,
        date,
        account,
        destination: field(f, "destination"),
        category: field(f, "category"),
        description: field(f, "description").trim(),
        installments: count,
        invoice: "",
        schedule:
          type === "expense" && a.type === "card"
            ? originalSame
              ? editing.schedule
              : schedule(amount, count, date, a)
            : [],
      };
      if (
        editing &&
        invoices(data).some(
          (i) =>
            i.paid > 0 &&
            editing.schedule.some(
              (p) => i.key === editing.account + "|" + p.date,
            ),
        )
      )
        throw new Error(
          "Remova primeiro os pagamentos das faturas vinculadas para alterar esta compra.",
        );
      if (
        await save({
          ...data,
          entries: [...data.entries.filter((x) => x.id !== entry.id), entry],
        })
      ) {
        setFormOpen(false);
        setEditing(null);
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function removeEntry(e: Entry) {
    if (
      invoices(data).some(
        (i) =>
          i.paid > 0 &&
          e.schedule.some((p) => i.key === e.account + "|" + p.date),
      )
    ) {
      setMessage("Exclua primeiro os pagamentos vinculados a essa compra.");
      return;
    }
    if (confirm("Excluir este lançamento?"))
      await save({
        ...data,
        entries: data.entries.filter((x) => x.id !== e.id),
      });
  }
  async function addAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      const type = field(f, "type") as Account["type"];
      const a: Account = {
        id: uid(),
        name: field(f, "name").trim(),
        type,
        opening: type === "card" ? 0 : cents(field(f, "opening")),
        closing: Number(field(f, "closing") || 1),
        due: Number(field(f, "due") || 1),
      };
      if (await save({ ...data, accounts: [...data.accounts, a] }))
        form.reset();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function payInvoice(e: FormEvent<HTMLFormElement>, key: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const invoice = invoices(data).find((i) => i.key === key)!;
    try {
      const amount = cents(field(f, "amount"));
      if (amount > invoice.total - invoice.paid)
        throw new Error("O pagamento excede o saldo da fatura.");
      const entry: Entry = {
        id: uid(),
        type: "transfer",
        amount,
        date: field(f, "date"),
        account: field(f, "source"),
        destination: invoice.card.id,
        category: "",
        description: "Pagamento de fatura • " + invoice.card.name,
        invoice: key,
        installments: 1,
        schedule: [],
      };
      if (entry.date > today())
        throw new Error("O pagamento deve ter uma data já ocorrida.");
      await save({ ...data, entries: [...data.entries, entry] });
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function exportBackup() {
    const raw =
      storageError && !supabase
        ? (localStorage.getItem(STORAGE) ?? "")
        : JSON.stringify(data, null, 2);
    const url = URL.createObjectURL(
      new Blob([raw], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "mb-financas-" + today() + ".json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const monthly = data.entries.filter((e) => e.date.startsWith(month));
  const expenses = monthly
    .filter((e) => e.type === "expense")
    .reduce((n, e) => n + e.amount, 0);
  const income = monthly
    .filter((e) => e.type === "income")
    .reduce((n, e) => n + e.amount, 0);
  const bills = invoices(data);
  const monthBills = bills.filter((i) => i.date.startsWith(month));
  const available = data.accounts
    .filter((a) => a.type !== "card")
    .reduce((n, a) => n + balance(data, a), 0);
  const filtered = monthly
    .filter((e) =>
      (
        e.description +
        " " +
        data.categories.find((c) => c.id === e.category)?.name
      )
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

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
    <div className="shell">
      <aside>
        <a
          className="brand"
          href="#inicio"
          onClick={() => setPage("Visão geral")}
        >
          mb<span>Finanças da casa</span>
        </a>
        <p className="eyebrow">NOSSO ESPAÇO</p>
        <nav>
          {labels.map((label, i) => (
            <button
              key={label}
              className={page === label ? "active" : ""}
              onClick={() => setPage(label)}
            >
              <span>{["◈", "↕", "▣", "▤", "◷", "⚙"][i]}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <strong>Orçamento do casal</strong>
          <small>
            {supabase ? "Conta compartilhada" : "Salvo neste navegador"}
          </small>
          {supabase && (
            <button
              className="ghost"
              onClick={() => void supabase!.auth.signOut()}
            >
              Sair da conta
            </button>
          )}
        </div>
      </aside>
      <main id="inicio">
        <header>
          <span className="eyebrow">MB FINANÇAS / {page.toUpperCase()}</span>
          <label className="month">
            Período
            <input
              aria-label="Mês de referência"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || today().slice(0, 7))}
            />
          </label>
        </header>
        {!supabase && (
          <div className="local-note">
            Uso local · Os dados ficam neste navegador. Para compartilhar entre
            dispositivos, configure a nuvem.{" "}
            <button
              className="text-button"
              onClick={() => setPage("Configurações")}
            >
              Ver opções
            </button>
          </div>
        )}
        {message && (
          <div role="status" className="notice">
            {message}
            <button aria-label="Fechar mensagem" onClick={() => setMessage("")}>
              ×
            </button>
          </div>
        )}
        {storageError && !supabase && (
          <div role="alert" className="notice">
            Não conseguimos ler o arquivo salvo. Exporte o original em
            Configurações para recuperá-lo. O salvamento está bloqueado para
            preservar os dados.
          </div>
        )}
        <div className="heading">
          <div>
            <p className="eyebrow">UM PASSO DE CADA VEZ</p>
            <h1>{page}</h1>
            <p>
              {page === "Visão geral"
                ? "Mais clareza para decidir juntos."
                : "Organizem os detalhes da vida financeira."}
            </p>
          </div>
          <button onClick={() => openEntry()} disabled={busy}>
            + Novo lançamento
          </button>
        </div>
        <fieldset disabled={busy} className="workspace">
          {page === "Visão geral" && (
            <>
              <section className="metrics">
                <article className="metric featured">
                  <span>Saldo em contas</span>
                  <strong>{money(available)}</strong>
                  <small>Saldo inicial + movimentações registradas</small>
                </article>
                <article className="metric">
                  <span>Receitas no mês</span>
                  <strong>{money(income)}</strong>
                  <small>Valores recebidos</small>
                </article>
                <article className="metric">
                  <span>Gastos no mês</span>
                  <strong>{money(expenses)}</strong>
                  <small>Compras integrais, incluindo cartão</small>
                </article>
                <article className="metric">
                  <span>Faturas a pagar no período</span>
                  <strong>
                    {money(
                      monthBills.reduce(
                        (s, i) => s + Math.max(0, i.total - i.paid),
                        0,
                      ),
                    )}
                  </strong>
                  <small>Compromissos de pagamento</small>
                </article>
              </section>
              <section className="columns">
                <article className="panel">
                  <div className="section-title">
                    <h2>Seu orçamento, em perspectiva</h2>
                    <button
                      className="text-button"
                      onClick={() => setPage("Planejamento")}
                    >
                      Ajustar renda →
                    </button>
                  </div>
                  {data.income === 0 ? (
                    <div className="empty">
                      <h3>Vamos dar contexto aos gastos?</h3>
                      <p>
                        Informe a renda líquida média do casal em Planejamento.
                      </p>
                    </div>
                  ) : (
                    Object.entries(groups).map(([key, g]) => {
                      const spent = monthly
                        .filter(
                          (e) =>
                            e.type === "expense" &&
                            data.categories.find((c) => c.id === e.category)
                              ?.group === key,
                        )
                        .reduce((s, e) => s + e.amount, 0);
                      const target = Math.round(data.income * g.ratio);
                      const ratio = target ? spent / target : 0;
                      return (
                        <div className="budget" key={key}>
                          <div>
                            <strong>{g.label}</strong>
                            <span>
                              {money(spent)} / {money(target)}
                            </span>
                          </div>
                          <progress
                            className={
                              ratio > 1
                                ? "danger"
                                : ratio >= 0.8
                                  ? "warning"
                                  : ""
                            }
                            value={Math.min(ratio, 1)}
                            max="1"
                          />
                          <small>
                            {ratio > 1
                              ? "Acima da referência mensal"
                              : ratio >= 0.8
                                ? "Atenção: perto da referência mensal"
                                : "Dentro da referência"}{" "}
                            · {Math.round(ratio * 100)}%
                          </small>
                        </div>
                      );
                    })
                  )}
                </article>
                <article className="panel">
                  <h2>Próximas faturas</h2>
                  <p className="muted">
                    Não somamos estas parcelas novamente aos gastos.
                  </p>
                  {bills
                    .filter((i) => i.total > i.paid)
                    .slice(0, 5)
                    .map((i) => (
                      <div className="row" key={i.key}>
                        <div>
                          <strong>{i.card.name}</strong>
                          <small>
                            Vence em {i.date.split("-").reverse().join("/")}
                          </small>
                        </div>
                        <strong>{money(i.total - i.paid)}</strong>
                      </div>
                    ))}
                  {!bills.some((i) => i.total > i.paid) && (
                    <div className="empty">Nenhuma fatura pendente.</div>
                  )}
                  <button className="ghost" onClick={() => setPage("Faturas")}>
                    Ver todas as faturas
                  </button>
                </article>
              </section>
              <article className="panel">
                <h2>Comece pelo que já conhece</h2>
                <p>
                  Cadastre as contas e o saldo inicial, informe a renda média e
                  registre a primeira movimentação.
                </p>
                <button
                  className="ghost"
                  onClick={() => setPage("Contas e cartões")}
                >
                  Organizar minhas contas →
                </button>
              </article>
            </>
          )}
          {page === "Movimentações" && (
            <>
              {formOpen && (
                <section className="panel">
                  <div className="section-title">
                    <h2>{editing ? "Editar lançamento" : "Novo lançamento"}</h2>
                    <button
                      className="ghost"
                      onClick={() => setFormOpen(false)}
                    >
                      Fechar
                    </button>
                  </div>
                  <form
                    className="grid-form"
                    onSubmit={submitEntry}
                    key={editing?.id ?? "new"}
                  >
                    <label>
                      Tipo
                      <select
                        value={type}
                        onChange={(e) => {
                          setType(e.target.value as Entry["type"]);
                          setAccount(
                            data.accounts.find((a) => a.type !== "card")?.id ??
                              "",
                          );
                        }}
                      >
                        <option value="expense">Despesa</option>
                        <option value="income">Receita</option>
                        <option value="transfer">
                          Transferência entre contas
                        </option>
                      </select>
                    </label>
                    <label>
                      Valor (R$)
                      <input
                        name="amount"
                        type="number"
                        step=".01"
                        min=".01"
                        required
                        defaultValue={
                          editing ? editing.amount / 100 : undefined
                        }
                      />
                    </label>
                    <label>
                      Data
                      <input
                        name="date"
                        type="date"
                        required
                        max={today()}
                        defaultValue={editing?.date ?? today()}
                      />
                    </label>
                    <label>
                      {type === "transfer"
                        ? "Conta de origem"
                        : "Conta ou cartão"}
                      <select
                        required
                        value={account}
                        onChange={(e) => setAccount(e.target.value)}
                      >
                        <option value="">Selecione</option>
                        {data.accounts
                          .filter(
                            (a) => type === "expense" || a.type !== "card",
                          )
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {type === "expense" && (
                      <label>
                        Categoria
                        <select
                          name="category"
                          required
                          defaultValue={
                            editing?.category ?? data.categories[0]?.id
                          }
                        >
                          {data.categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {type === "transfer" && (
                      <label>
                        Conta de destino
                        <select
                          required
                          name="destination"
                          defaultValue={editing?.destination ?? ""}
                        >
                          <option value="">Selecione</option>
                          {data.accounts
                            .filter(
                              (a) => a.id !== account && a.type !== "card",
                            )
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                        <small>Para pagar cartão, use a aba Faturas.</small>
                      </label>
                    )}
                    {type === "expense" &&
                      data.accounts.find((a) => a.id === account)?.type ===
                        "card" && (
                        <label>
                          Parcelas
                          <input
                            name="installments"
                            type="number"
                            min="1"
                            max="120"
                            required
                            defaultValue={editing?.installments ?? 1}
                          />
                        </label>
                      )}
                    <label>
                      Descrição opcional
                      <input
                        name="description"
                        maxLength={120}
                        defaultValue={editing?.description}
                      />
                    </label>
                    <div className="form-actions">
                      <button>Salvar lançamento</button>
                    </div>
                  </form>
                  {!data.accounts.length && (
                    <p className="notice">
                      Primeiro cadastre uma conta em “Contas e cartões”.
                    </p>
                  )}
                </section>
              )}
              <section className="panel">
                <label>
                  Buscar descrição ou categoria
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar movimentações…"
                  />
                </label>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Data / descrição</th>
                        <th>Conta</th>
                        <th>Categoria</th>
                        <th>Valor</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((e) => (
                        <tr key={e.id}>
                          <td>
                            <strong>
                              {e.description ||
                                {
                                  income: "Receita",
                                  expense: "Despesa",
                                  transfer: "Transferência",
                                }[e.type]}
                            </strong>
                            <small>
                              {e.date.split("-").reverse().join("/")}
                              {e.installments > 1
                                ? " · " + e.installments + " parcelas"
                                : ""}
                            </small>
                          </td>
                          <td>
                            {
                              data.accounts.find((a) => a.id === e.account)
                                ?.name
                            }
                          </td>
                          <td>
                            {data.categories.find((c) => c.id === e.category)
                              ?.name ?? "—"}
                          </td>
                          <td className={e.type === "income" ? "positive" : ""}>
                            {e.type === "income"
                              ? "+"
                              : e.type === "expense"
                                ? "−"
                                : "↔"}{" "}
                            {money(e.amount)}
                          </td>
                          <td>
                            <div className="actions">
                              {!e.invoice && (
                                <button
                                  className="ghost"
                                  onClick={() => openEntry(e)}
                                >
                                  Editar
                                </button>
                              )}
                              <button
                                className="ghost destructive"
                                onClick={() => void removeEntry(e)}
                              >
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!filtered.length && (
                  <div className="empty">
                    Nenhuma movimentação neste período.
                  </div>
                )}
              </section>
            </>
          )}
          {page === "Contas e cartões" && (
            <>
              <section className="account-grid">
                {data.accounts.map((a) => (
                  <article className="panel" key={a.id}>
                    <span className="eyebrow">
                      {a.type === "card"
                        ? "CARTÃO DE CRÉDITO"
                        : a.type === "cash"
                          ? "DINHEIRO"
                          : "CONTA BANCÁRIA"}
                    </span>
                    <h2>{a.name}</h2>
                    <strong className="account-value">
                      {money(
                        a.type === "card"
                          ? -balance(data, a)
                          : balance(data, a),
                      )}
                    </strong>
                    <small>
                      {a.type === "card"
                        ? "Dívida total · fecha dia " +
                          a.closing +
                          " · vence dia " +
                          a.due
                        : "Saldo atual"}
                    </small>
                    <button
                      className="ghost destructive"
                      onClick={() => {
                        if (
                          data.entries.some(
                            (e) => e.account === a.id || e.destination === a.id,
                          )
                        ) {
                          setMessage(
                            "Esta conta possui lançamentos e não pode ser excluída.",
                          );
                          return;
                        }
                        if (confirm("Excluir conta?"))
                          void save({
                            ...data,
                            accounts: data.accounts.filter(
                              (x) => x.id !== a.id,
                            ),
                          });
                      }}
                    >
                      Excluir conta
                    </button>
                  </article>
                ))}
              </section>
              <section className="panel">
                <h2>Cadastrar conta ou cartão</h2>
                <form className="grid-form" onSubmit={addAccount}>
                  <label>
                    Nome
                    <input
                      name="name"
                      required
                      maxLength={60}
                      placeholder="Ex.: Conta da casa"
                    />
                  </label>
                  <label>
                    Tipo
                    <select name="type">
                      <option value="bank">Conta bancária</option>
                      <option value="cash">Dinheiro</option>
                      <option value="card">Cartão de crédito</option>
                    </select>
                  </label>
                  <label>
                    Saldo inicial da conta (R$)
                    <input
                      name="opening"
                      type="number"
                      min="0"
                      step=".01"
                      defaultValue="0"
                    />
                    <small>
                      Cartões começam sem dívida. Registre as compras
                      existentes.
                    </small>
                  </label>
                  <label>
                    Dia de fechamento do cartão
                    <input
                      name="closing"
                      type="number"
                      min="1"
                      max="31"
                      defaultValue="1"
                    />
                  </label>
                  <label>
                    Dia de vencimento do cartão
                    <input
                      name="due"
                      type="number"
                      min="1"
                      max="31"
                      defaultValue="10"
                    />
                  </label>
                  <div className="form-actions">
                    <button>Cadastrar</button>
                  </div>
                </form>
              </section>
            </>
          )}
          {page === "Faturas" && (
            <>
              <p className="muted">
                Faturas com vencimento no mês selecionado. O gasto total da
                compra aparece na data da compra.
              </p>
              {monthBills.map((i) => (
                <article className="panel" key={i.key}>
                  <div className="section-title">
                    <div>
                      <h2>{i.card.name}</h2>
                      <small>
                        Vencimento: {i.date.split("-").reverse().join("/")}
                      </small>
                    </div>
                    <span
                      className={"badge " + (i.paid >= i.total ? "paid" : "")}
                    >
                      {i.paid >= i.total
                        ? "Paga"
                        : i.date < today()
                          ? "Vencida"
                          : "A pagar"}
                    </span>
                  </div>
                  <div className="invoice-numbers">
                    <p>
                      Total <strong>{money(i.total)}</strong>
                    </p>
                    <p>
                      Pago <strong>{money(i.paid)}</strong>
                    </p>
                    <p>
                      Restante{" "}
                      <strong>{money(Math.max(0, i.total - i.paid))}</strong>
                    </p>
                  </div>
                  {data.entries
                    .filter(
                      (e) =>
                        e.account === i.card.id &&
                        e.schedule.some((p) => p.date === i.date),
                    )
                    .map((e) => (
                      <div className="row" key={e.id}>
                        <span>
                          {e.description ||
                            data.categories.find((c) => c.id === e.category)
                              ?.name}{" "}
                          <small>
                            Parcela{" "}
                            {e.schedule.findIndex((p) => p.date === i.date) + 1}
                            /{e.installments}
                          </small>
                        </span>
                        <strong>
                          {money(
                            e.schedule.find((p) => p.date === i.date)!.amount,
                          )}
                        </strong>
                      </div>
                    ))}
                  {i.paid < i.total && (
                    <form
                      className="grid-form"
                      onSubmit={(e) => void payInvoice(e, i.key)}
                    >
                      <label>
                        Pagar com
                        <select name="source" required>
                          <option value="">Selecione a conta</option>
                          {data.accounts
                            .filter((a) => a.type !== "card")
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Valor (R$)
                        <input
                          key={i.paid}
                          name="amount"
                          required
                          type="number"
                          min=".01"
                          step=".01"
                          max={(i.total - i.paid) / 100}
                          defaultValue={(i.total - i.paid) / 100}
                        />
                      </label>
                      <label>
                        Data do pagamento
                        <input
                          name="date"
                          type="date"
                          required
                          max={today()}
                          defaultValue={today()}
                        />
                      </label>
                      <div className="form-actions">
                        <button>Registrar pagamento</button>
                      </div>
                    </form>
                  )}
                </article>
              ))}
              {!monthBills.length && (
                <section className="panel empty">
                  Nenhuma fatura prevista para este mês. Selecione outro período
                  ou registre uma compra no cartão.
                </section>
              )}
            </>
          )}
          {page === "Planejamento" && (
            <>
              <section className="panel">
                <h2>Renda líquida média do casal</h2>
                <p>
                  Informe o valor médio recebido por mês, depois dos descontos.
                  Essa média orienta os valores de referência.
                </p>
                <form
                  className="inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await save({
                        ...data,
                        income: cents(
                          field(new FormData(e.currentTarget), "income"),
                        ),
                      });
                    } catch (e) {
                      setMessage((e as Error).message);
                    }
                  }}
                >
                  <label>
                    Renda média (R$)
                    <input
                      name="income"
                      required
                      type="number"
                      step=".01"
                      min="0"
                      defaultValue={data.income / 100}
                      key={data.income}
                    />
                  </label>
                  <button>Salvar renda</button>
                </form>
                <div className="metrics">
                  {Object.entries(groups).map(([key, g]) => (
                    <article className="metric" key={key}>
                      <span>
                        {g.ratio * 100}% · {g.label}
                      </span>
                      <strong>
                        {money(Math.round(data.income * g.ratio))}
                      </strong>
                    </article>
                  ))}
                </div>
              </section>
              <section className="panel">
                <h2>Categorias do casal</h2>
                {data.categories.map((c) => (
                  <div className="row" key={c.id}>
                    <span>
                      <strong>{c.name}</strong>
                      <small>{groups[c.group].label}</small>
                    </span>
                    <button
                      className="ghost destructive"
                      onClick={() => {
                        if (data.entries.some((e) => e.category === c.id)) {
                          setMessage(
                            "Categoria em uso. Preserve os lançamentos antes de excluí-la.",
                          );
                          return;
                        }
                        void save({
                          ...data,
                          categories: data.categories.filter(
                            (x) => x.id !== c.id,
                          ),
                        });
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                ))}
                <form
                  className="grid-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const f = new FormData(form);
                    if (
                      await save({
                        ...data,
                        categories: [
                          ...data.categories,
                          {
                            id: uid(),
                            name: field(f, "name").trim(),
                            group: field(f, "group") as Group,
                          },
                        ],
                      })
                    )
                      form.reset();
                  }}
                >
                  <label>
                    Nova categoria
                    <input name="name" required maxLength={60} />
                  </label>
                  <label>
                    Grupo
                    <select name="group">
                      {Object.entries(groups).map(([key, g]) => (
                        <option value={key} key={key}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-actions">
                    <button>Adicionar categoria</button>
                  </div>
                </form>
              </section>
            </>
          )}
          {page === "Configurações" && (
            <>
              <section className="panel">
                <h2>
                  {supabase
                    ? "Casa compartilhada"
                    : "Seus dados neste navegador"}
                </h2>
                <p>
                  {supabase
                    ? "As alterações são atualizadas entre os membros da casa."
                    : "O app funciona localmente. Exporte cópias de segurança: limpar os dados do navegador também remove seus registros."}
                </p>
                {supabase ? (
                  <form
                    className="inline-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      try {
                        const { error } = await supabase!.functions.invoke(
                          "invite-member",
                          {
                            body: {
                              email: field(
                                new FormData(e.currentTarget),
                                "email",
                              ),
                              householdId: household,
                            },
                          },
                        );
                        if (error) throw error;
                        setMessage("Convite enviado por e-mail.");
                      } catch (e) {
                        setMessage(
                          "Não foi possível enviar: " + (e as Error).message,
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <label>
                      E-mail da pessoa convidada
                      <input name="email" type="email" required />
                    </label>
                    <button>Enviar convite</button>
                  </form>
                ) : (
                  <p className="muted">
                    Para ativar login e compartilhamento, siga as instruções em
                    README.md e configure o projeto Supabase próprio do MB
                    Finanças.
                  </p>
                )}
              </section>
              <section className="panel">
                <h2>Cópias de segurança</h2>
                <p>
                  O arquivo contém suas informações financeiras. Guarde-o em um
                  lugar privado.
                </p>
                <div className="actions">
                  <button onClick={exportBackup}>Exportar dados</button>
                  <label className="file-input">
                    Restaurar arquivo
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          if (file.size > 5_000_000)
                            throw new Error("Arquivo muito grande.");
                          const next = validate(JSON.parse(await file.text()));
                          if (
                            confirm(
                              "Substituir todos os dados atuais pelos dados deste arquivo?",
                            )
                          ) {
                            if (storageError && !supabase) {
                              localStorage.setItem(
                                STORAGE,
                                JSON.stringify(next),
                              );
                              setData(next);
                              setStorageError(false);
                            } else await save(next);
                          }
                        } catch (e) {
                          setMessage((e as Error).message);
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </section>
            </>
          )}
        </fieldset>
        <footer>
          MB Finanças · Construindo tranquilidade, juntos.
          {busy ? " Salvando…" : ""}
        </footer>
      </main>
    </div>
  );
}
export default App;
