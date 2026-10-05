import { expect, test, type Page, type Route } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
const site = "https://verification-test.convex.site";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhN8AAAAASUVORK5CYII=", "base64");
const reviewPath = "portfolioImages.index.getAdminReview", queuePath = "portfolioImages.index.listAdminImages", historyPath = "portfolioImages.index.getHistory", approvePath = "portfolioImages.index.approve";
const image = (id: string, status: "pending" | "approved" | "rejected" = "pending", purpose: "cover" | "gallery" = "cover", slot = "slot-1") => ({ imageId: id, companyId: "company", portfolioProjectId: "project", purpose, gallerySlotId: purpose === "gallery" ? slot : null, contentType: "image/png", size: png.length, sha256: `sha256-${id}`, uploadedBy: "owner", uploadedAt: 100, moderationStatus: status, reason: status === "rejected" ? "Contains identifying branding" : null, previewUrl: `${site}/portfolio-images/private/${id}` });
const a = image("approved-A", "approved"), b = image("pending-B");
const review = (selected = b, approved: ReturnType<typeof image> | null = a, submitted = b) => ({ image: selected, company: { companyId: "company", name: "Atlas", legalName: "Atlas SARL" }, project: { portfolioProjectId: "project", title: "Courtyard", status: "published" }, gallerySortOrder: selected.purpose === "gallery" ? 0 : null, currentSubmissionId: submitted.imageId, approved, submitted, isCurrentSubmission: selected.imageId === submitted.imageId, isCurrentApproved: selected.imageId === approved?.imageId });
type Review = ReturnType<typeof review>;
type W = Window & { __queries: Record<string, unknown>; __reviews: Record<string, Review>; __queryHandlers: Record<string, (args: { imageId: string }) => unknown>; __queryCalls: string[]; __directQueryCalls: { path: string; args: Record<string, unknown> }[];
  __paginatedQueries: Record<string, { status: string; results: unknown[] }>; __paginatedArgs: { path: string; args: Record<string, unknown>; options: Record<string, unknown> }[]; __paginationCalls: { path: string; numItems: number }[];
  __mutationCalls: { path: string; args: Record<string, unknown> }[]; __mutationErrors: Record<string, string>; __mutationDelays: Record<string, number>; __authToken: string | null;
  __blobCreated: string[]; __blobRevoked: string[]; __previewAborts: number };
let queueBundle = "", scopedBundle = "", publicBundle = "";
function state(locale: "en" | "fr" = "en", selected = b, approved: ReturnType<typeof image> | null = a, submitted = selected) {
  const selectedReview = review(selected, approved, submitted);
  return { __locale: locale, __authToken: "admin-session", __queries: { "users.currentUser": { _id: "admin", accountType: "admin" }, [reviewPath]: selectedReview },
    __paginatedQueries: { [queuePath]: { status: "CanLoadMore", results: [{ ...selected, companyName: "Atlas", projectTitle: "Courtyard", gallerySortOrder: selectedReview.gallerySortOrder, isCurrentSubmission: selectedReview.isCurrentSubmission, isCurrentApproved: selectedReview.isCurrentApproved }] }, [historyPath]: { status: "CanLoadMore", results: [{ historyId: "history", action: "uploaded", oldStatus: null, newStatus: "pending", changedAt: 100, reason: null }] } },
    __mutationErrors: {}, __mutationDelays: {}, __reviews: { [selected.imageId]: selectedReview, ...(approved ? { [approved.imageId]: review(approved, approved, submitted) } : {}) },
  };
}
async function respond(route: Route, status = 200, bytes: Buffer | string = png) {
  await route.fulfill({ status, contentType: "image/png", body: bytes, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": route.request().headers().origin || "*", "Access-Control-Allow-Headers": "Authorization", "Access-Control-Allow-Methods": "GET, OPTIONS" } });
}
async function previews(page: Page, options: { failure?: boolean; corrupt?: boolean; hold?: Promise<void>; holdOnly?: string } = {}) {
  await page.route(`${site}/portfolio-images/private/**`, async route => {
    if (route.request().method() === "OPTIONS") return respond(route, 200, "");
    expect(route.request().headers().authorization).toBe("Bearer admin-session"); expect(new URL(route.request().url()).search).toBe("");
    if (options.hold && (!options.holdOnly || route.request().url().endsWith(`/${options.holdOnly}`))) await options.hold;
    await respond(route, options.failure ? 404 : 200, options.corrupt ? "invalid image bytes" : png);
  });
}
async function changeReview(page: Page, next: Review) {
  await page.evaluate(({ path, next }) => { const w = window as unknown as W; w.__queries[path] = next; w.__reviews[next.image.imageId] = next; window.dispatchEvent(new Event("convex-harness-update")); }, { path: reviewPath, next });
}
async function calls(page: Page) { return page.evaluate(() => (window as unknown as W).__mutationCalls || []); }
async function openQueue(page: Page, locale: "en" | "fr" = "en") { await page.getByRole("button").filter({ hasText: (locale === "fr" ? fr : en).adminPortfolioImages.review }).first().click(); }
async function loaded(page: Page, locale: "en" | "fr" = "en") {
  const t = (locale === "fr" ? fr : en).adminPortfolioImages;
  await expect(page.getByRole("img", { name: t.previewAlt })).toHaveAttribute("src", /^blob:/);
  await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeEnabled();
}
async function mountReview(page: Page, data = state()) { await mountHarness(page, queueBundle, data); await openQueue(page, data.__locale); }
async function allRevoked(page: Page) { await expect.poll(() => page.evaluate(() => { const w = window as unknown as W; return w.__blobCreated.length > 0 && w.__blobCreated.every(url => w.__blobRevoked.includes(url)); })).toBe(true); }

test.beforeAll(async () => {
  queueBundle = await buildHarness(`import { AdminShell } from "./features/admin/components/admin-shell"; import { AdminPortfolioImageQueue } from "./features/admin/components/admin-portfolio-image-review";`, `<AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><AdminPortfolioImageQueue /></AdminShell>`);
  scopedBundle = await buildHarness(`import { AdminCompanyPortfolioImages } from "./features/admin/components/admin-portfolio-image-review";`, `<main className="mx-auto max-w-5xl p-4"><AdminCompanyPortfolioImages companyId="company" /></main>`);
  publicBundle = await buildHarness(`import { ApprovedPortfolioImage } from "./features/portfolio/components/approved-portfolio-image"; import Image from "next/image"; import { useQuery } from "convex/react"; import { api } from "@/convex/_generated/api"; function PublicImages(){const data=useQuery(api.publicPortfolioFixture);return <main><div className="relative size-20"><ApprovedPortfolioImage alt="Public portfolio cover" fill url={data.cover} /></div>{data.gallery.map(row=><div className="relative size-20" key={row.id}><ApprovedPortfolioImage alt={row.id} fill url={row.url} /></div>)}<Image alt="Unrelated cover" src="https://media.example.test/cover.png" width={100} height={80} /></main>}`, `<PublicImages />`);
});
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.addInitScript(() => {
    const w = window as unknown as W; w.__blobCreated = []; w.__blobRevoked = []; w.__previewAborts = 0;
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL), originalFetch = window.fetch.bind(window);
    URL.createObjectURL = blob => { const url = create(blob); w.__blobCreated.push(url); return url; };
    URL.revokeObjectURL = url => { w.__blobRevoked.push(url); revoke(url); };
    window.fetch = (input, init) => { if (String(input).includes("/portfolio-images/private/")) init?.signal?.addEventListener("abort", () => { w.__previewAborts++; }); return originalFetch(input, init); };
  });
});
for (const locale of ["en", "fr"] as const) {
  const t = (locale === "fr" ? fr : en).adminPortfolioImages;
  test(`${locale}: metadata queue, private cover review, bounded history and exact confirmed approval`, async ({ page }) => {
    let requests = 0; page.on("request", request => { if (request.method() === "GET" && request.url().includes("/portfolio-images/private/")) requests++; });
    await previews(page); await mountHarness(page, queueBundle, state(locale));
    await expect(page.getByRole("heading", { name: t.queueTitle })).toBeVisible(); expect(requests).toBe(0);
    await page.getByRole("button", { name: t.loadMore }).click(); expect(await page.evaluate(() => (window as unknown as W).__paginationCalls)).toContainEqual({ path: queuePath, numItems: 20 });
    await openQueue(page, locale); await loaded(page, locale); await expect(page.getByText(t.separateApproval)).toBeVisible();
    for (const item of Object.values(t.checklist)) await expect(page.getByText(item, { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: t.approvedAlt })).toHaveAttribute("src", /^blob:/); expect(requests).toBe(2);
    await page.getByRole("dialog", { name: t.reviewTitle }).getByRole("button", { name: t.loadMore }).click();
    expect(await page.evaluate(() => (window as unknown as W).__paginationCalls)).toContainEqual({ path: historyPath, numItems: 10 });
    await page.getByRole("button", { name: t.approve, exact: true }).click(); const dialog = page.getByRole("dialog", { name: t.confirm.approve }); await expect(dialog).toBeVisible();
    await page.evaluate(path => { (window as unknown as W).__mutationDelays[path] = 150; }, approvePath);
    await dialog.getByRole("button", { name: t.confirm.approve }).dblclick(); await expect(dialog).not.toBeVisible();
    expect(await calls(page)).toEqual([{ path: approvePath, args: { imageId: b.imageId, expectedSha256: b.sha256 } }]); await expect(page.getByText(t.success.approve)).toBeVisible();
    await page.getByRole("button", { name: t.close, exact: true }).click(); await expect(page.getByRole("button").filter({ hasText: t.review }).first()).toBeFocused(); await allRevoked(page);
  });
  test(`${locale}: gallery slot review, keyboard reason confirmation and mobile layout`, async ({ page }) => {
    const gallery = image("gallery-B", "pending", "gallery"), approved = image("gallery-A", "approved", "gallery");
    await previews(page); await mountHarness(page, scopedBundle, state(locale, gallery, approved)); await openQueue(page, locale); await loaded(page, locale);
    await expect(page.getByText(t.gallerySlot.replace("{number}", "1")).first()).toBeVisible();
    expect(await page.evaluate(path => (window as unknown as W).__paginatedArgs.find(call => call.path === path), queuePath)).toMatchObject({ args: { companyId: "company", status: "pending" }, options: { initialNumItems: 20 } });
    for (const width of [320, 375, 768, 1024]) { await page.setViewportSize({ width, height: 900 }); expect(await hasHorizontalOverflow(page)).toBe(false); expect(await page.getByRole("dialog", { name: t.reviewTitle }).evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(false); }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const bounds = await page.getByRole("dialog", { name: t.reviewTitle }).evaluate(el => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
    expect(bounds.top).toBeGreaterThanOrEqual(15); expect(bounds.bottom).toBeLessThanOrEqual(797);
    await page.screenshot({ path: `/private/tmp/batiplus-admin-portfolio-${locale}-mobile.png` });
    const reject = page.getByRole("button", { name: t.reject, exact: true }); await reject.focus(); await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: t.confirm.reject }), confirm = dialog.getByRole("button", { name: t.confirm.reject });
    await expect(confirm).toBeDisabled(); await dialog.getByLabel(t.reason, { exact: true }).fill(" x "); await expect(confirm).toBeDisabled();
    await dialog.getByLabel(t.reason, { exact: true }).fill("  Remove   phone number  "); await expect(confirm).toBeEnabled();
    await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible(); await expect(reject).toBeFocused();
    await reject.click(); await dialog.getByLabel(t.reason, { exact: true }).fill("  Remove   phone number  "); await confirm.click();
    expect(await calls(page)).toEqual([{ path: "portfolioImages.index.reject", args: { imageId: gallery.imageId, expectedSha256: gallery.sha256, reason: "Remove phone number" } }]);
    await expect(page.getByText(t.success.reject)).toBeVisible();
  });
}
test("status filters retain metadata-only pagination", async ({ page }) => {
  await mountHarness(page, queueBundle, state());
  for (const status of ["approved", "rejected", "pending"]) {
    await page.getByLabel(en.adminPortfolioImages.filter, { exact: true }).selectOption(status);
    await expect.poll(() => page.evaluate(path => (window as unknown as W).__paginatedArgs.filter(call => call.path === path).at(-1)?.args.status, queuePath)).toBe(status);
  }
  expect(await page.evaluate(() => (window as unknown as W).__blobCreated)).toEqual([]);
});
for (const failure of ["corrupt", "404"] as const) test(`${failure} preview cannot enable approval; retry decodes the exact image`, async ({ page }) => {
  await previews(page, { corrupt: failure === "corrupt", failure: failure === "404" }); await mountReview(page);
  await expect(page.getByText(en.portfolioImages.previewError).first()).toBeVisible(); await expect(page.getByRole("button", { name: en.adminPortfolioImages.approve, exact: true })).toBeDisabled();
  await previews(page); await page.getByRole("button", { name: en.portfolioImages.retryPreview }).first().click(); await loaded(page);
});
test("approval stays disabled during the selected image download", async ({ page }) => {
  let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
  await previews(page, { hold, holdOnly: b.imageId }); await mountReview(page); await expect(page.getByText(en.portfolioImages.loadingPreview).first()).toBeVisible();
  await expect(page.getByRole("img", { name: en.adminPortfolioImages.approvedAlt })).toHaveAttribute("src", /^blob:/);
  await expect(page.getByRole("button", { name: en.adminPortfolioImages.approve, exact: true })).toBeDisabled(); release(); await loaded(page);
});
test("changed hash cancels confirmation; returning to an earlier DTO still requires fresh review", async ({ page }) => {
  const t = en.adminPortfolioImages; await previews(page); await mountReview(page); await loaded(page);
  await page.getByRole("button", { name: t.approve, exact: true }).click();
  await changeReview(page, { ...review(), image: { ...b, sha256: "changed-hash" } });
  await expect(page.getByRole("dialog", { name: t.confirm.approve })).toHaveCount(0); await expect(page.getByText(t.stale)).toBeVisible();
  await changeReview(page, review()); await expect(page.getByText(t.stale)).toBeVisible();
  await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled(); expect(await calls(page)).toEqual([]);
  await page.getByRole("button", { name: t.reviewAgain, exact: true }).click(); await loaded(page);
  expect(await page.evaluate(() => (window as unknown as W).__directQueryCalls)).toEqual([{ path: reviewPath, args: { imageId: b.imageId } }]);
});
for (const change of ["replacement", "status", "order", "publication"] as const) test(`${change} invalidates review without automatically choosing a newer image`, async ({ page }) => {
  const t = en.adminPortfolioImages; await previews(page); await mountReview(page); await loaded(page);
  await page.getByRole("button", { name: t.reject, exact: true }).click();
  const next = review();
  if (change === "replacement") { next.currentSubmissionId = "pending-C"; next.submitted = image("pending-C"); next.isCurrentSubmission = false; }
  if (change === "status") next.image = { ...b, moderationStatus: "rejected", reason: "Another Admin reviewed it" };
  if (change === "order") next.gallerySortOrder = 3;
  if (change === "publication") next.project.status = "hidden";
  await changeReview(page, next); await expect(page.getByRole("dialog", { name: t.confirm.reject })).toHaveCount(0); await expect(page.getByText(t.stale)).toBeVisible();
  await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled(); expect(await calls(page)).toEqual([]);
  await page.getByRole("button", { name: t.reviewAgain, exact: true }).click();
  if (change === "replacement" || change === "status") await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled(); else await loaded(page);
  expect(await page.evaluate(() => (window as unknown as W).__directQueryCalls.at(-1)?.args)).toEqual({ imageId: b.imageId });
});
test("backend stale rejection requires explicit reload and inspection", async ({ page }) => {
  const t = en.adminPortfolioImages; await previews(page); await mountReview(page); await loaded(page);
  await page.evaluate(path => { (window as unknown as W).__mutationErrors[path] = "PORTFOLIO_IMAGE_REVIEW_STALE"; }, approvePath);
  await page.getByRole("button", { name: t.approve, exact: true }).click(); await page.getByRole("dialog", { name: t.confirm.approve }).getByRole("button", { name: t.confirm.approve }).click();
  await expect(page.getByText(t.stale)).toBeVisible(); await expect(page.getByRole("dialog", { name: t.confirm.approve })).toHaveCount(0);
  await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled();
  expect(await calls(page)).toEqual([{ path: approvePath, args: { imageId: b.imageId, expectedSha256: b.sha256 } }]);
  await page.getByRole("button", { name: t.reviewAgain, exact: true }).click(); await loaded(page);
});
for (const purpose of ["cover", "gallery"] as const) test(`${purpose} hide requires reason/confirmation and the current approved ID/hash`, async ({ page }) => {
  const t = en.adminPortfolioImages; const current = image("current-approved", "approved", purpose), pending = image("replacement", "pending", purpose);
  await previews(page); await mountReview(page, state("en", current, current, pending));
  await expect(page.getByRole("button", { name: t.hide, exact: true })).toBeEnabled(); await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled();
  await expect(page.getByRole("img", { name: t.submittedAlt })).toHaveAttribute("src", /^blob:/);
  await page.getByRole("button", { name: t.hide, exact: true }).click(); const dialog = page.getByRole("dialog", { name: t.confirm.hide });
  const confirm = dialog.getByRole("button", { name: t.confirm.hide }); await expect(confirm).toBeDisabled();
  await dialog.getByLabel(t.reason, { exact: true }).fill("  x "); await expect(confirm).toBeDisabled();
  await dialog.getByLabel(t.reason, { exact: true }).fill("Identifying watermark"); await confirm.click();
  expect(await calls(page)).toEqual([{ path: "portfolioImages.index.hide", args: { imageId: current.imageId, expectedSha256: current.sha256, reason: "Identifying watermark" } }]); await expect(page.getByText(t.success.hide)).toBeVisible();
});
test("rejected replacement shows reason and same-slot approved image but cannot be approved", async ({ page }) => {
  const rejected = image("rejected-B", "rejected"); await previews(page); await mountReview(page, state("en", rejected));
  await expect(page.getByText(en.adminPortfolioImages.reasonValue.replace("{reason}", rejected.reason!))).toBeVisible();
  await expect(page.getByRole("img", { name: en.adminPortfolioImages.approvedAlt })).toHaveAttribute("src", /^blob:/);
  await expect(page.getByRole("button", { name: en.adminPortfolioImages.approve, exact: true })).toBeDisabled();
});
for (const role of ["company", "client", "seo_team", "staff"]) test(`${role} never requests Admin private data`, async ({ page }) => {
  const data = state(); data.__queries["users.currentUser"] = { _id: "admin", accountType: role };
  await mountHarness(page, queueBundle, data); await expect(page.getByRole("heading", { name: en.adminPortfolioImages.queueTitle })).toHaveCount(0);
  const queries = await page.evaluate(() => (window as unknown as W).__queryCalls || []);
  for (const path of [queuePath, reviewPath, historyPath]) expect(queries).not.toContain(path);
  expect(await page.evaluate(() => (window as unknown as W).__blobCreated)).toEqual([]);
});
for (const change of ["sign-out", "account change", "Admin account change"] as const) test(`${change} clears previews and confirmation`, async ({ page }) => {
  await previews(page); await mountReview(page); await loaded(page); await page.getByRole("button", { name: en.adminPortfolioImages.approve, exact: true }).click();
  await page.evaluate(change => { const w = window as unknown as W; w.__authToken = change === "sign-out" ? null : "other-session"; w.__queries["users.currentUser"] = change === "sign-out" ? null : { _id: "other", accountType: change === "Admin account change" ? "admin" : "client" }; window.dispatchEvent(new Event("convex-harness-update")); }, change);
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.locator('img[src^="blob:"]')).toHaveCount(0); await allRevoked(page);
});
test("closing review aborts active downloads and suppresses late responses", async ({ page }) => {
  let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
  await previews(page, { hold }); await mountReview(page); await expect(page.getByText(en.portfolioImages.loadingPreview).first()).toBeVisible();
  await page.getByRole("button", { name: en.adminPortfolioImages.close, exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__previewAborts)).toBe(2); release();
  expect(await page.evaluate(() => (window as unknown as W).__blobCreated)).toEqual([]); await expect(page.locator('img[src^="blob:"]')).toHaveCount(0);
});
for (const change of ["close", "sign-out", "Admin account change"] as const) test(`late preview body after ${change} cannot reappear`, async ({ page }) => {
  await previews(page); await mountHarness(page, queueBundle, state());
  await page.evaluate(() => {
    const w = window as unknown as { __body?: { signal: AbortSignal; release: () => void } }, fetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (String(input).endsWith("/portfolio-images/private/pending-B")) {
        const read = response.blob.bind(response);
        response.blob = async () => { const blob = await read(); await new Promise<void>(release => { w.__body = { signal: init!.signal!, release }; }); return blob; };
      }
      return response;
    };
  });
  await openQueue(page);
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __body?: unknown }).__body)).toBe(true);
  if (change === "close") await page.getByRole("button", { name: en.adminPortfolioImages.close, exact: true }).click();
  else await page.evaluate(change => {
    const w = window as unknown as W; w.__authToken = change === "sign-out" ? null : "other-session";
    w.__queries["users.currentUser"] = change === "sign-out" ? null : { _id: "other", accountType: "admin" }; window.dispatchEvent(new Event("convex-harness-update"));
  }, change);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __body: { signal: AbortSignal } }).__body.signal.aborted)).toBe(true);
  const count = await page.evaluate(() => (window as unknown as W).__blobCreated.length);
  await page.evaluate(async () => { (window as unknown as { __body: { release: () => void } }).__body.release(); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  expect(await page.evaluate(() => (window as unknown as W).__blobCreated.length)).toBe(count);
  await expect(page.locator('img[src^="blob:"]')).toHaveCount(0);
  expect(await page.evaluate(() => { const w = window as unknown as W; return w.__blobCreated.every(url => w.__blobRevoked.includes(url)); })).toBe(true);
});
test("changing selected image revokes old previews and reviews the explicitly selected file", async ({ page }) => {
  const t = en.adminPortfolioImages; await previews(page); await mountReview(page); await loaded(page);
  await page.evaluate(path => { const w = window as unknown as W; w.__queryHandlers = { [path]: args => w.__reviews[args.imageId] }; }, reviewPath);
  const urls = await page.evaluate(() => (window as unknown as W).__blobCreated);
  await page.getByRole("button", { name: t.reviewApproved, exact: true }).click(); await expect(page.getByRole("button", { name: t.hide, exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(urls => urls.every(url => (window as unknown as W).__blobRevoked.includes(url)), urls)).toBe(true);
  await expect(page.getByRole("img", { name: t.previewAlt })).toHaveAttribute("src", /^blob:/); await expect(page.getByRole("img", { name: t.submittedAlt })).toHaveAttribute("src", /^blob:/);
  expect(await calls(page)).toEqual([]);
});
test("recoverable decision failure preserves reason and exact target for retry", async ({ page }) => {
  const t = en.adminPortfolioImages, path = "portfolioImages.index.reject"; await previews(page); await mountReview(page); await loaded(page);
  await page.evaluate(path => { (window as unknown as W).__mutationErrors[path] = "NETWORK"; }, path);
  await page.getByRole("button", { name: t.reject, exact: true }).click(); const dialog = page.getByRole("dialog", { name: t.confirm.reject });
  await dialog.getByLabel(t.reason, { exact: true }).fill("Remove phone number"); await dialog.getByRole("button", { name: t.confirm.reject }).click();
  await expect(dialog.getByRole("alert")).toBeVisible(); await expect(dialog.getByLabel(t.reason, { exact: true })).toHaveValue("Remove phone number");
  await page.evaluate(path => { delete (window as unknown as W).__mutationErrors[path]; }, path);
  await dialog.getByRole("button", { name: t.confirm.reject }).click(); await expect(dialog).not.toBeVisible();
  const submitted = await calls(page); expect(submitted).toHaveLength(2); expect(submitted[0]).toEqual(submitted[1]);
});
test("queue loading/empty and query error states are localized without raw error leakage", async ({ page }) => {
  const t = en.adminPortfolioImages, data = state(); data.__paginatedQueries[queuePath] = { status: "LoadingFirstPage", results: [] };
  await mountHarness(page, queueBundle, data); await expect(page.getByRole("status")).toBeVisible();
  await page.evaluate(path => { const w = window as unknown as W; w.__paginatedQueries[path] = { status: "Exhausted", results: [] }; window.dispatchEvent(new Event("convex-harness-update")); }, queuePath);
  await expect(page.getByText(t.emptyQueue)).toBeVisible();
  await mountHarness(page, queueBundle, state()); await page.evaluate(path => { (window as unknown as W).__queryHandlers = { [path]: () => { throw new Error("Private server stack and storage-id"); } }; }, reviewPath);
  await openQueue(page); await expect(page.getByText(t.loadError)).toBeVisible(); await expect(page.getByText("Private server stack and storage-id")).toHaveCount(0);
  await page.evaluate(path => { delete (window as unknown as W).__queryHandlers[path]; }, reviewPath); await page.getByRole("button", { name: t.retry, exact: true }).click(); await previews(page); await openQueue(page); await loaded(page);
});
test("approved public cover/gallery bypass optimization; failure shows generic and unrelated images stay optimized", async ({ page }) => {
  await page.route(`${site}/portfolio-images/public/**`, route => respond(route)); await page.route("https://media.example.test/cover.png", route => respond(route));
  await mountHarness(page, publicBundle, { __locale: "en", __queries: { publicPortfolioFixture: { cover: `${site}/portfolio-images/public/approved-cover`, gallery: [{ id: "slot-1", url: `${site}/portfolio-images/public/approved-gallery` }] } } });
  for (const alt of ["Public portfolio cover", "slot-1"]) await expect(page.getByRole("img", { name: alt, exact: true })).toHaveAttribute("data-unoptimized", "true");
  await expect(page.getByRole("img", { name: "Unrelated cover", exact: true })).not.toHaveAttribute("data-unoptimized");
  await page.route(`${site}/portfolio-images/public/hidden`, route => respond(route, 404, "not found"));
  await page.evaluate(() => { const w = window as unknown as W; w.__queries.publicPortfolioFixture = { cover: "https://verification-test.convex.site/portfolio-images/public/hidden", gallery: [] }; window.dispatchEvent(new Event("convex-harness-update")); });
  await expect(page.locator("img[alt='Public portfolio cover']")).toHaveCount(0); await expect(page.locator("[role=img][aria-label='Public portfolio cover']")).toBeVisible(); await expect(page.getByRole("img", { name: "slot-1", exact: true })).toHaveCount(0);
});
for (const url of [null, `${site}/portfolio-images/private/pending`, `${site}/api/storage/legacy`, "https://media.example.test/legacy.png"]) test(`public cover refuses legacy/private fallback ${url}`, async ({ page }) => {
  await mountHarness(page, publicBundle, { __locale: "fr", __queries: { publicPortfolioFixture: { cover: url, gallery: [] } } });
  await expect(page.locator("img[alt='Public portfolio cover']")).toHaveCount(0); await expect(page.locator("[role=img][aria-label='Public portfolio cover']")).toBeVisible();
});
test("manually constructed Next optimizer URLs deny moderated portfolio endpoints", async ({ request }) => {
  for (const purpose of ["public", "private"]) {
    const response = await request.get(`/_next/image?url=${encodeURIComponent(`${site}/portfolio-images/${purpose}/image-id`)}&w=96&q=75`);
    expect(response.status()).toBe(400); expect(await response.text()).toContain('"url" parameter is not allowed');
  }
});
