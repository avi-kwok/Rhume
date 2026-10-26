// Playwright smoke test of the demo path (F17). Run with `npm run test:e2e` (separate from `npm test`).
// Uses the locally installed Google Chrome (channel "chrome"), so no browser download is needed.
// Set E2E_BASE_URL to test an already-running server; otherwise a dev server is started on port 3210.

import { defineConfig } from "@playwright/test";

const PORT = 3210;
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  webServer: external
    ? undefined
    : {
        command: `npx next dev -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
