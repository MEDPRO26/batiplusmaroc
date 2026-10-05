import { defineConfig, devices } from "@playwright/test";

/** Real owner/Admin components with mocked sessions/HTTP; loopback settings only. */
export default defineConfig({
  testDir: "./tests/e2e", testMatch: ["company-owner-portfolio-images.spec.ts", "admin-portfolio-images.spec.ts", "admin-companies.spec.ts", "admin-company-logo.spec.ts"],
  fullyParallel: false, workers: 1, forbidOnly: Boolean(process.env.CI), reporter: "list",
  use: { baseURL: "http://127.0.0.1:3108", screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3108",
    url: "http://127.0.0.1:3108/en", reuseExistingServer: false, timeout: 120_000,
    env: { BATIPLUS_E2E_DIST_DIR: ".next/portfolio-images-e2e", NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210", CONVEX_URL: "http://127.0.0.1:3210", NEXT_PUBLIC_CONVEX_SITE_URL: "http://127.0.0.1:3211", CONVEX_SITE_URL: "http://127.0.0.1:3211" },
  },
});
