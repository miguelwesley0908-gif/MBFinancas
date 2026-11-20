import type { ChangeEvent, FormEvent } from "react";
import {
  balance,
  groups,
  money,
  today,
  type Account,
  type Data,
  type Entry,
  type ExpenseOccurrence,
  type ExpenseRecurrence,
  type InvoiceRecurrence,
  type InvoiceView,
  type ManualInvoice,
} from "../domain";

export type MovementRow =
  | { kind: "entry"; date: string; entry: Entry }
  | { kind: "invoice"; date: string; invoice: InvoiceView }
  | {
      kind: "occurrence";
      date: string;
      occurrence: ExpenseOccurrence;
      recurrence: ExpenseRecurrence;
    };

const dateLabel = (value: string) => value.split("-").reverse().join("/");

type MovementsProps = {
  data: Data;
  rows: MovementRow[];
  search: string;
  filterType: string;
  filterCategory: string;
  filterAccount: string;
  onSearch: (value: string) => void;
  onFilterType: (value: string) => void;
  onFilterCategory: (value: string) => void;
  onFilterAccount: (value: string) => void;
  onEditEntry: (entry: Entry) => void;
  onEditInvoice: (invoice: ManualInvoice) => void;
  onDeleteInvoice: (invoice: ManualInvoice) => void;
  onPayInvoice: (
    event: FormEvent<HTMLFormElement>,
    invoice: InvoiceView,
  ) => void;
  onConfirmForecast: (invoice: InvoiceView) => void;
  onRemoveEntry: (entry: Entry) => void;
  onMarkOccurrence: (
    occurrence: ExpenseOccurrence,
    recurrence: ExpenseRecurrence,
  ) => void;
  onEditOccurrence: (
    occurrence: ExpenseOccurrence,
    recurrence: ExpenseRecurrence,
  ) => void;
  onOccurrenceAction: (
    occurrence: ExpenseOccurrence,
    recurrence: ExpenseRecurrence,
    action: "skip" | "restore",
  ) => void;
};

export function MovementsSection({
  data,
  rows,
  search,
  filterType,
  filterCategory,
  filterAccount,
  onSearch,
  onFilterType,
  onFilterCategory,
  onFilterAccount,
  onEditEntry,
  onEditInvoice,
  onDeleteInvoice,
  onPayInvoice,
  onConfirmForecast,
  onRemoveEntry,
  onMarkOccurrence,
  onEditOccurrence,
  onOccurrenceAction,
}: MovementsProps) {
  return (
    <section id="movements" className="panel section-panel">
      <div className="section-title">
        <div>
          <h2>Movimentações e despesas</h2>
          <small>
            Despesas, receitas, pagamentos e faturas em uma única lista.
          </small>
        </div>
        <span className="count-label">{rows.length}</span>
      </div>
      <div className="filters">
        <label className="search-field">
          Buscar
          <input
            aria-label="Buscar movimentações"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Descrição ou categoria"
          />
        </label>
        <label>
          Tipo
          <select
            aria-label="Filtrar por tipo"
            value={filterType}
            onChange={(event) => onFilterType(event.target.value)}
          >
            <option value="">Todos</option>
            <option value="income">Receita</option>
            <option value="expense">Despesa</option>
            <option value="transfer">Transferência</option>
          </select>
        </label>
        <label>
          Categoria
          <select
            aria-label="Filtrar por categoria"
            value={filterCategory}
            onChange={(event) => onFilterCategory(event.target.value)}
          >
            <option value="">Todas</option>
            {data.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Conta ou cartão
          <select
            aria-label="Filtrar por conta"
            value={filterAccount}
            onChange={(event) => onFilterAccount(event.target.value)}
          >
            <option value="">Todos</option>
            {data.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="compact-list">
        {rows.map((row) =>
          row.kind === "invoice" ? (
            <article className="list-row invoice-list-row" key={row.invoice.key}>
              <div className="list-main">
                <span
                  className={`list-icon ${row.invoice.source === "forecast" ? "forecast" : "card-icon"}`}
                >
                  ▤
                </span>
                <div>
                  <strong>
                    {row.invoice.source === "forecast"
                      ? `Previsão · ${row.invoice.card.name}`
                      : `Fatura · ${row.invoice.card.name}`}
                  </strong>
                  <small>
                    {row.invoice.competence} · vence {dateLabel(row.invoice.date)}
                    {row.invoice.source === "purchase"
                      ? " · resumo das compras no cartão"
                      : row.invoice.source === "manual"
                        ? " · total informado"
                        : " · valor previsto"}
                  </small>
                </div>
              </div>
              <div className="row-value">
                <span>{money(row.invoice.total)}</span>
                <small>
                  {row.invoice.source === "forecast"
                    ? "Previsão"
                    : `Em aberto: ${money(Math.max(0, row.invoice.total - row.invoice.paid))}`}
                </small>
              </div>
              <div className="invoice-actions">
                {row.invoice.source === "forecast" ? (
                  <button
                    className="ghost compact-button"
                    onClick={() => onConfirmForecast(row.invoice)}
                  >
                    Informar valor real
                  </button>
                ) : row.invoice.paid >= row.invoice.total ? (
                  <span className="badge paid">Paga</span>
                ) : (
                  <details className="pay-details">
                    <summary>Pagar fatura</summary>
                    <form
                      className="payment-form"
                      onSubmit={(event) => onPayInvoice(event, row.invoice)}
                    >
                      <label>
                        Conta usada
                        <select name="source" required defaultValue="">
                          <option value="" disabled>
                            Selecione
                          </option>
                          {data.accounts
                            .filter((account) => account.type !== "card")
                            .map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Valor pago (R$)
                        <input
                          name="amount"
                          type="number"
                          min=".01"
                          step=".01"
                          max={Math.max(0, row.invoice.total - row.invoice.paid) / 100}
                          defaultValue={Math.max(0, row.invoice.total - row.invoice.paid) / 100}
                          required
                        />
                      </label>
                      <label>
                        Data do pagamento
                        <input
                          name="date"
                          type="date"
                          max={today()}
                          defaultValue={today()}
                          required
                        />
                      </label>
                      <button>Registrar pagamento</button>
                    </form>
                  </details>
                )}
                {row.invoice.source === "manual" && (
                  <>
                    {data.manualInvoices
                      .filter((item) => item.id === row.invoice.invoiceId)
                      .map((record) => (
                        <button
                          key={record.id}
                          className="ghost compact-button"
                          onClick={() => onEditInvoice(record)}
                        >
                          Editar
                        </button>
                      ))}
                    {row.invoice.paid === 0 && (
                      <button
                        className="ghost compact-button destructive"
                        onClick={() => {
                          const record = data.manualInvoices.find(
                            (item) => item.id === row.invoice.invoiceId,
                          );
                          if (record) onDeleteInvoice(record);
                        }}
                      >
                        Excluir
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          ) : row.kind === "entry" ? (
            <article className="list-row" key={row.entry.id}>
              <div className="list-main">
                <span className={`list-icon ${row.entry.type}`}>
                  {row.entry.type === "income"
                    ? "↑"
                    : row.entry.type === "transfer"
                      ? "↔"
                      : "↓"}
                </span>
                <div>
                  <strong>
                    {row.entry.description ||
                      {
                        income: "Receita",
                        expense: "Despesa",
                        transfer: "Transferência",
                      }[row.entry.type]}
                  </strong>
                  <small>
                    {data.categories.find(
                      (category) => category.id === row.entry.category,
                    )?.name ??
                      (row.entry.type === "transfer"
                        ? "Transferência entre contas"
                        : "Sem categoria")}{" "}
                    · {dateLabel(row.entry.date)} ·{" "}
                    {data.accounts.find(
                      (account) => account.id === row.entry.account,
                    )?.name ?? "Conta removida"}
                  </small>
                </div>
              </div>
              <div
                className={`row-value ${row.entry.type === "income" ? "positive" : ""}`}
              >
                <span>
                  {row.entry.type === "income"
                    ? "+"
                    : row.entry.type === "expense"
                      ? "−"
                      : "↔"}{" "}
                  {money(row.entry.amount)}
                </span>
                {row.entry.recurrenceId && (
                  <span className="badge paid">Paga</span>
                )}
              </div>
              <details className="row-menu">
                <summary aria-label="Ações da movimentação">•••</summary>
                <div>
                  {!row.entry.invoice && (
                    <button onClick={() => onEditEntry(row.entry)}>
                      Editar
                    </button>
                  )}
                  <button
                    className="destructive"
                    onClick={() => onRemoveEntry(row.entry)}
                  >
                    Excluir
                  </button>
                </div>
              </details>
            </article>
          ) : (
            <article
              className="list-row forecast-row"
              key={row.occurrence.recurrenceId + row.occurrence.occurrenceDate}
            >
              <div className="list-main">
                <span className="list-icon forecast">◷</span>
                <div>
                  <strong>{row.occurrence.description}</strong>
                  <small>
                    {
                      data.categories.find(
                        (category) => category.id === row.occurrence.category,
                      )?.name
                    }{" "}
                    · vence {dateLabel(row.occurrence.date)} ·{" "}
                    {
                      data.accounts.find(
                        (account) => account.id === row.occurrence.account,
                      )?.name
                    }{" "}
                    · previsão
                  </small>
                </div>
              </div>
              <div className="row-value">{money(row.occurrence.amount)}</div>
              <div className="occurrence-actions">
                {row.occurrence.status === "paid" ? (
                  <span className="badge paid">Confirmada</span>
                ) : row.occurrence.status === "skipped" ? (
                  <>
                    <span className="badge">Ignorada</span>
                    <button
                      className="small-action"
                      onClick={() =>
                        onOccurrenceAction(
                          row.occurrence,
                          row.recurrence,
                          "restore",
                        )
                      }
                    >
                      Restaurar
                    </button>
                  </>
                ) : (
                  <>
                    {row.occurrence.date < today() && (
                      <span className="badge late">Atrasada</span>
                    )}
                    <button
                      className="small-action"
                      onClick={() =>
                        onMarkOccurrence(row.occurrence, row.recurrence)
                      }
                    >
                      Marcar paga
                    </button>
                    <details className="row-menu">
                      <summary aria-label="Ações da previsão">•••</summary>
                      <div>
                        <button
                          onClick={() =>
                            onEditOccurrence(row.occurrence, row.recurrence)
                          }
                        >
                          Editar ocorrência
                        </button>
                        <button
                          onClick={() =>
                            onOccurrenceAction(
                              row.occurrence,
                              row.recurrence,
                              "skip",
                            )
                          }
                        >
                          Pular este mês
                        </button>
                      </div>
                    </details>
                  </>
                )}
              </div>
            </article>
          ),
        )}
        {!rows.length && (
          <div className="empty">
            Nenhuma movimentação neste mês. Use “+ Adicionar” para registrar uma
            entrada ou saída.
          </div>
        )}
      </div>
    </section>
  );
}

type AccountsProps = {
  data: Data;
  onAddAccount: () => void;
  onEditAccount: (account: Account) => void;
  onDeleteAccount: (account: Account) => void;
};

export function AccountsSection({
  data,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
}: AccountsProps) {
  return (
    <section id="accounts" className="panel section-panel">
      <div className="section-title">
        <div>
          <h2>Contas e cartões</h2>
          <small>Saldo disponível por conta e cartão.</small>
        </div>
        <button className="text-button" onClick={onAddAccount}>
          + Conta
        </button>
      </div>
      <div className="compact-list">
        {data.accounts.map((account) => (
          <article className="account-row" key={account.id}>
            <span
              className={`list-icon ${account.type === "card" ? "card-icon" : "account-icon"}`}
            >
              {account.type === "card" ? "▣" : "▤"}
            </span>
            <div className="account-info">
              <strong>{account.name}</strong>
              <small>
                {account.type === "card"
                  ? `Fecha dia ${account.closing} · vence dia ${account.due}`
                  : account.type === "cash"
                    ? "Dinheiro"
                    : "Conta bancária"}
              </small>
            </div>
            <strong className="account-balance">
              {money(
                account.type === "card"
                  ? -balance(data, account)
                  : balance(data, account),
              )}
            </strong>
            <div className="actions">
              <button
                className="ghost compact-button"
                onClick={() => onEditAccount(account)}
              >
                Editar
              </button>
              <button
                className="ghost compact-button destructive"
                onClick={() => onDeleteAccount(account)}
              >
                Excluir
              </button>
            </div>
          </article>
        ))}
        {!data.accounts.length && (
          <div className="empty">
            Cadastre uma conta bancária ou cartão para começar.
          </div>
        )}
      </div>
    </section>
  );
}

type InvoicesProps = {
  data: Data;
  month: string;
  bills: InvoiceView[];
  onAddInvoice: () => void;
  onEditInvoice: (invoice: ManualInvoice) => void;
  onDeleteInvoice: (invoice: ManualInvoice) => void;
  onPayInvoice: (
    event: FormEvent<HTMLFormElement>,
    invoice: InvoiceView,
  ) => void;
  onConfirmForecast: (invoice: InvoiceView) => void;
};

export function InvoicesSection({
  data,
  month,
  bills,
  onAddInvoice,
  onEditInvoice,
  onDeleteInvoice,
  onPayInvoice,
  onConfirmForecast,
}: InvoicesProps) {
  return (
    <section className="panel section-panel">
      <div className="section-title">
        <div>
          <h2>Faturas de {month}</h2>
          <small>
            O valor confirmado é a referência. Previsões não alteram o saldo.
          </small>
        </div>
        <button className="text-button" onClick={onAddInvoice}>
          + Fatura
        </button>
      </div>
      <div className="compact-list">
        {bills.map((invoice) => {
          const remaining = Math.max(0, invoice.total - invoice.paid);
          const status =
            invoice.source === "forecast"
              ? "Prevista"
              : invoice.paid >= invoice.total
                ? "Paga"
                : invoice.date < today()
                  ? "Atrasada"
                  : "Aberta";
          const record =
            invoice.source === "manual"
              ? data.manualInvoices.find(
                  (item) => item.id === invoice.invoiceId,
                )
              : undefined;
          return (
            <article className="invoice-row" key={invoice.key}>
              <div className="invoice-heading">
                <span
                  className={`list-icon ${invoice.source === "forecast" ? "forecast" : "card-icon"}`}
                >
                  ▤
                </span>
                <div>
                  <strong>{invoice.card.name}</strong>
                  <small>
                    {invoice.competence} · vence {dateLabel(invoice.date)}
                    {invoice.source === "forecast"
                      ? " · valor previsto"
                      : invoice.source === "purchase"
                        ? " · compras parceladas"
                        : " · valor informado"}
                  </small>
                </div>
              </div>
              <strong className="account-balance">
                {money(invoice.total)}
              </strong>
              <span
                className={`badge ${status === "Paga" ? "paid" : status === "Atrasada" ? "late" : status === "Prevista" ? "forecast-badge" : ""}`}
              >
                {status}
              </span>
              {invoice.source === "manual" && (
                <div className="invoice-actions">
                  <small>
                    Pago {money(invoice.paid)} · resta {money(remaining)}
                  </small>
                  {record && (
                    <button
                      className="ghost compact-button"
                      onClick={() => onEditInvoice(record)}
                    >
                      Editar
                    </button>
                  )}
                  {remaining > 0 && (
                    <details className="pay-details">
                      <summary>Pagar</summary>
                      <form
                        className="payment-form"
                        onSubmit={(event) => onPayInvoice(event, invoice)}
                      >
                        <label>
                          Conta
                          <select name="source" required defaultValue="">
                            <option value="" disabled>
                              Selecione
                            </option>
                            {data.accounts
                              .filter((account) => account.type !== "card")
                              .map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Valor (R$)
                          <input
                            name="amount"
                            type="number"
                            min=".01"
                            step=".01"
                            max={remaining / 100}
                            defaultValue={remaining / 100}
                            required
                          />
                        </label>
                        <label>
                          Pago em
                          <input
                            name="date"
                            type="date"
                            max={today()}
                            defaultValue={today()}
                            required
                          />
                        </label>
                        <button>Registrar pagamento</button>
                      </form>
                    </details>
                  )}
                  {record && invoice.paid === 0 && (
                    <button
                      className="text-button destructive"
                      onClick={() => onDeleteInvoice(record)}
                    >
                      Excluir
                    </button>
                  )}
                </div>
              )}
              {invoice.source === "forecast" && (
                <button
                  className="ghost compact-button"
                  onClick={() => onConfirmForecast(invoice)}
                >
                  Informar total
                </button>
              )}
            </article>
          );
        })}
        {!bills.length && (
          <div className="empty">Nenhuma fatura ou previsão para este mês.</div>
        )}
      </div>
    </section>
  );
}

type PlanningProps = {
  data: Data;
  month: string;
  onNewRecurrence: () => void;
  onEditRecurrence: (recurrence: ExpenseRecurrence) => void;
  onRecurrenceAction: (
    recurrence: ExpenseRecurrence,
    action: "pause" | "resume" | "end" | "delete",
  ) => void;
  onInvoicePlanAction: (
    plan: InvoiceRecurrence,
    action: "pause" | "resume" | "end",
  ) => void;
};

export function PlanningSection({
  data,
  month,
  onNewRecurrence,
  onEditRecurrence,
  onRecurrenceAction,
  onInvoicePlanAction,
}: PlanningProps) {
  return (
    <details id="planning" className="panel planning-panel">
      <summary>
        <span>
          <strong>Planejamento</strong>
          <small>Despesas recorrentes, previsões dos cartões e orçamento</small>
        </span>
        <span aria-hidden="true">＋</span>
      </summary>
      <div className="planning-content">
        <div className="section-title">
          <div>
            <h3>Despesas recorrentes</h3>
            <small>Previsões até a data final ou até cancelar.</small>
          </div>
          <button className="text-button" onClick={onNewRecurrence}>
            + Recorrência
          </button>
        </div>
        {data.recurrences.map((recurrence) => (
          <div className="planning-row" key={recurrence.id}>
            <div>
              <strong>{recurrence.description}</strong>
              <small>
                {money(recurrence.amount)} ·{" "}
                {recurrence.frequency === "weekly"
                  ? "semanal"
                  : recurrence.frequency === "yearly"
                    ? "anual"
                    : "mensal"} ·{" "}
                {data.accounts.find(
                  (account) => account.id === recurrence.account,
                )?.name} ·{" "}
                {recurrence.status === "active"
                  ? "Ativa"
                  : recurrence.status === "paused"
                    ? "Pausada"
                    : "Encerrada"}
              </small>
            </div>
            <div className="actions">
              <button
                className="ghost compact-button"
                onClick={() => onEditRecurrence(recurrence)}
              >
                Editar
              </button>
              {recurrence.status !== "ended" && (
                <button
                  className="ghost compact-button"
                  onClick={() =>
                    onRecurrenceAction(
                      recurrence,
                      recurrence.status === "paused" ? "resume" : "pause",
                    )
                  }
                >
                  {recurrence.status === "paused" ? "Reativar" : "Pausar"}
                </button>
              )}
              {recurrence.status === "active" && (
                <button
                  className="ghost compact-button"
                  onClick={() => onRecurrenceAction(recurrence, "end")}
                >
                  Encerrar
                </button>
              )}
              <button
                className="ghost compact-button destructive"
                onClick={() => onRecurrenceAction(recurrence, "delete")}
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
        {!data.recurrences.length && (
          <p className="empty">Nenhuma despesa recorrente cadastrada.</p>
        )}
        <h3>Orçamento mensal</h3>
        {data.income > 0 ? (
          <div className="budget-inline">
            {Object.entries(groups).map(([key, group]) => {
              const target = Math.round(data.income * group.ratio);
              const spent = data.entries
                .filter(
                  (entry) =>
                    entry.type === "expense" &&
                    data.categories.find(
                      (category) => category.id === entry.category,
                    )?.group === key,
                )
                .reduce((sum, entry) => {
                  const account = data.accounts.find(
                    (item) => item.id === entry.account,
                  );
                  if (account?.type === "card")
                    return (
                      sum +
                      entry.schedule
                        .filter((part) => part.date.startsWith(month))
                        .reduce((subtotal, part) => subtotal + part.amount, 0)
                    );
                  return sum + (entry.date.startsWith(month) ? entry.amount : 0);
                }, 0);
              return (
                <div key={key}>
                  <span>{group.label}</span>
                  <strong>
                    {money(spent)} / {money(target)}
                  </strong>
                  <progress
                    value={Math.min(target ? spent / target : 0, 1)}
                    max="1"
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">
            Defina sua renda mensal nas configurações para ver as referências de
            orçamento.
          </p>
        )}
        <div className="planning-bottom">
          <strong>Previsões dos cartões</strong>
          {data.invoiceRecurrences.map((plan) => (
            <div className="planning-row" key={plan.id}>
              <span>
                {data.accounts.find((account) => account.id === plan.cardId)
                  ?.name} · {money(plan.amount)} · desde {plan.startMonth} ·{" "}
                {plan.status === "active"
                  ? "Ativa"
                  : plan.status === "paused"
                    ? "Pausada"
                    : "Encerrada"}
              </span>
              <div className="actions">
                {plan.status !== "ended" && (
                  <button
                    className="ghost compact-button"
                    onClick={() =>
                      onInvoicePlanAction(
                        plan,
                        plan.status === "active" ? "pause" : "resume",
                      )
                    }
                  >
                    {plan.status === "active" ? "Pausar" : "Reativar"}
                  </button>
                )}
                {plan.status === "active" && (
                  <button
                    className="ghost compact-button"
                    onClick={() => onInvoicePlanAction(plan, "end")}
                  >
                    Encerrar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

type SettingsProps = {
  data: Data;
  shared: boolean;
  busy: boolean;
  onSaveIncome: (value: string) => void;
  onAddCategory: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteCategory: (id: string) => void;
  onExport: () => void;
  onRestoreFile: (file: File) => Promise<void>;
  onInvite?: (email: string) => Promise<void>;
  onSignOut?: () => void;
  onMessage: (message: string) => void;
};

const builtInCategoryIds = new Set([
  "housing",
  "food",
  "transport",
  "health",
  "home-bills",
  "dining",
  "leisure",
  "shopping",
  "subscriptions",
  "savings",
]);

export function SettingsSection({
  data,
  shared,
  busy,
  onSaveIncome,
  onAddCategory,
  onDeleteCategory,
  onExport,
  onRestoreFile,
  onInvite,
  onSignOut,
  onMessage,
}: SettingsProps) {
  const handleRestore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("Arquivo muito grande.");
      await onRestoreFile(file);
    } catch (error) {
      onMessage((error as Error).message);
    }
    event.target.value = "";
  };
  return (
    <details id="settings" className="panel settings-panel">
      <summary>
        <span>
          <strong>Configurações e orçamento</strong>
          <small>Renda, categorias, cópias de segurança e compartilhamento</small>
        </span>
        <span aria-hidden="true">＋</span>
      </summary>
      <div className="settings-content">
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            onSaveIncome(String(values.get("income") ?? ""));
          }}
        >
          <label>
            Renda mensal prevista (R$)
            <input
              name="income"
              type="number"
              min="0"
              step=".01"
              defaultValue={data.income / 100}
              key={data.income}
            />
          </label>
          <button>Salvar renda</button>
        </form>
        <h3>Categorias</h3>
        <div className="compact-list category-rows">
          {data.categories.map((category) => (
            <div className="planning-row" key={category.id}>
              <span>
                {category.name}
                <small>{groups[category.group].label}</small>
              </span>
              {!builtInCategoryIds.has(category.id) && (
                <button
                  className="ghost compact-button destructive"
                  onClick={() => onDeleteCategory(category.id)}
                >
                  Excluir
                </button>
              )}
            </div>
          ))}
        </div>
        <form
          className="inline-form category-form"
          onSubmit={onAddCategory}
        >
          <label>
            Nova categoria
            <input name="name" required maxLength={60} />
          </label>
          <label>
            Grupo
            <select name="group">
              {Object.entries(groups).map(([key, group]) => (
                <option key={key} value={key}>
                  {group.label}
                </option>
              ))}
            </select>
          </label>
          <button>Adicionar categoria</button>
        </form>
        {shared && onInvite && (
          <form
            className="inline-form invite-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              try {
                const values = new FormData(form);
                await onInvite(String(values.get("email") ?? ""));
                form.reset();
                onMessage("Convite enviado por e-mail.");
              } catch (error) {
                onMessage(
                  "Não foi possível enviar o convite: " +
                    (error as Error).message,
                );
              }
            }}
          >
            <label>
              E-mail da pessoa convidada
              <input name="email" type="email" required />
            </label>
            <button disabled={busy}>Enviar convite</button>
          </form>
        )}
        <div className="settings-actions">
          <button className="ghost" onClick={onExport}>
            Exportar cópia de segurança
          </button>
          <label className="file-input">
            Restaurar arquivo
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => void handleRestore(event)}
            />
          </label>
          {shared && onSignOut && (
            <button className="ghost" onClick={onSignOut}>
              Sair da conta
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
