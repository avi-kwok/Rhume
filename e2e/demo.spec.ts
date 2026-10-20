import { expect, test } from "@playwright/test";

// The 90-second demo path (PRD §10): presenter mode, both pause points, brief, SAP order, Scoreboard.
test("presenter demo path runs start to finish with both pauses and lands on the Scoreboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Atlantic", exact: true })).toBeVisible();

  const status = page.getByRole("status");

  // Start presenter mode.
  await page.keyboard.press("p");
  await expect(status).toContainText("Presenter");

  // Pause 1: the first card of the season, highlighted and never auto-approved.
  await expect(status).toContainText("Pause 1 of 2", { timeout: 45_000 });
  await expect(status).toContainText("First card of the season");
  const pause1 = page.locator("article.ring-accent");
  await expect(pause1).toHaveCount(1);
  await expect(pause1).toContainText("Nov");

  // Approve through the SAP order (A opens, A confirms), then resume.
  await page.keyboard.press("a");
  await expect(page.getByRole("dialog")).toContainText("Stock Transport Order 4500000001");
  await page.keyboard.press("a");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press(" ");

  // Pause 2: Atlantic's first store move, week of Jan 8, 2024.
  await expect(status).toContainText("Pause 2 of 2", { timeout: 90_000 });
  await expect(status).toContainText("First Atlantic store move");
  await expect(page.getByText("Week of Jan 8, 2024", { exact: true }).first()).toBeVisible();

  // B opens the brief; read the sections; A → SAP order; A confirms.
  await page.keyboard.press("b");
  const drawer = page.getByRole("dialog", { name: /Atlantic · Store move/ });
  await expect(drawer).toBeVisible();
  for (const section of ["Recommendation", "Why now", "Options compared", "Evidence against", "What would change this decision", "Approval needed", "Sources"]) {
    await expect(drawer.getByRole("heading", { name: section })).toBeVisible();
  }
  await expect(drawer.locator("[data-evidence]").first()).toBeVisible();
  await page.keyboard.press("a");
  const sap = page.getByRole("dialog", { name: /Stock Transport Order 45000/ });
  await expect(sap).toContainText("Simulated, no SAP connection. In production: Joule Studio agent → S/4HANA allocation table and stock transport order.");
  await expect(sap).toContainText("Allocation table AT-ATL-");
  await page.keyboard.press("a");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(status).toContainText("decided");

  // Resume to the end: the presenter lands on the Scoreboard.
  await page.keyboard.press(" ");
  await page.waitForURL("**/scoreboard", { timeout: 90_000 });
  await expect(page.getByText("Stockout region-days")).toBeVisible();
  await expect(page.getByText("Simulated outcome for one product group under stated assumptions.")).toBeVisible();

  expect(errors).toEqual([]);
});
