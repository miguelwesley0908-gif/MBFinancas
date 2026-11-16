export type Group = "needs" | "wants" | "future";
export type Account = {
  id: string;
  name: string;
  type: "bank" | "cash" | "card";
  opening: number;
  closing: number;
  due: number;
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
};
export type Data = {
  schema: 1;
  income: number;
  accounts: Account[];
  categories: Category[];
  entries: Entry[];
};
export const groups: Record<Group, { label: string; ratio: number }> = {
  needs: { label: "Necessidades", ratio: 0.5 },
  wants: { label: "Desejos", ratio: 0.3 },
  future: { label: "Futuro financeiro", ratio: 0.2 },
};
export const initial: Data = {
  schema: 1,
  income: 0,
  accounts: [],
  categories: [
    { id: "needs", name: "Essenciais", group: "needs" },
    { id: "wants", name: "Não essenciais", group: "wants" },
    { id: "future", name: "Reserva e objetivos", group: "future" },
  ],
  entries: [],
};
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
  return data.entries.reduce(
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
}
export function invoices(data: Data) {
  const map = new Map<
    string,
    { key: string; card: Account; date: string; total: number; paid: number }
  >();
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
        };
        invoice.total += part.amount;
        map.set(key, invoice);
      }
    }
  for (const e of data.entries)
    if (e.type === "transfer" && e.invoice && map.has(e.invoice))
      map.get(e.invoice)!.paid += e.amount;
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
  for (const a of data.accounts)
    if (
      !a.name?.trim() ||
      !["bank", "cash", "card"].includes(a.type) ||
      !Number.isSafeInteger(a.opening) ||
      !Number.isInteger(a.closing) ||
      a.closing < 1 ||
      a.closing > 31 ||
      !Number.isInteger(a.due) ||
      a.due < 1 ||
      a.due > 31
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
      !/^\d{4}-\d{2}-\d{2}$/.test(e.date) ||
      !data.accounts.some((a) => a.id === e.account) ||
      !Array.isArray(e.schedule)
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
  const validDate = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return dateAt(y, m - 1, d) === s;
  };
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
  if (invoices(data).some((i) => i.paid > i.total))
    throw new Error("Pagamento excede o total da fatura.");
  return data;
}
