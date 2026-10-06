/// <reference types="vite/client" />
import { convexTest, type TestConvexForDataModel } from "convex-test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import schema from "./schema";
import { readLegacyImageObject } from "./storage/r2Client";
import { sha256, storageHashMatches } from "./legacyMediaIngestion/model";
import type { LegacyTarget } from "./legacyMediaIngestion/constants";
import * as logoModel from "./companyLogos/index";

vi.mock("./storage/r2Client", () => ({ readLegacyImageObject: vi.fn() }));
const modules = import.meta.glob("./**/*.ts");
type Backend = TestConvexForDataModel<DataModel>;
const now = 1_800_000_000_000;
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII="), c => c.charCodeAt(0));
const ingest = api.legacyMediaIngestion.actions.ingest;
const listing = api.legacyMediaIngestion.index.listCandidates;
const page = { numItems: 20, cursor: null };
const as = (t: Backend, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|session` });
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
  process.env.R2_PUBLIC_BASE_URL = "https://media.example.test";
  vi.mocked(readLegacyImageObject).mockReset().mockResolvedValue({ bytes: png, contentType: "image/png", size: png.length, etag: '"original"' });
});
afterEach(() => { vi.restoreAllMocks(); });

async function fixture(mediaType: LegacyTarget["mediaType"] = "companyLogo", provider: LegacyTarget["provider"] = "r2") {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async ctx => {
    const adminId = await ctx.db.insert("users", { accountType: "admin" });
    const ownerId = await ctx.db.insert("users", { accountType: "company", onboardingStatus: "completed" });
    const companyId = await ctx.db.insert("companies", { name: "Atlas", slug: crypto.randomUUID(), city: "Rabat", description: "Construction",
      onboardingStatus: "completed", verificationStatus: "draft", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("companyMembers", { companyId, userId: ownerId, role: "owner", status: "active", createdAt: 1 });
    const projectId = await ctx.db.insert("portfolioProjects", { companyId, title: "Villa", description: "Renovation", city: "Rabat", projectType: "renovation", status: "published", createdAt: 1, updatedAt: 1 });
    const slotId = await ctx.db.insert("portfolioMedia", { portfolioProjectId: projectId, sortOrder: 3, caption: "Original caption", createdAt: 1 });
    const sourceStorageId = await ctx.storage.store(new Blob([png], { type: "image/png" }));
    const objectKey = `companies/${companyId}/portfolio/pending/media/source.png`;
    const publicMediaId = await ctx.db.insert("publicMedia", { storageProvider: "r2", companyId,
      portfolioProjectId: mediaType.startsWith("portfolio") ? projectId : undefined,
      purpose: mediaType === "portfolioGallery" ? "portfolioMedia" : mediaType, objectKey, mimeType: "image/png", size: png.length, uploadedBy: ownerId, createdAt: 1 });
    if (mediaType === "companyLogo") await ctx.db.patch(companyId, provider === "r2" ? { logoMediaId: publicMediaId } : { logoStorageId: sourceStorageId });
    else if (mediaType === "companyCover") await ctx.db.patch(companyId, { coverMediaId: publicMediaId });
    else if (mediaType === "portfolioCover") await ctx.db.patch(projectId, provider === "r2" ? { coverMediaId: publicMediaId } : { coverImageStorageId: sourceStorageId });
    else await ctx.db.patch(slotId, provider === "r2" ? { publicMediaId } : { storageId: sourceStorageId });
    return { adminId, ownerId, companyId, projectId, slotId, sourceStorageId, publicMediaId, objectKey };
  });
  const admin = as(t, seeded.adminId);
  const candidates = await admin.query(listing, { mediaType, paginationOpts: page });
  const candidate = candidates.page.find(row => row.provider === provider)!;
  const args = { mediaType, provider, companyId: seeded.companyId,
    portfolioProjectId: mediaType.startsWith("portfolio") ? seeded.projectId : undefined,
    gallerySlotId: mediaType === "portfolioGallery" ? seeded.slotId : undefined, sourceKey: candidate.sourceKey };
  return { t, admin, ...seeded, args, candidate };
}

test.each(["companyLogo", "companyCover", "portfolioCover", "portfolioGallery"] as const)("R2 %s ingestion creates exact pending image/hash/history and preserves originals", async mediaType => {
  const f = await fixture(mediaType);
  const original = await f.t.run(async ctx => ({ company: await ctx.db.get(f.companyId), project: await ctx.db.get(f.projectId), slot: await ctx.db.get(f.slotId), media: await ctx.db.get(f.publicMediaId) }));
  const result = await f.admin.action(ingest, f.args);
  expect(result.status).toBe("ingested"); expect(result.imageId).not.toBeNull();
  const image = await f.t.run(ctx => ctx.db.get(result.imageId!));
  expect(image).toMatchObject({ companyId: f.companyId, moderationStatus: "pending", size: png.length, contentType: "image/png", uploadedBy: f.adminId });
  expect(storageHashMatches(image!.sha256, await sha256(png))).toBe(true);
  const history = await f.t.run(ctx => ctx.db.query(mediaType === "companyLogo" ? "companyLogoModerationHistory" : mediaType === "companyCover" ? "companyCoverModerationHistory" : "portfolioImageModerationHistory").collect());
  expect(history).toHaveLength(1); expect(history[0]).toMatchObject({ imageId: result.imageId, action: "uploaded", newStatus: "pending", changedBy: f.adminId });
  const record = await f.t.run(ctx => ctx.db.get(result.ingestionId));
  expect(record).toMatchObject({ sourceRef: f.objectKey, sourceRecordId: f.publicMediaId, createdBy: f.adminId, attemptedBy: f.adminId, sha256: await sha256(png), sourceEtag: '"original"' });
  const current = await f.t.run(async ctx => ({ company: await ctx.db.get(f.companyId), project: await ctx.db.get(f.projectId), slot: await ctx.db.get(f.slotId), media: await ctx.db.get(f.publicMediaId) }));
  expect(current.media).toEqual(original.media);
  expect(current.company?.logoMediaId).toBe(original.company?.logoMediaId); expect(current.company?.coverMediaId).toBe(original.company?.coverMediaId);
  expect(current.project?.coverMediaId).toBe(original.project?.coverMediaId); expect(current.slot?.publicMediaId).toBe(original.slot?.publicMediaId);
  expect(current.slot?.sortOrder).toBe(3); expect(current.slot?.caption).toBe("Original caption"); expect(current.project?.status).toBe("published");
  expect(current.company?.approvedLogoImageId).toBeUndefined(); expect(current.company?.approvedCoverImageId).toBeUndefined();
  expect(current.project?.approvedImageId).toBeUndefined(); expect(current.slot?.approvedImageId).toBeUndefined();
  expect(vi.mocked(readLegacyImageObject)).toHaveBeenCalledWith(f.objectKey, (mediaType === "companyLogo" ? 5 : 10) * 1024 * 1024);
  if (mediaType.startsWith("portfolio")) expect(image).toMatchObject({ portfolioProjectId: f.projectId, purpose: mediaType === "portfolioCover" ? "cover" : "gallery" });
});
test.each(["companyLogo", "portfolioCover", "portfolioGallery"] as const)("native %s gets a NEW private storage object", async type => {
  const f = await fixture(type, "convex"); const result = await f.admin.action(ingest, f.args);
  const state = await f.t.run(async ctx => ({ image: await ctx.db.get(result.imageId!), sourceExists: !!(await ctx.storage.get(f.sourceStorageId)) }));
  expect(state.image!.storageId).not.toBe(f.sourceStorageId); expect(state.sourceExists).toBe(true); expect(result.status).toBe("ingested");
  expect(readLegacyImageObject).not.toHaveBeenCalled();
});
test.each(["company", "client", "seo_team"] as const)("%s denied all operations even with a candidate key", async role => {
  const f = await fixture(); const userId = await f.t.run(ctx => ctx.db.insert("users", { accountType: role }));
  const denied = as(f.t, userId);
  await expect(denied.query(listing, { mediaType: "companyLogo", paginationOpts: page })).rejects.toThrow("ADMIN_REQUIRED");
  await expect(denied.query(api.legacyMediaIngestion.index.listState, { companyId: f.companyId, paginationOpts: page })).rejects.toThrow("ADMIN_REQUIRED");
  await expect(denied.action(ingest, f.args)).rejects.toThrow("ADMIN_REQUIRED");
  await expect(as(f.t, f.ownerId).action(ingest, f.args)).rejects.toThrow("ADMIN_REQUIRED");
});
test("anonymous and staff denied; changing authenticated Admin role mid-copy prevents commitment", async () => {
  const f = await fixture();
  await expect(f.t.action(ingest, f.args)).rejects.toThrow("NOT_AUTHENTICATED");
  const staffId = await f.t.run(async ctx => { const id = await ctx.db.insert("users", { accountType: "company" }); await ctx.db.insert("companyMembers", { userId: id, companyId: f.companyId, role: "staff", status: "active", createdAt: 1 }); return id; });
  await expect(as(f.t, staffId).action(ingest, f.args)).rejects.toThrow("ADMIN_REQUIRED");
  vi.mocked(readLegacyImageObject).mockImplementationOnce(async () => {
    await f.t.run(ctx => ctx.db.patch(f.adminId, { accountType: "client" }));
    return { bytes: png, contentType: "image/png", size: png.length, etag: '"original"' };
  });
  const result = await f.admin.action(ingest, f.args); expect(result.status).toBe("failed");
  expect(await f.t.run(ctx => ctx.db.query("companyLogoImages").collect())).toEqual([]);
});
test("success replay/concurrent requests create one private copy, image and event", async () => {
  const f = await fixture();
  const results = await Promise.all([f.admin.action(ingest, f.args), f.admin.action(ingest, f.args)]);
  const completed = results.find(r => r.status === "ingested")!;
  expect(await f.admin.action(ingest, f.args)).toEqual(completed);
  expect(readLegacyImageObject).toHaveBeenCalledTimes(1);
  const state = await f.t.run(async ctx => ({ images: await ctx.db.query("companyLogoImages").collect(), events: await ctx.db.query("companyLogoModerationHistory").collect(), records: await ctx.db.query("legacyMediaIngestions").collect(), storage: await ctx.db.system.query("_storage").collect() }));
  expect(state.images).toHaveLength(1); expect(state.events).toHaveLength(1); expect(state.records).toHaveLength(1); expect(state.storage).toHaveLength(2);
});
test("failure preserves source and pointers, records sanitized failure and permits retry", async () => {
  const f = await fixture();
  vi.mocked(readLegacyImageObject).mockRejectedValueOnce(new Error("secret credential and object key"));
  const failed = await f.admin.action(ingest, f.args); expect(failed.status).toBe("failed"); expect(JSON.stringify(failed)).not.toContain("secret");
  expect(await f.t.run(ctx => ctx.db.get(f.publicMediaId))).not.toBeNull();
  expect((await f.t.run(ctx => ctx.db.get(f.companyId)))?.submittedLogoImageId).toBeUndefined();
  const retried = await f.admin.action(ingest, f.args); expect(retried.status).toBe("ingested"); expect(retried.ingestionId).toBe(failed.ingestionId);
  expect((await f.t.run(ctx => ctx.db.get(retried.ingestionId)))?.attempts).toBe(2);
});
test("failed finalization rolls back image/history, cleans only the new copy and retries safely", async () => {
  const f = await fixture();
  vi.spyOn(logoModel, "createPendingLogo").mockRejectedValueOnce(new Error("Simulated transaction failure"));
  const result = await f.admin.action(ingest, f.args); expect(result.status).toBe("failed");
  const state = await f.t.run(async ctx => ({ files: await ctx.db.system.query("_storage").collect(), images: await ctx.db.query("companyLogoImages").collect(), history: await ctx.db.query("companyLogoModerationHistory").collect() }));
  expect(state.files).toHaveLength(1); expect(state.files[0]._id).toBe(f.sourceStorageId); expect(state.images).toEqual([]); expect(state.history).toEqual([]);
  const retry = await f.admin.action(ingest, f.args); expect(retry.status).toBe("ingested"); expect(retry.ingestionId).toBe(result.ingestionId);
});
test("native invalid bytes leave the original intact and record retryable failure", async () => {
  const f = await fixture("companyLogo", "convex");
  const invalid = await f.t.run(async ctx => { const id = await ctx.storage.store(new Blob([Uint8Array.of(1, 2, 3)], { type: "image/png" })); await ctx.db.patch(f.companyId, { logoStorageId: id }); return id; });
  const candidate = (await f.admin.query(listing, { mediaType: "companyLogo", paginationOpts: page })).page[0];
  const result = await f.admin.action(ingest, { ...f.args, sourceKey: candidate.sourceKey }); expect(result.status).toBe("failed");
  expect(await f.t.run(async ctx => !!(await ctx.storage.get(invalid)))).toBe(true);
  expect((await f.t.run(ctx => ctx.db.get(f.companyId)))?.logoStorageId).toBe(invalid);
});
test.each([
  ["application/pdf", png], ["image/png", Uint8Array.of(1, 2, 3)], ["image/jpeg", png], ["image/webp", png],
  ["image/png", new Uint8Array(5 * 1024 * 1024 + 1)],
] as const)("rejects invalid %s bytes / logo size", async (contentType, bytes) => {
  const f = await fixture(); vi.mocked(readLegacyImageObject).mockResolvedValueOnce({ bytes, contentType, size: bytes.length, etag: "e" });
  expect((await f.admin.action(ingest, f.args)).status).toBe("failed");
  expect(await f.t.run(ctx => ctx.db.query("companyLogoImages").collect())).toEqual([]);
});
test.each(["image/jpeg", "image/webp"] as const)("accepts signature-validated %s", async contentType => {
  const f = await fixture(); const bytes = contentType === "image/jpeg" ? Uint8Array.of(255, 216, 255, 0) : new TextEncoder().encode("RIFF0000WEBP");
  vi.mocked(readLegacyImageObject).mockResolvedValueOnce({ bytes, contentType, size: bytes.length, etag: "e" });
  expect((await f.admin.action(ingest, f.args)).status).toBe("ingested");
});
test.each(["companyCover", "portfolioCover", "portfolioGallery"] as const)("%s rejects more than 10 MiB", async type => {
  const f = await fixture(type); const bytes = new Uint8Array(10 * 1024 * 1024 + 1); bytes.set(png);
  vi.mocked(readLegacyImageObject).mockResolvedValueOnce({ bytes, contentType: "image/png", size: bytes.length, etag: "e" });
  expect((await f.admin.action(ingest, f.args)).status).toBe("failed");
});
test.each(["companyLogo", "companyCover", "portfolioCover", "portfolioGallery"] as const)("existing submitted/approved %s is never replaced", async type => {
  const f = await fixture(type); const first = await f.admin.action(ingest, f.args);
  const image = await f.t.run(ctx => ctx.db.get(first.imageId!));
  if (type === "companyLogo") await f.admin.mutation(api.companyLogos.index.approve, { imageId: image!._id as Id<"companyLogoImages">, expectedSha256: image!.sha256 });
  else if (type === "companyCover") await f.admin.mutation(api.companyCovers.index.approve, { imageId: image!._id as Id<"companyCoverImages">, expectedSha256: image!.sha256 });
  else await f.admin.mutation(api.portfolioImages.index.approve, { imageId: image!._id as Id<"portfolioImages">, expectedSha256: image!.sha256 });
  // A second legacy provider/reference cannot override even an approved, hidden or rejected moderated history.
  await f.t.run(ctx => ctx.db.patch(f.publicMediaId, { objectKey: `companies/${f.companyId}/second.png` }));
  const next = (await f.admin.query(listing, { mediaType: type, paginationOpts: page })).page[0];
  const before = await f.t.run(ctx => ctx.db.get(type === "companyLogo" || type === "companyCover" ? f.companyId : type === "portfolioCover" ? f.projectId : f.slotId));
  const result = await f.admin.action(ingest, { ...f.args, sourceKey: next.sourceKey }); expect(result.status).toBe("conflict"); expect(result.imageId).toBeNull();
  expect(await f.t.run(ctx => ctx.db.get(before!._id))).toEqual(before); expect(readLegacyImageObject).toHaveBeenCalledTimes(1);
});
test("new owner upload during copy retains the ingestion pending but unlinked and stale approval fails", async () => {
  const f = await fixture(); let newer: Id<"companyLogoImages">;
  vi.mocked(readLegacyImageObject).mockImplementationOnce(async () => {
    const owner = as(f.t, f.ownerId); const intent = await owner.mutation(api.companyLogos.index.generateUploadIntent, { contentType: "image/png", size: png.length });
    const storageId = await f.t.run(ctx => ctx.storage.store(new Blob([png], { type: "image/png" })));
    newer = await owner.mutation(internal.companyLogos.index.bindUpload, { uploadToken: intent.uploadToken, storageId, contentType: "image/png", size: png.length });
    return { bytes: png, contentType: "image/png", size: png.length, etag: "e" };
  });
  const result = await f.admin.action(ingest, f.args); expect(result.status).toBe("conflict"); expect(result.imageId).not.toBeNull();
  expect((await f.t.run(ctx => ctx.db.get(f.companyId)))?.submittedLogoImageId).toBe(newer!);
  const image = await f.t.run(ctx => ctx.db.get(result.imageId!));
  await expect(f.admin.mutation(api.companyLogos.index.approve, { imageId: image!._id as Id<"companyLogoImages">, expectedSha256: image!.sha256 })).rejects.toThrow();
});
test("gallery ingestion affects only its exact slot and publication does not approve it", async () => {
  const f = await fixture("portfolioGallery");
  const otherSlot = await f.t.run(ctx => ctx.db.insert("portfolioMedia", { portfolioProjectId: f.projectId, sortOrder: 0, caption: "Other", createdAt: 1 }));
  const result = await f.admin.action(ingest, f.args);
  expect((await f.t.run(ctx => ctx.db.get(f.slotId)))?.submittedImageId).toBe(result.imageId);
  expect((await f.t.run(ctx => ctx.db.get(otherSlot)))?.submittedImageId).toBeUndefined();
  expect((await f.t.run(ctx => ctx.db.get(f.projectId)))?.submittedImageId).toBeUndefined();
  await expect(f.t.query(internal.portfolioImages.index.authorizePublicImage, { imageId: result.imageId as Id<"portfolioImages"> })).rejects.toThrow();
});
test("cross-Company/project/slot mismatch and forged source key deny ingestion", async () => {
  const f = await fixture("portfolioGallery");
  const otherCompany = await f.t.run(ctx => ctx.db.insert("companies", { onboardingStatus: "completed", verificationStatus: "draft", createdAt: 1, updatedAt: 1 }));
  await expect(f.admin.action(ingest, { ...f.args, companyId: otherCompany })).rejects.toThrow();
  await expect(f.admin.action(ingest, { ...f.args, sourceKey: "guessed" })).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch(f.publicMediaId, { companyId: otherCompany }));
  await expect(f.admin.action(ingest, f.args)).rejects.toThrow();
});
test("list DTOs/public DTOs never expose raw source/copy references and pages are bounded", async () => {
  const f = await fixture(); const result = await f.admin.action(ingest, f.args);
  const image = await f.t.run(ctx => ctx.db.get(result.imageId!));
  const list = await f.admin.query(listing, { mediaType: "companyLogo", paginationOpts: page });
  const state = await f.admin.query(api.legacyMediaIngestion.index.listState, { companyId: f.companyId, paginationOpts: page });
  const profile = await f.t.query(api.portfolio.index.getPublicCompanyProfile, { slug: (await f.t.run(ctx => ctx.db.get(f.companyId)))!.slug! });
  for (const dto of [list, state, profile, result]) {
    const serialized = JSON.stringify(dto); expect(serialized).not.toContain(f.objectKey); expect(serialized).not.toContain(f.sourceStorageId);
    expect(serialized).not.toContain(image!.storageId); expect(serialized).not.toContain("sourceRef"); expect(serialized).not.toContain("/api/storage/");
  }
  expect(profile?.logoUrl).toBeNull();
  await expect(f.admin.query(listing, { mediaType: "companyLogo", paginationOpts: { ...page, numItems: 21 } })).rejects.toThrow("INVALID_PAGINATION");
});
test("cleanup cannot delete a committed private copy or a native original", async () => {
  const f = await fixture("companyLogo", "convex"); const result = await f.admin.action(ingest, f.args);
  const image = await f.t.run(ctx => ctx.db.get(result.imageId!));
  for (const storageId of [image!.storageId, f.sourceStorageId]) await f.t.mutation(internal.legacyMediaIngestion.index.cleanupCopy, { ingestionId: result.ingestionId, storageId });
  expect(await f.t.run(async ctx => !!(await ctx.storage.get(image!.storageId)))).toBe(true);
  expect(await f.t.run(async ctx => !!(await ctx.storage.get(f.sourceStorageId)))).toBe(true);
});
test("expired attempt is fenced after retry and uncertain finish replay is idempotent", async () => {
  const f = await fixture(); const begin = await f.admin.mutation(internal.legacyMediaIngestion.index.begin, f.args);
  const storageId = await f.t.run(ctx => ctx.storage.store(new Blob([png], { type: "image/png" })));
  vi.spyOn(Date, "now").mockReturnValue(now + 11 * 60 * 1000);
  const second = await f.admin.mutation(internal.legacyMediaIngestion.index.begin, f.args);
  const finishArgs = { ingestionId: begin.result.ingestionId, attemptId: begin.attemptId!, storageId, contentType: "image/png" as const, size: png.length, sha256: await sha256(png) };
  await expect(f.admin.mutation(internal.legacyMediaIngestion.index.finish, finishArgs)).rejects.toThrow("LEGACY_MEDIA_STALE_ATTEMPT");
  const committed = await f.admin.mutation(internal.legacyMediaIngestion.index.finish, { ...finishArgs, attemptId: second.attemptId! });
  expect(await f.admin.mutation(internal.legacyMediaIngestion.index.finish, { ...finishArgs, attemptId: second.attemptId! })).toEqual(committed);
  await f.t.mutation(internal.legacyMediaIngestion.index.cleanupCopy, { ingestionId: committed.ingestionId, storageId });
  expect(await f.t.run(async ctx => !!(await ctx.storage.get(storageId)))).toBe(true);
});
