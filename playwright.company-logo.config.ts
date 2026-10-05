import { defineConfig, devices } from "@playwright/test";

/** Logo browser checks use mocked Convex and a fresh local server, never deployment settings. */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["company-owner-logo.spec.ts", "company-profile.spec.ts", "admin-company-logo.spec.ts", "admin-companies.spec.ts"],
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3107", screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3107",
    url: "http://127.0.0.1:3107/en",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      BATIPLUS_E2E_DIST_DIR: ".next/company-logo-e2e",
      NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210",
      NEXT_PUBLIC_CONVEX_SITE_URL: "http://127.0.0.1:3211",
      CONVEX_SITE_URL: "http://127.0.0.1:3211",
    },
  },
});
