/// <reference types="vite/client" />
import { convexTest, type TestConvexForDataModel } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { resolveCompanyIdentityAudience } from "./lib/companyName";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { PUBLIC_MEDIA_MAX_BYTES } from "./storage/constants";
import { assertNotVerificationStorage, getNonVerificationStorageUrl } from "./storage/verificationPrivacy";
const modules = import.meta.glob("./**/*.ts");
type Backend = TestConvexForDataModel<DataModel>;
const images = api.portfolioImages.index;
const page = { numItems: 20, cursor: null };
const now = 1_800_000_000_000;
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII="), c => c.charCodeAt(0));
const fields = { title: "Courtyard renovation", description: "Complete structural and finishing renovation of a residential courtyard.", city: "Rabat", projectType: "renovation" as const };

test("Company-scoped Admin queue uses bounded status pagination and reports current slot order", async () => {
  const { t, owner, company, admin, target } = await fixture("gallery");
  const other = await fixture("cover", t);
  const foreign = (await upload(t, other.company.userId, other.target)).image;
  const first = (await upload(t, company.userId, target)).image;
  await decide(t, admin.userId, first);
  const replacement = (await upload(t, company.userId, target)).image;
  const secondSlot = await owner.mutation(images.createGallerySlot, { portfolioProjectId: target.portfolioProjectId });
  const second = (await upload(t, company.userId, { ...target, gallerySlotId: secondSlot })).image;
  await owner.mutation(images.reorderGallery, { portfolioProjectId: target.portfolioProjectId, slotIds: [secondSlot, target.gallerySlotId!] });
  const reviewer = asUser(t, admin.userId);
  const queue = await reviewer.query(images.listAdminImages, { companyId: company.companyId, status: "pending", paginationOpts: { numItems: 1, cursor: null } });
  expect(queue.page).toHaveLength(1); expect(queue.isDone).toBe(false);
  const next = await reviewer.query(images.listAdminImages, { companyId: company.companyId, status: "pending", paginationOpts: { numItems: 1, cursor: queue.continueCursor } });
  const rows = [...queue.page, ...next.page];
  expect(rows.map(row => row.imageId).sort()).toEqual([replacement._id, second._id].sort());
  expect(rows.map(row => row.imageId)).not.toContain(foreign._id);
  expect(rows.find(row => row.imageId === replacement._id)).toMatchObject({ gallerySortOrder: 1, isCurrentSubmission: true, isCurrentApproved: false, projectTitle: fields.title });
  const approved = await reviewer.query(images.listAdminImages, { companyId: company.companyId, status: "approved", paginationOpts: page });
  expect(approved.page).toMatchObject([{ imageId: first._id, isCurrentApproved: true, isCurrentSubmission: false, gallerySortOrder: 1 }]);
  await decide(t, admin.userId, replacement, "reject", "Company logo is visible");
  const rejected = await reviewer.query(images.listAdminImages, { companyId: company.companyId, status: "rejected", paginationOpts: page });
  expect(rejected.page).toMatchObject([{ imageId: replacement._id, isCurrentSubmission: true, isCurrentApproved: false }]);
  await expect(owner.query(images.listAdminImages, { companyId: company.companyId, status: "pending", paginationOpts: page })).rejects.toThrow();
});

test.each(["cover", "gallery"] as const)("Admin %s review returns only the exact same-slot approved/submitted pair", async purpose => {
  const { t, company, admin, target } = await fixture(purpose);
  const first = (await upload(t, company.userId, target)).image;
  await decide(t, admin.userId, first);
  const replacement = (await upload(t, company.userId, target)).image;
  const review = await asUser(t, admin.userId).query(images.getAdminReview, { imageId: first._id });
  expect(review).toMatchObject({ image: { imageId: first._id, sha256: first.sha256 }, approved: { imageId: first._id }, submitted: { imageId: replacement._id, sha256: replacement.sha256 }, currentSubmissionId: replacement._id, isCurrentApproved: true, isCurrentSubmission: false, gallerySortOrder: purpose === "gallery" ? 0 : null });
  expect(JSON.stringify(review)).not.toMatch(new RegExp(`${first.storageId}|${replacement.storageId}|/api/storage/`));
});
beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  process.env.R2_PUBLIC_BASE_URL = "https://media.example.test";
  process.env.VERIFICATION_WEB_ORIGINS = "http://localhost:3000";
});
beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(now); });
afterEach(() => { vi.restoreAllMocks(); });
async function seed(t: Backend, options: {
  accountType?: "company" | "client" | "admin" | "seo_team";
  role?: "owner" | "staff"; status?: "active" | "inactive"; companyId?: Id<"companies">;
} = {}) {
  return await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { accountType: options.accountType ?? "company", onboardingStatus: "completed", createdAt: 1, updatedAt: 1 });
    const companyId = options.companyId ?? await ctx.db.insert("companies", {
      name: "Atlas Construction", legalName: "Atlas SARL", slug: crypto.randomUUID(), phone: "0612345678",
      city: "Rabat", description: "A completed construction company profile.", onboardingStatus: "completed",
      verificationStatus: "draft", directoryListed: true, createdAt: 1, updatedAt: 1,
    });
    const membershipId = await ctx.db.insert("companyMembers", {
      companyId, userId, role: options.role ?? "owner", status: options.status ?? "active", createdAt: 1,
    });
    return { userId, companyId, membershipId };
  });
}
const asUser = (t: Backend, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|session` });
const publicPath = (imageId: Id<"portfolioImages">) => `/portfolio-images/public/${imageId}`;
const privatePath = (imageId: Id<"portfolioImages">) => `/portfolio-images/private/${imageId}`;
type Target = { portfolioProjectId: Id<"portfolioProjects">; purpose: "cover" | "gallery"; gallerySlotId?: Id<"portfolioMedia"> };
async function upload(t: Backend, userId: Id<"users">, target: Target, bytes: Uint8Array = png, contentType: "image/png" | "image/jpeg" | "image/webp" = "image/png") {
  const owner = asUser(t, userId);
  const intent = await owner.mutation(images.generateUploadIntent, { ...target, contentType, size: bytes.length });
  expect(intent.uploadUrl).toBe("https://example.convex.site/portfolio-images/upload");
  const response = await send(owner, intent.uploadToken, bytes, contentType);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const result = await response.json() as { imageId: Id<"portfolioImages"> };
  expect(Object.keys(result)).toEqual(["imageId"]);
  return { ...intent, image: (await t.run(ctx => ctx.db.get(result.imageId)))! };
}
function send(caller: Backend, token: string, bytes: Uint8Array = png, type = "image/png", headers: Record<string, string> = {}) {
  return caller.fetch("/portfolio-images/upload", { method: "POST", headers: { "Content-Type": type, "X-Upload-Token": token, ...headers }, body: new Blob([new Uint8Array(bytes)]) });
}
async function fixture(purpose: "cover" | "gallery" = "cover", t = convexTest(schema, modules)) {
  const company = await seed(t);
  const admin = await seed(t, { accountType: "admin" });
  const owner = asUser(t, company.userId);
  const portfolioProjectId = await owner.mutation(api.portfolio.index.createPortfolioProject, fields);
  const gallerySlotId = purpose === "gallery" ? await owner.mutation(images.createGallerySlot, { portfolioProjectId, caption: "Finished courtyard" }) : undefined;
  const target: Target = { portfolioProjectId, purpose, ...(gallerySlotId ? { gallerySlotId } : {}) };
  return { t, company, admin, owner, target };
}
async function decide(t: Backend, adminId: Id<"users">, image: Doc<"portfolioImages">, action: "approve" | "reject" | "hide" = "approve", reason = "Identifying watermark") {
  const args = { imageId: image._id, expectedSha256: image.sha256 };
  const admin = asUser(t, adminId);
  if (action === "approve") return await admin.mutation(images.approve, args);
  return await admin.mutation(images[action], { ...args, reason });
}

for (const purpose of ["cover", "gallery"] as const) describe(`${purpose} exact-file moderation`, () => {
  test("upload stores immutable pending bytes/hash, target, intent and audit without public delivery", async () => {
    const { t, company, owner, target, admin } = await fixture(purpose);
    const { image, uploadToken } = await upload(t, company.userId, target);
    const state = await t.run(async ctx => ({ metadata: await ctx.db.system.get("_storage", image.storageId),
      bytes: await (await ctx.storage.get(image.storageId))!.arrayBuffer(), intent: await ctx.db.query("portfolioImageUploadIntents").withIndex("by_token", q => q.eq("token", uploadToken)).unique() }));
    expect(state.bytes).toEqual(png.buffer);
    expect(image).toMatchObject({ ...target, companyId: company.companyId, uploadedBy: company.userId, uploadedAt: now, moderationStatus: "pending", size: png.length, sha256: state.metadata?.sha256 });
    expect(state.intent).toMatchObject({ ...target, userId: company.userId, companyId: company.companyId, imageId: image._id, claimedAt: now });
    const dto = await owner.query(images.getMyImages, { portfolioProjectId: target.portfolioProjectId });
    const pair = purpose === "cover" ? dto.cover : dto.gallery[0];
    expect(pair.submitted?.imageId).toBe(image._id); expect(pair.approved).toBeNull();
    expect((await t.fetch(publicPath(image._id))).status).toBe(404);
    const history = await owner.query(images.getHistory, { imageId: image._id, paginationOpts: page });
    expect(history.page).toMatchObject([{ action: "uploaded", oldStatus: null, newStatus: "pending", changedBy: company.userId }]);
    const review = await asUser(t, admin.userId).query(images.getAdminReview, { imageId: image._id });
    expect(review).toMatchObject({ image: { imageId: image._id, sha256: image.sha256 }, isCurrentSubmission: true, approved: null });
    for (const result of [dto, history, review]) expect(JSON.stringify(result)).not.toMatch(new RegExp(`${image.storageId}|/api/storage/|objectKey`));
  });

  test("active owner and Admin only: public URL, guessed ID or other Company never grant private access", async () => {
    const { t, company, target, admin } = await fixture(purpose);
    const image = (await upload(t, company.userId, target)).image;
    for (const caller of [asUser(t, company.userId), asUser(t, admin.userId)]) {
      const response = await caller.fetch(privatePath(image._id));
      expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("location")).toBeNull(); expect(await response.arrayBuffer()).toEqual(png.buffer);
    }
    const denied: Backend[] = [t];
    for (const options of [{ accountType: "client" }, { accountType: "seo_team" }, { role: "staff", companyId: company.companyId }, {}, { status: "inactive", companyId: company.companyId }] as const) {
      denied.push(asUser(t, (await seed(t, options)).userId));
    }
    for (const caller of denied) {
      expect((await caller.fetch(privatePath(image._id))).status).toBe(404);
      await expect(caller.query(images.getMyImages, { portfolioProjectId: target.portfolioProjectId })).rejects.toThrow();
      await expect(caller.query(images.getHistory, { imageId: image._id, paginationOpts: page })).rejects.toThrow();
    }
    await decide(t, admin.userId, image, "reject", "Company name is visible");
    for (const caller of [asUser(t, company.userId), asUser(t, admin.userId)]) expect((await caller.fetch(privatePath(image._id))).status).toBe(200);
    for (const caller of denied) expect((await caller.fetch(privatePath(image._id))).status).toBe(404);
    const rejected = await asUser(t, company.userId).query(images.getMyImages, { portfolioProjectId: target.portfolioProjectId });
    expect((purpose === "cover" ? rejected.cover : rejected.gallery[0]).submitted?.reason).toBe("Company name is visible");
    await t.run(ctx => ctx.db.patch(company.membershipId, { status: "inactive" }));
    expect((await asUser(t, company.userId).fetch(privatePath(image._id))).status).toBe(404);
    expect((await asUser(t, admin.userId).fetch(privatePath("guessed" as Id<"portfolioImages">))).status).toBe(404);
  });

  test("publishing does not approve; approved public delivery preserves Company/project visibility and masking", async () => {
    const { t, company, target, admin, owner } = await fixture(purpose);
    const image = (await upload(t, company.userId, target)).image;
    await owner.mutation(api.portfolio.index.publishPortfolioProject, { projectId: target.portfolioProjectId });
    expect((await t.fetch(publicPath(image._id))).status).toBe(404);
    expect((await t.run(ctx => ctx.db.get(image._id)))?.moderationStatus).toBe("pending");
    await decide(t, admin.userId, image);
    const response = await t.fetch(publicPath(image._id));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("location")).toBeNull(); expect(await response.arrayBuffer()).toEqual(png.buffer);
    const companyBefore = (await t.run(ctx => ctx.db.get(company.companyId)))!;
    const profile = await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: companyBefore.slug! });
    expect(profile).toMatchObject({ name: "At*** Co**********", isVerified: false });
    const project = profile!.portfolio[0];
    expect(purpose === "cover" ? project.coverImageUrl : project.media[0].url).toBe(`https://example.convex.site${publicPath(image._id)}`);
    expect(JSON.stringify(profile)).not.toMatch(new RegExp(`${image.storageId}|reason|sha256|previewUrl`));
    for (const status of ["draft", "hidden"] as const) {
      await t.run(ctx => ctx.db.patch(target.portfolioProjectId, { status }));
      expect((await t.fetch(publicPath(image._id))).status).toBe(404);
    }
    await t.run(ctx => ctx.db.patch(target.portfolioProjectId, { status: "published" }));
    for (const change of [{ onboardingStatus: "pending" as const }, { slug: undefined }, { description: undefined }]) {
      await t.run(ctx => ctx.db.patch(company.companyId, change));
      expect((await t.fetch(publicPath(image._id))).status).toBe(404);
      await t.run(ctx => ctx.db.patch(company.companyId, { onboardingStatus: companyBefore.onboardingStatus, slug: companyBefore.slug, description: companyBefore.description }));
    }
    // Existing suspension hides directory participation, while historical profiles stay visible.
    await t.run(ctx => ctx.db.patch(company.companyId, { operationalStatus: "suspended" }));
    expect((await t.fetch(publicPath(image._id))).status).toBe(200);
  });

  test("A remains public while B waits or is rejected; approval switches exactly one slot; hide never restores A", async () => {
    const { t, company, target, admin, owner } = await fixture(purpose);
    await owner.mutation(api.portfolio.index.publishPortfolioProject, { projectId: target.portfolioProjectId });
    const a = (await upload(t, company.userId, target)).image;
    await decide(t, admin.userId, a);
    const b = (await upload(t, company.userId, target, new Uint8Array([...png, 1]))).image;
    expect((await t.fetch(publicPath(a._id))).status).toBe(200); expect((await t.fetch(publicPath(b._id))).status).toBe(404);
    await decide(t, admin.userId, b, "reject");
    expect((await t.fetch(publicPath(a._id))).status).toBe(200); expect((await t.fetch(publicPath(b._id))).status).toBe(404);
    expect((await owner.query(images.listMyImages, { portfolioProjectId: target.portfolioProjectId, paginationOpts: page })).page.find(row => row.imageId === b._id)?.reason).toBe("Identifying watermark");
    const c = (await upload(t, company.userId, target, new Uint8Array([...png, 2]))).image;
    await decide(t, admin.userId, c);
    expect((await t.fetch(publicPath(a._id))).status).toBe(404); expect((await t.fetch(publicPath(c._id))).status).toBe(200);
    const pending = (await upload(t, company.userId, target)).image;
    await decide(t, admin.userId, c, "hide");
    for (const image of [a, b, c, pending]) expect((await t.fetch(publicPath(image._id))).status).toBe(404);
    const dto = await owner.query(images.getMyImages, { portfolioProjectId: target.portfolioProjectId });
    const pair = purpose === "cover" ? dto.cover : dto.gallery[0];
    expect(pair.approved).toBeNull(); expect(pair.submitted?.imageId).toBe(pending._id);
    expect(await t.run(async ctx => (await ctx.storage.get(a.storageId)) !== null)).toBe(true);
    const history = await asUser(t, admin.userId).query(images.getHistory, { imageId: c._id, paginationOpts: page });
    expect(history.page.map(row => row.action)).toEqual(["hidden", "approved", "uploaded"]);
    expect(history.page[0]).toMatchObject({ oldStatus: "approved", newStatus: "rejected", changedBy: admin.userId, reason: "Identifying watermark" });
  });

  test("stale IDs/hashes, repeated and concurrent decisions fail; rejection/hiding reasons are required", async () => {
    const { t, company, target, admin } = await fixture(purpose);
    const a = (await upload(t, company.userId, target)).image;
    const b = (await upload(t, company.userId, target)).image;
    await expect(decide(t, admin.userId, a)).rejects.toThrow("PORTFOLIO_IMAGE_REVIEW_STALE");
    await expect(decide(t, admin.userId, a, "reject")).rejects.toThrow("PORTFOLIO_IMAGE_REVIEW_STALE");
    await expect(asUser(t, admin.userId).mutation(images.approve, { imageId: b._id, expectedSha256: "other-file" })).rejects.toThrow("PORTFOLIO_IMAGE_REVIEW_STALE");
    for (const reason of ["", " x ", "x".repeat(501)]) await expect(decide(t, admin.userId, b, "reject", reason)).rejects.toThrow("REJECTION_REASON_REQUIRED");
    const outcomes = await Promise.allSettled([decide(t, admin.userId, b), decide(t, admin.userId, b, "reject")]);
    expect(outcomes.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(row => row.status === "rejected")).toHaveLength(1);
    await expect(decide(t, admin.userId, b)).rejects.toThrow("PORTFOLIO_IMAGE_REVIEW_STALE");
    if ((await t.run(ctx => ctx.db.get(b._id)))?.moderationStatus === "approved") {
      for (const reason of ["", "xy", "x".repeat(501)]) await expect(decide(t, admin.userId, b, "hide", reason)).rejects.toThrow("REJECTION_REASON_REQUIRED");
    }
    expect(await t.run(ctx => ctx.db.query("portfolioImageModerationHistory").collect())).toHaveLength(3);
  });
});

describe("portfolio upload and isolation", () => {
  test.each([
    ["image/jpeg", new Uint8Array([255, 216, 255, 224, 1, 2, 3, 4])], ["image/png", png],
    ["image/webp", new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80])],
  ] as const)("preserves %s signature support", async (type, bytes) => {
    const { t, company, target } = await fixture();
    expect((await upload(t, company.userId, target, bytes, type)).image.contentType).toBe(type);
  });
  test("10 MiB maximum, type, integral/nonzero size and actual streaming bytes are authoritative", async () => {
    const { t, company, target, owner } = await fixture();
    const bytes = new Uint8Array(PUBLIC_MEDIA_MAX_BYTES); bytes.set(png);
    await upload(t, company.userId, target, bytes);
    for (const size of [0, -1, 1.5, PUBLIC_MEDIA_MAX_BYTES + 1, NaN, Infinity]) await expect(owner.mutation(images.generateUploadIntent, { ...target, contentType: "image/png", size })).rejects.toThrow();
    await expect(owner.mutation(images.generateUploadIntent, { ...target, contentType: "image/svg+xml" as "image/png", size: 10 })).rejects.toThrow();
    const intent = await owner.mutation(images.generateUploadIntent, { ...target, contentType: "image/png", size: png.length });
    for (const bad of [new Uint8Array(), png.slice(0, 7), new Uint8Array(png.length), new Uint8Array(png.length + 1)]) expect((await send(owner, intent.uploadToken, bad)).status).toBe(400);
    expect((await send(owner, intent.uploadToken, png, "image/jpeg")).status).toBe(400);
    expect((await send(owner, intent.uploadToken, png, "image/png", { "Content-Length": String(PUBLIC_MEDIA_MAX_BYTES + 1) })).status).toBe(400);
    expect((await send(owner, intent.uploadToken, new Uint8Array(PUBLIC_MEDIA_MAX_BYTES + 1), "image/png", { "Content-Length": "1" })).status).toBe(400);
    expect(await t.run(ctx => ctx.db.query("portfolioImages").collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(1);
  });

  test("owner-only upload, exact Company/project/slot binding, expiry boundary and single-success reuse", async () => {
    const { t, company, target, owner, admin } = await fixture("gallery");
    const intent = await owner.mutation(images.generateUploadIntent, { ...target, contentType: "image/png", size: png.length });
    const denied: Backend[] = [t, asUser(t, admin.userId)];
    for (const options of [{ accountType: "client" }, { accountType: "seo_team" }, { role: "staff", companyId: company.companyId }, {}, { status: "inactive" }] as const) denied.push(asUser(t, (await seed(t, options)).userId));
    for (const caller of denied) {
      await expect(caller.mutation(images.generateUploadIntent, { ...target, contentType: "image/png", size: png.length })).rejects.toThrow();
      expect((await send(caller, intent.uploadToken)).status).toBe(400);
    }
    const secondProject = await owner.mutation(api.portfolio.index.createPortfolioProject, fields);
    const otherSlot = await owner.mutation(images.createGallerySlot, { portfolioProjectId: secondProject });
    for (const invalid of [{ ...target, gallerySlotId: otherSlot }, { ...target, purpose: "cover" as const }, { ...target, gallerySlotId: undefined }]) await expect(owner.mutation(images.generateUploadIntent, { ...invalid, contentType: "image/png", size: png.length })).rejects.toThrow();
    const successful = await upload(t, company.userId, target);
    expect((await send(owner, successful.uploadToken)).status).toBe(400);
    await t.run(async ctx => { const row = await ctx.db.query("portfolioImageUploadIntents").withIndex("by_token", q => q.eq("token", intent.uploadToken)).unique(); await ctx.db.patch(row!._id, { expiresAt: now }); });
    expect((await send(owner, intent.uploadToken)).status).toBe(400);
  });

  test("late ownership/expiry changes fail binding; cleanup cannot delete a committed image", async () => {
    for (const change of ["inactive", "expired"] as const) {
      const { t, company, target, owner } = await fixture();
      const previous = (await upload(t, company.userId, target)).image;
      const intent = await owner.mutation(images.generateUploadIntent, { ...target, contentType: "image/png", size: png.length });
      const stream = new ReadableStream({ async pull(controller) {
        await t.run(async ctx => {
          if (change === "inactive") await ctx.db.patch(company.membershipId, { status: "inactive" });
          else { const row = await ctx.db.query("portfolioImageUploadIntents").withIndex("by_token", q => q.eq("token", intent.uploadToken)).unique(); await ctx.db.patch(row!._id, { expiresAt: now }); }
        });
        controller.enqueue(png); controller.close();
      } }, { highWaterMark: 0 });
      const response = await owner.fetch("/portfolio-images/upload", { method: "POST", headers: { "Content-Type": "image/png", "X-Upload-Token": intent.uploadToken }, body: stream, duplex: "half" } as RequestInit);
      expect(response.status).toBe(400);
      await t.mutation(internal.portfolioImages.index.cleanupFailedUpload, { storageId: previous.storageId });
      expect((await t.run(ctx => ctx.db.system.query("_storage").collect())).map(row => row._id)).toEqual([previous.storageId]);
    }
  });

  test("concurrent upload replay produces one image, one audit event and no orphan", async () => {
    const { t, owner, target } = await fixture();
    const intent = await owner.mutation(images.generateUploadIntent, { ...target, contentType: "image/png", size: png.length });
    const responses = await Promise.all([send(owner, intent.uploadToken), send(owner, intent.uploadToken)]);
    expect(responses.map(row => row.status).sort()).toEqual([200, 400]);
    expect(await t.run(ctx => ctx.db.query("portfolioImages").collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("portfolioImageModerationHistory").collect())).toHaveLength(1);
  });

  test("one gallery approval never approves cover/other slots; ordering and replacement are independent", async () => {
    const { t, owner, company, admin, target } = await fixture("gallery");
    const a = (await upload(t, company.userId, target)).image;
    const secondSlot = await owner.mutation(images.createGallerySlot, { portfolioProjectId: target.portfolioProjectId });
    const b = (await upload(t, company.userId, { ...target, gallerySlotId: secondSlot })).image;
    const cover = (await upload(t, company.userId, { portfolioProjectId: target.portfolioProjectId, purpose: "cover" })).image;
    await owner.mutation(api.portfolio.index.publishPortfolioProject, { projectId: target.portfolioProjectId });
    await decide(t, admin.userId, a);
    const slug = (await t.run(ctx => ctx.db.get(company.companyId)))!.slug!;
    let profile = (await t.query(api.portfolio.index.getPublicCompanyProfile, { slug }))!;
    expect(profile.portfolio[0].coverImageUrl).toBeNull(); expect(profile.portfolio[0].media).toHaveLength(1);
    expect((await t.fetch(publicPath(b._id))).status).toBe(404); expect((await t.fetch(publicPath(cover._id))).status).toBe(404);
    await decide(t, admin.userId, b, "reject");
    profile = (await t.query(api.portfolio.index.getPublicCompanyProfile, { slug }))!;
    expect(profile.portfolio[0].media).toHaveLength(1);
    const c = (await upload(t, company.userId, { ...target, gallerySlotId: secondSlot })).image;
    await decide(t, admin.userId, c);
    await owner.mutation(images.reorderGallery, { portfolioProjectId: target.portfolioProjectId, slotIds: [secondSlot, target.gallerySlotId!] });
    profile = (await t.query(api.portfolio.index.getPublicCompanyProfile, { slug }))!;
    expect(profile.portfolio[0].media.map(row => row.url)).toEqual([c, a].map(row => `https://example.convex.site${publicPath(row._id)}`));
    await expect(owner.mutation(images.reorderGallery, { portfolioProjectId: target.portfolioProjectId, slotIds: [secondSlot, secondSlot] })).rejects.toThrow();
    const replacement = (await upload(t, company.userId, target)).image;
    expect((await t.run(ctx => ctx.db.get(target.gallerySlotId!)))?.sortOrder).toBe(1);
    await decide(t, admin.userId, replacement);
    expect((await t.run(ctx => ctx.db.get(target.gallerySlotId!)))?.sortOrder).toBe(1);
  });

  test("Admin decisions/queue denied to all other roles; queue/history pagination stays bounded", async () => {
    const { t, company, admin, target, owner } = await fixture();
    const image = (await upload(t, company.userId, target)).image;
    const denied: Backend[] = [t, owner];
    for (const options of [{ accountType: "client" }, { accountType: "seo_team" }, { role: "staff", companyId: company.companyId }] as const) denied.push(asUser(t, (await seed(t, options)).userId));
    for (const caller of denied) {
      await expect(caller.query(images.getAdminReview, { imageId: image._id })).rejects.toThrow();
      await expect(caller.query(images.listAdminImages, { status: "pending", paginationOpts: page })).rejects.toThrow();
      for (const action of ["approve", "reject", "hide"] as const) await expect(caller.mutation(images[action], { imageId: image._id, expectedSha256: image.sha256, ...(action !== "approve" ? { reason: "branding" } : {}) })).rejects.toThrow();
    }
    const reviewer = asUser(t, admin.userId);
    for (const numItems of [0, 101, 1.5]) await expect(reviewer.query(images.listAdminImages, { status: "pending", paginationOpts: { numItems, cursor: null } })).rejects.toThrow("INVALID_PAGINATION");
    for (let i = 0; i < 8; i++) await upload(t, company.userId, target);
    const queue = await reviewer.query(images.listAdminImages, { status: "pending", paginationOpts: { numItems: 3, cursor: null } });
    expect(queue.page).toHaveLength(3); expect(queue.isDone).toBe(false);
    expect(queue.page.filter(row => row.isCurrentSubmission)).toHaveLength(1);
    expect(JSON.stringify(queue)).not.toContain("storageId");
  });

  test("gallery has eight stable slots including legacy rows; invalid captions and cross-Company ordering fail", async () => {
    const { t, owner, target } = await fixture("gallery");
    for (let i = 1; i < 8; i++) await owner.mutation(images.createGallerySlot, { portfolioProjectId: target.portfolioProjectId });
    await expect(owner.mutation(images.createGallerySlot, { portfolioProjectId: target.portfolioProjectId })).rejects.toThrow("INVALID_PORTFOLIO_IMAGE");
    const secondProject = await owner.mutation(api.portfolio.index.createPortfolioProject, fields);
    await expect(owner.mutation(images.createGallerySlot, { portfolioProjectId: secondProject, caption: " " })).rejects.toThrow("INVALID_PORTFOLIO_CAPTION");
    const other = await seed(t);
    await expect(asUser(t, other.userId).mutation(images.createGallerySlot, { portfolioProjectId: target.portfolioProjectId })).rejects.toThrow("PORTFOLIO_PROJECT_NOT_FOUND");
  });

  test("hash tampering and a foreign slot/project pointer cannot authorize public delivery", async () => {
    const { t, owner, company, admin, target } = await fixture("gallery");
    const image = (await upload(t, company.userId, target)).image;
    await t.run(ctx => ctx.db.patch(image._id, { sha256: "forged-hash" }));
    await expect(asUser(t, admin.userId).mutation(images.approve, { imageId: image._id, expectedSha256: "forged-hash" })).rejects.toThrow("PORTFOLIO_IMAGE_NOT_FOUND");
    await t.run(ctx => ctx.db.patch(image._id, { sha256: image.sha256 }));
    await decide(t, admin.userId, image);
    await owner.mutation(api.portfolio.index.publishPortfolioProject, { projectId: target.portfolioProjectId });
    const otherProject = await owner.mutation(api.portfolio.index.createPortfolioProject, fields);
    await t.run(ctx => ctx.db.patch(target.gallerySlotId!, { portfolioProjectId: otherProject }));
    expect((await t.fetch(publicPath(image._id))).status).toBe(404);
    expect((await owner.fetch(privatePath(image._id))).status).toBe(404);
  });

  test("CORS denies untrusted origins/headers while downloads/errors/preflight remain no-store", async () => {
    const { t, company, target } = await fixture();
    const image = (await upload(t, company.userId, target)).image;
    const options = await t.fetch("/portfolio-images/upload", { method: "OPTIONS", headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type,x-upload-token" } });
    expect(options.status).toBe(204); expect(options.headers.get("access-control-allow-origin")).toBe("http://localhost:3000"); expect(options.headers.get("access-control-allow-credentials")).toBeNull();
    const invalid = await t.fetch("/portfolio-images/upload", { method: "OPTIONS", headers: { Origin: "https://evil.test", "Access-Control-Request-Method": "POST" } });
    expect(invalid.status).toBe(403);
    const preview = await asUser(t, company.userId).fetch(privatePath(image._id), { headers: { Origin: "https://evil.test" } });
    expect(preview.status).toBe(404); expect(preview.headers.get("access-control-allow-origin")).toBeNull();
    for (const response of [options, invalid, preview, await t.fetch(publicPath(image._id))]) expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

async function conversation(t: Backend, company: Awaited<ReturnType<typeof seed>>) {
  const client = await seed(t, { accountType: "client" });
  return await t.run(async ctx => {
    await ctx.db.patch(company.companyId, { verificationStatus: "verified" });
    const projectId = await ctx.db.insert("projects", { clientId: client.userId, primaryCategory: "renovation", city: "rabat",
      countryCode: "MA", title: "Villa renovation", propertyType: "house", surface: 100, surfaceUnknown: false,
      description: "Complete structural and finishing renovation.", timeline: "one_to_three_months", visibility: "marketplace",
      status: "published", lastCompletedStep: 6, createdAt: 1, updatedAt: 1, publishedAt: 1 });
    const quoteId = await ctx.db.insert("projectQuotes", { projectId, companyId: company.companyId, submittedByUserId: company.userId,
      message: "A proposal from our experienced team.", estimatedPrice: 100000, currency: "MAD", estimatedDuration: 60,
      availableStartDate: "2099-01-01", scope: "Full renovation and project coordination.", quoteType: "initial",
      status: "discussion_open", createdAt: 1, updatedAt: 1, submittedAt: 1 });
    const conversationId = await ctx.db.insert("conversations", { projectId, quoteId, clientId: client.userId,
      companyId: company.companyId, status: "active", createdBy: client.userId, createdAt: 1, updatedAt: 1 });
    return { projectId, quoteId, conversationId, clientId: client.userId };
  });
}

test("private portfolio IDs cannot yield raw URLs, be attached/downloaded as PDFs or be discarded through other APIs", async () => {
    const { t, company, target } = await fixture();
    const image = (await upload(t, company.userId, target)).image;
    await expect(t.run(ctx => assertNotVerificationStorage(ctx, image.storageId))).rejects.toThrow("PRIVATE_PORTFOLIO_IMAGE_FILE");
    expect(await t.run(ctx => getNonVerificationStorageUrl(ctx, image.storageId))).toBeNull();
    const relationship = await conversation(t, company);
    const owner = asUser(t, company.userId);
    const client = asUser(t, relationship.clientId);
    const draft = await client.mutation(api.projects.index.initializeDraft, {});
    await expect(client.mutation(api.projects.index.saveFiles, { projectId: draft.projectId, imageUploadTokens: [],
      documents: [{ storageId: image.storageId, uploadToken: "arbitrary", fileName: "document.pdf" }],
    })).rejects.toThrow("PRIVATE_PORTFOLIO_IMAGE_FILE");
    const messageIntent = await owner.mutation(api.messages.attachments.generateAttachmentUploadUrl, {
      conversationId: relationship.conversationId, fileName: "quote.pdf", contentType: "application/pdf", size: png.length,
    });
    await expect(owner.action(api.messages.attachments.sendMessageWithAttachment, { conversationId: relationship.conversationId,
      body: "Attached quote", clientMessageId: "portfolio-reuse", uploadToken: messageIntent.uploadToken, storageId: image.storageId,
    })).rejects.toThrow("PRIVATE_PORTFOLIO_IMAGE_FILE");
    await expect(owner.mutation(api.messages.attachments.discardAttachmentUpload, { conversationId: relationship.conversationId,
      uploadToken: messageIntent.uploadToken, storageId: image.storageId,
    })).rejects.toThrow("PRIVATE_PORTFOLIO_IMAGE_FILE");
    const finalQuote = await client.mutation(api.finalQuotes.index.request, { conversationId: relationship.conversationId });
    await expect(owner.mutation(api.finalQuotes.index.submitRevision, { conversationId: relationship.conversationId,
      price: 100000, duration: 30, plannedStartDate: "2099-01-01", validUntil: "2099-02-01", scope: "Full construction and finishing work.",
      inclusions: "Materials and labour", exclusions: "Municipal fees", paymentTerms: "Monthly milestones",
      pdf: { storageId: image.storageId, uploadToken: "arbitrary", fileName: "quote.pdf" },
    })).rejects.toThrow("PRIVATE_PORTFOLIO_IMAGE_FILE");
    const ids = await t.run(async ctx => {
      const messageId = await ctx.db.insert("messages", { conversationId: relationship.conversationId, senderUserId: company.userId,
        senderType: "company", body: "A legacy attachment", createdAt: 1 });
      const attachmentId = await ctx.db.insert("messageAttachments", { messageId, conversationId: relationship.conversationId, uploadedByUserId: company.userId,
        storageId: image.storageId, originalFileName: "legacy.pdf", mimeType: "application/pdf", kind: "pdf", sizeBytes: png.length, createdAt: 1 });
      const revisionId = await ctx.db.insert("finalQuoteRevisions", { finalQuoteId: finalQuote.finalQuoteId, revisionNumber: 1,
        price: 100000, currency: "MAD", duration: 30, plannedStartDate: "2099-01-01", validUntil: "2099-02-01", scope: "Complete renovation",
        inclusions: "Materials", exclusions: "Fees", paymentTerms: "Monthly milestones", submittedByUserId: company.userId,
        pdfStorageId: image.storageId, pdfFileName: "legacy.pdf", pdfSize: png.length, submittedAt: 1, createdAt: 1 });
      return { attachmentId, revisionId };
    });
    expect((await client.fetch(`/messages/attachments/${ids.attachmentId}`)).status).toBe(404);
    expect((await client.fetch(`/final-quotes/pdf/${ids.revisionId}`)).status).toBe(404);
    expect(await t.run(async ctx => (await ctx.storage.get(image.storageId)) !== null)).toBe(true);
  });

test("a transient failed cleanup schedules a safe retry for the unbound file", async () => {
    let attempts = 0;
    const t = convexTest(schema, { ...modules, "./portfolioImages/index.ts": async () => {
      const original = await modules["./portfolioImages/index.ts"]() as typeof import("./portfolioImages/index");
      // Fault injection uses the runtime handler that Convex omits from its public types.
      const cleanup = original.cleanupFailedUpload as typeof original.cleanupFailedUpload & {
        _handler: (ctx: MutationCtx, args: { storageId: Id<"_storage"> }) => Promise<null>;
      };
      return { ...original, cleanupFailedUpload: internalMutation({
        args: { storageId: v.id("_storage") }, returns: v.null(), handler: async (ctx, args) => {
          if (++attempts === 1) throw new Error("Transient cleanup failure");
          return await cleanup._handler(ctx, args);
        },
      }) };
    } });
    const { company, owner, target } = await fixture("cover", t);
    const intent = await owner.mutation(images.generateUploadIntent, { ...target, contentType: "image/png", size: png.length });
    const stream = new ReadableStream({ async pull(controller) {
      await t.run(ctx => ctx.db.patch(company.membershipId, { status: "inactive" }));
      controller.enqueue(png); controller.close();
    } }, { highWaterMark: 0 });
    expect((await owner.fetch("/portfolio-images/upload", { method: "POST", headers: {
      "Content-Type": "image/png", "X-Upload-Token": intent.uploadToken,
    }, body: stream, duplex: "half" } as RequestInit)).status).toBe(400);
    await t.finishAllScheduledFunctions(() => {});
    expect(attempts).toBe(2);
    expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("portfolioImages").collect())).toEqual([]);
  });

test("a Client Deal reveals the name under the existing policy but never pending/rejected image access", async () => {
  const { t, company, target, admin } = await fixture();
  const image = (await upload(t, company.userId, target)).image;
  const relationship = await conversation(t, company);
  const client = asUser(t, relationship.clientId);
  const { finalQuoteId } = await client.mutation(api.finalQuotes.index.request, { conversationId: relationship.conversationId });
  await t.run(async ctx => {
    const revisionId = await ctx.db.insert("finalQuoteRevisions", {
      finalQuoteId, revisionNumber: 1, price: 100000, currency: "MAD", duration: 30, plannedStartDate: "2099-01-01", validUntil: "2099-12-31",
      scope: "Complete renovation", inclusions: "Materials", exclusions: "Fees", paymentTerms: "Milestones", submittedByUserId: company.userId, submittedAt: 1, createdAt: 1,
    });
    await ctx.db.insert("deals", { projectId: relationship.projectId, clientUserId: relationship.clientId, companyId: company.companyId, createdByUserId: relationship.clientId,
      acceptedFinalQuoteId: finalQuoteId, acceptedFinalQuoteRevisionId: revisionId, conversationId: relationship.conversationId, initialQuoteId: relationship.quoteId,
      agreedAmountMad: 100000, currency: "MAD", commissionRateBps: 300, commissionAmountMad: 3000, commissionTierMinAmountMad: 0, commissionTierMaxAmountMad: 300000,
      commissionConfigVersion: 1, commissionDebtorCompanyId: company.companyId, commissionBeneficiary: "batiplus", commissionStatus: "due", status: "active", createdAt: 1 });
  });
  expect(await client.run(ctx => resolveCompanyIdentityAudience(ctx, company.companyId))).toBe("deal_client");
  for (const rejected of [false, true]) {
    if (rejected) await decide(t, admin.userId, image, "reject");
    expect((await client.fetch(privatePath(image._id))).status).toBe(404);
    expect((await client.fetch(publicPath(image._id))).status).toBe(404);
    await expect(client.query(images.getHistory, { imageId: image._id, paginationOpts: page })).rejects.toThrow();
  }
});

test("every legacy portfolio R2 request/verify/bind path is closed while Company cover uploads remain available", async () => {
  const { t, owner, company, target } = await fixture();
  for (const purpose of ["portfolioCover", "portfolioMedia"] as const) {
    const args = { purpose, contentType: "image/png", size: png.length, portfolioProjectId: target.portfolioProjectId };
    await expect(owner.action(api.storage.r2.requestPublicMediaUpload, args)).rejects.toThrow("PORTFOLIO_PRIVATE_UPLOAD_REQUIRED");
    await expect(t.query(internal.storage.publicMedia.getUploadAccess, { ...args, userId: company.userId })).rejects.toThrow("PORTFOLIO_PRIVATE_UPLOAD_REQUIRED");
    const token = crypto.randomUUID(); const objectKey = `companies/${company.companyId}/portfolio/legacy.png`;
    await expect(t.mutation(internal.storage.publicMedia.createUploadIntent, { ...args, userId: company.userId, companyId: company.companyId, uploadToken: token, objectKey })).rejects.toThrow("PORTFOLIO_PRIVATE_UPLOAD_REQUIRED");
    await t.run(ctx => ctx.db.insert("publicMediaUploadIntents", { companyId: company.companyId, userId: company.userId, portfolioProjectId: target.portfolioProjectId, purpose,
      token, objectKey, expectedContentType: "image/png", expectedSize: png.length, createdAt: now, expiresAt: now + 10000 }));
    await expect(t.query(internal.storage.publicMedia.getUploadIntentForVerification, { userId: company.userId, uploadToken: token })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");
    await expect(t.mutation(internal.storage.publicMedia.markUploadVerified, { userId: company.userId, uploadToken: token, objectKey, contentType: "image/png", size: png.length })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");
    await expect(owner.action(api.storage.r2.verifyPublicMediaUpload, { uploadToken: token })).rejects.toThrow("INVALID_PUBLIC_MEDIA_UPLOAD");
  }
  expect(await t.query(internal.storage.publicMedia.getUploadAccess, { userId: company.userId, purpose: "companyCover", contentType: "image/png", size: png.length })).toEqual({ companyId: company.companyId });
});
