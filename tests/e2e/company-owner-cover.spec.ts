import { expect, test, type Page, type Route } from "@playwright/test";
import { buildHarness, hasHorizontalOverflow, mountHarness } from "./support/component-harness";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const site = "https://verification-test.convex.site";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhN8AAAAASUVORK5CYII=", "base64");
const reason = "Remove the identifying phone number";
const coverPath = "companyCovers.index.getMyCovers";
const intentPath = "companyCovers.index.generateUploadIntent";
const image = (imageId: string, moderationStatus: "pending" | "approved" | "rejected") => ({
  imageId, companyId: "company", contentType: "image/png", size: png.length, sha256: "file-hash", uploadedBy: "owner", uploadedAt: 100,
  moderationStatus, reason: moderationStatus === "rejected" ? reason : null, previewUrl: `${site}/company-covers/private/${imageId}`,
});
const approved = image("approved-A", "approved");
const rejected = image("rejected-B", "rejected");
type CoverState = { approved: ReturnType<typeof image> | null; submitted: ReturnType<typeof image> | null };
type HarnessWindow = Window & {
  __authToken: string | null; __queries: Record<string, unknown>; __queryCalls: string[];
  __mutationCalls?: { path: string; args: Record<string, unknown> }[];
  __mutationCompletions?: string[];
  __mutationErrors?: Record<string, string>; __mutationDelays?: Record<string, number>;
  __blobCreated: string[]; __blobRevoked: string[];
};
let bundle = ""; let strictBundle = ""; let profileBundle = "";

function state(locale: "en" | "fr" = "en", covers: CoverState = { approved: null, submitted: null }, owner = true) {
  return { __locale: locale, __authToken: "owner-session", __queries: {
    "users.currentUser": { _id: "owner", accountType: "company", onboardingStatus: "completed", email: "owner@example.test" },
    "companyVerification.index.getVerificationStatus": { status: "draft", canManageDocuments: owner },
    [coverPath]: covers,
  }, __mutationResults: {
    [intentPath]: { uploadToken: "single-use-secret", uploadUrl: "https://untrusted.invalid/never-use?token=secret" },
  } };
}

async function cors(route: Route, response: { status?: number; contentType: string; body: string | Buffer }) {
  await route.fulfill({ ...response, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": route.request().headers().origin || "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Upload-Token", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
}

async function privatePreviews(page: Page, denied = false) {
  await page.route(`${site}/company-covers/private/**`, async route => {
    if (route.request().method() === "OPTIONS") return cors(route, { contentType: "text/plain", body: "" });
    expect(route.request().headers().authorization).toBe("Bearer owner-session");
    expect(new URL(route.request().url()).search).toBe("");
    await cors(route, { status: denied ? 404 : 200, contentType: "image/png", body: denied ? "Not found" : png });
  });
}

async function upload(page: Page, { failure = false, update = true } = {}) {
  await page.route(`${site}/company-covers/upload`, async route => {
    const request = route.request();
    if (request.method() === "OPTIONS") return cors(route, { contentType: "text/plain", body: "" });
    expect(request.method()).toBe("POST"); expect(request.headers().authorization).toBe("Bearer owner-session");
    expect(request.headers()["x-upload-token"]).toBe("single-use-secret"); expect(request.headers()["content-type"]).toBe("image/png");
    expect(request.postDataBuffer()).toEqual(png); expect(new URL(request.url()).search).toBe("");
    if (!failure && update) await updateCovers(page, { submitted: image("pending-C", "pending") });
    await cors(route, { status: failure ? 503 : 200, contentType: "application/json", body: JSON.stringify({ imageId: "pending-C" }) });
  });
}

async function updateCovers(page: Page, patch: Partial<CoverState>) {
  await page.evaluate(({ path, patch }) => {
    const w = window as unknown as HarnessWindow; w.__queries[path] = { ...(w.__queries[path] as object), ...patch };
    window.dispatchEvent(new Event("convex-harness-update"));
  }, { path: coverPath, patch });
}

async function select(page: Page, locale: "en" | "fr" = "en", name = "replacement.png") {
  await page.getByLabel((locale === "en" ? en : fr).companyCover.chooseFile, { exact: true }).setInputFiles({ name, mimeType: "image/png", buffer: png });
}
async function calls(page: Page) { return page.evaluate(() => (window as unknown as HarnessWindow).__mutationCalls || []); }
async function trackBlobs(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as HarnessWindow; w.__blobCreated = []; w.__blobRevoked = [];
    const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); w.__blobCreated.push(url); return url; };
    URL.revokeObjectURL = url => { w.__blobRevoked.push(url); revoke(url); };
  });
}

test.beforeAll(async () => {
  bundle = await buildHarness(`import { CompanyOwnerCoverManager } from "./features/companies/components/company-owner-cover-manager";`, `<main className="mx-auto max-w-[720px] p-4"><CompanyOwnerCoverManager /></main>`);
  strictBundle = await buildHarness(`import { StrictMode } from "react"; import { CompanyOwnerCoverManager } from "./features/companies/components/company-owner-cover-manager";`, `<StrictMode><main className="mx-auto max-w-[720px] p-4"><CompanyOwnerCoverManager /></main></StrictMode>`);
  profileBundle = await buildHarness(`import { CompanyProfileEditor } from "./features/companies/components/company-profile-editor"; import { AppFeedback } from "./features/shared/components/app-feedback";`, `<AppFeedback><CompanyProfileEditor /></AppFeedback>`);
});

test.beforeEach(async ({ page }) => {
  // Even a mistaken fixture URL cannot make a real external request.
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
  });
});

for (const locale of ["en", "fr"] as const) {
  const t = (locale === "en" ? en : fr).companyCover;
  test(`${locale}: owner uploads a pending cover directly and previews authenticated bytes`, async ({ page }) => {
    await privatePreviews(page); await upload(page);
    await mountHarness(page, bundle, state(locale));
    await expect(page.getByText(t.guidance)).toBeVisible();
    await select(page, locale); await page.getByRole("button", { name: t.submit, exact: true }).click();
    await expect(page.getByText(t.success)).toBeVisible();
    await expect(page.getByRole("region", { name: t.submittedTitle }).getByText(t.status.pending, { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: t.submittedAlt })).toHaveAttribute("src", /^blob:/);
    await expect(page.getByRole("img", { name: t.submittedAlt })).toHaveAttribute("data-unoptimized", "true");
    await expect(page.getByText(t.noApproved, { exact: true })).toBeVisible();
    expect(await calls(page)).toEqual([{ path: intentPath, args: { contentType: "image/png", size: png.length } }]);
  });

  test(`${locale}: pending replacement and rejection keep approved A separate; a new upload is allowed`, async ({ page }) => {
    await privatePreviews(page); await upload(page); await mountHarness(page, bundle, state(locale, { approved, submitted: image("pending-B", "pending") }));
    const approvedImage = page.getByRole("img", { name: t.approvedAlt });
    await expect(approvedImage).toHaveAttribute("src", /^blob:/); const a = await approvedImage.getAttribute("src");
    await expect(page.getByText(t.status.pending, { exact: true })).toBeVisible();
    await updateCovers(page, { submitted: rejected });
    await expect(page.getByText(t.reason.replace("{reason}", reason))).toBeVisible();
    await expect(approvedImage).toHaveAttribute("src", a!);
    await select(page, locale); await page.getByRole("button", { name: t.submit, exact: true }).click();
    await expect(page.getByText(t.success)).toBeVisible(); await expect(page.getByText(reason, { exact: false })).toHaveCount(0);
    await expect(page.getByText(t.status.pending, { exact: true })).toBeVisible(); await expect(approvedImage).toHaveAttribute("src", a!);
  });

  for (const width of [320, 375, 1024]) {
    test(`${locale}: rejected/replacement state fits ${width}px and supports keyboard upload`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 }); await privatePreviews(page); await upload(page);
      await mountHarness(page, bundle, state(locale, { approved, submitted: rejected }));
      await expect(page.getByRole("img", { name: t.submittedAlt })).toBeVisible();
      await select(page, locale, "cover-" + "x".repeat(140) + ".png");
      const file = page.getByLabel(t.chooseFile, { exact: true }); await file.focus(); await expect(file).toBeFocused();
      await page.keyboard.press("Tab"); const submit = page.getByRole("button", { name: t.submit, exact: true }); await expect(submit).toBeFocused();
      expect(await hasHorizontalOverflow(page)).toBe(false);
      const box = await submit.boundingBox(); expect(box?.height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press("Enter"); await expect(page.getByText(t.success)).toBeVisible();
      expect(await hasHorizontalOverflow(page)).toBe(false);
    });
  }
}

test("invalid type and oversized file do not generate intents or upload", async ({ page }) => {
  await mountHarness(page, bundle, state()); const file = page.getByLabel(en.companyCover.chooseFile, { exact: true });
  for (const bad of [{ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") }, { name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }]) {
    await file.setInputFiles(bad); await expect(page.getByRole("alert")).toContainText(en.ux.error.codes.INVALID_COVER);
    await expect(page.getByRole("button", { name: en.companyCover.submit })).toBeDisabled(); expect(await calls(page)).toHaveLength(0);
  }
});

test("upload failure preserves the selected file for retry and blocks duplicate clicks", async ({ page }) => {
  await privatePreviews(page); await upload(page, { failure: true });
  await mountHarness(page, bundle, { ...state(), __mutationDelays: { [intentPath]: 200 } }); await select(page);
  const button = page.getByRole("button", { name: en.companyCover.submit, exact: true });
  await button.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect(page.getByRole("button", { name: en.companyCover.uploading })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText(en.ux.error.codes.PUBLIC_MEDIA_UPLOAD_FAILED);
  await expect(page.getByText(en.companyCover.selected.replace("{name}", "replacement.png"))).toBeVisible(); expect(await calls(page)).toHaveLength(1);
  await upload(page); await page.getByRole("button", { name: en.companyCover.retryUpload }).click();
  await expect(page.getByText(en.companyCover.success)).toBeVisible(); expect(await calls(page)).toHaveLength(2);
  await expect(page.getByRole("img", { name: en.companyCover.submittedAlt })).toBeVisible();
});

test("intent failure also keeps the file for a fresh retry", async ({ page }) => {
  await privatePreviews(page); await upload(page);
  await mountHarness(page, bundle, { ...state(), __mutationErrors: { [intentPath]: "COMPANY_COVER_UPLOAD_EXPIRED" } }); await select(page);
  await page.getByRole("button", { name: en.companyCover.submit, exact: true }).click(); await expect(page.getByRole("alert")).toBeVisible();
  await page.evaluate(() => { (window as unknown as HarnessWindow).__mutationErrors = {}; });
  await page.getByRole("button", { name: en.companyCover.retryUpload }).click(); await expect(page.getByText(en.companyCover.success)).toBeVisible();
  expect(await calls(page)).toHaveLength(2);
});

test("staff never subscribe to image state, request private previews or see reasons", async ({ page }) => {
  const requested: string[] = []; page.on("request", request => { if (request.url().includes("/company-covers/")) requested.push(request.url()); });
  await mountHarness(page, bundle, state("en", { approved, submitted: rejected }, false));
  await expect(page.locator("[data-company-cover-manager]")).toHaveCount(0); await expect(page.getByText(reason, { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).__queryCalls)).not.toContain(coverPath); expect(requested).toEqual([]);
});

test("sign-out clears private previews and revokes every Blob URL", async ({ page }) => {
  await privatePreviews(page); await mountHarness(page, bundle, state()); await trackBlobs(page);
  await updateCovers(page, { approved, submitted: rejected });
  await expect(page.getByRole("img", { name: en.companyCover.approvedAlt })).toHaveAttribute("src", /^blob:/);
  await expect(page.getByRole("img", { name: en.companyCover.submittedAlt })).toHaveAttribute("src", /^blob:/);
  const created = await page.evaluate(() => (window as unknown as HarnessWindow).__blobCreated); expect(created).toHaveLength(2);
  await page.evaluate(() => { const w = window as unknown as HarnessWindow; w.__authToken = null; w.__queries["users.currentUser"] = null; window.dispatchEvent(new Event("convex-harness-update")); });
  await expect(page.locator("[data-company-cover-manager]")).toHaveCount(0); await expect(page.getByText(reason, { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).__blobRevoked)).toEqual(expect.arrayContaining(created));
});

test("Strict Mode releases loaded previews without aborting completed downloads", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await privatePreviews(page); await mountHarness(page, strictBundle, state()); await trackBlobs(page);
  await page.evaluate(() => {
    const w = window as unknown as HarnessWindow & { __previewRequests: { signal: AbortSignal; finished: boolean }[]; __previewErrors: string[] };
    w.__previewRequests = []; w.__previewErrors = [];
    window.addEventListener("unhandledrejection", event => w.__previewErrors.push(String(event.reason)));
    const fetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (!String(input).includes("/company-covers/private/")) return fetch(input, init);
      const request = { signal: init!.signal!, finished: false }; w.__previewRequests.push(request);
      const response = await fetch(input, init); const read = response.blob.bind(response);
      response.blob = async () => { const blob = await read(); request.finished = true; return blob; };
      return response;
    };
  });
  await updateCovers(page, { approved, submitted: rejected });
  await expect(page.getByRole("img", { name: en.companyCover.approvedAlt })).toHaveAttribute("src", /^blob:/);
  await expect(page.getByRole("img", { name: en.companyCover.submittedAlt })).toHaveAttribute("src", /^blob:/);
  await page.evaluate(() => { const w = window as unknown as HarnessWindow; w.__authToken = null; window.dispatchEvent(new Event("convex-harness-update")); });
  await expect(page.locator("[data-company-cover-manager]")).toHaveCount(0);
  const result = await page.evaluate(() => {
    const w = window as unknown as HarnessWindow & { __previewRequests: { signal: AbortSignal; finished: boolean }[]; __previewErrors: string[] };
    return { requests: w.__previewRequests.length, completed: w.__previewRequests.filter(request => request.finished).map(request => request.signal.aborted),
      revoked: w.__blobCreated.every(url => w.__blobRevoked.includes(url)), errors: w.__previewErrors };
  });
  expect(result.requests).toBe(2); expect(result.completed).toEqual([false, false]); expect(result.revoked).toBe(true);
  expect(result.errors).toEqual([]); expect(errors).toEqual([]);
});

test("Strict Mode aborts an unfinished preview and discards its late body after sign-out", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await privatePreviews(page); await mountHarness(page, strictBundle, state()); await trackBlobs(page);
  await page.evaluate(() => {
    const w = window as unknown as HarnessWindow & { __previewBodies: { signal: AbortSignal; release: () => void }[] };
    w.__previewBodies = [];
    const fetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (!String(input).includes("/company-covers/private/")) return fetch(input, init);
      const response = await fetch(input, init); const read = response.blob.bind(response);
      response.blob = async () => {
        const blob = await read();
        await new Promise<void>(release => w.__previewBodies.push({ signal: init!.signal!, release }));
        return blob; // Deliberately deliver a late body even if cancellation was requested.
      };
      return response;
    };
  });
  await updateCovers(page, { submitted: rejected });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __previewBodies: unknown[] }).__previewBodies.length)).toBe(1);
  await page.evaluate(() => { const w = window as unknown as HarnessWindow; w.__authToken = null; window.dispatchEvent(new Event("convex-harness-update")); });
  await expect(page.locator("[data-company-cover-manager]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __previewBodies: { signal: AbortSignal }[] }).__previewBodies.every(body => body.signal.aborted))).toBe(true);
  await page.evaluate(async () => {
    for (const body of (window as unknown as { __previewBodies: { release: () => void }[] }).__previewBodies) body.release();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).__blobCreated)).toEqual([]);
  await expect(page.locator('img[src^="blob:"]')).toHaveCount(0); expect(errors).toEqual([]);
});

test("account change clears previous previews, rejection reason and selected file", async ({ page }) => {
  await privatePreviews(page); await mountHarness(page, bundle, state()); await trackBlobs(page);
  await updateCovers(page, { submitted: rejected }); await expect(page.getByRole("img", { name: en.companyCover.submittedAlt })).toBeVisible(); await select(page);
  const created = await page.evaluate(() => (window as unknown as HarnessWindow).__blobCreated);
  await page.evaluate(path => {
    const w = window as unknown as HarnessWindow; w.__authToken = "other-session";
    w.__queries["users.currentUser"] = { _id: "different-owner", accountType: "company", onboardingStatus: "completed" };
    w.__queries[path] = { approved: null, submitted: null }; window.dispatchEvent(new Event("convex-harness-update"));
  }, coverPath);
  await expect(page.getByText(reason, { exact: false })).toHaveCount(0); await expect(page.getByRole("img", { name: en.companyCover.submittedAlt })).toHaveCount(0);
  await expect(page.getByText(en.companyCover.selected.replace("{name}", "replacement.png"))).toHaveCount(0);
  await expect(page.getByRole("button", { name: en.companyCover.submit, exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).__blobRevoked)).toEqual(expect.arrayContaining(created));
});

test("replacing an image revokes its preview, and a denied preview offers authenticated retry", async ({ page }) => {
  await privatePreviews(page); await mountHarness(page, bundle, state()); await trackBlobs(page);
  await updateCovers(page, { submitted: rejected }); const preview = page.getByRole("img", { name: en.companyCover.submittedAlt });
  await expect(preview).toBeVisible(); const old = await preview.getAttribute("src");
  await privatePreviews(page, true); await updateCovers(page, { submitted: image("pending-new", "pending") });
  await expect(page.getByText(en.companyCover.previewError)).toBeVisible(); await expect(preview).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as HarnessWindow).__blobRevoked)).toContain(old);
  await privatePreviews(page); await page.getByRole("button", { name: en.companyCover.retryPreview }).click(); await expect(preview).toHaveAttribute("src", /^blob:/);
});

test("sign-out during an intent request aborts the upload without sending the file", async ({ page }) => {
  let uploads = 0; await page.route(`${site}/company-covers/upload`, route => { uploads++; return cors(route, { contentType: "application/json", body: JSON.stringify({ imageId: "pending" }) }); });
  await mountHarness(page, bundle, { ...state(), __mutationDelays: { [intentPath]: 200 } }); await select(page);
  await page.getByRole("button", { name: en.companyCover.submit, exact: true }).click();
  await page.evaluate(() => { const w = window as unknown as HarnessWindow; w.__authToken = null; window.dispatchEvent(new Event("convex-harness-update")); });
  await expect(page.locator("[data-company-cover-manager]")).toHaveCount(0);
  // Wait for the actual mocked mutation completion, not an arbitrary timer.
  await expect.poll(() => page.evaluate(() => (window as unknown as HarnessWindow).__mutationCompletions || [])).toContain(intentPath);
  expect(uploads).toBe(0);
});

test("profile header keeps approved A unoptimized during upload B and does not change verification", async ({ page }) => {
  await privatePreviews(page); await upload(page); await page.route(`${site}/company-covers/public/approved-A`, route => cors(route, { contentType: "image/png", body: png }));
  const profile = { slug: "atlas", name: "Atlas", description: "Residential construction and renovation services.", city: "Rabat", phone: "0612345678", website: "", yearsExperience: 5, foundedYear: null, companySize: null, languages: [], serviceAreas: [], services: [], selectedServiceIds: [], catalogServices: [], serviceOptions: [], serviceAreaOptions: [], languageOptions: [], companySizeOptions: [], logoUrl: null, coverImageUrl: `${site}/company-covers/public/approved-A`, legal: { verificationStatus: "draft", legalName: "Atlas SARL", ice: "", rcNumber: "", legalRepresentative: "", phone: "", address: "", documents: [] } };
  const initial = state("en", { approved, submitted: null });
  await mountHarness(page, profileBundle, { ...initial, __queries: { ...initial.__queries, "companies.index.getProfileManager": profile, "portfolio.index.getPortfolioManager": { projects: [] }, "portfolio.index.getPublicCompanyProfile": null } });
  const headerCover = page.getByRole("img", { name: en.companyProfileManager.branding.coverAlt, exact: true });
  await expect(headerCover).toHaveAttribute("src", profile.coverImageUrl); await expect(headerCover).toHaveAttribute("data-unoptimized", "true");
  await select(page); await page.getByRole("region", { name: en.companyCover.title, exact: true }).getByRole("button", { name: en.companyCover.submit, exact: true }).click(); await expect(page.getByText(en.companyCover.success)).toBeVisible();
  await expect(headerCover).toHaveAttribute("src", profile.coverImageUrl); await expect(page.locator('[data-verification="verified"]')).toHaveCount(0);
  expect((await calls(page)).map(call => call.path)).toEqual([intentPath]);
});
