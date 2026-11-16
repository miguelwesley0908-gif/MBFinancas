import test from "node:test";
import assert from "node:assert/strict";
import {
  schedule,
  balance,
  invoices,
  initial,
  validate,
  cents,
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
  category: "needs",
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
test("quantidade inválida de parcelas e dinheiro não numérico são rejeitados", () => {
  assert.throws(() => schedule(50, 60, "2026-11-19", card));
  assert.throws(() => cents("abc"));
  assert.throws(() => cents("-1"));
  assert.equal(cents("25,90"), 2590);
});
