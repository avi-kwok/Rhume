import { expect, test } from "@playwright/test";

// The 90-second demo path (PRD §10): Mia Lily's story. Presenter mode, one pause point (Atlantic's
// first store move), brief, SAP order, Scoreboard.
test("presenter demo path runs start to finish with the Atlantic pause and lands on the Scoreboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Atlantic", exact: true })).toBeVisible();
  await expect(page.getByLabel("Signed in as Mia Lily · Replenishment Planner · Atlantic")).toBeVisible();

  const status = page.getByRole("status");
  const atlanticTile = page.getByRole("button", { name: /^Atlantic,/ });

  // Start presenter mode. Atlantic (Mia's region) is selected and stays selected.
  await page.keyboard.press("p");
  await expect(status).toContainText("Presenter");
  await expect(atlanticTile).toHaveAttribute("aria-pressed", "true");

  // November: the season's first card is auto-approved, no pause.
  await expect(page.getByText("Week of Dec 4, 2023", { exact: true }).first()).toBeVisible({ timeout: 45_000 });
  await expect(status).toContainText("Playing");
  await expect(atlanticTile).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Atlantic", exact: true })).toBeVisible();

  // The one pause: Atlantic's first store move, week of Jan 8, 2024.
  await expect(status).toContainText("Pause: First Atlantic store move", { timeout: 90_000 });
  await expect(status).toContainText("Atlantic · Store move");
  await expect(page.getByText("Week of Jan 8, 2024", { exact: true }).first()).toBeVisible();
  await expect(atlanticTile).toHaveAttribute("aria-pressed", "true");
  const pause = page.locator("article.ring-accent");
  await expect(pause).toHaveCount(1);
  await expect(pause).toContainText("Atlantic");

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
  await expect(sap).toContainText("Stock Transport Order 4500000001");
  await expect(sap).toContainText("Rhume agent, approved by Mia Lily (Replenishment Planner)");
  await page.keyboard.press("a");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(status).toContainText("decided");

  // Resume to the end: the presenter lands on the Scoreboard.
  await page.keyboard.press(" ");
  await page.waitForURL("**/scoreboard", { timeout: 90_000 });
  await expect(page.getByText("Stockout region-days").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Against a seasonal pre-build" })).toBeVisible();
  await expect(page.getByText("Simulated outcome for one product group under stated assumptions.")).toBeVisible();

  expect(errors).toEqual([]);
});
