import test from "node:test";
import assert from "node:assert/strict";
import {
  schedule,
  balance,
  invoices,
  initial,
  validate,
  cents,
  upgradeData,
  occurrenceForMonth,
  nextUnsettledOccurrence,
  recurringDate,
  reviseOccurrence,
  setRecurrenceStatus,
  settleOccurrence,
  invoiceForecasts,
  expenseTotalForMonth,
} from "../src/domain.ts";
const card = {
  id: "c",
  name: "Cartão",
  type: "card",
  opening: 0,
  closing: 20,
  due: 5,
};
const bank = {
  id: "b",
  name: "Banco",
  type: "bank",
  opening: 100000,
  closing: 1,
  due: 1,
};
const purchase = {
  id: "p",
  type: "expense",
  amount: 60000,
  date: "2026-11-01",
  account: "c",
  destination: "",
  category: "housing",
  description: "Compra",
  installments: 3,
  invoice: "",
  schedule: schedule(60000, 3, "2026-11-01", card),
};
test("600 em 3x gera parcelas que somam exatamente a compra", () =>
  assert.deepEqual(purchase.schedule, [
    { date: "2026-12-05", amount: 20000 },
    { date: "2027-01-05", amount: 20000 },
    { date: "2027-02-05", amount: 20000 },
  ]));
test("após fechamento vai para fatura seguinte", () =>
  assert.equal(schedule(100, 1, "2026-11-21", card)[0].date, "2027-01-05"));
test("no dia de fechamento pertence à fatura corrente", () =>
  assert.equal(schedule(100, 1, "2026-11-20", card)[0].date, "2026-12-05"));
test("centavos residuais ficam na última parcela", () =>
  assert.deepEqual(
    schedule(10000, 3, "2026-11-19", card).map((p) => p.amount),
    [3333, 3333, 3334],
  ));
test("fevereiro e virada de ano respeitam últimos dias", () =>
  assert.equal(
    schedule(100, 1, "2027-01-31", { ...card, closing: 31, due: 31 })[0].date,
    "2027-02-28",
  ));
test("pagamento diminui banco e dívida sem duplicar despesa", () => {
  const data = {
    ...structuredClone(initial),
    accounts: [bank, card],
    entries: [
      purchase,
      {
        id: "pay",
        type: "transfer",
        amount: 20000,
        date: "2026-11-15",
        account: "b",
        destination: "c",
        category: "",
        description: "Fatura",
        installments: 1,
        invoice: "c|2026-12-05",
        schedule: [],
      },
    ],
  };
  assert.equal(balance(data, bank), 80000);
  assert.equal(balance(data, card), -40000);
  assert.equal(invoices(data)[0].paid, 20000);
  assert.equal(
    data.entries
      .filter((e) => e.type === "expense")
      .reduce((s, e) => s + e.amount, 0),
    60000,
  );
  validate(data);
});
test("backup com referência inexistente é rejeitado", () =>
  assert.throws(() => validate({ ...initial, entries: [purchase] })));
test("migração preserva categorias antigas usadas e acrescenta categorias diretas", () => {
  const oldData = {
    ...structuredClone(initial),
    accounts: [bank, card],
    categories: [
      { id: "needs", name: "Essenciais", group: "needs" },
      { id: "wants", name: "Não essenciais", group: "wants" },
      { id: "future", name: "Reserva e objetivos", group: "future" },
    ],
    entries: [{ ...purchase, category: "needs" }],
  };
  const upgraded = upgradeData(validate(oldData));
  assert.equal(
    upgraded.categories.some((category) => category.id === "needs"),
    true,
  );
  assert.equal(
    upgraded.categories.some((category) => category.id === "housing"),
    true,
  );
  assert.equal(upgraded.entries[0].category, "needs");
});
test("dados importados não aceitam saldo negativo nem parcela em despesa bancária", () => {
  assert.throws(() =>
    validate({
      ...initial,
      accounts: [{ ...bank, opening: -1 }],
    }),
  );
  assert.throws(() =>
    validate({
      ...initial,
      accounts: [bank],
      entries: [{ ...purchase, account: "b", installments: 2, schedule: [] }],
    }),
  );
});
test("quantidade inválida de parcelas e dinheiro não numérico são rejeitados", () => {
  assert.throws(() => schedule(50, 60, "2026-11-19", card));
  assert.throws(() => cents("abc"));
  assert.throws(() => cents("-1"));
  assert.equal(cents("25,90"), 2590);
});

const recurrence = {
  id: "r1",
  description: "Internet",
  amount: 12000,
  category: "home-bills",
  account: "b",
  startDate: "2026-11-10",
  endDate: null,
  frequency: "monthly",
  status: "active",
  pauses: [],
  overrides: [],
  settledOccurrences: [],
};
const household = (overrides = {}) => ({
  ...structuredClone(initial),
  accounts: [bank, card],
  recurrences: [],
  manualInvoices: [],
  invoiceRecurrences: [],
  ...overrides,
});

test("recorrência mensal produz somente o mês consultado e trata fim de mês", () => {
  const data = household({ recurrences: [recurrence] });
  assert.deepEqual(
    occurrenceForMonth(recurrence, "2026-11", data).map(
      (item) => item.occurrenceDate,
    ),
    ["2026-11-10"],
  );
  assert.deepEqual(
    occurrenceForMonth(recurrence, "2027-02", data).map(
      (item) => item.occurrenceDate,
    ),
    ["2027-02-10"],
  );
  assert.equal(recurringDate("2027-01-31", "monthly", 1), "2027-02-28");
  assert.equal(recurringDate("2028-01-31", "monthly", 1), "2028-02-29");
  assert.equal(recurringDate("2026-11-19", "weekly", 2), "2026-12-03");
  assert.equal(recurringDate("2024-02-29", "yearly", 1), "2025-02-28");
});

test("editar uma ocorrência não altera as próximas e revisão futura preserva o histórico", () => {
  const data = household();
  const december = occurrenceForMonth(recurrence, "2026-12", data)[0];
  const one = reviseOccurrence(
    recurrence,
    december,
    { amount: 15000, date: "2026-12-12" },
    "one",
  );
  assert.equal(occurrenceForMonth(one, "2026-12", data)[0].amount, 15000);
  assert.equal(occurrenceForMonth(one, "2027-01", data)[0].amount, 12000);
  const future = reviseOccurrence(
    recurrence,
    december,
    {
      amount: 16000,
      date: "2026-12-12",
      category: "housing",
      account: "b",
      description: "Internet nova",
    },
    "future",
  );
  assert.equal(
    occurrenceForMonth(future, "2026-11", data)[0].date,
    "2026-11-10",
  );
  assert.equal(occurrenceForMonth(future, "2026-12", data)[0].amount, 16000);
  assert.equal(
    occurrenceForMonth(future, "2027-01", data)[0].date,
    "2027-01-12",
  );
  assert.equal(
    occurrenceForMonth(future, "2027-01", data)[0].description,
    "Internet nova",
  );
});

test("editar a série começa na próxima ocorrência sem reescrever pagamentos passados", () => {
  const data = household();
  const paid = settleOccurrence(recurrence, "2026-11-10");
  const next = nextUnsettledOccurrence(paid, "2026-11-19");
  assert.deepEqual(next, { occurrenceDate: "2026-12-10", index: 1 });
  const updated = reviseOccurrence(paid, next, { amount: 13500 }, "future");
  assert.equal(occurrenceForMonth(updated, "2026-11", data)[0].status, "paid");
  assert.equal(occurrenceForMonth(updated, "2026-12", data)[0].amount, 13500);
});

test("pausa e encerramento impedem novas previsões, reativação retoma o calendário", () => {
  const data = household();
  const paused = setRecurrenceStatus(recurrence, "pause", "2026-11-19");
  assert.equal(occurrenceForMonth(paused, "2026-11", data).length, 1);
  assert.equal(occurrenceForMonth(paused, "2026-12", data).length, 0);
  const resumed = setRecurrenceStatus(paused, "resume", "2026-11-25");
  assert.equal(occurrenceForMonth(resumed, "2026-12", data).length, 1);
  const ended = setRecurrenceStatus(recurrence, "end", "2026-11-19");
  assert.equal(occurrenceForMonth(ended, "2026-12", data).length, 0);
});

test("marcar recorrência em conta como paga cria saída efetiva sem duplicar", () => {
  const current = household({ recurrences: [recurrence] });
  const occurrence = occurrenceForMonth(recurrence, "2026-11", current)[0];
  const settled = settleOccurrence(recurrence, occurrence.occurrenceDate);
  assert.equal(
    occurrenceForMonth(settled, "2026-11", current)[0].status,
    "paid",
  );
  const paidEntry = {
    id: "paid-r1",
    type: "expense",
    amount: 12000,
    date: "2026-11-19",
    account: "b",
    destination: "",
    category: "home-bills",
    description: "Internet",
    installments: 1,
    invoice: "",
    schedule: [],
    recurrenceId: "r1",
    occurrenceDate: "2026-11-10",
  };
  const paid = { ...current, entries: [paidEntry], recurrences: [settled] };
  assert.equal(balance(paid, bank), 88000);
  assert.equal(expenseTotalForMonth(paid, "2026-11"), 12000);
  assert.equal(occurrenceForMonth(settled, "2026-11", paid)[0].status, "paid");
  validate(paid);
});

test("fatura manual usa total informado e pagamento parcial atualiza conta e saldo do cartão", () => {
  const invoiceRecurrence = {
    id: "ir1",
    cardId: "c",
    amount: 200000,
    startMonth: "2026-11",
    endMonth: null,
    dueDay: 15,
    dueMonthOffset: 1,
    status: "active",
  };
  const manualInvoice = {
    id: "mi1",
    cardId: "c",
    competence: "2026-11",
    total: 200000,
    dueDate: "2026-12-15",
    recurrenceId: "ir1",
  };
  const paid = household({
    invoiceRecurrences: [invoiceRecurrence],
    manualInvoices: [manualInvoice],
    entries: [
      {
        id: "pay1",
        type: "transfer",
        amount: 50000,
        date: "2026-11-19",
        account: "b",
        destination: "c",
        category: "",
        description: "Pagamento parcial",
        installments: 1,
        invoice: "manual:mi1",
        schedule: [],
      },
    ],
  });
  assert.equal(balance(paid, bank), 50000);
  assert.equal(balance(paid, card), -150000);
  assert.equal(
    invoices(paid).find((item) => item.source === "manual").paid,
    50000,
  );
  assert.equal(expenseTotalForMonth(paid, "2026-11"), 200000);
  assert.equal(expenseTotalForMonth(paid, "2026-12"), 0);
  validate(paid);
});

test("faturas recorrentes são previsões até confirmação e uma edição mensal não altera a série", () => {
  const plan = {
    id: "ir1",
    cardId: "c",
    amount: 150000,
    startMonth: "2026-11",
    endMonth: null,
    dueDay: 15,
    dueMonthOffset: 1,
    status: "active",
  };
  const data = household({ invoiceRecurrences: [plan] });
  assert.equal(invoiceForecasts(data, "2026-12")[0].date, "2027-01-15");
  const confirmed = {
    id: "mi-dec",
    cardId: "c",
    competence: "2026-12",
    total: 173000,
    dueDate: "2027-01-15",
    recurrenceId: "ir1",
  };
  const next = { ...data, manualInvoices: [confirmed] };
  assert.equal(invoiceForecasts(next, "2026-12").length, 0);
  assert.equal(invoiceForecasts(next, "2027-01")[0].total, 150000);
  assert.equal(validate(next).manualInvoices[0].total, 173000);
});

test("não mistura compras recorrentes planejadas com fatura manual e rejeita fatura duplicada", () => {
  const subscription = { ...recurrence, account: "c" };
  const plan = {
    id: "ir1",
    cardId: "c",
    amount: 3900,
    startMonth: "2026-11",
    endMonth: null,
    dueDay: 15,
    status: "active",
  };
  const data = household({
    recurrences: [subscription],
    invoiceRecurrences: [plan],
  });
  assert.equal(invoiceForecasts(data, "2026-12")[0].total, 3900);
  assert.equal(expenseTotalForMonth(data, "2026-12"), 0);
  const invoice = {
    id: "mi",
    cardId: "c",
    competence: "2026-11",
    total: 50000,
    dueDate: "2026-12-15",
    recurrenceId: "ir1",
  };
  const confirmed = { ...data, manualInvoices: [invoice] };
  assert.equal(invoiceForecasts(confirmed, "2026-11").length, 0);
  assert.equal(expenseTotalForMonth(confirmed, "2026-11"), 50000);
  assert.equal(expenseTotalForMonth(confirmed, "2026-12"), 0);
  assert.throws(
    () =>
      validate({
        ...data,
        manualInvoices: [invoice, { ...invoice, id: "mi2" }],
      }),
    /competência|Fatura/,
  );
  assert.throws(
    () =>
      validate({
        ...data,
        invoiceRecurrences: [
          plan,
          { ...plan, id: "ir2", startMonth: "2026-12" },
        ],
      }),
    /sobrepõem/,
  );
  assert.throws(
    () =>
      validate(
        household({
          entries: [purchase],
          manualInvoices: [
            { ...invoice, competence: "2026-12", recurrenceId: null },
          ],
        }),
      ),
    /compras lançadas/,
  );
});

test("migração aditiva aceita registros antigos e acrescenta coleções vazias", () => {
  const legacy = {
    ...structuredClone(initial),
    accounts: [bank, card],
    entries: [purchase],
  };
  const upgraded = upgradeData(validate(legacy));
  assert.equal(upgraded.entries[0].id, purchase.id);
  assert.deepEqual(upgraded.recurrences, []);
  assert.deepEqual(upgraded.manualInvoices, []);
  assert.deepEqual(upgraded.invoiceRecurrences, []);
});
