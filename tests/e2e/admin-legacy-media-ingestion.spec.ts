import { test, expect, type Page } from "@playwright/test";
import { buildHarness, mountHarness, hasHorizontalOverflow } from "./support/component-harness";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const list = "legacyMediaIngestion.index.listCandidates";
const action = "legacyMediaIngestion.actions.ingest";
const candidate = { mediaType: "companyLogo", provider: "r2", companyId: "company", companyName: "Atlas", projectTitle: null, order: null,
  sourceKey: "opaque-source-key", state: null, hasModeratedState: false, retryable: false };
type W = Window & { __queries: Record<string, unknown>; __authToken: string | null; __mutationCalls: { path: string; args: unknown }[];
  __mutationResults: Record<string, unknown>; __mutationErrors: Record<string, string>; __mutationDelays: Record<string, number>; __mutationCompletions: string[];
  __paginatedArgs: { path: string; args: Record<string, unknown>; options: unknown }[]; __paginationCalls: { path: string; numItems: number }[] };
let bundle = "";
test.beforeAll(async () => {
  bundle = await buildHarness('import { AdminLegacyMediaIngestion } from "./features/admin/components/admin-legacy-media-ingestion";', '<main className="mx-auto max-w-5xl p-4"><AdminLegacyMediaIngestion /></main>');
});
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});
function state(locale: "en" | "fr" = "en", overrides: Record<string, unknown> = {}) {
  return { __locale: locale, __authToken: "admin-session", __queries: { "users.currentUser": { _id: "admin", accountType: "admin" } },
    __paginatedQueries: { [list]: { results: [candidate], status: "CanLoadMore" } },
    __mutationResults: { [action]: { ingestionId: "ingestion", status: "ingested", imageId: "pending-image" } }, __mutationErrors: {}, __mutationDelays: {}, ...overrides };
}
async function calls(page: Page) { return page.evaluate(() => (window as unknown as W).__mutationCalls || []); }
for (const locale of ["en", "fr"] as const) {
  const copy = (locale === "fr" ? fr : en).adminLegacyMedia;
  test(`${locale}: metadata list, bounded pagination and one exact ingestion links existing review`, async ({ page }) => {
    const requests: string[] = []; page.on("request", request => { if (/company-logos|company-covers|portfolio-images|api\/storage/.test(request.url())) requests.push(request.url()); });
    await mountHarness(page, bundle, state(locale));
    await expect(page.getByRole("heading", { name: copy.title })).toBeVisible();
    await expect(page.getByText(copy.lead)).toBeVisible(); expect(requests).toEqual([]); await expect(page.locator("img")).toHaveCount(0);
    await page.getByRole("button", { name: copy.loadMore }).click();
    expect(await page.evaluate(() => (window as unknown as W).__paginationCalls)).toContainEqual({ path: list, numItems: 20 });
    await page.getByRole("button", { name: copy.ingest }).click();
    await expect(page.getByRole("link", { name: copy.review })).toHaveAttribute("href", "/admin/companies/company?tab=logo");
    await expect(page.getByText(copy.status.ingested, { exact: true })).toBeVisible();
    expect(await calls(page)).toEqual([{ path: action, args: { mediaType: "companyLogo", provider: "r2", companyId: "company", sourceKey: candidate.sourceKey } }]);
  });
  for (const width of [320, 375]) test(`${locale}: keyboard access and ${width}px layout`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 }); await mountHarness(page, bundle, state(locale));
    await page.getByLabel(copy.mediaType).focus(); await expect(page.getByLabel(copy.mediaType)).toBeFocused();
    await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: copy.ingest })).toBeFocused();
    await page.keyboard.press("Enter"); await expect(page.getByRole("link", { name: copy.review })).toBeVisible();
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
}
test("duplicate clicks are prevented while copying", async ({ page }) => {
  await mountHarness(page, bundle, state("en", { __mutationDelays: { [action]: 250 } }));
  await page.getByRole("button", { name: en.adminLegacyMedia.ingest }).dblclick();
  await expect(page.getByRole("link", { name: en.adminLegacyMedia.review })).toBeVisible(); expect(await calls(page)).toHaveLength(1);
});
test("failed action displays safe error and retry succeeds", async ({ page }) => {
  await mountHarness(page, bundle, state("en", { __mutationErrors: { [action]: "secret internal error" } }));
  await page.getByRole("button", { name: en.adminLegacyMedia.ingest }).click();
  await expect(page.getByRole("alert")).toHaveText(en.adminLegacyMedia.actionError); await expect(page.getByText("secret internal error")).toHaveCount(0);
  await page.evaluate(() => { (window as unknown as W).__mutationErrors = {}; });
  await page.getByRole("button", { name: en.adminLegacyMedia.retry }).click();
  await expect(page.getByRole("link", { name: en.adminLegacyMedia.review })).toBeVisible(); expect(await calls(page)).toHaveLength(2);
});
test("persisted failed ingestion retries without stale response masking success", async ({ page }) => {
  await mountHarness(page, bundle, state("en", { __paginatedQueries: { [list]: { results: [{ ...candidate, state: { ingestionId: "ingestion", status: "failed", imageId: null }, retryable: true }], status: "Exhausted" } } }));
  await page.getByRole("button", { name: en.adminLegacyMedia.retry }).click();
  await expect(page.getByText(en.adminLegacyMedia.status.ingested, { exact: true })).toBeVisible();
});
test("conflict retains newer work and does not offer moderation controls", async ({ page }) => {
  await mountHarness(page, bundle, state("en", { __mutationResults: { [action]: { ingestionId: "ingestion", status: "conflict", imageId: null } } }));
  await page.getByRole("button", { name: en.adminLegacyMedia.ingest }).click();
  await expect(page.getByText(en.adminLegacyMedia.status.conflict, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: en.adminLegacyMedia.review })).toHaveCount(0);
});
for (const role of ["company", "client", "seo_team"]) test(`${role} cannot subscribe or ingest`, async ({ page }) => {
  await mountHarness(page, bundle, state("en", { __queries: { "users.currentUser": { _id: "other", accountType: role } } }));
  await expect(page.getByRole("heading", { name: en.adminLegacyMedia.title })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as W).__paginatedArgs || [])).toEqual([]);
});
for (const change of ["signout", "account"] as const) test(`${change} clears pending operation and ignores late result`, async ({ page }) => {
  await mountHarness(page, bundle, state("en", { __mutationDelays: { [action]: 350 } }));
  await page.getByRole("button", { name: en.adminLegacyMedia.ingest }).click();
  await page.evaluate(change => { const w = window as unknown as W; if (change === "signout") w.__authToken = null; else { w.__queries["users.currentUser"] = { _id: "admin2", accountType: "admin" }; w.__authToken = "admin2-session"; } window.dispatchEvent(new Event("convex-harness-update")); }, change);
  await expect.poll(async () => page.evaluate(() => (window as unknown as W).__mutationCompletions?.length || 0)).toBe(1);
  await expect(page.getByRole("link", { name: en.adminLegacyMedia.review })).toHaveCount(0);
  if (change === "account") await expect(page.getByRole("button", { name: en.adminLegacyMedia.ingest })).toBeEnabled();
});
