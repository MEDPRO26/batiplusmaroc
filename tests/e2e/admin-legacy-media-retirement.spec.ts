import { test, expect, type Page } from "@playwright/test";
import { buildHarness, mountHarness, hasHorizontalOverflow } from "./support/component-harness";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const list = "legacyMediaIngestion.retirement.listRetirements";
const check = "legacyMediaIngestion.retirement.getReadiness";
const action = "legacyMediaIngestion.retirementActions.retire";
const row = { ingestionId: "ingestion", companyId: "company", companyName: "Atlas", projectTitle: "Villa", mediaType: "portfolioGallery", provider: "r2", ingestionStatus: "ingested", moderationStatus: "approved", retirementStatus: "not_ready", cacheVerificationRequired: false };
const readiness = { ...row, order: 2, publicState: "approved", dependencyResult: "clear", ready: true, retryable: false, blockers: [], fingerprint: "exact-reviewed-source",
  knownUrls: ["https://media.example.test/companies/company/legacy.png"], recoveryImageId: "preserved-image" };
type W = Window & { __queries: Record<string, unknown>; __authToken: string | null; __queryCalls: string[];
  __mutationCalls: { path: string; args: unknown }[]; __mutationResults: Record<string, unknown>; __mutationErrors: Record<string, string>;
  __mutationCompletions: string[]; __paginatedArgs: unknown[]; __directQueryCalls: { path: string; args: unknown }[] };
let bundle = "";
test.beforeAll(async () => { bundle = await buildHarness('import { AdminLegacyMediaIngestion } from "./features/admin/components/admin-legacy-media-ingestion";', '<main className="mx-auto max-w-5xl p-4"><AdminLegacyMediaIngestion /></main>'); });
test.beforeEach(async ({ page }) => { await page.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()); });
function state(locale: "fr" | "en" = "en", overrides: Record<string, unknown> = {}) {
  return { __locale: locale, __authToken: "admin-session", __queries: { "users.currentUser": { _id: "admin", accountType: "admin" }, [check]: readiness },
    __paginatedQueries: { [list]: { results: [row], status: "Exhausted" } },
    __mutationResults: { [action]: { ingestionId: "ingestion", retirementStatus: "retired", knownUrls: readiness.knownUrls, cacheVerificationRequired: true } }, __mutationErrors: {}, ...overrides };
}
async function calls(page: Page) { return page.evaluate(() => (window as unknown as W).__mutationCalls || []); }
async function open(page: Page, copy = en.adminLegacyRetirement) {
  await page.getByRole("button", { name: copy.check }).click();
  await page.getByRole("button", { name: copy.retire, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
for (const locale of ["en", "fr"] as const) {
  const copy = (locale === "fr" ? fr : en).adminLegacyRetirement;
  test(`${locale}: active lease hides Retry; fresh check after expiry exposes guarded Retry retirement`, async ({ page }) => {
    const startedAt = 1_800_000_000_000; const leaseUntil = startedAt + 10 * 60 * 1000;
    await page.clock.setFixedTime(new Date(startedAt));
    await mountHarness(page, bundle, state(locale, { __paginatedQueries: { [list]: { results: [{ ...row, retirementStatus: "retiring" }], status: "Exhausted" } } }));
    await page.evaluate(({ check, readiness, leaseUntil }) => {
      (window as unknown as { __queryHandlers: Record<string, (args: { checkedAt: number }) => unknown> }).__queryHandlers = {
        [check]: args => ({ ...readiness, ready: args.checkedAt >= leaseUntil, retryable: args.checkedAt >= leaseUntil, retirementStatus: args.checkedAt >= leaseUntil ? "ready" : "retiring" }),
      };
    }, { check, readiness, leaseUntil });
    await page.getByRole("button", { name: copy.check }).click();
    await expect(page.getByText(copy.status.retiring, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.retry, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: copy.retire, exact: true })).toHaveCount(0);
    await page.clock.setFixedTime(new Date(leaseUntil));
    await page.getByRole("button", { name: copy.check }).click();
    await expect(page.getByRole("button", { name: copy.retry, exact: true })).toBeVisible();
    await expect(page.getByText(copy.status.retiring, { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as W).__directQueryCalls.map(call => call.args))).toEqual([
      { ingestionId: "ingestion", checkedAt: startedAt }, { ingestionId: "ingestion", checkedAt: leaseUntil },
    ]);
    await page.getByRole("button", { name: copy.retry, exact: true }).click();
    await page.getByLabel(copy.typeIntent.replace("{word}", copy.confirmationWord)).fill(copy.confirmationWord);
    await page.getByRole("button", { name: copy.confirmRetire }).click();
    await expect(page.getByText(copy.cacheRequired)).toBeVisible();
    expect(await calls(page)).toEqual([{ path: action, args: { ingestionId: "ingestion", expectedFingerprint: "exact-reviewed-source", confirmation: "RETIRE" } }]);
  });
  test(`${locale}: on-demand readiness and exact typed retirement confirmation`, async ({ page }) => {
    await mountHarness(page, bundle, state(locale));
    expect(await page.evaluate(() => ((window as unknown as W).__queryCalls || []).includes("legacyMediaIngestion.retirement.getReadiness"))).toBe(false);
    await expect(page.locator("img")).toHaveCount(0); await expect(page.getByText(readiness.knownUrls[0], { exact: true })).toHaveCount(0);
    await open(page, copy); await expect(page.getByRole("dialog")).toContainText(copy.warning);
    await expect(page.getByRole("button", { name: copy.confirmRetire })).toBeDisabled();
    await page.getByLabel(copy.typeIntent.replace("{word}", copy.confirmationWord)).fill(copy.confirmationWord);
    await page.getByRole("button", { name: copy.confirmRetire }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByText(copy.cacheRequired)).toBeVisible();
    expect(await calls(page)).toEqual([{ path: action, args: { ingestionId: "ingestion", expectedFingerprint: "exact-reviewed-source", confirmation: "RETIRE" } }]);
  });
  for (const width of [320, 375]) test(`${locale}: ${width}px confirmation keyboard and focus`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 }); await mountHarness(page, bundle, state(locale)); await open(page, copy);
    expect(await hasHorizontalOverflow(page)).toBe(false); await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: copy.retire, exact: true })).toBeFocused();
    await page.keyboard.press("Enter"); await expect(page.getByRole("dialog")).toBeVisible();
    const input = page.getByLabel(copy.typeIntent.replace("{word}", copy.confirmationWord)); await input.fill(copy.confirmationWord); await input.focus(); await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: copy.cancel })).toBeFocused(); expect(await hasHorizontalOverflow(page)).toBe(false);
  });
}
test("pending preservation blocks retirement and explains blocker", async ({ page }) => {
  await mountHarness(page, bundle, state("en", { __queries: { "users.currentUser": { _id: "admin", accountType: "admin" }, [check]: { ...readiness, moderationStatus: "pending", ready: false, blockers: ["moderation_pending"], retirementStatus: "not_ready" } } }));
  await page.getByRole("button", { name: en.adminLegacyRetirement.check }).click();
  await expect(page.getByText(en.adminLegacyRetirement.blockers.moderation_pending)).toBeVisible(); await expect(page.getByRole("button", { name: en.adminLegacyRetirement.retire, exact: true })).toHaveCount(0);
});
test("stale readiness closes confirmation and requires fresh explicit intent", async ({ page }) => {
  await mountHarness(page, bundle, state()); await open(page);
  await page.evaluate(({ check, readiness }) => { (window as unknown as W).__queries[check] = { ...readiness, fingerprint: "new-owner-submission" }; window.dispatchEvent(new Event("convex-harness-update")); }, { check, readiness });
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByText(en.adminLegacyRetirement.stale)).toBeVisible(); expect(await calls(page)).toEqual([]);
  await page.getByRole("button", { name: en.adminLegacyRetirement.retire, exact: true }).click();
  await page.getByLabel(en.adminLegacyRetirement.typeIntent.replace("{word}", "RETIRE")).fill("RETIRE"); await page.getByRole("button", { name: en.adminLegacyRetirement.confirmRetire }).click();
  expect((await calls(page))[0].args).toEqual({ ingestionId: "ingestion", expectedFingerprint: "new-owner-submission", confirmation: "RETIRE" });
});
test("provider/gate error remains safe and can be checked and retried", async ({ page }) => {
  await mountHarness(page, bundle, state("en", { __mutationErrors: { [action]: "secret internal credentials" } })); await open(page);
  await page.getByLabel(en.adminLegacyRetirement.typeIntent.replace("{word}", "RETIRE")).fill("RETIRE"); await page.getByRole("button", { name: en.adminLegacyRetirement.confirmRetire }).click();
  await expect(page.getByRole("alert")).toHaveText(en.adminLegacyRetirement.error); await expect(page.getByText("secret internal credentials")).toHaveCount(0);
  await page.evaluate(() => { (window as unknown as W).__mutationErrors = {}; }); await open(page);
  await page.getByLabel(en.adminLegacyRetirement.typeIntent.replace("{word}", "RETIRE")).fill("RETIRE"); await page.getByRole("button", { name: en.adminLegacyRetirement.confirmRetire }).click();
  await expect(page.getByText(en.adminLegacyRetirement.cacheRequired)).toBeVisible(); expect(await calls(page)).toHaveLength(2);
});
test("duplicate destructive clicks issue one action", async ({ page }) => {
  await mountHarness(page, bundle, state("en", { __mutationDelays: { [action]: 250 } })); await open(page);
  await page.getByLabel(en.adminLegacyRetirement.typeIntent.replace("{word}", "RETIRE")).fill("RETIRE"); await page.getByRole("button", { name: en.adminLegacyRetirement.confirmRetire }).dblclick();
  await expect(page.getByText(en.adminLegacyRetirement.cacheRequired)).toBeVisible(); expect(await calls(page)).toHaveLength(1);
});
for (const role of ["company", "client", "seo_team"]) test(`${role} never subscribes to retirement operations`, async ({ page }) => {
  await mountHarness(page, bundle, state("en", { __queries: { "users.currentUser": { _id: "other", accountType: role } } }));
  await expect(page.getByRole("heading", { name: en.adminLegacyRetirement.title })).toHaveCount(0); expect(await page.evaluate(() => (window as unknown as W).__paginatedArgs || [])).toEqual([]);
});
for (const change of ["signout", "account"] as const) test(`${change} clears confirmation and ignores late retirement response`, async ({ page }) => {
  await mountHarness(page, bundle, state("en", { __mutationDelays: { [action]: 350 } })); await open(page);
  await page.getByLabel(en.adminLegacyRetirement.typeIntent.replace("{word}", "RETIRE")).fill("RETIRE"); await page.getByRole("button", { name: en.adminLegacyRetirement.confirmRetire }).click();
  await page.evaluate(change => { const w = window as unknown as W; if (change === "signout") w.__authToken = null; else { w.__authToken = "another-admin"; w.__queries["users.currentUser"] = { _id: "another-admin", accountType: "admin" }; } window.dispatchEvent(new Event("convex-harness-update")); }, change);
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect.poll(() => page.evaluate(() => (window as unknown as W).__mutationCompletions?.length || 0)).toBe(1);
  await expect(page.getByText(en.adminLegacyRetirement.cacheRequired)).toHaveCount(0); await expect(page.getByText(readiness.knownUrls[0], { exact: true })).toHaveCount(0);
});
