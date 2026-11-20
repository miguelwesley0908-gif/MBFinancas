export type Group = "needs" | "wants" | "future";
export type Account = {
  id: string;
  name: string;
  type: "bank" | "cash" | "card";
  opening: number;
  closing: number;
  due: number;
  archived?: boolean;
};
export type Category = { id: string; name: string; group: Group };
export type Entry = {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  date: string;
  account: string;
  destination: string;
  category: string;
  description: string;
  installments: number;
  invoice: string;
  schedule: { date: string; amount: number }[];
  recurrenceId?: string;
  occurrenceDate?: string;
};
export type Frequency = "weekly" | "monthly" | "yearly";
export type RecurrenceStatus = "active" | "paused" | "ended";
export type RecurrencePause = { from: string; through: string | null };
export type RecurrenceOverride = {
  occurrenceDate: string;
  skipped: boolean;
  date?: string;
  amount?: number;
  category?: string;
  account?: string;
  description?: string;
};
export type RecurrenceRevision = {
  fromIndex: number;
  startDate: string;
  frequency: Frequency;
  amount: number;
  category: string;
  account: string;
  description: string;
};
export type ExpenseRecurrence = {
  id: string;
  description: string;
  amount: number;
  category: string;
  account: string;
  startDate: string;
  endDate: string | null;
  endedAt?: string | null;
  frequency: Frequency;
  status: RecurrenceStatus;
  pauses: RecurrencePause[];
  overrides: RecurrenceOverride[];
  settledOccurrences: string[];
  revisions?: RecurrenceRevision[];
};
export type ManualInvoice = {
  id: string;
  cardId: string;
  competence: string;
  total: number;
  dueDate: string;
  recurrenceId: string | null;
  archived?: boolean;
};
export type InvoiceRecurrence = {
  id: string;
  cardId: string;
  amount: number;
  startMonth: string;
  endMonth: string | null;
  dueDay: number;
  dueMonthOffset?: number;
  status: RecurrenceStatus;
};
export type InvoiceView = {
  key: string;
  card: Account;
  date: string;
  total: number;
  paid: number;
  source: "purchase" | "manual" | "forecast";
  competence: string;
  invoiceId?: string;
  recurrenceId?: string;
};
export type ExpenseOccurrence = {
  key: string;
  recurrenceId: string;
  occurrenceDate: string;
  date: string;
  amount: number;
  category: string;
  account: string;
  description: string;
  status: "pending" | "paid" | "skipped";
  index: number;
};
export type Data = {
  schema: 1;
  income: number;
  accounts: Account[];
  categories: Category[];
  entries: Entry[];
  recurrences: ExpenseRecurrence[];
  manualInvoices: ManualInvoice[];
  invoiceRecurrences: InvoiceRecurrence[];
};
export const groups: Record<Group, { label: string; ratio: number }> = {
  needs: { label: "Necessidades", ratio: 0.5 },
  wants: { label: "Desejos", ratio: 0.3 },
  future: { label: "Futuro financeiro", ratio: 0.2 },
};
const standardCategories: Category[] = [
  { id: "housing", name: "Moradia", group: "needs" },
  { id: "food", name: "Mercado e alimentação", group: "needs" },
  { id: "transport", name: "Transporte", group: "needs" },
  { id: "health", name: "Saúde", group: "needs" },
  { id: "home-bills", name: "Contas da casa", group: "needs" },
  { id: "dining", name: "Restaurantes", group: "wants" },
  { id: "leisure", name: "Lazer", group: "wants" },
  { id: "shopping", name: "Compras pessoais", group: "wants" },
  { id: "subscriptions", name: "Assinaturas", group: "wants" },
  { id: "savings", name: "Reserva e investimentos", group: "future" },
];
export const initial: Data = {
  schema: 1,
  income: 0,
  accounts: [],
  categories: standardCategories,
  entries: [],
  recurrences: [],
  manualInvoices: [],
  invoiceRecurrences: [],
};
const legacyCategoryIds = new Set(["needs", "wants", "future"]);
export function upgradeData(data: Data): Data {
  const usedCategories = new Set(data.entries.map((entry) => entry.category));
  const categories = data.categories.filter(
    (category) =>
      !legacyCategoryIds.has(category.id) || usedCategories.has(category.id),
  );
  const existingIds = new Set(categories.map((category) => category.id));
  for (const category of standardCategories)
    if (!existingIds.has(category.id)) categories.push(category);
  return {
    ...data,
    categories,
    accounts: data.accounts.map((account) => ({
      ...account,
      archived: account.archived ?? false,
    })),
    recurrences: data.recurrences ?? [],
    manualInvoices: (data.manualInvoices ?? []).map((invoice) => ({
      ...invoice,
      archived: invoice.archived ?? false,
    })),
    invoiceRecurrences: data.invoiceRecurrences ?? [],
  };
}
export const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n / 100,
  );
export const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};
export const uid = () => crypto.randomUUID();
export function cents(value: string): number {
  const n = Number(value.replace(",", "."));
  const result = Math.round(n * 100);
  if (
    !Number.isFinite(n) ||
    !Number.isSafeInteger(result) ||
    result < 0 ||
    result > 100000000000
  )
    throw new Error("Informe um valor válido, com até duas casas decimais.");
  return result;
}
function dateAt(y: number, m: number, day: number) {
  const date = new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function schedule(
  amount: number,
  count: number,
  date: string,
  card: Account,
) {
  if (!Number.isInteger(count) || count < 1 || count > 120 || amount < count)
    throw new Error(
      "Use de 1 a 120 parcelas, com pelo menos R$ 0,01 por parcela.",
    );
  const [y, m, d] = date.split("-").map(Number);
  let closingMonth = m - 1;
  const effectiveClosing = Math.min(card.closing, new Date(y, m, 0).getDate());
  if (d > effectiveClosing) closingMonth++;
  const closingDate = dateAt(y, closingMonth, card.closing);
  let dueMonth = closingMonth;
  if (dateAt(y, dueMonth, card.due) <= closingDate) dueMonth++;
  const base = Math.floor(amount / count);
  return Array.from({ length: count }, (_, i) => ({
    date: dateAt(y, dueMonth + i, card.due),
    amount: base + (i === count - 1 ? amount - base * count : 0),
  }));
}
export function balance(data: Data, account: Account) {
  const entriesBalance = data.entries.reduce(
    (sum, e) =>
      sum +
      (e.account === account.id
        ? e.type === "income"
          ? e.amount
          : -e.amount
        : 0) +
      (e.type === "transfer" && e.destination === account.id ? e.amount : 0),
    account.opening,
  );
  if (account.type !== "card") return entriesBalance;
  return (
    entriesBalance -
    (data.manualInvoices ?? [])
      .filter((invoice) => invoice.cardId === account.id)
      .reduce((sum, invoice) => sum + invoice.total, 0)
  );
}
const validDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  return dateAt(y, m - 1, d) === s;
};
const monthDate = (month: string, day: number, offset = 0) => {
  const [y, m] = month.split("-").map(Number);
  return dateAt(y, m - 1 + offset, day);
};
export function recurringDate(
  start: string,
  frequency: Frequency,
  index: number,
) {
  const [y, m, d] = start.split("-").map(Number);
  if (frequency === "weekly") {
    const date = new Date(Date.UTC(y, m - 1, d + 7 * index));
    return date.toISOString().slice(0, 10);
  }
  if (frequency === "monthly") return dateAt(y, m - 1 + index, d);
  return dateAt(y + index, m - 1, d);
}
export function occurrenceForMonth(
  recurrence: ExpenseRecurrence,
  month: string,
  data: Data,
): ExpenseOccurrence[] {
  const targetStart = month + "-01";
  const [y, m] = month.split("-").map(Number);
  const targetEnd = dateAt(y, m, 0);
  const last =
    recurrence.status === "ended"
      ? [recurrence.endDate, recurrence.endedAt ?? today()]
          .filter((value): value is string => !!value)
          .sort()[0]
      : recurrence.endDate;
  const output: ExpenseOccurrence[] = [];
  for (let index = 0; index < 10000; index++) {
    const revision = [...(recurrence.revisions ?? [])]
      .sort((a, b) => a.fromIndex - b.fromIndex)
      .filter((item) => item.fromIndex <= index)
      .at(-1);
    const occurrenceDate = recurringDate(
      revision?.startDate ?? recurrence.startDate,
      revision?.frequency ?? recurrence.frequency,
      revision ? index - revision.fromIndex : index,
    );
    if (occurrenceDate > targetEnd) break;
    if (occurrenceDate < targetStart || (last && occurrenceDate > last))
      continue;
    if (
      recurrence.status === "ended" &&
      occurrenceDate > (recurrence.endedAt ?? today())
    )
      continue;
    if (
      recurrence.pauses.some(
        (pause) =>
          occurrenceDate >= pause.from &&
          (!pause.through || occurrenceDate <= pause.through),
      )
    )
      continue;
    if (
      recurrence.status === "paused" &&
      !recurrence.pauses.some((pause) => pause.through === null) &&
      occurrenceDate > today()
    )
      continue;
    const override = recurrence.overrides.find(
      (item) => item.occurrenceDate === occurrenceDate,
    );
    if (override?.skipped) {
      output.push({
        key: recurrence.id + "|" + occurrenceDate,
        recurrenceId: recurrence.id,
        occurrenceDate,
        date: occurrenceDate,
        amount: override.amount ?? recurrence.amount,
        category: override.category ?? recurrence.category,
        account: override.account ?? recurrence.account,
        description: override.description ?? recurrence.description,
        status: "skipped",
        index,
      });
      continue;
    }
    const settled =
      recurrence.settledOccurrences.includes(occurrenceDate) ||
      data.entries.some(
        (entry) =>
          entry.recurrenceId === recurrence.id &&
          entry.occurrenceDate === occurrenceDate,
      );
    output.push({
      key: recurrence.id + "|" + occurrenceDate,
      recurrenceId: recurrence.id,
      occurrenceDate,
      date: override?.date ?? occurrenceDate,
      amount: override?.amount ?? revision?.amount ?? recurrence.amount,
      category: override?.category ?? revision?.category ?? recurrence.category,
      account: override?.account ?? revision?.account ?? recurrence.account,
      description:
        override?.description ??
        revision?.description ??
        recurrence.description,
      status: settled ? "paid" : "pending",
      index,
    });
  }
  return output;
}
export function nextUnsettledOccurrence(
  recurrence: ExpenseRecurrence,
  fromDate = today(),
): Pick<ExpenseOccurrence, "occurrenceDate" | "index"> | null {
  if (recurrence.status === "paused") return null;
  for (let index = 0; index < 10000; index++) {
    const revision = [...(recurrence.revisions ?? [])]
      .sort((a, b) => a.fromIndex - b.fromIndex)
      .filter((item) => item.fromIndex <= index)
      .at(-1);
    const occurrenceDate = recurringDate(
      revision?.startDate ?? recurrence.startDate,
      revision?.frequency ?? recurrence.frequency,
      revision ? index - revision.fromIndex : index,
    );
    if (recurrence.endDate && occurrenceDate > recurrence.endDate) return null;
    if (
      recurrence.status === "ended" &&
      occurrenceDate > (recurrence.endedAt ?? today())
    )
      return null;
    if (occurrenceDate < fromDate) continue;
    if (
      recurrence.pauses.some(
        (pause) =>
          occurrenceDate >= pause.from &&
          (!pause.through || occurrenceDate <= pause.through),
      )
    )
      continue;
    if (recurrence.settledOccurrences.includes(occurrenceDate)) continue;
    return { occurrenceDate, index };
  }
  return null;
}
export function invoiceForecasts(data: Data, month: string): InvoiceView[] {
  return (data.invoiceRecurrences ?? []).flatMap((recurrence) => {
    if (
      recurrence.status !== "active" ||
      month < recurrence.startMonth ||
      (recurrence.endMonth && month > recurrence.endMonth)
    )
      return [];
    const card = data.accounts.find(
      (account) => account.id === recurrence.cardId,
    );
    if (!card || card.type !== "card" || card.archived) return [];
    const hasInvoice =
      (data.manualInvoices ?? []).some(
        (invoice) => invoice.cardId === card.id && invoice.competence === month,
      ) ||
      invoices(data).some(
        (invoice) =>
          invoice.source === "purchase" &&
          invoice.card.id === card.id &&
          invoice.competence === month,
      );
    if (hasInvoice) return [];
    return [
      {
        key: `forecast:${recurrence.id}:${month}`,
        card,
        date: monthDate(
          month,
          recurrence.dueDay,
          recurrence.dueMonthOffset ?? 0,
        ),
        total: recurrence.amount,
        paid: 0,
        source: "forecast" as const,
        competence: month,
        recurrenceId: recurrence.id,
      },
    ];
  });
}
export function expenseTotalForMonth(data: Data, month: string): number {
  const cashAndBank = data.entries
    .filter(
      (entry) =>
        entry.type === "expense" &&
        entry.date.startsWith(month) &&
        data.accounts.find((account) => account.id === entry.account)?.type !==
          "card",
    )
    .reduce((sum, entry) => sum + entry.amount, 0);
  const cardPurchases = invoices(data)
    .filter(
      (invoice) =>
        invoice.source === "purchase" && invoice.competence === month,
    )
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const manualTotals = (data.manualInvoices ?? [])
    .filter((invoice) => invoice.competence === month)
    .reduce((sum, invoice) => sum + invoice.total, 0);
  return cashAndBank + cardPurchases + manualTotals;
}
export function projectedExpenseTotalForMonth(data: Data, month: string) {
  const plannedInvoices = invoiceForecasts(data, month);
  const invoicesAlreadyRepresented = new Set([
    ...invoices(data)
      .filter((invoice) => invoice.competence === month)
      .map((invoice) => invoice.card.id),
    ...plannedInvoices.map((invoice) => invoice.card.id),
  ]);
  const recurringForecast = data.recurrences
    .flatMap((recurrence) => occurrenceForMonth(recurrence, month, data))
    .reduce((sum, occurrence) => {
      if (occurrence.status === "skipped") return sum;
      const account = data.accounts.find(
        (item) => item.id === occurrence.account,
      );
      if (account?.type === "card") {
        return invoicesAlreadyRepresented.has(account.id)
          ? sum
          : sum + occurrence.amount;
      }
      return occurrence.status === "pending" ? sum + occurrence.amount : sum;
    }, 0);
  const plannedInvoiceTotal = plannedInvoices.reduce(
    (sum, invoice) => sum + invoice.total,
    0,
  );
  return (
    expenseTotalForMonth(data, month) + recurringForecast + plannedInvoiceTotal
  );
}
export type OccurrenceChanges = Pick<
  RecurrenceOverride,
  "date" | "amount" | "category" | "account" | "description"
>;
export function reviseOccurrence(
  recurrence: ExpenseRecurrence,
  occurrence: Pick<ExpenseOccurrence, "occurrenceDate" | "index">,
  changes: OccurrenceChanges,
  scope: "one" | "future",
): ExpenseRecurrence {
  if (recurrence.settledOccurrences.includes(occurrence.occurrenceDate))
    throw new Error("Uma ocorrência paga não pode ser alterada.");
  if (scope === "one") {
    const override: RecurrenceOverride = {
      occurrenceDate: occurrence.occurrenceDate,
      skipped: false,
      ...changes,
    };
    return {
      ...recurrence,
      overrides: [
        ...recurrence.overrides.filter(
          (item) => item.occurrenceDate !== occurrence.occurrenceDate,
        ),
        override,
      ],
    };
  }
  const previous = [...(recurrence.revisions ?? [])]
    .sort((a, b) => a.fromIndex - b.fromIndex)
    .filter((revision) => revision.fromIndex <= occurrence.index)
    .at(-1);
  const revisions = (recurrence.revisions ?? []).filter(
    (revision) => revision.fromIndex < occurrence.index,
  );
  revisions.push({
    fromIndex: occurrence.index,
    startDate: changes.date ?? occurrence.occurrenceDate,
    frequency: previous?.frequency ?? recurrence.frequency,
    amount: changes.amount ?? previous?.amount ?? recurrence.amount,
    category: changes.category ?? previous?.category ?? recurrence.category,
    account: changes.account ?? previous?.account ?? recurrence.account,
    description:
      changes.description ?? previous?.description ?? recurrence.description,
  });
  return {
    ...recurrence,
    revisions,
    overrides: recurrence.overrides.filter(
      (item) => item.occurrenceDate < occurrence.occurrenceDate,
    ),
  };
}
export function setRecurrenceStatus(
  recurrence: ExpenseRecurrence,
  action: "pause" | "resume" | "end",
  date = today(),
): ExpenseRecurrence {
  if (action === "end")
    return { ...recurrence, endedAt: date, status: "ended" };
  if (action === "pause")
    return {
      ...recurrence,
      status: "paused",
      pauses: [
        ...recurrence.pauses.filter((pause) => pause.through),
        { from: date, through: null },
      ],
    };
  return {
    ...recurrence,
    status: "active",
    endedAt: null,
    pauses: recurrence.pauses.flatMap((pause) => {
      if (pause.through !== null) return [pause];
      if (pause.from >= date) return [];
      return [{ ...pause, through: shiftDays(date, -1) }];
    }),
  };
}
function shiftDays(date: string, offset: number) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + offset));
  return shifted.toISOString().slice(0, 10);
}
export function settleOccurrence(
  recurrence: ExpenseRecurrence,
  occurrenceDate: string,
): ExpenseRecurrence {
  return {
    ...recurrence,
    settledOccurrences: [
      ...new Set([...recurrence.settledOccurrences, occurrenceDate]),
    ],
  };
}
export function invoices(data: Data): InvoiceView[] {
  const map = new Map<string, InvoiceView>();
  for (const entry of data.entries)
    if (entry.type === "expense") {
      const card = data.accounts.find(
        (a) => a.id === entry.account && a.type === "card",
      );
      if (!card) continue;
      for (const part of entry.schedule) {
        const key = card.id + "|" + part.date;
        const invoice = map.get(key) ?? {
          key,
          card,
          date: part.date,
          total: 0,
          paid: 0,
          source: "purchase",
          competence: part.date.slice(0, 7),
        };
        invoice.total += part.amount;
        map.set(key, invoice);
      }
    }
  for (const e of data.entries)
    if (e.type === "transfer" && e.invoice && map.has(e.invoice))
      map.get(e.invoice)!.paid += e.amount;
  for (const manual of data.manualInvoices ?? []) {
    const card = data.accounts.find((account) => account.id === manual.cardId);
    if (!card) continue;
    const key = `manual:${manual.id}`;
    map.set(key, {
      key,
      card,
      date: manual.dueDate,
      total: manual.total,
      paid: data.entries
        .filter((entry) => entry.type === "transfer" && entry.invoice === key)
        .reduce((sum, entry) => sum + entry.amount, 0),
      source: "manual",
      competence: manual.competence,
      invoiceId: manual.id,
    });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function validate(data: Data): Data {
  if (
    !data ||
    data.schema !== 1 ||
    !Array.isArray(data.accounts) ||
    !Array.isArray(data.categories) ||
    !Array.isArray(data.entries) ||
    !Number.isSafeInteger(data.income) ||
    data.income < 0
  )
    throw new Error("Arquivo de dados inválido.");
  const recurrences = data.recurrences ?? [];
  const manualInvoices = data.manualInvoices ?? [];
  const invoiceRecurrences = data.invoiceRecurrences ?? [];
  if (
    !Array.isArray(recurrences) ||
    !Array.isArray(manualInvoices) ||
    !Array.isArray(invoiceRecurrences)
  )
    throw new Error("Coleções de planejamento inválidas.");
  const ids = (items: { id: string }[]) => {
    if (
      items.some((x) => typeof x.id !== "string" || !x.id) ||
      new Set(items.map((x) => x.id)).size !== items.length
    )
      throw new Error("Identificadores inválidos.");
  };
  ids(data.accounts);
  ids(data.categories);
  ids(data.entries);
  ids(recurrences);
  ids(manualInvoices);
  ids(invoiceRecurrences);
  for (const a of data.accounts)
    if (
      typeof a.name !== "string" ||
      !a.name.trim() ||
      !["bank", "cash", "card"].includes(a.type) ||
      !Number.isSafeInteger(a.opening) ||
      a.opening < 0 ||
      a.opening > 100000000000 ||
      !Number.isInteger(a.closing) ||
      a.closing < 1 ||
      a.closing > 31 ||
      !Number.isInteger(a.due) ||
      a.due < 1 ||
      a.due > 31 ||
      (a.type === "card" && a.opening !== 0) ||
      (a.archived !== undefined && typeof a.archived !== "boolean")
    )
      throw new Error("Conta inválida.");
  for (const c of data.categories)
    if (!c.name?.trim() || !Object.hasOwn(groups, c.group))
      throw new Error("Categoria inválida.");
  for (const e of data.entries) {
    if (
      !["income", "expense", "transfer"].includes(e.type) ||
      !Number.isSafeInteger(e.amount) ||
      e.amount <= 0 ||
      e.amount > 100000000000 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(e.date) ||
      !data.accounts.some((a) => a.id === e.account) ||
      !Array.isArray(e.schedule) ||
      typeof e.destination !== "string" ||
      typeof e.category !== "string" ||
      typeof e.description !== "string" ||
      typeof e.invoice !== "string"
    )
      throw new Error("Lançamento inválido.");
    if (
      e.type === "expense" &&
      !data.categories.some((c) => c.id === e.category)
    )
      throw new Error("Categoria ausente.");
    if (
      e.type === "transfer" &&
      (!data.accounts.some((a) => a.id === e.destination) ||
        e.destination === e.account)
    )
      throw new Error("Transferência inválida.");
    const card = data.accounts.find((a) => a.id === e.account)?.type === "card";
    if (card && e.type !== "expense")
      throw new Error("Use uma conta bancária como origem.");
    if (e.type !== "expense" && e.installments !== 1)
      throw new Error("Apenas compras podem ser parceladas.");
    if (e.type === "expense" && !card && e.installments !== 1)
      throw new Error("Parcelas só podem ser usadas em compras no cartão.");
    if (
      e.type === "expense" &&
      card &&
      (e.schedule.length !== e.installments ||
        e.schedule.reduce((s, p) => s + p.amount, 0) !== e.amount)
    )
      throw new Error("Parcelas inconsistentes.");
    if (
      e.schedule.some(
        (p) =>
          !Number.isSafeInteger(p.amount) ||
          p.amount <= 0 ||
          !/^\d{4}-\d{2}-\d{2}$/.test(p.date),
      )
    )
      throw new Error("Parcela inválida.");
  }
  for (const e of data.entries) {
    if (
      !validDate(e.date) ||
      e.date > today() ||
      typeof e.description !== "string" ||
      typeof e.invoice !== "string" ||
      !Number.isInteger(e.installments) ||
      e.installments < 1 ||
      e.installments > 120
    )
      throw new Error("Detalhes do lançamento inválidos.");
    if (e.schedule.some((p) => !validDate(p.date)))
      throw new Error("Vencimento inválido.");
    const isCard =
      data.accounts.find((a) => a.id === e.account)?.type === "card";
    if (!isCard && e.schedule.length)
      throw new Error("Apenas compras no cartão têm parcelas.");
    if (e.type === "transfer") {
      const destination = data.accounts.find((a) => a.id === e.destination)!;
      if (
        destination.type === "card" &&
        (!e.invoice ||
          !invoices(data).some(
            (i) => i.key === e.invoice && i.card.id === destination.id,
          ))
      )
        throw new Error("Pagamento sem fatura correspondente.");
      if (destination.type !== "card" && e.invoice)
        throw new Error("Fatura incompatível com a conta.");
    }
  }
  const recurrenceKeys = new Set<string>();
  for (const recurrence of recurrences) {
    if (
      typeof recurrence.description !== "string" ||
      !recurrence.description.trim() ||
      !Number.isSafeInteger(recurrence.amount) ||
      recurrence.amount <= 0 ||
      recurrence.amount > 100000000000 ||
      !data.categories.some(
        (category) => category.id === recurrence.category,
      ) ||
      !data.accounts.some((account) => account.id === recurrence.account) ||
      !validDate(recurrence.startDate) ||
      (recurrence.endDate !== null && !validDate(recurrence.endDate)) ||
      (recurrence.endedAt !== undefined &&
        recurrence.endedAt !== null &&
        !validDate(recurrence.endedAt)) ||
      (recurrence.endDate && recurrence.endDate < recurrence.startDate) ||
      !["weekly", "monthly", "yearly"].includes(recurrence.frequency) ||
      !["active", "paused", "ended"].includes(recurrence.status) ||
      !Array.isArray(recurrence.pauses) ||
      !Array.isArray(recurrence.overrides) ||
      !Array.isArray(recurrence.settledOccurrences)
    )
      throw new Error("Despesa recorrente inválida.");
    const revisions = recurrence.revisions ?? [];
    if (!Array.isArray(revisions))
      throw new Error("Alterações futuras da recorrência inválidas.");
    const sortedRevisions = [...revisions].sort(
      (a, b) => a.fromIndex - b.fromIndex,
    );
    if (
      revisions.some(
        (revision) =>
          !Number.isInteger(revision.fromIndex) ||
          revision.fromIndex < 0 ||
          !validDate(revision.startDate) ||
          !["weekly", "monthly", "yearly"].includes(revision.frequency) ||
          !Number.isSafeInteger(revision.amount) ||
          revision.amount <= 0 ||
          revision.amount > 100000000000 ||
          !data.categories.some(
            (category) => category.id === revision.category,
          ) ||
          !data.accounts.some((account) => account.id === revision.account) ||
          !revision.description.trim(),
      ) ||
      sortedRevisions.some(
        (revision, index) =>
          index > 0 &&
          revision.fromIndex === sortedRevisions[index - 1].fromIndex,
      )
    )
      throw new Error("Alterações futuras da recorrência inválidas.");
    for (const pause of recurrence.pauses)
      if (
        !validDate(pause.from) ||
        (pause.through !== null &&
          (!validDate(pause.through) || pause.through < pause.from))
      )
        throw new Error("Pausa de recorrência inválida.");
    for (const override of recurrence.overrides) {
      if (
        typeof override.skipped !== "boolean" ||
        !validDate(override.occurrenceDate) ||
        recurrenceKeys.has(recurrence.id + "|" + override.occurrenceDate)
      )
        throw new Error("Exceção de recorrência duplicada ou inválida.");
      recurrenceKeys.add(recurrence.id + "|" + override.occurrenceDate);
      if (override.date && !validDate(override.date))
        throw new Error("Data da ocorrência inválida.");
      if (
        override.amount !== undefined &&
        (!Number.isSafeInteger(override.amount) ||
          override.amount <= 0 ||
          override.amount > 100000000000)
      )
        throw new Error("Valor da ocorrência inválido.");
      if (
        override.category &&
        !data.categories.some((category) => category.id === override.category)
      )
        throw new Error("Categoria da ocorrência ausente.");
      if (
        override.account &&
        !data.accounts.some((item) => item.id === override.account)
      )
        throw new Error("Conta da ocorrência ausente.");
      if (
        override.description !== undefined &&
        (typeof override.description !== "string" ||
          !override.description.trim())
      )
        throw new Error("Descrição da ocorrência inválida.");
    }
    if (
      new Set(recurrence.settledOccurrences).size !==
        recurrence.settledOccurrences.length ||
      recurrence.settledOccurrences.some((date) => !validDate(date))
    )
      throw new Error("Ocorrências recorrentes duplicadas ou inválidas.");
  }
  const invoiceKeys = new Set<string>();
  for (const invoice of manualInvoices) {
    const card = data.accounts.find((account) => account.id === invoice.cardId);
    if (
      !card ||
      card.type !== "card" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(invoice.competence) ||
      !Number.isSafeInteger(invoice.total) ||
      invoice.total <= 0 ||
      invoice.total > 100000000000 ||
      !validDate(invoice.dueDate) ||
      (invoice.archived !== undefined &&
        typeof invoice.archived !== "boolean") ||
      (invoice.recurrenceId !== null &&
        !invoiceRecurrences.some(
          (plan) =>
            plan.id === invoice.recurrenceId && plan.cardId === invoice.cardId,
        ))
    )
      throw new Error("Fatura manual inválida.");
    const unique = invoice.cardId + "|" + invoice.competence;
    if (invoiceKeys.has(unique))
      throw new Error("Já existe fatura para este cartão e competência.");
    invoiceKeys.add(unique);
    if (
      invoices(data).some(
        (item) =>
          item.source === "purchase" &&
          item.card.id === card.id &&
          item.competence === invoice.competence,
      )
    )
      throw new Error(
        "Já existem compras lançadas para este cartão e competência. Edite a fatura existente para evitar duplicidade.",
      );
  }
  for (const recurrence of invoiceRecurrences) {
    const card = data.accounts.find(
      (account) => account.id === recurrence.cardId,
    );
    if (
      !card ||
      card.type !== "card" ||
      !Number.isSafeInteger(recurrence.amount) ||
      recurrence.amount <= 0 ||
      recurrence.amount > 100000000000 ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(recurrence.startMonth) ||
      (recurrence.endMonth !== null &&
        (!/^\d{4}-(0[1-9]|1[0-2])$/.test(recurrence.endMonth) ||
          recurrence.endMonth < recurrence.startMonth)) ||
      !Number.isInteger(recurrence.dueDay) ||
      recurrence.dueDay < 1 ||
      recurrence.dueDay > 31 ||
      (recurrence.dueMonthOffset !== undefined &&
        (!Number.isInteger(recurrence.dueMonthOffset) ||
          recurrence.dueMonthOffset < 0 ||
          recurrence.dueMonthOffset > 2)) ||
      !["active", "paused", "ended"].includes(recurrence.status)
    )
      throw new Error("Previsão recorrente de fatura inválida.");
  }
  for (let index = 0; index < invoiceRecurrences.length; index++)
    for (
      let otherIndex = index + 1;
      otherIndex < invoiceRecurrences.length;
      otherIndex++
    ) {
      const first = invoiceRecurrences[index];
      const second = invoiceRecurrences[otherIndex];
      if (
        first.status !== "ended" &&
        second.status !== "ended" &&
        first.cardId === second.cardId &&
        first.startMonth <= (second.endMonth ?? "9999-12") &&
        second.startMonth <= (first.endMonth ?? "9999-12")
      )
        throw new Error(
          "Previsões recorrentes de fatura se sobrepõem para o mesmo cartão.",
        );
    }
  const recurrenceEntryKeys = new Set<string>();
  for (const entry of data.entries)
    if (
      entry.recurrenceId !== undefined ||
      entry.occurrenceDate !== undefined
    ) {
      const key = entry.recurrenceId + "|" + entry.occurrenceDate;
      if (
        entry.type !== "expense" ||
        !entry.recurrenceId ||
        !validDate(entry.occurrenceDate ?? "") ||
        !recurrences.some((item) => item.id === entry.recurrenceId) ||
        recurrenceEntryKeys.has(key)
      )
        throw new Error("Pagamento de recorrência duplicado ou inválido.");
      recurrenceEntryKeys.add(key);
    }
  const manualInvoiceKeys = new Set(
    manualInvoices.map((invoice) => "manual:" + invoice.id),
  );
  for (const entry of data.entries)
    if (
      entry.type === "transfer" &&
      entry.invoice.startsWith("manual:") &&
      !manualInvoiceKeys.has(entry.invoice)
    )
      throw new Error("Pagamento de fatura sem fatura correspondente.");
  for (const key of manualInvoiceKeys) {
    const invoice = invoices(data).find((item) => item.key === key);
    if (invoice && invoice.paid > invoice.total)
      throw new Error("Pagamento excede o total da fatura.");
  }
  if (invoices(data).some((i) => i.paid > i.total))
    throw new Error("Pagamento excede o total da fatura.");
  return data;
}
