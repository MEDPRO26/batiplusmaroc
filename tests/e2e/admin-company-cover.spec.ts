import { expect, test, type Page, type Route } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const site = "https://verification-test.convex.site";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhN8AAAAASUVORK5CYII=", "base64");
const reviewPath = "companyCovers.index.getAdminReview";
const queuePath = "companyCovers.index.listAdminCovers";
const historyPath = "companyCovers.index.getHistory";
const approvePath = "companyCovers.index.approve";
const image = (id: string, status: "pending" | "approved" | "rejected" = "pending") => ({ imageId: id, companyId: "company", contentType: "image/png", size: png.length, sha256: `sha256-${id}`, uploadedBy: "owner", uploadedAt: 100,
  moderationStatus: status, reason: status === "rejected" ? "Contains identifying branding" : null, previewUrl: `${site}/company-covers/private/${id}` });
const a = image("approved-A", "approved"); const b = image("pending-B");
const review = (selected = b, approved: ReturnType<typeof image> | null = a) => ({ image: selected, company: { companyId: "company", name: "Atlas", legalName: "Atlas SARL" }, currentSubmissionId: b.imageId, approved, isCurrentSubmission: selected.imageId === b.imageId, isCurrentApproved: selected.imageId === approved?.imageId });
type Review = ReturnType<typeof review>;
type W = Window & { __queries: Record<string, unknown>; __reviews: Record<string, Review>; __queryHandlers: Record<string, (args: { imageId: string }) => unknown>; __queryCalls: string[]; __directQueryCalls: { path: string; args: Record<string, unknown> }[];
  __paginatedQueries: Record<string, { status: string; results: unknown[] }>; __paginationCalls: { path: string; numItems: number }[];
  __mutationCalls: { path: string; args: Record<string, unknown> }[]; __mutationErrors: Record<string, string>; __mutationDelays: Record<string, number>; __authToken: string | null;
  __blobCreated: string[]; __blobRevoked: string[]; __previewAborts: number };
let queueBundle = ""; let sectionBundle = ""; let publicBundle = "";
function state(locale: "en" | "fr" = "en", selected = b) {
  return { __locale: locale, __authToken: "admin-session", __queries: { "users.currentUser": { _id: "admin", accountType: "admin" }, [reviewPath]: review(selected) },
    __paginatedQueries: { [queuePath]: { status: "CanLoadMore", results: [{ ...b, companyName: "Atlas", isCurrentSubmission: true }] }, [historyPath]: { status: "CanLoadMore", results: [{ historyId: "history", action: "uploaded", oldStatus: null, newStatus: "pending", changedAt: 100, reason: null }] } },
    __mutationErrors: {}, __mutationDelays: {}, __reviews: { [b.imageId]: review(), [a.imageId]: review(a) },
  };
}
async function respond(route: Route, status = 200, bytes: Buffer | string = png) {
  await route.fulfill({ status, contentType: "image/png", body: bytes, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": route.request().headers().origin || "*", "Access-Control-Allow-Headers": "Authorization", "Access-Control-Allow-Methods": "GET, OPTIONS" } });
}
async function previews(page: Page, options: { failure?: boolean; corrupt?: boolean; hold?: Promise<void> } = {}) {
  await page.route(`${site}/company-covers/private/**`, async route => {
    if (route.request().method() === "OPTIONS") return respond(route, 200, "");
    expect(route.request().headers().authorization).toBe("Bearer admin-session");
    expect(new URL(route.request().url()).search).toBe("");
    if (options.hold) await options.hold;
    await respond(route, options.failure ? 404 : 200, options.corrupt ? "invalid image bytes" : png);
  });
}
async function changeReview(page: Page, next: Review) {
  await page.evaluate(({ path, next }) => { const w = window as unknown as W; w.__queries[path] = next; w.__reviews[next.image.imageId] = next; window.dispatchEvent(new Event("convex-harness-update")); }, { path: reviewPath, next });
}
async function calls(page: Page) { return page.evaluate(() => (window as unknown as W).__mutationCalls || []); }
async function openQueue(page: Page, locale: "en" | "fr" = "en") { await page.getByRole("button", { name: (locale === "fr" ? fr : en).adminCompanyCovers.reviewCompany.replace("{company}", "Atlas") }).click(); }
async function loaded(page: Page, locale: "en" | "fr" = "en") {
  const cover = page.getByRole("img", { name: (locale === "fr" ? fr : en).adminCompanyCovers.previewAlt });
  await expect(cover).toHaveAttribute("src", /^blob:/);
  await expect(page.getByRole("button", { name: (locale === "fr" ? fr : en).adminCompanyCovers.approve, exact: true })).toBeEnabled();
}

test.beforeAll(async () => {
  queueBundle = await buildHarness(`import { AdminShell } from "./features/admin/components/admin-shell"; import { AdminPendingCoverQueue } from "./features/admin/components/admin-company-cover-review";`, `<AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><AdminPendingCoverQueue /></AdminShell>`);
  sectionBundle = await buildHarness(`import { AdminCompanyCoverSection } from "./features/admin/components/admin-company-cover-review";`, `<main className="mx-auto max-w-5xl p-4"><AdminCompanyCoverSection submittedImageId="pending-B" approvedImageId="approved-A" /></main>`);
  publicBundle = await buildHarness(`import { ApprovedCompanyCover } from "./features/companies/components/approved-company-cover"; import Image from "next/image"; import { useQuery } from "convex/react"; import { api } from "@/convex/_generated/api"; function PublicCovers(){ const data=useQuery(api.publicCoverFixture);return <main><div className="relative size-20"><ApprovedCompanyCover alt="Public Company cover" fill url={data.coverUrl} /></div><Image alt="Unrelated cover image" src="https://media.example.test/cover.png" width={100} height={80} /></main>}`, `<PublicCovers />`);
});
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.addInitScript(() => {
    const w = window as unknown as W; w.__blobCreated = []; w.__blobRevoked = []; w.__previewAborts = 0;
    const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL); const originalFetch = window.fetch.bind(window);
    URL.createObjectURL = blob => { const url = create(blob); w.__blobCreated.push(url); return url; };
    URL.revokeObjectURL = url => { w.__blobRevoked.push(url); revoke(url); };
    window.fetch = (input, init) => { if (String(input).includes("/company-covers/private/")) init?.signal?.addEventListener("abort", () => { w.__previewAborts++; }); return originalFetch(input, init); };
  });
});

for (const locale of ["en", "fr"] as const) {
  const t = (locale === "fr" ? fr : en).adminCompanyCovers;
  test(`${locale}: paginated queue loads only the selected private previews and exact approval`, async ({ page }) => {
    let requests = 0;
    page.on("request", request => { if (request.method() === "GET" && request.url().includes("/company-covers/private/")) requests++; });
    await previews(page); await mountHarness(page, queueBundle, state(locale));
    await expect(page.getByRole("heading", { name: t.queueTitle })).toBeVisible();
    expect(requests).toBe(0);
    await page.getByRole("button", { name: t.loadMore }).click();
    expect(await page.evaluate(() => (window as unknown as W).__paginationCalls)).toContainEqual({ path: queuePath, numItems: 20 });
    await openQueue(page, locale); await loaded(page, locale);
    await expect(page.getByText(t.checklist.qr, { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: t.approvedAlt })).toHaveAttribute("src", /^blob:/);
    expect(requests).toBe(2);
    await page.getByRole("button", { name: t.loadMore }).click();
    expect(await page.evaluate(() => (window as unknown as W).__paginationCalls)).toContainEqual({ path: historyPath, numItems: 10 });
    await page.getByRole("button", { name: t.approve, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: t.confirm.approve });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: t.confirm.approve })).toHaveCSS("background-color", "rgb(47, 107, 255)");
    await page.evaluate(path => { (window as unknown as W).__mutationDelays[path] = 150; }, approvePath);
    await dialog.getByRole("button", { name: t.confirm.approve }).dblclick();
    await expect(dialog).not.toBeVisible();
    expect(await calls(page)).toEqual([{ path: approvePath, args: { imageId: b.imageId, expectedSha256: b.sha256 } }]);
    await expect(page.getByText(t.success.approve)).toBeVisible();
    await page.getByRole("button", { name: t.close, exact: true }).click();
    await expect(page.getByRole("button", { name: t.reviewCompany.replace("{company}", "Atlas") })).toBeFocused();
    await expect.poll(() => page.evaluate(() => { const w = window as unknown as W; return w.__blobCreated.length > 0 && w.__blobCreated.every(url => w.__blobRevoked.includes(url)); })).toBe(true);
  });
  test(`${locale}: keyboard and mobile review supports reasons and cancellation`, async ({ page }) => {
    await previews(page); await mountHarness(page, sectionBundle, state(locale)); await loaded(page, locale);
    for (const width of [320, 375, 768, 1024]) { await page.setViewportSize({ width, height: 900 }); expect(await hasHorizontalOverflow(page)).toBe(false); }
    const reject = page.getByRole("button", { name: t.reject, exact: true }); await reject.focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: t.confirm.reject }); const confirm = dialog.getByRole("button", { name: t.confirm.reject });
    await expect(confirm).toBeDisabled(); await dialog.getByLabel(t.reason, { exact: true }).fill(" x "); await expect(confirm).toBeDisabled();
    await dialog.getByLabel(t.reason, { exact: true }).fill("  Remove   phone number  "); await expect(confirm).toBeEnabled();
    await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible(); await expect(reject).toBeFocused();
    await reject.click(); await dialog.getByLabel(t.reason, { exact: true }).fill("  Remove   phone number  "); await confirm.click();
    expect(await calls(page)).toEqual([{ path: "companyCovers.index.reject", args: { imageId: b.imageId, expectedSha256: b.sha256, reason: "Remove phone number" } }]);
    await expect(page.getByText(t.success.reject)).toBeVisible();
  });
}

test("approval remains disabled until the exact image decodes; failed bytes can retry", async ({ page }) => {
  const t = en.adminCompanyCovers;
  await previews(page, { corrupt: true }); await mountHarness(page, sectionBundle, state());
  await expect(page.getByText(en.companyCover.previewError).first()).toBeVisible();
  await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled();
  await previews(page); await page.getByRole("button", { name: en.companyCover.retryPreview }).first().click(); await loaded(page);
});

test("stale hash/status or replacement cancels confirmation and requires a fresh review", async ({ page }) => {
  const t = en.adminCompanyCovers;
  await previews(page); await mountHarness(page, sectionBundle, state()); await loaded(page);
  await page.getByRole("button", { name: t.approve, exact: true }).click();
  const newer = { ...review(), image: { ...b, sha256: "changed-hash" } };
  await changeReview(page, newer);
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByText(t.stale)).toBeVisible();
  await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled();
  expect(await calls(page)).toEqual([]);
  await page.getByRole("button", { name: t.reviewAgain, exact: true }).click(); await loaded(page);
  expect(await page.evaluate(() => (window as unknown as W).__directQueryCalls)).toEqual([{ path: reviewPath, args: { imageId: b.imageId } }]);
  await page.getByRole("button", { name: t.approve, exact: true }).click();
  const replaced = { ...newer, currentSubmissionId: "pending-C", isCurrentSubmission: false };
  await changeReview(page, replaced); await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: t.reviewAgain, exact: true }).click();
  await expect(page.getByText(t.superseded)).toBeVisible();
  await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled(); expect(await calls(page)).toEqual([]);
});

test("returning to an earlier review DTO cannot reopen a cancelled confirmation", async ({ page }) => {
  const t = en.adminCompanyCovers;
  await previews(page); await mountHarness(page, sectionBundle, state()); await loaded(page);
  await page.getByRole("button", { name: t.approve, exact: true }).click();
  await changeReview(page, { ...review(), image: { ...b, sha256: "changed-hash" } });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await changeReview(page, review());
  await expect(page.getByText(t.stale)).toBeVisible();
  await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled();
  expect(await calls(page)).toEqual([]);
  await page.getByRole("button", { name: t.reviewAgain, exact: true }).click(); await loaded(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("server stale decision requires another explicit review without substituting a newer image", async ({ page }) => {
  const t = en.adminCompanyCovers; await previews(page); await mountHarness(page, sectionBundle, state()); await loaded(page);
  await page.evaluate(path => { (window as unknown as W).__mutationErrors[path] = "COMPANY_COVER_REVIEW_STALE"; }, approvePath);
  await page.getByRole("button", { name: t.approve, exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: t.confirm.approve }).click();
  await expect(page.getByText(t.stale)).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled();
  expect(await calls(page)).toEqual([{ path: approvePath, args: { imageId: b.imageId, expectedSha256: b.sha256 } }]);
  await page.getByRole("button", { name: t.reviewAgain, exact: true }).click(); await loaded(page);
});

test("hide targets only the approved file and requires a reason and confirmation", async ({ page }) => {
  const t = en.adminCompanyCovers; await previews(page); await mountHarness(page, sectionBundle, state("en", a));
  await expect(page.getByRole("button", { name: t.hide, exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: t.hide, exact: true }).click(); const dialog = page.getByRole("dialog", { name: t.confirm.hide });
  await expect(dialog.getByRole("button", { name: t.confirm.hide })).toBeDisabled();
  await expect(dialog.getByText(t.hideLead.replace("{company}", "Atlas"))).toBeVisible();
  await dialog.getByLabel(t.reason, { exact: true }).fill("Identifying watermark"); await dialog.getByRole("button", { name: t.confirm.hide }).click();
  expect(await calls(page)).toEqual([{ path: "companyCovers.index.hide", args: { imageId: a.imageId, expectedSha256: a.sha256, reason: "Identifying watermark" } }]);
  await expect(page.getByText(t.success.hide)).toBeVisible();
});

for (const role of ["company", "client", "seo_team"]) test(`${role} never requests private Admin review data`, async ({ page }) => {
  const data = state(); data.__queries["users.currentUser"] = { _id: "admin", accountType: role };
  await mountHarness(page, queueBundle, data);
  await expect(page.getByRole("heading", { name: en.adminCompanyCovers.queueTitle })).toHaveCount(0);
  const queries = await page.evaluate(() => (window as unknown as W).__queryCalls || []);
  expect(queries).not.toContain(queuePath); expect(queries).not.toContain(reviewPath); expect(queries).not.toContain(historyPath);
  expect(await page.evaluate(() => (window as unknown as W).__blobCreated)).toEqual([]);
});

for (const change of ["sign-out", "account change"] as const) test(`${change} clears Admin private previews and confirmation`, async ({ page }) => {
  await previews(page); await mountHarness(page, sectionBundle, state()); await loaded(page);
  await page.getByRole("button", { name: en.adminCompanyCovers.approve, exact: true }).click();
  await page.evaluate(change => { const w = window as unknown as W; w.__authToken = change === "sign-out" ? null : "other-session"; w.__queries["users.currentUser"] = change === "sign-out" ? null : { _id: "other", accountType: "client" }; window.dispatchEvent(new Event("convex-harness-update")); }, change);
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.locator('img[src^="blob:"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => { const w = window as unknown as W; return w.__blobCreated.every(url => w.__blobRevoked.includes(url)); })).toBe(true);
});

test("closing review aborts outstanding private requests", async ({ page }) => {
  let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
  await previews(page, { hold }); await mountHarness(page, queueBundle, state()); await openQueue(page);
  await expect(page.getByText(en.companyCover.loadingPreview).first()).toBeVisible();
  await page.getByRole("button", { name: en.adminCompanyCovers.close, exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__previewAborts)).toBe(2); release();
  expect(await page.evaluate(() => (window as unknown as W).__blobCreated)).toEqual([]);
});

test("changing selected image revokes the old preview and loads the selected immutable file", async ({ page }) => {
  await previews(page); await mountHarness(page, sectionBundle, state()); await loaded(page);
  await page.evaluate(path => { const w = window as unknown as W; w.__queryHandlers = { [path]: args => w.__reviews[args.imageId] }; }, reviewPath);
  const urls = await page.evaluate(() => (window as unknown as W).__blobCreated);
  await page.getByRole("button", { name: en.adminCompanyCovers.reviewApproved, exact: true }).click();
  await expect(page.getByRole("button", { name: en.adminCompanyCovers.hide, exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(urls => urls.every(url => (window as unknown as W).__blobRevoked.includes(url)), urls)).toBe(true);
  await expect(page.getByRole("img", { name: en.adminCompanyCovers.previewAlt })).toHaveAttribute("src", /^blob:/);
});

test("queue and detail include loading and empty states", async ({ page }) => {
  const data = state(); data.__paginatedQueries[queuePath] = { status: "LoadingFirstPage", results: [] };
  await mountHarness(page, queueBundle, data); await expect(page.getByRole("status")).toBeVisible();
  await page.evaluate(path => { const w = window as unknown as W; w.__paginatedQueries[path] = { status: "Exhausted", results: [] }; window.dispatchEvent(new Event("convex-harness-update")); }, queuePath);
  await expect(page.getByText(en.adminCompanyCovers.emptyQueue)).toBeVisible();
});

test("public covers bypass optimization and fail to a generic image; other images keep optimization", async ({ page }) => {
  await page.route(`${site}/company-covers/public/**`, route => respond(route));
  await page.route("https://media.example.test/cover.png", route => respond(route));
  const data = { __locale: "en", __queries: { publicCoverFixture: { coverUrl: `${site}/company-covers/public/approved-A` } } };
  await mountHarness(page, publicBundle, data);
  await expect(page.getByRole("img", { name: "Public Company cover" })).toHaveAttribute("src", `${site}/company-covers/public/approved-A`);
  await expect(page.getByRole("img", { name: "Public Company cover" })).toHaveAttribute("data-unoptimized", "true");
  await expect(page.getByRole("img", { name: "Unrelated cover image" })).not.toHaveAttribute("data-unoptimized");
  await page.route(`${site}/company-covers/public/hidden-B`, route => respond(route, 404, "not found"));
  await page.evaluate(() => { const w = window as unknown as W; w.__queries.publicCoverFixture = { coverUrl: "https://verification-test.convex.site/company-covers/public/hidden-B" }; window.dispatchEvent(new Event("convex-harness-update")); });
  await expect(page.getByRole("img", { name: en.companyCover.genericAlt })).toBeVisible();
  await expect(page.getByRole("img", { name: "Public Company cover" })).toHaveCount(0);
});
for (const url of [null, `${site}/company-covers/private/pending-B`, `${site}/api/storage/legacy`, "https://media.example.test/legacy.png"]) test(`public consumer never falls back to ${url}`, async ({ page }) => {
  await mountHarness(page, publicBundle, { __locale: "fr", __queries: { publicCoverFixture: { coverUrl: url } } });
  await expect(page.getByRole("img", { name: fr.companyCover.genericAlt })).toBeVisible();
  await expect(page.getByRole("img", { name: "Public Company cover" })).toHaveCount(0);
});

test("a reactive status change cancels an open decision", async ({ page }) => {
  const t = en.adminCompanyCovers; await previews(page); await mountHarness(page, sectionBundle, state()); await loaded(page);
  await page.getByRole("button", { name: t.reject, exact: true }).click();
  await page.getByRole("dialog").getByLabel(t.reason, { exact: true }).fill("Identifying branding");
  await changeReview(page, review({ ...b, moderationStatus: "rejected", reason: "Reviewed by another Admin" }));
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByText(t.stale)).toBeVisible();
  await expect(page.getByRole("button", { name: t.reject, exact: true })).toBeDisabled(); expect(await calls(page)).toEqual([]);
});

test("a recoverable decision error keeps the exact review and reason for retry", async ({ page }) => {
  const t = en.adminCompanyCovers; const path = "companyCovers.index.reject";
  await previews(page); await mountHarness(page, sectionBundle, state()); await loaded(page);
  await page.evaluate(path => { (window as unknown as W).__mutationErrors[path] = "NETWORK"; }, path);
  await page.getByRole("button", { name: t.reject, exact: true }).click(); const dialog = page.getByRole("dialog", { name: t.confirm.reject });
  await dialog.getByLabel(t.reason, { exact: true }).fill("Remove phone number"); await dialog.getByRole("button", { name: t.confirm.reject }).click();
  await expect(dialog.getByRole("alert")).toBeVisible(); await expect(dialog.getByLabel(t.reason, { exact: true })).toHaveValue("Remove phone number");
  await page.evaluate(path => { delete (window as unknown as W).__mutationErrors[path]; }, path);
  await dialog.getByRole("button", { name: t.confirm.reject }).click(); await expect(dialog).not.toBeVisible();
  const submitted = await calls(page); expect(submitted).toHaveLength(2); expect(submitted[0]).toEqual(submitted[1]);
});

test("query failures show a localized retry without leaking server details", async ({ page }) => {
  const t = en.adminCompanyCovers; await previews(page); await mountHarness(page, queueBundle, state());
  await page.evaluate(path => { (window as unknown as W).__queryHandlers = { [path]: () => { throw new Error("Private server stack and storage-id"); } }; }, reviewPath);
  await openQueue(page); await expect(page.getByText(t.loadError)).toBeVisible(); await expect(page.getByText("Private server stack and storage-id")).toHaveCount(0);
  await page.evaluate(path => { delete (window as unknown as W).__queryHandlers[path]; }, reviewPath);
  await page.getByRole("button", { name: t.retry, exact: true }).click(); await openQueue(page); await loaded(page);
  await page.screenshot({ path: "/private/tmp/batiplus-admin-cover-review-desktop.png" });
  await page.setViewportSize({ width: 375, height: 812 }); expect(await hasHorizontalOverflow(page)).toBe(false);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect.poll(() => page.getByRole("dialog").evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(812);
  // Let Chrome repaint the resized viewport before the visual inspection capture.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: "/private/tmp/batiplus-admin-cover-review-mobile.png" });
});

for (const purpose of ["public", "private"]) test(`manually constructed optimizer request cannot fetch the ${purpose} cover endpoint`, async ({ request }) => {
  const response = await request.get(`/_next/image?url=${encodeURIComponent(`${site}/company-covers/${purpose}/image-id`)}&w=96&q=75`);
  expect(response.status()).toBe(400);
});
