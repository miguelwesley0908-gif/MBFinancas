import { useState, type FormEvent } from "react";
import { today, type Data, type Entry } from "../domain";

type EntryFormProps = {
  data: Data;
  editing?: Entry | null;
  fixedType?: Entry["type"];
  cardOnly?: boolean;
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
  fixedType,
  cardOnly = false,
  onSubmit,
  onCancel,
}: EntryFormProps) {
  const [type, setType] = useState<Entry["type"]>(
    fixedType ?? editing?.type ?? "expense",
  );
  const [account, setAccount] = useState(
    () =>
      editing?.account ??
      data.accounts.find((item) =>
        cardOnly ? item.type === "card" : item.type !== "card",
      )?.id ??
      data.accounts[0]?.id ??
      "",
  );
  const availableAccounts = data.accounts.filter((item) =>
    cardOnly
      ? item.type === "card"
      : type === "expense" || item.type !== "card",
  );
  const ordinaryAccounts = data.accounts.filter((item) => item.type !== "card");
  const canSubmit =
    availableAccounts.length > 0 &&
    (type !== "transfer" || ordinaryAccounts.length > 1);

  function changeType(nextType: Entry["type"]) {
    setType(nextType);
    setAccount(
      data.accounts.find((item) =>
        cardOnly ? item.type === "card" : item.type !== "card",
      )?.id ??
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
      {!canSubmit && (
        <p role="note" className="muted form-hint">
          {type === "transfer"
            ? "Adicione outra conta bancária ou dinheiro para transferir entre contas."
            : cardOnly
              ? "Cadastre um cartão antes de lançar uma compra no cartão."
              : "Cadastre uma conta bancária ou dinheiro antes de continuar."}
        </p>
      )}
      <form
        className="grid-form"
        onSubmit={(event) => onSubmit(event, type, account)}
        key={editing?.id ?? "new-entry"}
      >
        {!fixedType && (
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
        )}
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
          <button disabled={!canSubmit}>
            {editing ? "Salvar alterações" : "Salvar movimentação"}
          </button>
        </div>
      </form>
    </section>
  );
}
