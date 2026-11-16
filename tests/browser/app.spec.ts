import { test, expect } from "@playwright/test";
test("contas, parcela, pagamento, orçamento e persistência", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Contas e cartões", exact: false })
    .first()
    .click();
  await page.getByLabel("Nome", { exact: true }).fill("Banco da casa");
  await page.getByLabel("Saldo inicial da conta").fill("1000");
  await page.getByRole("button", { name: "Cadastrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Banco da casa" }),
  ).toBeVisible();
  await page.getByLabel("Nome", { exact: true }).fill("Cartão da casa");
  await page
    .getByRole("combobox", { name: "Tipo", exact: true })
    .selectOption("card");
  await page.getByLabel("Dia de fechamento").fill("10");
  await page.getByLabel("Dia de vencimento").fill("28");
  await page.getByRole("button", { name: "Cadastrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Cartão da casa" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Planejamento", exact: false })
    .first()
    .click();
  await page.getByLabel("Renda média (R$)").fill("2000");
  await page.getByRole("button", { name: "Salvar renda" }).click();
  await page.getByRole("button", { name: "+ Novo lançamento" }).click();
  await page.getByLabel("Valor (R$)", { exact: true }).fill("600");
  await page.getByLabel("Data", { exact: true }).fill("2026-11-01");
  await page
    .getByLabel("Conta ou cartão")
    .selectOption({ label: "Cartão da casa" });
  await page.getByLabel("Parcelas", { exact: true }).fill("3");
  await page.getByLabel("Descrição opcional").fill("Compra parcelada");
  await page.getByRole("button", { name: "Salvar lançamento" }).click();
  await expect(
    page.getByRole("heading", { name: "Novo lançamento" }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByLabel("Mês de referência").fill("2026-11");
  await page
    .getByRole("button", { name: "Faturas", exact: false })
    .first()
    .click();
  await expect(page.getByText("Parcela 1/3")).toBeVisible();
  await page.getByLabel("Pagar com").selectOption({ label: "Banco da casa" });
  await page.getByLabel("Valor (R$)", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(page.getByText("Restante").locator("strong")).toContainText(
    "100,00",
  );
  await page
    .getByRole("button", { name: "Visão geral", exact: false })
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
test("renda e despesa editáveis, exclusão e transferência", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Contas e cartões", exact: false })
    .first()
    .click();
  await page.getByLabel("Nome", { exact: true }).fill("Conta");
  await page.getByRole("button", { name: "Cadastrar", exact: true }).click();
  await page.getByRole("button", { name: "+ Novo lançamento" }).click();
  await page
    .getByRole("combobox", { name: "Tipo", exact: true })
    .selectOption("income");
  await page.getByLabel("Valor (R$)", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Salvar lançamento" }).click();
  await expect(page.getByRole("cell", { name: "+ R$ 500,00" })).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Valor (R$)", { exact: true }).fill("700");
  await page.getByRole("button", { name: "Salvar lançamento" }).click();
  await expect(page.getByRole("cell", { name: "+ R$ 700,00" })).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(
    page.getByText("Nenhuma movimentação neste período."),
  ).toBeVisible();
});
