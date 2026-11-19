import { useState, type FormEvent } from "react";
import { today, type Data, type Entry } from "../domain";

type EntryFormProps = {
  data: Data;
  editing?: Entry | null;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    type: Entry["type"],
    account: string,
  ) => void;
  onCancel: () => void;
};

const entryTypes: { value: Entry["type"]; label: string }[] = [
  { value: "expense", label: "Gastei" },
  { value: "income", label: "Recebi" },
  { value: "transfer", label: "Transferi" },
];

export function EntryForm({
  data,
  editing,
  onSubmit,
  onCancel,
}: EntryFormProps) {
  const [type, setType] = useState<Entry["type"]>(editing?.type ?? "expense");
  const [account, setAccount] = useState(
    () =>
      editing?.account ??
      data.accounts.find((item) => item.type !== "card")?.id ??
      data.accounts[0]?.id ??
      "",
  );
  const availableAccounts = data.accounts.filter(
    (item) => type === "expense" || item.type !== "card",
  );

  function changeType(nextType: Entry["type"]) {
    setType(nextType);
    setAccount(
      data.accounts.find((item) => item.type !== "card")?.id ??
        data.accounts[0]?.id ??
        "",
    );
  }

  return (
    <section className="panel">
      <div className="section-title">
        <h2>{editing ? "Editar movimentação" : "Nova movimentação"}</h2>
        <button className="ghost" type="button" onClick={onCancel}>
          Fechar
        </button>
      </div>
      <form
        className="grid-form"
        onSubmit={(event) => onSubmit(event, type, account)}
        key={editing?.id ?? "new-entry"}
      >
        <fieldset className="entry-type-choice">
          <legend>O que aconteceu?</legend>
          <div className="choice-buttons">
            {entryTypes.map((item) => (
              <button
                key={item.value}
                type="button"
                className={type === item.value ? "choice active" : "choice"}
                aria-pressed={type === item.value}
                onClick={() => changeType(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          Valor (R$)
          <input
            name="amount"
            type="number"
            step=".01"
            min=".01"
            required
            defaultValue={editing ? editing.amount / 100 : undefined}
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
          {type === "income"
            ? "Entrou em"
            : type === "transfer"
              ? "Saiu de"
              : "Conta ou cartão"}
          <select
            required
            value={account}
            onChange={(event) => setAccount(event.target.value)}
          >
            <option value="">Selecione</option>
            {availableAccounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {type === "expense" && (
          <label>
            Tipo de gasto
            <select
              name="category"
              required
              defaultValue={editing?.category ?? ""}
            >
              <option value="">Selecione</option>
              {data.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {type === "transfer" && (
          <label>
            Entrou em
            <select
              required
              name="destination"
              defaultValue={editing?.destination ?? ""}
            >
              <option value="">Selecione</option>
              {data.accounts
                .filter((item) => item.id !== account && item.type !== "card")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {type === "expense" &&
          data.accounts.find((item) => item.id === account)?.type ===
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
          Descrição (opcional)
          <input
            name="description"
            maxLength={120}
            autoComplete="off"
            defaultValue={editing?.description}
          />
        </label>
        <div className="form-actions">
          <button>
            {editing ? "Salvar alterações" : "Salvar movimentação"}
          </button>
        </div>
      </form>
    </section>
  );
}
