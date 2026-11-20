import { test, expect } from "@playwright/test";

async function addAccount(
  page: import("@playwright/test").Page,
  kind: "Nova conta bancária" | "Novo cartão",
  name: string,
) {
  await page.getByRole("button", { name: "+ Adicionar" }).click();
  await page.getByRole("button", { name: kind }).click();
  await page.getByLabel("Nome", { exact: true }).fill(name);
  if (kind === "Nova conta bancária") {
    await page.getByLabel("Saldo inicial (R$)").fill("1000");
  } else {
    await page.getByLabel("Fechamento da fatura (dia)").fill("10");
    await page.getByLabel("Vencimento da fatura (dia)").fill("15");
  }
  await page.getByRole("button", { name: "Cadastrar", exact: true }).click();
  await expect(
    page.locator(".account-row").filter({ hasText: name }),
  ).toBeVisible();
}

function shiftMonth(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}

test("cadastros, recorrência paga e resumo compartilhado", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Minhas finanças" }),
  ).toBeVisible();
  await addAccount(page, "Nova conta bancária", "Conta da casa");
  await addAccount(page, "Nova conta bancária", "Outra conta");
  await addAccount(page, "Novo cartão", "Cartão da casa");

  await page.getByRole("button", { name: "+ Adicionar" }).click();
  await page.getByRole("button", { name: "Nova receita" }).click();
  await page.getByLabel("Valor (R$)").fill("500");
  await page.getByLabel("Entrou em").selectOption({ label: "Conta da casa" });
  await page.getByRole("button", { name: "Salvar receita" }).click();
  await expect(
    page.locator(".list-row").filter({ hasText: "Receita" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "+ Adicionar" }).click();
  await page
    .locator(".add-option")
    .filter({ hasText: "Nova despesa" })
    .first()
    .click();
  await page.getByLabel("Valor (R$)").fill("25");
  await page
    .getByLabel("Conta ou cartão")
    .selectOption({ label: "Conta da casa" });
  await page
    .getByRole("dialog")
    .getByLabel("Categoria")
    .selectOption("home-bills");
  await page.getByLabel("Descrição").fill("Gás");
  await page.getByRole("button", { name: "Salvar despesa" }).click();
  await expect(page.getByText("Gás", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "+ Adicionar" }).click();
  await page.getByRole("button", { name: "Nova transferência" }).click();
  await page.getByLabel("Valor (R$)").fill("50");
  await page.getByLabel("Saiu de").selectOption({ label: "Conta da casa" });
  await page.getByLabel("Entrou em").selectOption({ label: "Outra conta" });
  // Contas do mesmo tipo continuam sendo uma transferência, sem gerar receitas ou despesas.
  await page.getByRole("button", { name: "Salvar transferência" }).click();
  await expect(
    page.getByRole("heading", { name: "Nova movimentação" }),
  ).toHaveCount(0);
  await expect(page.locator(".compact-metrics .metric").nth(1)).toContainText(
    "500,00",
  );
  await expect(page.locator(".compact-metrics .metric").nth(2)).toContainText(
    "25,00",
  );

  await page.getByRole("button", { name: "+ Adicionar" }).click();
  await page.getByRole("button", { name: "Nova despesa recorrente" }).click();
  await page.getByLabel("Descrição", { exact: true }).fill("Internet");
  await page.getByLabel("Valor (R$)").fill("120");
  await page
    .getByRole("dialog")
    .getByLabel("Categoria")
    .selectOption("home-bills");
  await page
    .getByLabel("Conta ou cartão")
    .selectOption({ label: "Conta da casa" });
  await page
    .getByLabel("Primeiro vencimento")
    .fill(await page.evaluate(() => new Date().toISOString().slice(0, 10)));
  await page.getByLabel("Frequência").selectOption("monthly");
  await page.getByRole("button", { name: "Criar recorrência" }).click();
  await expect(
    page.getByText("Internet", { exact: true }).first(),
  ).toBeVisible();
  await page.locator(".forecast-row .row-menu summary").click();
  await page.getByRole("button", { name: "Editar ocorrência" }).click();
  await page.getByLabel("Valor (R$)").fill("130");
  await page.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(page.getByText("R$ 130,00").first()).toBeVisible();
  await page.getByRole("button", { name: "Marcar paga" }).click();
  await expect(page.getByText("Paga", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Saldo atual das contas").locator(".."),
  ).toContainText("2.345,00");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Minhas finanças" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("fatura aparece pelo vencimento e pagamento entra no mês pago", async ({
  page,
}) => {
  await page.goto("/");
  const period = page.locator(".app-header input[type=month]");
  const currentMonth = await period.inputValue();
  const priorMonth = shiftMonth(currentMonth, -1);
  const dueMonth = currentMonth;
  const forecastDueMonth = shiftMonth(currentMonth, 1);
  await addAccount(page, "Nova conta bancária", "Banco");
  await addAccount(page, "Novo cartão", "Nubank");
  await expect(
    page
      .locator(".account-row")
      .filter({ hasText: "Nubank" })
      .locator(".account-balance"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Faturas", exact: true }).click();
  await page.getByRole("button", { name: "+ Fatura" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Cartão")
    .selectOption({ label: "Nubank" });
  await page.getByRole("dialog").getByLabel("Mês da fatura").fill(priorMonth);
  await page.getByLabel("Valor total da fatura (R$)").fill("1500");
  await page.getByLabel("Vencimento").fill(`${dueMonth}-15`);
  await expect(
    page.getByLabel("Criar previsão desse valor para os próximos meses"),
  ).not.toBeChecked();
  await page
    .getByLabel("Criar previsão desse valor para os próximos meses")
    .check();
  await page.getByRole("button", { name: "Salvar fatura" }).click();
  await expect(
    page
      .getByRole("dialog")
      .locator(".invoice-row")
      .filter({ hasText: "Nubank" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await period.fill(priorMonth);
  await expect(page.locator("#movements .invoice-list-row")).toHaveCount(0);

  await period.fill(dueMonth);
  const openInvoice = page
    .locator("#movements .invoice-list-row")
    .filter({ hasText: "Nubank" });
  await expect(openInvoice).toHaveCount(1);
  await page.getByRole("button", { name: "Faturas", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .locator(".invoice-row")
      .filter({ hasText: "Nubank" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();

  await openInvoice.locator(".pay-details summary").click();
  await page
    .locator(".payment-form select[name=source]")
    .selectOption({ label: "Banco" });
  await page.locator(".payment-form input[name=amount]").fill("500");
  await page.getByRole("button", { name: "Registrar pagamento" }).click();
  await period.fill(currentMonth);
  const cardPayment = page
    .locator("#movements .list-row")
    .filter({ hasText: "Pagamento da fatura · Nubank" });
  await expect(cardPayment).toHaveCount(1);
  await page.getByLabel("Filtrar por conta").selectOption({ label: "Nubank" });
  await expect(cardPayment).toHaveCount(1);
  await period.fill(priorMonth);
  await expect(cardPayment).toHaveCount(0);
  await period.fill(dueMonth);
  await expect(page.locator("#movements .invoice-list-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Faturas", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .locator(".invoice-row")
      .filter({ hasText: "Nubank" }),
  ).toContainText("resta R$ 1.000,00");
  await page.keyboard.press("Escape");
  await page.getByLabel("Filtrar por conta").selectOption("");
  await period.fill(forecastDueMonth);
  await page.getByRole("button", { name: "Faturas", exact: true }).click();
  await expect(
    page.getByText("Prevista", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("R$ 1.500,00").first()).toBeVisible();
});

test("formulários e listas cabem no mobile e botão adicionar abre bottom sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "+ Adicionar" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.locator(".add-option").filter({ hasText: "Nova despesa" }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await addAccount(page, "Nova conta bancária", "Banco mobile");
  await page.getByRole("button", { name: "+ Adicionar" }).click();
  await page
    .locator(".add-option")
    .filter({ hasText: "Nova despesa" })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.keyboard.press("Escape");
});
