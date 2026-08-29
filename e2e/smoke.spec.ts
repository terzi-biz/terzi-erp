import { test, expect, type ConsoleMessage } from "@playwright/test";

/**
 * Smoke: усі публічні маршрути відкриваються, немає 404/білого екрана,
 * немає console errors і несподіваних 5xx.
 *
 * Маршрути під авторизацією редиректять на /login — це очікувана поведінка,
 * тому перевіряємо саме «сторінка відрендерилась і не впала».
 */
const ROUTES = [
  "/",
  "/login",
  "/crm",
  "/crm/requests",
  "/crm/leads",
  "/crm/tasks",
  "/crm/calls",
  "/crm/contacts",
  "/clients",
  "/calc",
  "/screed",
  "/roofing_pvc",
  "/roofing_rub",
  "/insulation",
  "/demolition",
  "/history",
  "/orders",
  "/orders/new",
  "/operations",
  "/production",
  "/warehouse",
  "/finance",
  "/reports",
  "/marketing",
  "/materials",
  "/works",
  "/settings",
  "/integrations",
  "/access",
];

for (const route of ROUTES) {
  test(`маршрут ${route} відкривається без помилок`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const serverErrors: string[] = [];

    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("response", (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
    });

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `HTTP статус ${route}`).toBeLessThan(400);

    await page.waitForLoadState("networkidle").catch(() => undefined);

    const bodyText = (await page.locator("body").innerText()).trim();
    expect(bodyText.length, `порожня сторінка ${route}`).toBeGreaterThan(0);
    expect(bodyText).not.toContain("Not Found");

    expect(serverErrors, `5xx на ${route}`).toEqual([]);
    expect(consoleErrors, `console errors на ${route}`).toEqual([]);
  });
}
