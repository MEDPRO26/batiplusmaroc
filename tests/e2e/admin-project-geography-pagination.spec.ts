import { expect, test } from "@playwright/test";
import { getProvincesByRegion } from "../../lib/geography/morocco";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";

// Real controls and app CSS; the Convex pager is mocked. Backend pagination has
// independent convex-test coverage, including source records beyond the old cap.
let bundle = "";
const path = "admin.projects.listProjectsPage";
type PagerArgs = { status: string; search?: string; city?: string; regionCode?: string; provinceCode?: string };
type HarnessWindow = typeof window & {
  __paginatedArgs: { path: string; args: PagerArgs; options: { initialNumItems: number } }[];
  __paginatedQueries: Record<string, { results: unknown[]; status: string }>;
  __paginationCalls: { path: string; numItems: number }[];
  __paginationHandlers: Record<string, (numItems: number) => void>;
  __mutationCalls?: unknown[];
};

test.beforeAll(async () => {
  bundle = await buildHarness(
    'import { AdminShell } from "./features/admin/components/admin-shell"; import { AdminProjectsPanel } from "./features/admin/components/admin-projects-panel";',
    '<AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><AdminProjectsPanel /></AdminShell>',
  );
});
test.beforeEach(async ({ page, baseURL }) => {
  await page.route("**/*", (route) => route.request().url().startsWith(baseURL!) ? route.continue() : route.abort());
});

for (const locale of ["fr", "en"] as const) {
  const messages = locale === "fr" ? fr : en;
  const t = messages.adminProjects;

  test(`${locale}: geography dependencies, clear and existing filters send fresh pager arguments`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mountHarness(page, bundle, { __locale: locale, __pathname: "/admin/projects", __queries: {},
      __paginatedQueries: { [path]: { results: [], status: "Exhausted" } } });
    const region = page.getByRole("combobox", { name: t.regionLabel, exact: true });
    const province = page.getByRole("combobox", { name: t.provinceLabel, exact: true });
    const city = page.getByRole("combobox", { name: t.cityLabel, exact: true });
    const status = page.getByRole("combobox", { name: t.statusFilterLabel, exact: true });
    const search = page.getByRole("textbox", { name: t.searchLabel, exact: true });
    const latest = () => page.evaluate((queryPath) => (window as HarnessWindow).__paginatedArgs
      .filter((call) => call.path === queryPath).at(-1)?.args, path);
    await expect(province).toBeDisabled();
    await region.selectOption("05");
    await expect(province).toBeEnabled();
    await expect(province.getByRole("option")).toHaveCount(getProvincesByRegion("05").length + 1);
    await province.selectOption("05.081");
    await expect.poll(latest).toEqual({ status: "pending_review", regionCode: "05", provinceCode: "05.081" });
    await region.selectOption("09");
    await expect(province).toHaveValue("");
    await expect(province.getByRole("option")).toHaveCount(getProvincesByRegion("09").length + 1);
    await expect.poll(latest).toEqual({ status: "pending_review", regionCode: "09" });
    await province.selectOption("09.541");
    await search.fill("  rural roof  ");
    await city.selectOption("rabat");
    await status.selectOption("published");
    await expect.poll(latest).toEqual({ status: "published", regionCode: "09", provinceCode: "09.541",
      search: "rural roof", city: "rabat" });
    await region.focus();
    await page.keyboard.press("Tab");
    await expect(province).toBeFocused();
    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(region).toBeVisible();
      await expect(province).toBeVisible();
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }
    await page.screenshot({ path: testInfo.outputPath(`${locale}-project-filters.png`), fullPage: true });
    await page.getByRole("button", { name: t.clearFilters, exact: true }).click();
    await expect(province).toBeDisabled();
    await expect(region).toHaveValue("");
    await expect(province).toHaveValue("");
    await expect(search).toHaveValue("");
    await expect(city).toHaveValue("");
    await expect(status).toHaveValue("all");
    await expect.poll(latest).toEqual({ status: "all" });
    const calls = await page.evaluate((queryPath) => (window as HarnessWindow).__paginatedArgs
      .filter((call) => call.path === queryPath), path);
    expect(calls.length).toBeGreaterThan(6);
    expect(calls.every((call) => call.options.initialNumItems === 25)).toBe(true);
    expect(calls.some((call) => call.args.regionCode === "09" && call.args.provinceCode === "05.081")).toBe(false);
    expect(errors).toEqual([]);
  });

  test(`${locale}: empty intermediate pages remain loadable and later matches survive loading`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mountHarness(page, bundle, { __locale: locale, __pathname: "/admin/projects", __queries: {},
      __paginationCalls: [], __paginatedQueries: { [path]: { results: [], status: "CanLoadMore" } } });
    await page.evaluate((queryPath) => {
      const state = window as HarnessWindow;
      state.__paginationHandlers = { [queryPath]: () => {
        state.__paginatedQueries[queryPath].status = "LoadingMore";
        window.dispatchEvent(new Event("convex-harness-update"));
      } };
    }, path);
    const loadMore = page.getByRole("button", { name: t.pagination.loadMore, exact: true });
    await expect(page.getByText(t.empty, { exact: true })).toHaveCount(0);
    await expect(page.getByText(t.pagination.moreMatches, { exact: true })).toBeVisible();
    await loadMore.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: t.pagination.loadingMore, exact: true })).toBeDisabled();
    await page.evaluate((queryPath) => {
      (window as HarnessWindow).__paginatedQueries[queryPath].status = "CanLoadMore";
      window.dispatchEvent(new Event("convex-harness-update"));
    }, path);
    await expect(loadMore).toBeEnabled();
    await expect(page.getByText(t.empty, { exact: true })).toHaveCount(0);
    await loadMore.click();
    await page.evaluate((queryPath) => {
      (window as HarnessWindow).__paginatedQueries[queryPath] = {
        results: [{ projectId: "older-201", title: "Later matching rural project", clientName: "Client Tester",
          city: "rabat", category: null, customCategoryText: null, submittedAt: null, status: "pending_review" }],
        status: "CanLoadMore",
      };
      window.dispatchEvent(new Event("convex-harness-update"));
    }, path);
    const target = page.getByText("Later matching rural project", { exact: true }).filter({ visible: true });
    await expect(target).toBeVisible();
    await loadMore.click();
    await expect(target).toBeVisible();
    await expect(page.getByRole("button", { name: t.pagination.loadingMore, exact: true })).toBeDisabled();
    await page.evaluate((queryPath) => {
      (window as HarnessWindow).__paginatedQueries[queryPath].status = "Exhausted";
      window.dispatchEvent(new Event("convex-harness-update"));
    }, path);
    await expect(target).toBeVisible();
    await expect(loadMore).toHaveCount(0);
    expect(await page.evaluate(() => (window as HarnessWindow).__paginationCalls)).toEqual(
      Array.from({ length: 3 }, () => ({ path, numItems: 25 })),
    );
    expect(await page.evaluate(() => (window as HarnessWindow).__mutationCalls ?? [])).toEqual([]);
    expect(errors).toEqual([]);
  });
}
