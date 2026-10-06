import { defineConfig, devices } from "@playwright/test";

/** Run in an isolated source copy without deployment environment files. All backend calls are mocked. */
export default defineConfig({
  testDir: "./tests/e2e", testMatch: ["admin-legacy-media-ingestion.spec.ts", "admin-legacy-media-retirement.spec.ts", "admin-companies.spec.ts"],
  workers: 1, fullyParallel: false, forbidOnly: Boolean(process.env.CI), reporter: "list",
  use: { baseURL: "http://127.0.0.1:3176", screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3176", url: "http://127.0.0.1:3176/en", reuseExistingServer: false, timeout: 120_000,
    env: { BATIPLUS_E2E_DIST_DIR: ".next/legacy-media-e2e", NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210",
      NEXT_PUBLIC_CONVEX_SITE_URL: "http://127.0.0.1:3211", CONVEX_SITE_URL: "http://127.0.0.1:3211" },
  },
});
