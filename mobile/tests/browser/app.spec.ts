import { test, expect } from "@playwright/test";
test("flujo móvil: personas, gastos, saldos, persistencia y archivo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Grupo", exact: true }).click();
  for (const name of ["Ana", "Luis"]) {
    await page.getByLabel("Nombre", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Añadir", exact: true }).click();
    await expect(page.locator(".members")).toContainText(name);
  }
  await page.getByRole("button", { name: "Ticket", exact: true }).click();
  await page.getByLabel("¿Quién pagó?").selectOption({ label: "Ana" });
  await page.getByLabel("Producto 1", { exact: true }).fill("Pizza");
  await page.getByLabel("Importe 1", { exact: true }).fill("100.01");
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await page.getByRole("button", { name: "Guardar y repartir" }).click();
  await expect(page.locator(".expense")).toContainText("Pizza");
  await page.reload();
  await expect(page.locator(".expense")).toContainText("Pizza");
  await page.getByRole("button", { name: "Saldos", exact: true }).click();
  await expect(page.locator(".transfer")).toContainText("Luis");
  await expect(page.locator(".transfer")).toContainText("Ana");
  await page.getByRole("button", { name: "Inicio", exact: true }).click();
  await page.getByLabel("Nombre del evento").fill("Cena");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Archivar gastos activos" }).click();
  await page.getByRole("button", { name: "Historial", exact: true }).click();
  await expect(page.locator(".expense")).toContainText("Cena");
  await page.getByRole("button", { name: "Restaurar" }).click();
  await expect(page.locator(".expense")).toHaveCount(0);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.getByRole("button", { name: "Inicio", exact: true }).click();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
test("foto de galería: OCR real, revisión, asignación y guardado", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByRole("button", { name: "Grupo", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Ana");
  await page.getByRole("button", { name: "Añadir", exact: true }).click();
  await expect(page.locator(".members")).toContainText("Ana");
  await page.getByRole("button", { name: "Ticket", exact: true }).click();
  await page
    .getByLabel("Abrir galería", { exact: true })
    .setInputFiles("tests/receipt.png");
  await expect(
    page.getByRole("button", { name: "Guardar y repartir" }),
  ).toBeEnabled({ timeout: 90000 });
  await expect(page.getByLabel("Producto 1", { exact: true })).toHaveValue(
    /PAN/i,
  );
  await expect(page.getByLabel("Importe 1", { exact: true })).toHaveValue(
    "20.00",
  );
  await expect(page.getByLabel("Producto 2", { exact: true })).toHaveValue(
    /LECHE/i,
  );
  await page.getByLabel("¿Quién pagó?").selectOption({ label: "Ana" });
  for (const b of await page
    .getByRole("button", { name: "Todos", exact: true })
    .all())
    await b.click();
  await page.getByLabel(/Revisé nombres/).check();
  await page.getByRole("button", { name: "Guardar y repartir" }).click();
  await expect(page.locator(".expense")).toHaveCount(2);
  await expect(page.locator(".hero-amount")).toContainText("55.50");
});
test("dos navegadores comparten cambios con un código", async ({ browser }) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const p = await a.newPage(),
    q = await b.newPage();
  try {
    await p.goto("/");
    await p.getByRole("button", { name: "Grupo", exact: true }).click();
    await p.getByRole("button", { name: "Crear grupo compartido" }).click();
    const code = await p.getByLabel("Código de invitación").inputValue();
    await q.goto("/");
    await q.getByRole("button", { name: "Grupo", exact: true }).click();
    await q.getByLabel("Entrar a otro grupo").fill(code);
    await q
      .getByRole("button", { name: "Entrar al grupo", exact: true })
      .click();
    await expect(q.getByLabel("Código de invitación")).toHaveValue(code);
    await q.getByLabel("Nombre", { exact: true }).fill("Mar");
    await q.getByRole("button", { name: "Añadir", exact: true }).click();
    await expect(p.locator(".members")).toContainText("Mar", {
      timeout: 15000,
    });
    await q.reload();
    await q.getByRole("button", { name: "Grupo", exact: true }).click();
    await expect(q.getByLabel("Código de invitación")).toHaveValue(code);
  } finally {
    await a.close();
    await b.close();
  }
});
test("modo personal funciona sin conexión después de instalar la caché", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.getByRole("button", { name: "Grupo", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Offline");
  await page.getByRole("button", { name: "Añadir", exact: true }).click();
  await expect(page.locator(".members")).toContainText("Offline");
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "Grupo", exact: true }).click();
  await expect(page.locator(".members")).toContainText("Offline");
  await page.getByLabel("Nombre", { exact: true }).fill("Otra persona");
  await page.getByRole("button", { name: "Añadir", exact: true }).click();
  await expect(page.locator(".members")).toContainText("Otra persona");
  await context.setOffline(false);
});
