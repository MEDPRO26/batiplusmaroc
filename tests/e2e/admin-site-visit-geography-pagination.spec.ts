import { expect, test } from "@playwright/test";
import { getProvincesByRegion } from "../../lib/geography/morocco";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";

// Real controls/CSS with mocked Convex. Handler pagination/projection/security is
// independently exercised by convex-test; this is not authenticated live E2E.
let bundle = "";
const path = "admin.siteVisits.listSiteVisitsPage";
const gate = "admin.siteVisits.getSiteVisitPaginationRollout";
const legacy = "admin.siteVisits.listSiteVisits";
type PagerArgs = { status: string; now: number; projectSearch?: string; companySearch?: string; city?: string;
  dateFrom?: string; dateTo?: string; regionCode?: string; provinceCode?: string };
type HarnessWindow = typeof window & {
  __queries: Record<string, unknown>;
  __paginatedArgs: { path: string; args: PagerArgs | "skip"; options: { initialNumItems: number } }[];
  __paginatedQueries: Record<string, { results: unknown[]; status: string }>;
  __paginationCalls: { path: string; numItems: number }[];
  __paginationHandlers: Record<string, (numItems: number) => void>;
};
const row = { assessmentId: "older-202", projectId: "private-rural", projectTitle: "Later matching rural visit",
  clientName: "Client Tester", companyName: "Atlas Build", city: "rabat", assessmentStatus: "accepted",
  visitDate: null, visitTime: null, proposedBy: null, status: "accepted", finalQuoteStatus: "not_available", riskSignal: null, sortAt: 1 };

test.beforeAll(async () => {
  bundle = await buildHarness(
    'import { AdminShell } from "./features/admin/components/admin-shell"; import { AdminSiteVisitsPanel } from "./features/admin/components/admin-site-visits-panel";',
    '<AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><AdminSiteVisitsPanel /></AdminShell>',
  );
});
test.beforeEach(async ({ page, baseURL }) => {
  await page.route("**/*", (route) => route.request().url().startsWith(baseURL!) ? route.continue() : route.abort());
});

for (const locale of ["fr", "en"] as const) {
  const t = (locale === "fr" ? fr : en).adminSiteVisits;
  test(`${locale}: geography dependencies reset pages and clearing geography preserves other filters at 320/375/desktop`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mountHarness(page, bundle, { __locale: locale, __pathname: "/admin/site-visits",
      __queries: { [gate]: { enabled: true, reason: null }, [legacy]: [row] },
      __paginatedQueries: { [path]: { results: [], status: "Exhausted" } } });
    const region = page.getByRole("combobox", { name: t.filters.regionLabel, exact: true });
    const province = page.getByRole("combobox", { name: t.filters.provinceLabel, exact: true });
    const latest = () => page.evaluate((queryPath) => {
      const args = (window as HarnessWindow).__paginatedArgs.filter((call) => call.path === queryPath).at(-1)?.args;
      if (!args || args === "skip") return args;
      const copy = { ...args }; delete (copy as Partial<PagerArgs>).now;
      return copy;
    }, path);
    await expect(province).toBeDisabled();
    await expect(region.getByRole("option")).toHaveCount(13);
    await region.selectOption("05"); await province.selectOption("05.081");
    await expect.poll(latest).toEqual({ status: "all", regionCode: "05", provinceCode: "05.081" });
    await region.selectOption("09");
    await expect(province).toHaveValue("");
    await expect(province.getByRole("option")).toHaveCount(getProvincesByRegion("09").length + 1);
    await province.selectOption("09.541");
    await page.getByRole("searchbox", { name: t.filters.projectLabel, exact: true }).fill("  rural roof  ");
    await page.getByRole("searchbox", { name: t.filters.companyLabel, exact: true }).fill("Atlas");
    await page.getByRole("combobox", { name: t.filters.cityLabel, exact: true }).selectOption("rabat");
    await page.getByLabel(t.filters.dateFrom, { exact: true }).fill("2026-10-10");
    await page.getByLabel(t.filters.dateTo, { exact: true }).fill("2026-10-20");
    await page.getByRole("button", { name: t.tabs.confirmed, exact: true }).click();
    const expected = { status: "confirmed", projectSearch: "rural roof", companySearch: "Atlas", city: "rabat", dateFrom: "2026-10-10", dateTo: "2026-10-20" };
    await expect.poll(latest).toEqual({ ...expected, regionCode: "09", provinceCode: "09.541" });
    await region.focus(); await page.keyboard.press("Tab"); await expect(province).toBeFocused();
    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(region).toBeVisible(); await expect(province).toBeVisible();
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }
    await page.screenshot({ path: testInfo.outputPath(`${locale}-site-visit-filters.png`), fullPage: true });
    await page.getByRole("button", { name: t.filters.clearGeography, exact: true }).click();
    await expect(region).toHaveValue(""); await expect(province).toBeDisabled();
    await expect.poll(latest).toEqual(expected);
    await expect(page.getByRole("searchbox", { name: t.filters.projectLabel, exact: true })).toHaveValue("  rural roof  ");
    await page.getByLabel(t.filters.dateFrom, { exact: true }).fill("2026-10-21");
    await expect(page.getByRole("alert")).toHaveText(t.filters.invalidRange);
    await expect.poll(latest).toBe("skip");
    await page.getByLabel(t.filters.dateFrom, { exact: true }).fill("2026-10-10");
    await expect.poll(latest).toEqual(expected);
    const calls = await page.evaluate((queryPath) => (window as HarnessWindow).__paginatedArgs.filter((call) => call.path === queryPath), path);
    expect(calls.every((call) => call.options.initialNumItems === 25)).toBe(true);
    expect(calls.some((call) => call.args !== "skip" && call.args.regionCode === "09" && call.args.provinceCode === "05.081")).toBe(false);
    expect(errors).toEqual([]);
  });

  test(`${locale}: empty intermediate pages remain loadable, preserve later rows and show exhaustion accurately`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await mountHarness(page, bundle, { __locale: locale, __pathname: "/admin/site-visits", __queries: { [gate]: { enabled: true, reason: null } },
      __paginationCalls: [], __paginatedQueries: { [path]: { results: [], status: "CanLoadMore" } } });
    await page.evaluate((queryPath) => {
      const state = window as HarnessWindow;
      state.__paginationHandlers = { [queryPath]: () => { state.__paginatedQueries[queryPath].status = "LoadingMore";
        window.dispatchEvent(new Event("convex-harness-update")); } };
    }, path);
    const more = page.getByRole("button", { name: t.pagination.loadMore, exact: true });
    await expect(page.getByText(t.empty, { exact: true })).toHaveCount(0);
    await expect(page.getByText(t.pagination.moreMatches, { exact: true })).toBeVisible();
    await more.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: t.pagination.loadingMore, exact: true })).toBeDisabled();
    await page.evaluate(({ queryPath, match }) => {
      (window as HarnessWindow).__paginatedQueries[queryPath] = { results: [match], status: "CanLoadMore" };
      window.dispatchEvent(new Event("convex-harness-update"));
    }, { queryPath: path, match: row });
    await expect(page.getByRole("button", { name: t.viewAria.replace("{project}", row.projectTitle), exact: true })).toBeVisible();
    await more.click();
    await expect(page.getByRole("button", { name: t.pagination.loadingMore, exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: t.viewAria.replace("{project}", row.projectTitle), exact: true })).toBeVisible();
    const calls = await page.evaluate((queryPath) => (window as HarnessWindow).__paginationCalls.filter((call) => call.path === queryPath), path);
    expect(calls.map((call) => call.numItems)).toEqual([25, 25]);
    await page.evaluate((queryPath) => {
      (window as HarnessWindow).__paginatedQueries[queryPath] = { results: [], status: "Exhausted" };
      window.dispatchEvent(new Event("convex-harness-update"));
    }, path);
    await expect(page.getByText(t.empty, { exact: true })).toBeVisible();
    await expect(more).toHaveCount(0); expect(errors).toEqual([]);
  });

  test(`${locale}: clock refresh updates follow-up risk without resetting loaded cursor arguments`, async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-15T08:59:30Z") });
    const planned = { ...row, status: "confirmed", visitDate: "2026-10-15", visitTime: "10:00", sortAt: Date.UTC(2026, 9, 15, 9) };
    await mountHarness(page, bundle, { __locale: locale, __pathname: "/admin/site-visits",
      __queries: { [gate]: { enabled: true, reason: null } },
      __paginatedQueries: { [path]: { results: [planned, { ...planned, assessmentId: "malformed", projectTitle: "Malformed schedule", visitDate: "invalid", sortAt: 1 }], status: "CanLoadMore" } } });
    const latest = () => page.evaluate((queryPath) => (window as HarnessWindow).__paginatedArgs
      .filter((call) => call.path === queryPath).at(-1)?.args, path);
    await expect.poll(async () => (await latest()) !== "skip").toBe(true);
    const before = await latest();
    expect(before).toMatchObject({ status: "all", now: expect.any(Number) });
    await expect(page.getByRole("table").getByText(t.risk.visit_follow_up_needed, { exact: true })).toHaveCount(0);
    await page.clock.fastForward(61_000);
    expect(await page.evaluate(() => Date.now())).toBeGreaterThan(planned.sortAt);
    await expect(page.getByRole("table").getByText(t.risk.visit_follow_up_needed, { exact: true })).toBeVisible();
    await expect.poll(latest).toEqual(before);
    await expect(page.getByRole("button", { name: t.pagination.loadMore, exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: t.viewAria.replace("{project}", row.projectTitle), exact: true })).toBeVisible();
  });

  test(`${locale}: missing historical coverage keeps the legacy reader active and geographic controls unavailable`, async ({ page }) => {
    await mountHarness(page, bundle, { __locale: locale, __pathname: "/admin/site-visits",
      __queries: { [gate]: { enabled: false, reason: "historical_projection_missing" }, [legacy]: [row] },
      __paginatedQueries: { [path]: { results: [{ ...row, projectTitle: "Should never appear" }], status: "Exhausted" } } });
    await expect(page.getByText(t.pagination.legacyLimited, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: t.viewAria.replace("{project}", row.projectTitle), exact: true })).toBeVisible();
    await expect(page.getByText("Should never appear", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: t.filters.regionLabel, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: t.pagination.loadMore, exact: true })).toHaveCount(0);
    const calls = await page.evaluate((queryPath) => (window as HarnessWindow).__paginatedArgs.filter((call) => call.path === queryPath), path);
    expect(calls.every((call) => call.args === "skip")).toBe(true);
  });
}
