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
  await page.getByRole("button", { name: "Salvar movimentação" }).click();
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
  await page.getByLabel("Tipo de gasto").selectOption("home-bills");
  await page.getByLabel("Descrição (opcional)").fill("Gás");
  await page.getByRole("button", { name: "Salvar movimentação" }).click();
  await expect(page.getByText("Gás", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "+ Adicionar" }).click();
  await page.getByRole("button", { name: "Nova transferência" }).click();
  await page.getByLabel("Valor (R$)").fill("50");
  await page.getByLabel("Saiu de").selectOption({ label: "Conta da casa" });
  await page.getByLabel("Entrou em").selectOption({ label: "Outra conta" });
  // Contas do mesmo tipo continuam sendo uma transferência, sem gerar receitas ou despesas.
  await page.getByRole("button", { name: "Salvar movimentação" }).click();
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

test("fatura manual e previsão mensal não exigem compras individuais", async ({
  page,
}) => {
  await page.goto("/");
  await addAccount(page, "Nova conta bancária", "Banco");
  await addAccount(page, "Novo cartão", "Nubank");
  await page.getByRole("button", { name: "+ Adicionar" }).click();
  await page.getByRole("button", { name: "Nova fatura" }).click();
  await page.getByLabel("Cartão").selectOption({ label: "Nubank" });
  await page
    .getByRole("dialog")
    .getByLabel("Mês de referência")
    .fill("2027-05");
  await page.getByLabel("Valor total (R$)").fill("1500");
  await page.getByLabel("Vencimento").fill("2027-06-15");
  await expect(
    page.getByLabel("Repetir este valor nos próximos meses"),
  ).not.toBeChecked();
  await page.getByLabel("Repetir este valor nos próximos meses").check();
  await page.getByRole("button", { name: "Salvar fatura" }).click();
  const period = page.locator(".app-header input[type=month]");
  await period.fill("2027-05");
  await expect(
    page.locator(".invoice-row").filter({ hasText: "Nubank" }),
  ).toBeVisible();
  await expect(page.getByText("R$ 1.500,00").first()).toBeVisible();
  await page.getByText("Pagar", { exact: true }).click();
  await page
    .locator(".payment-form select[name=source]")
    .selectOption({ label: "Banco" });
  await page.locator(".payment-form input[name=amount]").fill("500");
  await page.getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(page.getByText("R$ 1.000,00").first()).toBeVisible();
  await period.fill("2027-06");
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
