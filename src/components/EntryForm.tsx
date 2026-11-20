import { useState, type FormEvent } from "react";
import {
  cents,
  today,
  uid,
  type Data,
  type Entry,
  type ManualInvoice,
} from "../domain";

type ExpenseMode = "account" | "card-purchase" | "card-invoice";
type EntryFormProps = {
  data: Data;
  editing?: Entry | null;
  invoice?: ManualInvoice | null;
  month: string;
  invoiceCardId?: string;
  fixedType?: Entry["type"];
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    type: Entry["type"],
    account: string,
  ) => void;
  onSaveInvoice: (invoice: ManualInvoice, repeat: boolean) => Promise<boolean>;
  onCancel: () => void;
  onError: (message: string) => void;
};

const entryTypes: { value: Entry["type"]; label: string }[] = [
  { value: "expense", label: "Despesa" },
  { value: "income", label: "Receita" },
  { value: "transfer", label: "Transferência" },
];

function dueDate(month: string, day: number) {
  const [year, value] = month.split("-").map(Number);
  return new Date(
    Date.UTC(
      year,
      value,
      Math.min(day, new Date(Date.UTC(year, value + 1, 0)).getUTCDate()),
    ),
  )
    .toISOString()
    .slice(0, 10);
}

export function EntryForm({
  data,
  editing,
  invoice,
  month,
  invoiceCardId,
  fixedType,
  onSubmit,
  onSaveInvoice,
  onCancel,
  onError,
}: EntryFormProps) {
  const initialMode: ExpenseMode = invoice || invoiceCardId
    ? "card-invoice"
    : editing?.type === "expense" &&
        data.accounts.find((item) => item.id === editing.account)?.type ===
          "card"
      ? "card-purchase"
      : "account";
  const [type, setType] = useState<Entry["type"]>(
    fixedType ?? editing?.type ?? "expense",
  );
  const [mode, setMode] = useState<ExpenseMode>(initialMode);
  const firstAccount = data.accounts.find((item) =>
    initialMode === "card-purchase" || initialMode === "card-invoice"
      ? item.type === "card"
      : item.type !== "card",
  );
  const [account, setAccount] = useState(
    invoice?.cardId ??
      invoiceCardId ??
      editing?.account ??
      firstAccount?.id ??
      data.accounts[0]?.id ??
      "",
  );
  const [competence, setCompetence] = useState(
    invoice?.competence ?? month,
  );
  const [dueDateValue, setDueDateValue] = useState(
    invoice?.dueDate ??
      dueDate(month, data.accounts.find((item) => item.id === (invoiceCardId ?? account))?.due ?? 15),
  );
  const cards = data.accounts.filter((item) => item.type === "card");
  const ordinaryAccounts = data.accounts.filter((item) => item.type !== "card");
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
    const nextAccount = data.accounts.find((item) =>
      nextMode === "account" ? item.type !== "card" : item.type === "card",
    );
    if (nextAccount) {
      setAccount(nextAccount.id);
      if (nextMode === "card-invoice")
        setDueDateValue(dueDate(competence, nextAccount.due));
    }
  }

  async function submitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      const next: ManualInvoice = {
        id: invoice?.id ?? uid(),
        cardId: account,
        competence: String(values.get("competence") ?? ""),
        total: cents(String(values.get("amount") ?? "")),
        dueDate: String(values.get("dueDate") ?? ""),
        recurrenceId: invoice?.recurrenceId ?? null,
      };
      if (!next.total) throw new Error("Informe um valor maior que zero.");
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(next.competence))
        throw new Error("Escolha o mês de referência da fatura.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(next.dueDate))
        throw new Error("Informe uma data de vencimento válida.");
      const repeat = !invoice && values.get("repeat") === "on";
      if (await onSaveInvoice(next, repeat)) onCancel();
    } catch (error) {
      onError((error as Error).message);
    }
  }

  if (!data.accounts.length) {
    return (
      <section className="panel modal-panel">
        <div className="section-title">
          <h2>{invoice ? "Editar fatura" : "Registrar despesa"}</h2>
          <button className="ghost" type="button" onClick={onCancel}>
            Fechar
          </button>
        </div>
        <p className="empty">Cadastre uma conta ou cartão antes de continuar.</p>
      </section>
    );
  }

  return (
    <section className="panel modal-panel">
      <div className="section-title">
        <div>
          <h2>
            {invoice
              ? "Editar despesa · fatura"
              : editing
                ? "Editar movimentação"
                : type === "expense"
                  ? "Registrar despesa"
                  : type === "income"
                    ? "Registrar receita"
                    : "Registrar transferência"}
          </h2>
          {type === "expense" && (
            <p className="muted">
              Escolha como quer lançar. Compras e faturas do cartão aparecem na
              mesma lista de despesas.
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
              ? "Cadastre um cartão antes de lançar compras ou faturas."
              : "Cadastre uma conta bancária ou dinheiro antes de continuar."}
        </p>
      )}
      <form
        className="grid-form"
        onSubmit={(event) =>
          type === "expense" && mode === "card-invoice"
            ? void submitInvoice(event)
            : onSubmit(event, type, account)
        }
        key={invoice?.id ?? editing?.id ?? "new-entry"}
      >
        {!fixedType && !invoice && (
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
        {type === "expense" && !invoice && !editing && (
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
                className={mode === "card-purchase" ? "choice active" : "choice"}
                aria-pressed={mode === "card-purchase"}
                onClick={() => changeMode("card-purchase")}
              >
                Compra no cartão
              </button>
              <button
                type="button"
                className={mode === "card-invoice" ? "choice active" : "choice"}
                aria-pressed={mode === "card-invoice"}
                onClick={() => changeMode("card-invoice")}
              >
                Fatura fechada
              </button>
            </div>
            {mode === "card-invoice" && (
              <small>
                Informe o total da fatura uma vez. Não lance também as compras
                individuais desse cartão e mês.
              </small>
            )}
          </fieldset>
        )}
        <label>
          {type === "expense" && mode === "card-invoice"
            ? "Valor total da fatura (R$)"
            : "Valor (R$)"}
          <input
            name="amount"
            type="number"
            step=".01"
            min=".01"
            required
            defaultValue={
              invoice
                ? invoice.total / 100
                : editing
                  ? editing.amount / 100
                  : undefined
            }
          />
        </label>
        {type === "expense" && mode === "card-invoice" ? (
          <>
            <label>
              Cartão
              <select
                required
                value={account}
                disabled={!!invoice}
                onChange={(event) => {
                  const id = event.target.value;
                  setAccount(id);
                  const selected = cards.find((item) => item.id === id);
                  if (selected) setDueDateValue(dueDate(competence, selected.due));
                }}
              >
                <option value="">Selecione o cartão</option>
                {cards.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mês da fatura
              <input
                name="competence"
                type="month"
                required
                value={competence}
                readOnly={!!invoice}
                onChange={(event) => {
                  const value = event.target.value;
                  setCompetence(value);
                  const selected = cards.find((item) => item.id === account);
                  if (selected && value)
                    setDueDateValue(dueDate(value, selected.due));
                }}
              />
            </label>
            <label>
              Vencimento
              <input
                name="dueDate"
                type="date"
                required
                value={dueDateValue}
                onChange={(event) => setDueDateValue(event.target.value)}
              />
            </label>
            {!invoice && (
              <label className="check-label">
                <input name="repeat" type="checkbox" />
                Criar previsão desse valor para os próximos meses
              </label>
            )}
            {invoice?.recurrenceId && (
              <p className="muted">
                Esta alteração vale apenas para este mês; as próximas previsões
                ficam como estão.
              </p>
            )}
          </>
        ) : (
          <>
            <label>
              {type === "income"
                ? "Recebido em"
                : type === "transfer"
                  ? "Transferido em"
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
                placeholder={type === "expense" ? "Ex.: mercado, aluguel…" : "Opcional"}
              />
            </label>
          </>
        )}
        <div className="form-actions">
          <button disabled={!canSubmit}>
            {invoice
              ? "Salvar alterações"
              : editing
                ? "Salvar alterações"
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
