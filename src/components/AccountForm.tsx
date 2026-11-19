import { useState, type FormEvent } from "react";
import { cents, uid, type Account } from "../domain";

type AccountFormProps = {
  account?: Account;
  typeLocked?: boolean;
  onSave: (account: Account) => Promise<boolean>;
  onCancel?: () => void;
  onError: (message: string) => void;
};

const accountTypeNames: Record<Account["type"], string> = {
  bank: "Conta bancária",
  cash: "Dinheiro",
  card: "Cartão de crédito",
};

export function AccountForm({
  account,
  typeLocked = false,
  onSave,
  onCancel,
  onError,
}: AccountFormProps) {
  const [type, setType] = useState<Account["type"]>(account?.type ?? "bank");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    if (!name) {
      onError("Informe o nome da conta ou do cartão.");
      return;
    }
    try {
      const selectedType = typeLocked && account ? account.type : type;
      const saved = await onSave({
        id: account?.id ?? uid(),
        name,
        type: selectedType,
        opening:
          selectedType === "card"
            ? 0
            : cents(String(values.get("opening") ?? "")),
        closing:
          selectedType === "card"
            ? Number(values.get("closing"))
            : account?.type === "card"
              ? 1
              : (account?.closing ?? 1),
        due:
          selectedType === "card"
            ? Number(values.get("due"))
            : account?.type === "card"
              ? 1
              : (account?.due ?? 1),
      });
      if (saved && !account) {
        form.reset();
        setType("bank");
      }
    } catch (error) {
      onError((error as Error).message);
    }
  }

  return (
    <section className="panel">
      <div className="section-title">
        <h2>
          {account
            ? "Editar conta"
            : type === "card"
              ? "Cadastrar cartão"
              : "Cadastrar conta"}
        </h2>
        {onCancel && (
          <button className="ghost" type="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
      <form
        className="grid-form"
        onSubmit={(event) => void submit(event)}
        key={account?.id ?? "new-account"}
      >
        <label>
          Nome
          <input
            name="name"
            required
            maxLength={60}
            autoComplete="off"
            defaultValue={account?.name}
          />
        </label>
        <label>
          Tipo
          <select
            name="type"
            value={type}
            disabled={typeLocked}
            onChange={(event) => setType(event.target.value as Account["type"])}
          >
            {Object.entries(accountTypeNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {type === "card" ? (
          <>
            <label>
              Fechamento da fatura (dia)
              <input
                name="closing"
                type="number"
                min="1"
                max="31"
                required
                defaultValue={account?.type === "card" ? account.closing : ""}
              />
            </label>
            <label>
              Vencimento da fatura (dia)
              <input
                name="due"
                type="number"
                min="1"
                max="31"
                required
                defaultValue={account?.type === "card" ? account.due : ""}
              />
            </label>
          </>
        ) : (
          <label>
            Saldo ao começar (R$)
            <input
              name="opening"
              type="number"
              min="0"
              step=".01"
              required
              defaultValue={account ? account.opening / 100 : ""}
            />
          </label>
        )}
        <div className="form-actions">
          <button>{account ? "Salvar alterações" : "Cadastrar"}</button>
        </div>
      </form>
    </section>
  );
}
