import { useState, type FormEvent } from "react";
import {
  today,
  type Data,
  type Entry,
} from "../domain";

type ExpenseMode = "account" | "card-purchase";
type EntryFormProps = {
  data: Data;
  editing?: Entry | null;
  invoiceCardId?: string;
  startAsCardPurchase?: boolean;
  fixedType?: Entry["type"];
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    type: Entry["type"],
    account: string,
  ) => void;
  onCancel: () => void;
};

const entryTypes: { value: Entry["type"]; label: string }[] = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
  { value: "transfer", label: "Transferência" },
];

export function EntryForm({
  data,
  editing,
  invoiceCardId,
  startAsCardPurchase = false,
  fixedType,
  onSubmit,
  onCancel,
}: EntryFormProps) {
  const initialMode: ExpenseMode =
    startAsCardPurchase || invoiceCardId ||
    (editing?.type === "expense" &&
      data.accounts.find((item) => item.id === editing.account)?.type === "card")
      ? "card-purchase"
      : "account";
  const [type, setType] = useState<Entry["type"]>(
    fixedType ?? editing?.type ?? "expense",
  );
  const [mode, setMode] = useState<ExpenseMode>(initialMode);
  const selectableAccounts = data.accounts.filter(
    (item) =>
      !item.archived ||
      item.id === invoiceCardId ||
      item.id === editing?.account ||
      item.id === editing?.destination,
  );
  const firstAccount = selectableAccounts.find((item) =>
    initialMode === "card-purchase"
      ? item.type === "card"
      : item.type !== "card",
  );
  const [account, setAccount] = useState(
    invoiceCardId ||
      editing?.account ||
      firstAccount?.id ||
      selectableAccounts[0]?.id ||
      "",
  );
  const cards = selectableAccounts.filter((item) => item.type === "card");
  const ordinaryAccounts = selectableAccounts.filter(
    (item) => item.type !== "card",
  );
  const availableAccounts =
    type === "expense"
      ? mode === "account"
        ? ordinaryAccounts
        : cards
      : ordinaryAccounts;
  const canSubmit =
    availableAccounts.some((item) => item.id === account) &&
    (type !== "transfer" || ordinaryAccounts.length > 1);

  function changeType(nextType: Entry["type"]) {
    setType(nextType);
    if (nextType === "expense") {
      setMode("account");
      setAccount(ordinaryAccounts[0]?.id ?? cards[0]?.id ?? "");
    } else {
      setAccount(ordinaryAccounts[0]?.id ?? "");
    }
  }

  function changeMode(nextMode: ExpenseMode) {
    setMode(nextMode);
    const nextAccount = selectableAccounts.find((item) =>
      nextMode === "account" ? item.type !== "card" : item.type === "card",
    );
    if (nextAccount) {
      setAccount(nextAccount.id);
    }
  }

  if (!data.accounts.length) {
    return (
      <section className="panel modal-panel">
        <div className="section-title">
          <h2>{startAsCardPurchase ? "Adicionar compra à fatura" : "Registrar despesa"}</h2>
          <button className="ghost" type="button" onClick={onCancel}>
            Fechar
          </button>
        </div>
        <p className="empty">
          {startAsCardPurchase
            ? "Cadastre um cartão em Contas e cartões antes de continuar."
            : "Cadastre uma conta bancária ou cartão antes de continuar."}
        </p>
      </section>
    );
  }

  return (
    <section className="panel modal-panel">
      <div className="section-title">
        <div>
          <h2>
            {editing
                ? "Editar movimentação"
                : startAsCardPurchase
                  ? "Adicionar compra à fatura"
                  : type === "expense"
                    ? "Registrar despesa"
                    : type === "income"
                      ? "Registrar receita"
                      : "Registrar transferência"}
          </h2>
          {type === "expense" && (
            <p className="muted">
              {startAsCardPurchase
                  ? "A compra fica vinculada a este cartão. As parcelas entram nos vencimentos calculados automaticamente."
                  : "Escolha como quer lançar. Compras no cartão somam automaticamente na fatura."}
            </p>
          )}
        </div>
        <button className="ghost" type="button" onClick={onCancel}>
          Fechar
        </button>
      </div>
      {!canSubmit && (
        <p role="note" className="muted form-hint">
          {type === "transfer"
            ? "Adicione outra conta bancária ou dinheiro para transferir entre contas."
            : mode !== "account"
              ? cards.length
                ? "Selecione um cartão para continuar."
                : "Cadastre um cartão antes de lançar compras."
              : "Cadastre uma conta bancária ou dinheiro antes de continuar."}
        </p>
      )}
      <form
        className="grid-form"
        onSubmit={(event) => onSubmit(event, type, account)}
        key={editing?.id ?? "new-entry"}
      >
        {!fixedType && !startAsCardPurchase && (
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
        {type === "expense" &&
          !editing &&
          !startAsCardPurchase && (
          <fieldset className="entry-type-choice expense-mode-choice">
            <legend>Como quer lançar esta despesa?</legend>
            <div className="choice-buttons">
              <button
                type="button"
                className={mode === "account" ? "choice active" : "choice"}
                aria-pressed={mode === "account"}
                onClick={() => changeMode("account")}
              >
                Conta ou dinheiro
              </button>
              <button
                type="button"
                className={
                  mode === "card-purchase" ? "choice active" : "choice"
                }
                aria-pressed={mode === "card-purchase"}
                onClick={() => changeMode("card-purchase")}
              >
                Compra no cartão
              </button>
            </div>
          </fieldset>
        )}
        <label>
          {type === "expense" && mode === "card-purchase"
              ? "Valor a parcelar (R$)"
              : "Valor (R$)"}
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
        {type === "expense" && mode === "card-purchase" && (
          <small className="form-hint">
            Se a compra já começou, informe apenas o valor das parcelas que
            faltam. Cada parcela soma na fatura do seu vencimento.
          </small>
        )}
        <>
            <label>
              {type === "income"
                ? "Recebido em"
                : type === "transfer"
                  ? "Transferido em"
                  : mode === "card-purchase"
                    ? "Data da compra"
                    : "Data da despesa"}
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
                disabled={startAsCardPurchase && !!invoiceCardId}
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
                Categoria
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
                  {ordinaryAccounts
                    .filter((item) => item.id !== account)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {type === "expense" && mode === "card-purchase" && (
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
              Descrição
              <input
                name="description"
                maxLength={120}
                autoComplete="off"
                defaultValue={editing?.description}
                placeholder={
                  type === "expense" ? "Ex.: mercado, aluguel…" : "Opcional"
                }
              />
            </label>
        </>
        <div className="form-actions">
          <button disabled={!canSubmit}>
            {editing
                ? "Salvar alterações"
                : startAsCardPurchase
                  ? "Salvar compra"
                  : type === "expense"
                    ? "Salvar despesa"
                    : type === "income"
                      ? "Salvar receita"
                      : "Salvar transferência"}
          </button>
        </div>
      </form>
    </section>
  );
}
