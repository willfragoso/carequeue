import { test, expect, type APIRequestContext } from "@playwright/test";

// The suite only needs the queue to hold enough cases; it reuses what is already there
// (for example the seed data) and creates the rest through the API.
async function ensureCases(request: APIRequestContext, minimum: number) {
  const summary = await (await request.get("/api/cases/summary")).json();
  for (let index = summary.data.total; index < minimum; index++) {
    const response = await request.post("/api/cases", {
      data: {
        title: "Teste e2e · caso de apoio " + index,
        description: "Criado pelo teste de navegador para preencher a fila.",
      },
    });
    expect(response.ok()).toBe(true);
  }
}

async function createResolvedCase(request: APIRequestContext) {
  const created = await request.post("/api/cases", {
    data: {
      title: "Teste e2e · solicitação resolvida " + Date.now(),
      description: "Percorre toda a triagem pela API.",
    },
  });
  const { id } = (await created.json()).data;
  for (const status of ["TRIAGE", "ASSIGNED", "RESOLVED"])
    expect(
      (
        await request.patch(`/api/cases/${id}/status`, { data: { status } })
      ).ok(),
    ).toBe(true);
}
test("creates a case, advances triage and traces its notification", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Solicitações", level: 1 }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Nova solicitação", exact: true })
    .click();
  const title = "Teste e2e · fluxo completo " + Date.now();
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Descrição gerada pelo teste de navegador.");
  await page
    .getByRole("button", { name: "Criar solicitação", exact: true })
    .click();
  const details = page.getByRole("complementary", {
    name: "Detalhes da solicitação",
  });
  await expect(details.getByRole("heading", { name: title })).toBeVisible();
  await expect(details.getByRole("tab", { name: /Histórico/ })).toBeVisible();
  await expect(
    details.getByRole("tab", { name: "Entrega do evento" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Mapa", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Componentes que executam a demonstração.",
    }),
  ).toBeVisible();
  await expect(
    page
      .getByLabel("Diagrama dos sistemas CareQueue")
      .getByText("Express API", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Como uma solicitação vira uma notificação confiável.",
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Fluxo", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Como uma solicitação vira uma notificação confiável.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Cases + History + Outbox")).toBeVisible();
  await expect(
    details.getByText("Notificação simulada salva", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    details.getByText("1 notificação(ões) · efeito protegido por eventId", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    details.getByText("correlationId", { exact: true }),
  ).toBeVisible();
  await details
    .getByRole("button", { name: "Avançar para em triagem" })
    .click();
  await expect(
    details.getByRole("button", { name: "Avançar para atribuída" }),
  ).toBeVisible();
  await details.getByRole("button", { name: "Avançar para atribuída" }).click();
  await expect(
    details.getByRole("button", { name: "Avançar para resolvida" }),
  ).toBeVisible();
  await details.getByRole("button", { name: "Avançar para resolvida" }).click();
  await expect(
    details.getByRole("button", { name: "Solicitação resolvida" }),
  ).toBeDisabled();
  await details.getByRole("tab", { name: /Histórico/ }).click();
  await expect(details.getByRole("listitem")).toHaveCount(4);
  await page.getByRole("button", { name: "Fluxo", exact: true }).click();
  await expect(
    page.getByText("docker compose stop rabbitmq", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Repita a entrega" }),
  ).toBeVisible();
});
test("shows server errors with a correlation ID and preserves entered input", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Nova solicitação", exact: true })
    .click();
  await page
    .getByLabel("Título", { exact: true })
    .fill("Teste e2e · solicitação rejeitada");
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Solicitação usada para exibir o erro da API.");
  // Browser-only response fixture; runtime and reliability tests use real services.
  await page.route("**/api/cases", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 400,
          contentType: "application/json",
          headers: {
            "x-correlation-id": "87ba5cdd-9498-49e2-b271-24dccadf0b65",
          },
          body: JSON.stringify({
            error: { code: "VALIDATION_ERROR", message: "Invalid input" },
          }),
        })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "Criar solicitação", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("VALIDATION_ERROR");
  await expect(page.getByRole("alert")).toContainText(
    "87ba5cdd-9498-49e2-b271-24dccadf0b65",
  );
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue(
    "Teste e2e · solicitação rejeitada",
  );
});
test("works at a mobile viewport without horizontal document overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Nova solicitação", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Mapa", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Componentes que executam a demonstração.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fluxo", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Como uma solicitação vira uma notificação confiável.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Glossário", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Termos técnicos em linguagem simples.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Outbox" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Idempotência" }),
  ).toBeVisible();
});

test("filters by status with counts and keeps the selection panel in sync", async ({
  page,
  request,
}) => {
  await createResolvedCase(request);
  await page.goto("/");
  const filters = page.getByRole("group", { name: "Filtrar por status" });
  await expect(
    filters.getByRole("button", { name: /^Todas \d+$/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: /^Resolvidas \d+$/ }).click();
  await expect(
    filters.getByRole("button", { name: /^Resolvidas \d+$/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const rows = page.getByRole("table").getByRole("row");
  const range = page.locator("p.range");
  await expect(rows.nth(1)).toBeVisible();
  const badges = page.getByRole("table").locator(".badge");
  expect(await badges.count()).toBeGreaterThan(0);
  for (const text of await badges.allTextContents())
    expect(text.trim()).toBe("Resolvida");
  await expect(range).toHaveText(/^\s*Exibindo \d+–\d+ de \d+\s*$/);

  await rows.nth(1).click();
  await expect(
    page.getByRole("complementary", { name: "Detalhes da solicitação" }),
  ).toBeVisible();
});

test("paginates the list and changes the page size", async ({
  page,
  request,
}) => {
  await ensureCases(request, 12);
  await page.goto("/");
  const next = page.getByRole("button", { name: "Próxima página" });
  const previous = page.getByRole("button", { name: "Página anterior" });
  const first = page.getByRole("button", { name: "Primeira página" });
  const rows = page.getByRole("table").getByRole("row");
  const range = page.locator("p.range");
  const indicator = page.locator(".page-indicator");

  await expect(indicator).toHaveText(/^\s*Página 1 de \d+\s*$/);
  await expect(rows).toHaveCount(11); // header + 10 cases
  await expect(previous).toBeDisabled();
  await expect(first).toBeDisabled();

  await next.click();
  await expect(indicator).toHaveText(/^\s*Página 2 de \d+\s*$/);
  await expect(range).toHaveText(/^\s*Exibindo 11–\d+ de \d+\s*$/);
  await expect(previous).toBeEnabled();
  await first.click();
  await expect(indicator).toHaveText(/^\s*Página 1 de \d+\s*$/);

  await page.getByLabel("Itens por página").selectOption("20");
  await expect(range).toHaveText(/^\s*Exibindo 1–\d+ de \d+\s*$/);
  expect(await rows.count()).toBeGreaterThan(11);
});
