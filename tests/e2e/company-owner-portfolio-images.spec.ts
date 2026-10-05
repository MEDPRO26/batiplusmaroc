import { expect, test, type Page, type Route } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const site = "https://verification-test.convex.site";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhN8AAAAASUVORK5CYII=", "base64");
const imagePath = "portfolioImages.index.getMyImages";
const intentPath = "portfolioImages.index.generateUploadIntent";
const slotPath = "portfolioImages.index.createGallerySlot";
const managerPath = "portfolio.index.getPortfolioManager";
const reason = "Remove identifying branding";
const image = (id: string, status: "pending" | "approved" | "rejected", slotId?: string) => ({
  imageId: id, companyId: "company", portfolioProjectId: "project", purpose: slotId ? "gallery" : "cover", gallerySlotId: slotId ?? null,
  moderationStatus: status, reason: status === "rejected" ? reason : null, sha256: `hash-${id}`, size: png.length, contentType: "image/png",
  uploadedAt: 100, uploadedBy: "owner", previewUrl: `${site}/portfolio-images/private/${id}`,
});
type Pair = { approved: ReturnType<typeof image> | null; submitted: ReturnType<typeof image> | null };
type Images = { cover: Pair; gallery: (Pair & { slotId: string; sortOrder: number; caption: null })[] };
const empty = (): Images => ({ cover: { approved: null, submitted: null }, gallery: [] });
const a = image("approved-A", "approved");
const project = { id: "project", title: "Renovated home", description: "Residential construction and renovation project.", city: "Rabat", projectType: "renovation", surface: null, durationMonths: null, year: null, status: "published", coverImageUrl: `${site}/portfolio-images/public/approved-A` as string | null, media: [] };
type HW = Window & {
  __queries: Record<string, unknown>; __queryCalls: string[]; __authToken: string | null;
  __mutationCalls?: { path: string; args: Record<string, unknown> }[]; __mutationErrors?: Record<string, string>; __mutationCompletions?: string[];
  __mutationHandlers?: Record<string, (args: Record<string, unknown>) => unknown>;
  __blobCreated: string[]; __blobRevoked: string[];
};
let bundle = ""; let managerBundle = "";

function state(locale: "en" | "fr" = "en", images: Images = empty(), owner = true) {
  return { __locale: locale, __authToken: "owner-session", __queries: {
    "users.currentUser": { _id: "owner", accountType: "company", onboardingStatus: "completed" },
    "companyVerification.index.getVerificationStatus": { status: "draft", canManageDocuments: owner },
    [imagePath]: images, [managerPath]: { companySlug: "atlas", projects: [project] },
  }, __mutationResults: { [intentPath]: { uploadToken: "single-use-secret", uploadUrl: "https://untrusted.invalid/ignore?secret=token" }, "portfolio.index.createPortfolioProject": "project" } };
}
async function cors(route: Route, response: { status?: number; contentType: string; body: string | Buffer }) {
  return route.fulfill({ ...response, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": route.request().headers().origin || "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Upload-Token", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
}
async function previews(page: Page, denied = false) {
  await page.route(`${site}/portfolio-images/private/**`, route => {
    if (route.request().method() === "OPTIONS") return cors(route, { contentType: "text/plain", body: "" });
    expect(route.request().headers().authorization).toBe("Bearer owner-session"); expect(new URL(route.request().url()).search).toBe("");
    return cors(route, { status: denied ? 404 : 200, contentType: "image/png", body: denied ? "Not found" : png });
  });
  await page.route(`${site}/portfolio-images/public/**`, route => cors(route, { contentType: "image/png", body: png }));
}
async function patch(page: Page, images: Images) {
  await page.evaluate(({ path, images }) => { const w = window as unknown as HW; w.__queries[path] = images; window.dispatchEvent(new Event("convex-harness-update")); }, { path: imagePath, images });
}
async function uploads(page: Page, failed = false) {
  await page.route(`${site}/portfolio-images/upload`, async route => {
    const req = route.request();
    if (req.method() === "OPTIONS") return cors(route, { contentType: "text/plain", body: "" });
    expect(req.method()).toBe("POST"); expect(req.headers().authorization).toBe("Bearer owner-session");
    expect(req.headers()["x-upload-token"]).toBe("single-use-secret"); expect(req.postDataBuffer()).toEqual(png); expect(new URL(req.url()).search).toBe("");
    const args = await page.evaluate(() => (window as unknown as HW).__mutationCalls!.filter(call => call.path === "portfolioImages.index.generateUploadIntent").at(-1)!.args);
    const id = `new-${args.gallerySlotId ?? "cover"}`;
    if (!failed) await page.evaluate(({ path, args, dto }) => {
      const w = window as unknown as HW; const data = w.__queries[path] as Images;
      w.__queries[path] = args.purpose === "cover" ? { ...data, cover: { ...data.cover, submitted: dto } } : { ...data, gallery: data.gallery.map(slot => slot.slotId === args.gallerySlotId ? { ...slot, submitted: dto } : slot) };
      window.dispatchEvent(new Event("convex-harness-update"));
    }, { path: imagePath, args, dto: image(id, "pending", args.gallerySlotId as string | undefined) });
    await cors(route, { status: failed ? 503 : 200, contentType: "application/json", body: JSON.stringify({ imageId: id }) });
  });
}
const slot = (page: Page, id = "cover") => page.locator(`[data-slot-id="${id}"]`);
async function select(page: Page, id = "cover", locale: "en" | "fr" = "en", name = "replacement.png") {
  await slot(page, id).getByLabel((locale === "en" ? en : fr).portfolioImages.chooseFile, { exact: true }).setInputFiles({ name, mimeType: "image/png", buffer: png });
}
async function calls(page: Page) { return page.evaluate(() => (window as unknown as HW).__mutationCalls || []); }
async function trackBlobs(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as HW; w.__blobCreated = []; w.__blobRevoked = [];
    const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); w.__blobCreated.push(url); return url; };
    URL.revokeObjectURL = url => { w.__blobRevoked.push(url); revoke(url); };
  });
}
async function editing(page: Page, initial: Record<string, unknown> = state()) {
  await mountHarness(page, managerBundle, initial);
  await page.getByRole("button", { name: en.portfolioManager.edit, exact: true }).click();
}
test.beforeAll(async () => {
  bundle = await buildHarness(`import { StrictMode } from "react"; import { CompanyOwnerPortfolioImages } from "./features/portfolio/components/company-owner-portfolio-images";`, `<StrictMode><main className="mx-auto max-w-[720px] p-4"><CompanyOwnerPortfolioImages portfolioProjectId="project" publicUrls={["${site}/portfolio-images/public/approved-A", "${site}/portfolio-images/public/gallery-A"]} /></main></StrictMode>`);
  managerBundle = await buildHarness(`import { PortfolioManager } from "./features/portfolio/components/portfolio-manager"; import { AppFeedback } from "./features/shared/components/app-feedback";`, `<AppFeedback><PortfolioManager /></AppFeedback>`);
});
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});

for (const locale of ["en", "fr"] as const) {
  const t = (locale === "en" ? en : fr).portfolioImages;
  test(`${locale}: pending cover uploads directly and owner previews privately`, async ({ page }) => {
    await previews(page); await uploads(page); await mountHarness(page, bundle, state(locale));
    await expect(page.getByText(t.guidance)).toBeVisible(); await expect(page.getByText(t.publicationHelp)).toBeVisible();
    await select(page, "cover", locale); await slot(page).getByRole("button", { name: t.submit, exact: true }).click();
    await expect(slot(page).getByText(t.success)).toBeVisible(); await expect(slot(page).getByText(t.status.pending, { exact: true })).toBeVisible();
    await expect(slot(page).getByRole("img", { name: t.submittedTitle })).toHaveAttribute("src", /^blob:/);
    await expect(slot(page).getByRole("img", { name: t.submittedTitle })).toHaveAttribute("data-unoptimized", "true");
    expect(await calls(page)).toEqual([{ path: intentPath, args: { portfolioProjectId: "project", purpose: "cover", contentType: "image/png", size: png.length } }]);
  });
  test(`${locale}: approved A stays public during pending/rejected B and another upload`, async ({ page }) => {
    await previews(page); await uploads(page);
    const images = empty(); images.cover = { approved: a, submitted: image("B", "pending") };
    await mountHarness(page, bundle, state(locale, images));
    const approved = slot(page).getByRole("img", { name: t.approvedTitle });
    await expect(approved).toHaveAttribute("src", `${site}/portfolio-images/public/approved-A`); await expect(approved).toHaveAttribute("data-unoptimized", "true");
    images.cover.submitted = image("B", "rejected"); await patch(page, images);
    await expect(slot(page).getByText(t.reason.replace("{reason}", reason))).toBeVisible();
    await select(page, "cover", locale); await slot(page).getByRole("button", { name: t.submit, exact: true }).click();
    await expect(slot(page).getByText(t.status.pending, { exact: true })).toBeVisible(); await expect(page.getByText(reason, { exact: false })).toHaveCount(0);
    await expect(approved).toHaveAttribute("src", `${site}/portfolio-images/public/approved-A`);
  });
  for (const width of [320, 375]) test(`${locale}: ${width}px gallery and keyboard upload fit`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await previews(page); await uploads(page);
    const images = empty(); images.gallery = [{ slotId: "slot-1", sortOrder: 0, caption: null, approved: image("gallery-A", "approved", "slot-1"), submitted: image("B", "rejected", "slot-1") }];
    await mountHarness(page, bundle, state(locale, images)); await select(page, "slot-1", locale, "image-" + "x".repeat(140) + ".png");
    const input = slot(page, "slot-1").getByLabel(t.chooseFile); await input.focus(); await expect(input).toBeFocused(); await page.keyboard.press("Tab");
    const button = slot(page, "slot-1").getByRole("button", { name: t.submit, exact: true }); await expect(button).toBeFocused();
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44); expect(await hasHorizontalOverflow(page)).toBe(false);
    await page.keyboard.press("Enter"); await expect(slot(page, "slot-1").getByText(t.success)).toBeVisible(); expect(await hasHorizontalOverflow(page)).toBe(false);
  });
}

test("new gallery slot and existing replacement retain their own approval and order", async ({ page }) => {
  await previews(page); await uploads(page); const images = empty();
  images.gallery = [{ slotId: "slot-1", sortOrder: 0, caption: null, approved: image("gallery-A", "approved", "slot-1"), submitted: null }];
  await mountHarness(page, bundle, state("en", images));
  await page.evaluate(({ path, imagePath }) => {
    const w = window as unknown as HW; w.__mutationHandlers = { [path]: () => {
      const data = w.__queries[imagePath] as Images; w.__queries[imagePath] = { ...data, gallery: [...data.gallery, { slotId: "slot-2", sortOrder: 1, caption: null, approved: null, submitted: null }] };
      window.dispatchEvent(new Event("convex-harness-update")); return "slot-2";
    } };
  }, { path: slotPath, imagePath });
  await page.getByRole("button", { name: en.portfolioImages.addSlot }).click();
  await expect(slot(page, "slot-2").getByLabel(en.portfolioImages.chooseFile)).toBeFocused();
  for (const id of ["slot-2", "slot-1"]) {
    await select(page, id); await slot(page, id).getByRole("button", { name: en.portfolioImages.submit, exact: true }).click();
    await expect(slot(page, id).getByText(en.portfolioImages.success)).toBeVisible(); await expect(slot(page, id).getByRole("img", { name: en.portfolioImages.submittedTitle })).toHaveAttribute("src", /^blob:/);
  }
  await expect(slot(page, "slot-1").getByRole("img", { name: en.portfolioImages.approvedTitle })).toHaveAttribute("src", `${site}/portfolio-images/public/gallery-A`);
  await expect(slot(page, "slot-2").getByText(en.portfolioImages.omittedGallery)).toBeVisible();
  const mutations = await calls(page); expect(mutations.map(call => call.path)).toEqual([slotPath, intentPath, intentPath]);
  expect(mutations[1].args.gallerySlotId).toBe("slot-2"); expect(mutations[2].args.gallerySlotId).toBe("slot-1");
  expect(await page.locator('[data-slot-id^="slot-"]').evaluateAll(elements => elements.map(element => element.getAttribute("data-slot-id")))).toEqual(["slot-1", "slot-2"]);
});

test("invalid MIME and oversized files do not request upload intents", async ({ page }) => {
  await mountHarness(page, bundle, state()); const input = slot(page).getByLabel(en.portfolioImages.chooseFile);
  for (const bad of [{ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") }, { name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }]) {
    await input.setInputFiles(bad); await expect(slot(page).getByRole("alert")).toContainText(en.ux.error.codes.INVALID_PORTFOLIO_IMAGE_UPLOAD);
    await expect(slot(page).getByRole("button", { name: en.portfolioImages.submit, exact: true })).toBeDisabled(); expect(await calls(page)).toEqual([]);
  }
});
test("failed upload retains File/slot; retry uses a fresh intent and duplicate clicks are blocked", async ({ page }) => {
  await previews(page); await uploads(page, true); const images = empty(); images.gallery = [{ slotId: "slot-1", sortOrder: 0, caption: null, approved: null, submitted: null }];
  await mountHarness(page, bundle, { ...state("en", images), __mutationDelays: { [intentPath]: 200 } }); await select(page, "slot-1");
  await slot(page, "slot-1").getByRole("button", { name: en.portfolioImages.submit, exact: true }).evaluate(el => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
  await expect(slot(page, "slot-1").getByRole("alert")).toContainText(en.ux.error.codes.PUBLIC_MEDIA_UPLOAD_FAILED); expect(await calls(page)).toHaveLength(1);
  await expect(slot(page, "slot-1").getByText(en.portfolioImages.selected.replace("{name}", "replacement.png"))).toBeVisible();
  await uploads(page); await slot(page, "slot-1").getByRole("button", { name: en.portfolioImages.retryUpload }).click();
  await expect(slot(page, "slot-1").getByText(en.portfolioImages.success)).toBeVisible(); expect((await calls(page)).every(call => call.args.gallerySlotId === "slot-1")).toBe(true);
  expect(await calls(page)).toHaveLength(2);
});
test("intent failure retains selection for retry", async ({ page }) => {
  await previews(page); await uploads(page); await mountHarness(page, bundle, { ...state(), __mutationErrors: { [intentPath]: "INVALID_PORTFOLIO_IMAGE_UPLOAD" } }); await select(page);
  await slot(page).getByRole("button", { name: en.portfolioImages.submit, exact: true }).click(); await expect(slot(page).getByRole("alert")).toBeVisible();
  await page.evaluate(() => { (window as unknown as HW).__mutationErrors = {}; }); await slot(page).getByRole("button", { name: en.portfolioImages.retryUpload }).click();
  await expect(slot(page).getByText(en.portfolioImages.success)).toBeVisible(); expect(await calls(page)).toHaveLength(2);
});
test("staff do not subscribe to private state, fetch previews or see reasons", async ({ page }) => {
  const requests: string[] = []; page.on("request", req => { if (req.url().includes("/portfolio-images/")) requests.push(req.url()); });
  const images = empty(); images.cover.submitted = image("B", "rejected"); await mountHarness(page, bundle, state("en", images, false));
  await expect(page.locator("[data-owner-portfolio-images]")).toHaveCount(0); await expect(page.getByText(reason, { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as HW).__queryCalls)).not.toContain(imagePath); expect(requests).toEqual([]);
});
test("sign-out revokes loaded Blobs without aborting completed bodies", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); await previews(page); await mountHarness(page, bundle, state()); await trackBlobs(page);
  await page.evaluate(() => {
    const w = window as unknown as { __signals: AbortSignal[] }; w.__signals = []; const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => { if (String(input).includes("/portfolio-images/private/")) w.__signals.push(init!.signal!); return fetch(input, init); };
  });
  const images = empty(); images.cover.submitted = image("B", "rejected"); await patch(page, images);
  await expect(slot(page).getByRole("img", { name: en.portfolioImages.submittedTitle })).toHaveAttribute("src", /^blob:/);
  await page.evaluate(() => { const w = window as unknown as HW; w.__authToken = null; window.dispatchEvent(new Event("convex-harness-update")); });
  await expect(page.locator("[data-owner-portfolio-images]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as HW).__blobCreated.every(url => (window as unknown as HW).__blobRevoked.includes(url)))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __signals: AbortSignal[] }).__signals.map(signal => signal.aborted))).toEqual([false]); expect(errors).toEqual([]);
});
test("account switch clears previews/reasons/selection", async ({ page }) => {
  await previews(page); await mountHarness(page, bundle, state()); await trackBlobs(page);
  const images = empty(); images.cover.submitted = image("B", "rejected"); await patch(page, images); await select(page);
  await expect(slot(page).getByRole("img", { name: en.portfolioImages.submittedTitle })).toHaveAttribute("src", /^blob:/);
  await page.evaluate(({ path, data }) => {
    const w = window as unknown as HW; w.__authToken = "other-session"; w.__queries["users.currentUser"] = { _id: "other", accountType: "company", onboardingStatus: "completed" }; w.__queries[path] = data;
    window.dispatchEvent(new Event("convex-harness-update"));
  }, { path: imagePath, data: empty() });
  await expect(page.locator('img[src^="blob:"]')).toHaveCount(0); await expect(page.getByText(reason, { exact: false })).toHaveCount(0);
  await expect(slot(page).getByRole("button", { name: en.portfolioImages.submit, exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as HW).__blobCreated.every(url => (window as unknown as HW).__blobRevoked.includes(url)))).toBe(true);
});
test("late preview body after sign-out is cancelled and never becomes a Blob URL", async ({ page }) => {
  await previews(page); await mountHarness(page, bundle, state()); await trackBlobs(page);
  await page.evaluate(() => {
    const w = window as unknown as { __body?: { signal: AbortSignal; release: () => void } }; const fetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (String(input).includes("/portfolio-images/private/")) { const read = response.blob.bind(response); response.blob = async () => {
        const blob = await read(); await new Promise<void>(release => { w.__body = { signal: init!.signal!, release }; }); return blob;
      }; } return response;
    };
  });
  const images = empty(); images.cover.submitted = image("B", "pending"); await patch(page, images);
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __body?: unknown }).__body)).toBe(true);
  await page.evaluate(() => { const w = window as unknown as HW; w.__authToken = null; window.dispatchEvent(new Event("convex-harness-update")); });
  await expect(page.locator("[data-owner-portfolio-images]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __body: { signal: AbortSignal } }).__body.signal.aborted)).toBe(true);
  await page.evaluate(async () => { (window as unknown as { __body: { release: () => void } }).__body.release(); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  expect(await page.evaluate(() => (window as unknown as HW).__blobCreated)).toEqual([]);
});
test("changing image releases old preview; denied fetch has retry", async ({ page }) => {
  await previews(page); await mountHarness(page, bundle, state()); await trackBlobs(page);
  const images = empty(); images.cover.submitted = image("B", "pending"); await patch(page, images);
  const preview = slot(page).getByRole("img", { name: en.portfolioImages.submittedTitle }); await expect(preview).toHaveAttribute("src", /^blob:/); const old = await preview.getAttribute("src");
  await previews(page, true); images.cover.submitted = image("C", "pending"); await patch(page, images);
  await expect(slot(page).getByText(en.portfolioImages.previewError)).toBeVisible(); expect(await page.evaluate(() => (window as unknown as HW).__blobRevoked)).toContain(old);
  await previews(page); await slot(page).getByRole("button", { name: en.portfolioImages.retryPreview }).click(); await expect(preview).toHaveAttribute("src", /^blob:/);
});
test("closing editor releases private previews", async ({ page }) => {
  await previews(page); await editing(page); await trackBlobs(page); const images = empty(); images.cover.submitted = image("B", "pending"); await patch(page, images);
  await expect(slot(page).getByRole("img", { name: en.portfolioImages.submittedTitle })).toHaveAttribute("src", /^blob:/);
  await page.getByRole("button", { name: en.portfolioManager.cancel, exact: true }).first().click(); await expect(page.locator("[data-owner-portfolio-images]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as HW).__blobCreated.every(url => (window as unknown as HW).__blobRevoked.includes(url)))).toBe(true);
});
test("draft without images saves and then allows optional review uploads", async ({ page }) => {
  await previews(page); const initial = state(); initial.__queries[managerPath].projects = [];
  await mountHarness(page, managerBundle, initial); await page.getByRole("button", { name: en.portfolioManager.add, exact: true }).click();
  await expect(page.getByText(en.portfolioImages.saveFirst)).toBeVisible(); await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.getByLabel(en.portfolioManager.fields.title, { exact: true }).fill("Renovated home"); await page.getByLabel(en.portfolioManager.fields.description, { exact: true }).fill("Residential construction and renovation project."); await page.getByLabel(en.portfolioManager.fields.city, { exact: true }).fill("Rabat");
  await page.getByRole("button", { name: en.portfolioManager.saveDraft, exact: true }).click(); await expect(page.locator("[data-owner-portfolio-images]")).toBeVisible();
  const mutations = await calls(page); expect(mutations).toHaveLength(1); expect(mutations[0].path).toBe("portfolio.index.createPortfolioProject");
  expect(mutations[0].args).not.toHaveProperty("coverImage"); expect(mutations[0].args).not.toHaveProperty("extraImages");
});
test("text save remains available during upload and after recoverable failure", async ({ page }) => {
  await previews(page); await uploads(page, true); await editing(page, { ...state(), __mutationDelays: { [intentPath]: 300 } }); await select(page);
  await slot(page).getByRole("button", { name: en.portfolioImages.submit, exact: true }).click();
  await page.getByRole("button", { name: en.portfolioManager.saveDraft, exact: true }).click();
  await expect(slot(page).getByRole("alert")).toBeVisible(); await expect(slot(page).getByRole("button", { name: en.portfolioImages.retryUpload })).toBeEnabled();
  expect((await calls(page)).map(call => call.path)).toEqual([intentPath, "portfolio.index.updatePortfolioProject"]);
  await page.getByRole("button", { name: en.portfolioManager.saveDraft, exact: true }).click();
  await expect.poll(async () => (await calls(page)).filter(call => call.path === "portfolio.index.updatePortfolioProject").length).toBe(2);
});
test("publishing sends metadata decision only and never approves pending images", async ({ page }) => {
  await previews(page); const initial = state(); initial.__queries[managerPath].projects = [{ ...project, status: "draft", coverImageUrl: null }]; initial.__queries[imagePath].cover.submitted = image("B", "pending");
  await mountHarness(page, managerBundle, initial); await page.getByRole("button", { name: en.portfolioManager.moreActions.replace("{title}", project.title) }).click();
  await page.getByRole("menuitem", { name: en.portfolioManager.publish, exact: true }).click();
  expect(await calls(page)).toEqual([{ path: "portfolio.index.publishPortfolioProject", args: { projectId: "project" } }]);
  await page.getByRole("button", { name: en.portfolioManager.edit, exact: true }).click(); await expect(slot(page).getByText(en.portfolioImages.status.pending, { exact: true })).toBeVisible();
});
for (const width of [320, 375]) test(`full owner editor fits ${width}px without requiring images`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 }); await previews(page); await editing(page);
  await expect(page.locator("[data-owner-portfolio-images]")).toBeVisible(); expect(await hasHorizontalOverflow(page)).toBe(false);
  for (const title of [en.portfolioImages.approvedTitle, en.portfolioImages.submittedTitle]) {
    expect((await slot(page).getByRole("img", { name: title, exact: true }).boundingBox())?.height).toBe(80);
  }
  await page.screenshot({ path: testInfo.outputPath("owner-editor.png"), fullPage: true });
});

test("approved draft image uses authenticated preview and ignores supplied raw preview URL", async ({ page }) => {
  const requests: string[] = []; page.on("request", req => { if (req.url().includes("/portfolio-images/")) requests.push(req.url()); });
  await previews(page); const images = empty(); images.cover.approved = { ...image("draft-approved", "approved"), previewUrl: "https://legacy.r2.dev/private-file" };
  await mountHarness(page, bundle, state("en", images));
  await expect(slot(page).getByRole("img", { name: en.portfolioImages.approvedTitle })).toHaveAttribute("src", /^blob:/);
  expect(requests.filter(url => url.includes("/public/"))).toEqual([]);
  expect(requests.some(url => url.endsWith("/private/draft-approved"))).toBe(true);
  await expect(page.locator('img[src*="r2.dev"]')).toHaveCount(0);
});
test("a late replaced-image body cannot overwrite the current preview", async ({ page }) => {
  await previews(page); await mountHarness(page, bundle, state()); await trackBlobs(page);
  await page.evaluate(() => {
    const w = window as unknown as { __old?: { signal: AbortSignal; release: () => void } }; const fetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (String(input).endsWith("/portfolio-images/private/old-B")) { const read = response.blob.bind(response); response.blob = async () => {
        const blob = await read(); await new Promise<void>(release => { w.__old = { signal: init!.signal!, release }; }); return blob;
      }; } return response;
    };
  });
  const images = empty(); images.cover.submitted = image("old-B", "pending"); await patch(page, images);
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __old?: unknown }).__old)).toBe(true);
  images.cover.submitted = image("current-C", "pending"); await patch(page, images);
  const preview = slot(page).getByRole("img", { name: en.portfolioImages.submittedTitle }); await expect(preview).toHaveAttribute("src", /^blob:/); const currentUrl = await preview.getAttribute("src");
  expect(await page.evaluate(() => (window as unknown as { __old: { signal: AbortSignal } }).__old.signal.aborted)).toBe(true);
  await page.evaluate(async () => { (window as unknown as { __old: { release: () => void } }).__old.release(); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  await expect(preview).toHaveAttribute("src", currentUrl!); expect(await page.evaluate(() => (window as unknown as HW).__blobCreated)).toHaveLength(1);
});
test("sign-out during intent creation sends no image bytes", async ({ page }) => {
  let sent = 0; await page.route(`${site}/portfolio-images/upload`, route => { sent++; return cors(route, { contentType: "application/json", body: "{}" }); });
  await mountHarness(page, bundle, { ...state(), __mutationDelays: { [intentPath]: 250 } }); await select(page);
  await slot(page).getByRole("button", { name: en.portfolioImages.submit, exact: true }).click();
  await page.evaluate(() => { const w = window as unknown as HW; w.__authToken = null; window.dispatchEvent(new Event("convex-harness-update")); });
  await expect(page.locator("[data-owner-portfolio-images]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as HW).__mutationCompletions || [])).toContain(intentPath); expect(sent).toBe(0);
});
