import { test, expect } from "@playwright/test";
test("contas, parcela, pagamento, orçamento e persistência", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Contas", exact: false })
    .first()
    .click();
  await page.getByLabel("Nome", { exact: true }).fill("Banco da casa");
  await page.getByLabel("Saldo ao começar (R$)").fill("1000");
  await page.getByRole("button", { name: "Cadastrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Banco da casa" }),
  ).toBeVisible();
  await expect(page.getByLabel("Fechamento da fatura (dia)")).toHaveCount(0);
  await page.getByLabel("Nome", { exact: true }).fill("Cartão da casa");
  await page
    .getByRole("combobox", { name: "Tipo", exact: true })
    .selectOption("card");
  await expect(page.getByLabel("Saldo ao começar (R$)")).toHaveCount(0);
  await page.getByLabel("Fechamento da fatura (dia)").fill("10");
  await page.getByLabel("Vencimento da fatura (dia)").fill("28");
  await page.getByRole("button", { name: "Cadastrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Cartão da casa" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mais", exact: true }).click();
  await page.getByRole("button", { name: "Orçamento", exact: true }).click();
  await page.getByLabel("Valor mensal (R$)").fill("2000");
  await page.getByRole("button", { name: "Salvar renda" }).click();
  await page.getByRole("button", { name: "+ Nova movimentação" }).click();
  await page.getByLabel("Valor (R$)", { exact: true }).fill("600");
  await page.getByLabel("Data", { exact: true }).fill("2026-11-01");
  await page.getByLabel("Tipo de gasto").selectOption("food");
  await page
    .getByLabel("Conta ou cartão")
    .selectOption({ label: "Cartão da casa" });
  await page.getByLabel("Parcelas", { exact: true }).fill("3");
  await page.getByLabel("Descrição (opcional)").fill("Compra parcelada");
  await page.getByRole("button", { name: "Salvar movimentação" }).click();
  await expect(
    page.getByRole("heading", { name: "Nova movimentação" }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByLabel("Mês de referência").fill("2026-11");
  await page.getByRole("button", { name: "Ver todas as faturas" }).click();
  await expect(page.getByText("Parcela 1/3")).toBeVisible();
  await page.getByLabel("Pagar com").selectOption({ label: "Banco da casa" });
  await page.getByLabel("Valor (R$)", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(page.getByText("Restante").locator("strong")).toContainText(
    "100,00",
  );
  await page
    .getByRole("button", { name: "Resumo", exact: false })
    .first()
    .click();
  await expect(
    page.getByText("Gastos no mês", { exact: true }).locator(".."),
  ).toContainText("600,00");
  await expect(
    page.getByText("Saldo em contas", { exact: true }).locator(".."),
  ).toContainText("900,00");
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "artifacts/dashboard-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("movimentação de receita editável e edição segura da conta", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Contas", exact: false })
    .first()
    .click();
  await page.getByLabel("Nome", { exact: true }).fill("Conta");
  await page.getByLabel("Saldo ao começar (R$)").fill("0");
  await page.getByRole("button", { name: "Cadastrar", exact: true }).click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Conta conjunta");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(
    page.getByRole("heading", { name: "Conta conjunta" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ Nova movimentação" }).click();
  await page.getByRole("button", { name: "Recebi", exact: true }).click();
  await page.getByLabel("Valor (R$)", { exact: true }).fill("500");
  await page.getByLabel("Entrou em").selectOption({ label: "Conta conjunta" });
  await page.getByRole("button", { name: "Salvar movimentação" }).click();
  await expect(page.getByRole("cell", { name: "+ R$ 500,00" })).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Valor (R$)", { exact: true }).fill("700");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("cell", { name: "+ R$ 700,00" })).toBeVisible();
  await page.getByRole("button", { name: "Contas", exact: true }).click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Tipo", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("button", { name: "Movimentações", exact: false })
    .click();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(
    page.getByText("Nenhuma movimentação neste período."),
  ).toBeVisible();
});
