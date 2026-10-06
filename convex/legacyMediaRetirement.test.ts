/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { readLegacyImageObject, retireLegacyImageObject } from "./storage/r2Client";
import type { LegacyTarget } from "./legacyMediaIngestion/constants";
import { RETIREMENT_LEASE_MS } from "./legacyMediaIngestion/retirementConstants";

vi.mock("./storage/r2Client", () => ({ readLegacyImageObject: vi.fn(), retireLegacyImageObject: vi.fn() }));
const modules = import.meta.glob("./**/*.ts");
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII="), c => c.charCodeAt(0));
const now = 1_800_000_000_000;
const readiness = api.legacyMediaIngestion.retirement.getReadiness;
const retire = api.legacyMediaIngestion.retirementActions.retire;
const page = { numItems: 20, cursor: null };
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubEnv("LEGACY_MEDIA_REVOCATION_ENABLED", "true"); vi.stubEnv("LEGACY_MEDIA_R2_CONDITIONAL_DELETE_VERIFIED", "true");
  vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site"); vi.stubEnv("R2_PUBLIC_BASE_URL", "https://media.example.test");
  vi.mocked(readLegacyImageObject).mockReset().mockResolvedValue({ bytes: png, contentType: "image/png", size: png.length, etag: '"original"' });
  vi.mocked(retireLegacyImageObject).mockReset().mockImplementation(async (_source, authorize) => { await authorize(); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function fixture(type: LegacyTarget["mediaType"] = "companyLogo", provider: LegacyTarget["provider"] = "r2") {
  const t = convexTest(schema, modules);
  const seed = await t.run(async ctx => {
    const adminId = await ctx.db.insert("users", { accountType: "admin" });
    const ownerId = await ctx.db.insert("users", { accountType: "company" });
    const companyId = await ctx.db.insert("companies", { name: "Atlas", slug: "atlas", city: "Rabat", description: "Construction", onboardingStatus: "completed", verificationStatus: "draft", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("companyMembers", { userId: ownerId, companyId, role: "owner", status: "active", createdAt: 1 });
    const projectId = await ctx.db.insert("portfolioProjects", { companyId, title: "Villa", description: "Renovation", city: "Rabat", projectType: "renovation", status: "published", createdAt: 1, updatedAt: 1 });
    const slotId = await ctx.db.insert("portfolioMedia", { portfolioProjectId: projectId, sortOrder: 2, caption: "Original", createdAt: 1 });
    const originalId = await ctx.storage.store(new Blob([png], { type: "image/png" }));
    const key = `companies/${companyId}/legacy/image.png`;
    const mediaId = await ctx.db.insert("publicMedia", { storageProvider: "r2", companyId, portfolioProjectId: type.startsWith("portfolio") ? projectId : undefined,
      purpose: type === "portfolioGallery" ? "portfolioMedia" : type, objectKey: key, mimeType: "image/png", size: png.length, uploadedBy: ownerId, createdAt: 1 });
    if (type === "companyLogo") await ctx.db.patch(companyId, provider === "r2" ? { logoMediaId: mediaId } : { logoStorageId: originalId });
    else if (type === "companyCover") await ctx.db.patch(companyId, { coverMediaId: mediaId });
    else if (type === "portfolioCover") await ctx.db.patch(projectId, provider === "r2" ? { coverMediaId: mediaId } : { coverImageStorageId: originalId });
    else await ctx.db.patch(slotId, provider === "r2" ? { publicMediaId: mediaId } : { storageId: originalId });
    return { adminId, ownerId, companyId, projectId, slotId, originalId, key, mediaId };
  });
  const admin = t.withIdentity({ subject: `${seed.adminId}|session` });
  const candidate = (await admin.query(api.legacyMediaIngestion.index.listCandidates, { mediaType: type, paginationOpts: page })).page.find(c => c.provider === provider)!;
  const result = await admin.action(api.legacyMediaIngestion.actions.ingest, { mediaType: type, provider, companyId: seed.companyId,
    portfolioProjectId: type.startsWith("portfolio") ? seed.projectId : undefined, gallerySlotId: type === "portfolioGallery" ? seed.slotId : undefined, sourceKey: candidate.sourceKey });
  const image = (await t.run(ctx => ctx.db.get(result.imageId!)))!;
  const decision = async (action: "approve" | "reject" | "hide") => {
    const args = { expectedSha256: image.sha256, ...(action === "approve" ? {} : { reason: "Identifying branding" }) };
    if (type === "companyLogo") await admin.mutation(api.companyLogos.index[action], { ...args, imageId: image._id as Id<"companyLogoImages"> });
    else if (type === "companyCover") await admin.mutation(api.companyCovers.index[action], { ...args, imageId: image._id as Id<"companyCoverImages"> });
    else await admin.mutation(api.portfolioImages.index[action], { ...args, imageId: image._id as Id<"portfolioImages"> });
  };
  const get = () => admin.query(readiness, { ingestionId: result.ingestionId, checkedAt: Date.now() });
  const run = async () => admin.action(retire, { ingestionId: result.ingestionId, expectedFingerprint: (await get()).fingerprint, confirmation: "RETIRE" });
  return { t, admin, ...seed, image, result, type, provider, decision, get, run };
}

test.each(["companyLogo", "companyCover", "portfolioCover", "portfolioGallery"] as const)("R2 %s exact object retires, preserves fields/copy and requires cache verification", async type => {
  const f = await fixture(type); await f.decision("approve"); expect((await f.get()).ready).toBe(true);
  const before = await f.t.run(ctx => ctx.db.get(type.startsWith("company") ? f.companyId : type === "portfolioCover" ? f.projectId : f.slotId));
  const result = await f.run(); expect(result.retirementStatus).toBe("retired"); expect(result.cacheVerificationRequired).toBe(true);
  expect(result.knownUrls).toEqual([`https://media.example.test/${f.key}`]);
  expect(retireLegacyImageObject).toHaveBeenCalledWith({ objectKey: f.key, etag: '"original"', size: png.length, contentType: "image/png" }, expect.any(Function));
  expect(await f.t.run(ctx => ctx.db.get(before!._id))).toEqual(before);
  expect(await f.t.run(ctx => ctx.db.get(f.mediaId))).not.toBeNull(); expect(await f.t.run(async ctx => !!(await ctx.storage.get(f.image.storageId)))).toBe(true);
  expect(await f.run()).toEqual(result); expect(retireLegacyImageObject).toHaveBeenCalledTimes(1);
  const history = (await f.admin.query(api.legacyMediaIngestion.retirement.getHistory, { ingestionId: f.result.ingestionId, paginationOpts: page })).page;
  expect(history.map(h => h.action).sort()).toEqual(["requested", "retired"]);
  expect((await f.t.run(ctx => ctx.db.get(f.companyId)))?.verificationStatus).toBe("draft");
});
test.each(["companyLogo", "portfolioCover", "portfolioGallery"] as const)("native %s deletes only original and remains listed with captured alias", async type => {
  const f = await fixture(type, "convex"); await f.decision("approve"); const url = (await f.get()).knownUrls[0]; expect(url).toBeTruthy();
  const result = await f.run(); expect(result).toMatchObject({ retirementStatus: "retired", cacheVerificationRequired: true, knownUrls: [url] });
  expect(await f.t.run(async ctx => !!(await ctx.storage.get(f.originalId)))).toBe(false); expect(await f.t.run(async ctx => !!(await ctx.storage.get(f.image.storageId)))).toBe(true);
  expect(retireLegacyImageObject).not.toHaveBeenCalled(); expect(await f.run()).toEqual(result);
  expect((await f.admin.query(api.legacyMediaIngestion.retirement.listRetirements, { paginationOpts: page })).page[0].retirementStatus).toBe("retired");
});
test.each(["company", "client", "seo_team"] as const)("%s cannot inspect, list/history, retire or retry", async role => {
  const f = await fixture(); await f.decision("approve"); const userId = await f.t.run(ctx => ctx.db.insert("users", { accountType: role }));
  const denied = f.t.withIdentity({ subject: `${userId}|session` });
  await expect(denied.query(readiness, { ingestionId: f.result.ingestionId, checkedAt: Date.now() })).rejects.toThrow("ADMIN_REQUIRED");
  await expect(denied.query(api.legacyMediaIngestion.retirement.listRetirements, { paginationOpts: page })).rejects.toThrow("ADMIN_REQUIRED");
  await expect(denied.query(api.legacyMediaIngestion.retirement.getHistory, { ingestionId: f.result.ingestionId, paginationOpts: page })).rejects.toThrow("ADMIN_REQUIRED");
  await expect(denied.action(retire, { ingestionId: f.result.ingestionId, expectedFingerprint: (await f.get()).fingerprint, confirmation: "RETIRE" })).rejects.toThrow("ADMIN_REQUIRED");
  await expect(f.t.withIdentity({ subject: `${f.ownerId}|session` }).query(readiness, { ingestionId: f.result.ingestionId, checkedAt: Date.now() })).rejects.toThrow("ADMIN_REQUIRED");
});
test("anonymous denied and unset gate permits readiness but blocks destructive IO", async () => {
  const f = await fixture(); await f.decision("approve"); vi.stubEnv("LEGACY_MEDIA_REVOCATION_ENABLED", "");
  await expect(f.t.query(readiness, { ingestionId: f.result.ingestionId, checkedAt: Date.now() })).rejects.toThrow("NOT_AUTHENTICATED");
  expect((await f.get()).ready).toBe(true); await expect(f.run()).rejects.toThrow("LEGACY_MEDIA_REVOCATION_DISABLED"); expect(retireLegacyImageObject).not.toHaveBeenCalled();
});
test("R2 conditional-delete capability gate is independently required", async () => {
  const f = await fixture(); await f.decision("approve"); vi.stubEnv("LEGACY_MEDIA_R2_CONDITIONAL_DELETE_VERIFIED", "");
  await expect(f.run()).rejects.toThrow("LEGACY_MEDIA_R2_SAFETY_UNVERIFIED"); expect(retireLegacyImageObject).not.toHaveBeenCalled();
});
test("pending and published project never imply readiness or approval", async () => {
  const f = await fixture("portfolioGallery"); const state = await f.get(); expect(state.ready).toBe(false); expect(state.blockers).toContain("moderation_pending");
  await expect(f.run()).rejects.toThrow("LEGACY_MEDIA_RETIREMENT_NOT_READY"); expect(retireLegacyImageObject).not.toHaveBeenCalled();
});
test.each(["reject", "hide"] as const)("%s permits intentionally generic state without restoring older image", async decision => {
  const f = await fixture("companyCover"); if (decision === "hide") await f.decision("approve"); await f.decision(decision);
  expect(await f.get()).toMatchObject({ ready: true, publicState: "generic", moderationStatus: "rejected" });
  await f.run(); expect((await f.t.run(ctx => ctx.db.get(f.companyId)))?.approvedCoverImageId).toBeUndefined();
});
test.each(["sha256", "size", "contentType", "completedAt", "sourceEtag"] as const)("incomplete or mismatched %s provenance fails closed", async field => {
  const f = await fixture(); await f.decision("approve"); await f.t.run(ctx => ctx.db.patch(f.result.ingestionId, { [field]: undefined }));
  expect((await f.get()).ready).toBe(false); await expect(f.run()).rejects.toThrow(); expect(retireLegacyImageObject).not.toHaveBeenCalled();
});
test("missing preserved copy or changed source relationship blocks retirement", async () => {
  const f = await fixture("companyLogo", "convex"); await f.decision("approve");
  await f.t.run(ctx => ctx.storage.delete(f.image.storageId)); expect((await f.get()).blockers).toContain("preservation_invalid");
  await expect(f.run()).rejects.toThrow(); expect(await f.t.run(async ctx => !!(await ctx.storage.get(f.originalId)))).toBe(true);
  const other = await fixture(); await other.decision("approve"); await other.t.run(ctx => ctx.db.patch(other.companyId, { logoMediaId: undefined }));
  expect((await other.get()).blockers).toContain("relationship_changed");
});
test("new owner submission invalidates confirmation without substituting the deletion target", async () => {
  const f = await fixture(); await f.decision("approve"); const old = await f.get();
  const owner = f.t.withIdentity({ subject: `${f.ownerId}|session` });
  const intent = await owner.mutation(api.companyLogos.index.generateUploadIntent, { contentType: "image/png", size: png.length });
  const storageId = await f.t.run(ctx => ctx.storage.store(new Blob([png], { type: "image/png" })));
  const newImage = await owner.mutation(internal.companyLogos.index.bindUpload, { uploadToken: intent.uploadToken, storageId, contentType: "image/png", size: png.length });
  await expect(f.admin.action(retire, { ingestionId: f.result.ingestionId, expectedFingerprint: old.fingerprint, confirmation: "RETIRE" })).rejects.toThrow("LEGACY_MEDIA_RETIREMENT_STALE");
  expect((await f.get()).ready).toBe(true); await f.run(); expect(vi.mocked(retireLegacyImageObject).mock.calls[0][0].objectKey).toBe(f.key);
  expect((await f.t.run(ctx => ctx.db.get(f.companyId)))?.submittedLogoImageId).toBe(newImage);
});
test("reservation rechecks role and current readiness immediately before R2 deletion", async () => {
  const f = await fixture(); await f.decision("approve"); let deleted = false;
  vi.mocked(retireLegacyImageObject).mockImplementationOnce(async (_source, authorize) => {
    await f.t.run(ctx => ctx.db.patch(f.adminId, { accountType: "client" })); await authorize(); deleted = true;
  });
  expect((await f.run()).retirementStatus).toBe("failed"); expect(deleted).toBe(false);
});
test("duplicate/concurrent retirement and failed provider retry preserve single terminal audit", async () => {
  const f = await fixture(); await f.decision("approve"); vi.mocked(retireLegacyImageObject).mockRejectedValueOnce(new Error("secret key credentials"));
  const failed = await f.run(); expect(failed.retirementStatus).toBe("failed"); expect(JSON.stringify(failed)).not.toContain("secret");
  const hash = (await f.get()).fingerprint;
  const result = await Promise.all([1, 2].map(() => f.admin.action(retire, { ingestionId: f.result.ingestionId, expectedFingerprint: hash, confirmation: "RETIRE" })));
  expect(result.some(r => r.retirementStatus === "retired")).toBe(true); expect(retireLegacyImageObject).toHaveBeenCalledTimes(2);
  const history = await f.t.run(ctx => ctx.db.query("legacyMediaRetirementHistory").collect());
  expect(history.filter(h => h.action === "retired")).toHaveLength(1); expect(history.filter(h => h.action === "failed")).toHaveLength(1);
});
test("expired/replaced attempt is fenced before native deletion", async () => {
  const f = await fixture("companyLogo", "convex"); await f.decision("approve");
  const args = { ingestionId: f.result.ingestionId, expectedFingerprint: (await f.get()).fingerprint, confirmation: "RETIRE" as const };
  const first = await f.admin.mutation(internal.legacyMediaIngestion.retirement.reserve, args);
  vi.spyOn(Date, "now").mockReturnValue(now + 11 * 60 * 1000);
  const second = await f.admin.mutation(internal.legacyMediaIngestion.retirement.reserve, args);
  await expect(f.admin.mutation(internal.legacyMediaIngestion.retirement.retireNative, { ingestionId: f.result.ingestionId, attemptId: first.attemptId! })).rejects.toThrow("STALE");
  expect((await f.admin.mutation(internal.legacyMediaIngestion.retirement.retireNative, { ingestionId: f.result.ingestionId, attemptId: second.attemptId! })).retirementStatus).toBe("retired");
});

async function interruptRetirement(provider: LegacyTarget["provider"] = "r2") {
  const f = await fixture("companyLogo", provider); await f.decision("approve");
  const request = { ingestionId: f.result.ingestionId, expectedFingerprint: (await f.get()).fingerprint, confirmation: "RETIRE" as const };
  const first = await f.admin.mutation(internal.legacyMediaIngestion.retirement.reserve, request);
  return { ...f, request, first };
}
test.each(["r2", "convex"] as const)("%s active lease is locked; expired lease exposes a fresh guarded retry without marking success", async provider => {
  const f = await interruptRetirement(provider);
  expect(await f.get()).toMatchObject({ ready: false, retryable: false, retirementStatus: "retiring", blockers: [] });
  // Query time is only a UI hint; even a browser-supplied future time cannot unlock server reservation.
  expect(await f.admin.query(readiness, { ingestionId: f.result.ingestionId, checkedAt: now + RETIREMENT_LEASE_MS })).toMatchObject({ ready: true, retryable: true });
  expect((await f.run()).retirementStatus).toBe("retiring"); expect(retireLegacyImageObject).not.toHaveBeenCalled();
  expect((await f.t.run(ctx => ctx.db.get(f.result.ingestionId)))?.retirementAttempts).toBe(1);
  vi.mocked(Date.now).mockReturnValue(now + RETIREMENT_LEASE_MS - 1);
  expect((await f.get()).ready).toBe(false);
  vi.mocked(Date.now).mockReturnValue(now + RETIREMENT_LEASE_MS);
  expect(await f.get()).toMatchObject({ ready: true, retryable: true, retirementStatus: "ready", blockers: [] });
  expect((await f.t.run(ctx => ctx.db.get(f.result.ingestionId)))?.retirementStatus).toBe("retiring");
});
test.each(["r2", "convex"] as const)("%s expired and replaced attempts cannot finalize; new fenced retry records one terminal event", async provider => {
  const f = await interruptRetirement(provider);
  vi.mocked(Date.now).mockReturnValue(now + RETIREMENT_LEASE_MS);
  const finish = provider === "r2" ? internal.legacyMediaIngestion.retirement.finishR2 : internal.legacyMediaIngestion.retirement.retireNative;
  const oldAttempt = { ingestionId: f.result.ingestionId, attemptId: f.first.attemptId! };
  await expect(f.admin.mutation(finish, oldAttempt)).rejects.toThrow("STALE");
  const second = await f.admin.mutation(internal.legacyMediaIngestion.retirement.reserve, { ...f.request, expectedFingerprint: (await f.get()).fingerprint });
  expect(second.attemptId).not.toBe(f.first.attemptId);
  expect(await f.t.run(ctx => ctx.db.get(f.result.ingestionId))).toMatchObject({ retirementAttempts: 2, retirementLeaseUntil: now + 2 * RETIREMENT_LEASE_MS, retirementAttemptId: second.attemptId });
  await expect(f.admin.mutation(finish, oldAttempt)).rejects.toThrow("STALE");
  await f.admin.mutation(internal.legacyMediaIngestion.retirement.fail, oldAttempt);
  expect((await f.t.run(ctx => ctx.db.get(f.result.ingestionId)))?.retirementAttemptId).toBe(second.attemptId);
  const newAttempt = { ingestionId: f.result.ingestionId, attemptId: second.attemptId! };
  if (provider === "r2") await f.admin.mutation(internal.legacyMediaIngestion.retirement.authorizeDeletion, newAttempt);
  expect((await f.admin.mutation(finish, newAttempt)).retirementStatus).toBe("retired");
  await expect(f.admin.mutation(finish, oldAttempt)).rejects.toThrow("STALE");
  expect((await f.run()).retirementStatus).toBe("retired");
  const history = await f.t.run(ctx => ctx.db.query("legacyMediaRetirementHistory").collect());
  expect(history.filter(row => row.action === "requested")).toHaveLength(2);
  expect(history.filter(row => row.action === "retired")).toHaveLength(1);
  expect(history.filter(row => row.action === "failed")).toHaveLength(0);
});
test("expired R2 retry rechecks provider metadata and a provider failure stays retryable", async () => {
  const f = await interruptRetirement(); vi.mocked(Date.now).mockReturnValue(now + RETIREMENT_LEASE_MS);
  vi.mocked(retireLegacyImageObject).mockRejectedValueOnce(new Error("changed ETag or provider failure"));
  expect((await f.run()).retirementStatus).toBe("failed");
  expect(retireLegacyImageObject).toHaveBeenCalledWith({ objectKey: f.key, etag: '"original"', size: png.length, contentType: "image/png" }, expect.any(Function));
  expect(await f.get()).toMatchObject({ ready: true, retryable: true, retirementStatus: "failed" });
  expect((await f.run()).retirementStatus).toBe("retired");
  expect((await f.t.run(ctx => ctx.db.get(f.result.ingestionId)))?.retirementAttempts).toBe(3);
  expect(retireLegacyImageObject).toHaveBeenCalledTimes(2);
  const history = await f.t.run(ctx => ctx.db.query("legacyMediaRetirementHistory").collect());
  expect(history.filter(row => row.action === "retired")).toHaveLength(1);
});
test("concurrent expired retries reserve one new attempt and run one provider operation", async () => {
  const f = await interruptRetirement(); vi.mocked(Date.now).mockReturnValue(now + RETIREMENT_LEASE_MS);
  const request = { ...f.request, expectedFingerprint: (await f.get()).fingerprint };
  const results = await Promise.all([1, 2].map(() => f.admin.action(retire, request)));
  expect(results.some(result => result.retirementStatus === "retired")).toBe(true);
  expect(retireLegacyImageObject).toHaveBeenCalledTimes(1);
  expect((await f.t.run(ctx => ctx.db.get(f.result.ingestionId)))?.retirementAttempts).toBe(2);
  expect((await f.t.run(ctx => ctx.db.query("legacyMediaRetirementHistory").collect())).filter(row => row.action === "retired")).toHaveLength(1);
});
test.each(["role", "copy", "source", "dependency", "pointer"] as const)("expired retry rechecks changed %s again immediately before deletion", async condition => {
  const f = await interruptRetirement(); vi.mocked(Date.now).mockReturnValue(now + RETIREMENT_LEASE_MS);
  let deleted = false;
  vi.mocked(retireLegacyImageObject).mockImplementationOnce(async (_source, authorize) => {
    await f.t.run(async ctx => {
      if (condition === "role") await ctx.db.patch(f.adminId, { accountType: "client" });
      if (condition === "copy") await ctx.storage.delete(f.image.storageId);
      if (condition === "source") await ctx.db.patch(f.companyId, { logoMediaId: undefined });
      if (condition === "dependency") await ctx.db.patch(f.companyId, { coverMediaId: f.mediaId });
      if (condition === "pointer") await ctx.db.patch(f.companyId, { approvedLogoImageId: undefined });
    });
    await authorize(); deleted = true;
  });
  expect((await f.run()).retirementStatus).toBe("failed"); expect(deleted).toBe(false);
});
test.each(["gate", "r2_gate", "role", "ingestion", "copy", "moderation", "source", "dependency", "pointer", "grant"] as const)("expired retry still blocks changed %s safety conditions", async condition => {
  const f = await interruptRetirement(); vi.mocked(Date.now).mockReturnValue(now + RETIREMENT_LEASE_MS);
  const fingerprint = (await f.get()).fingerprint;
  if (condition === "gate") vi.stubEnv("LEGACY_MEDIA_REVOCATION_ENABLED", "false");
  else if (condition === "r2_gate") vi.stubEnv("LEGACY_MEDIA_R2_CONDITIONAL_DELETE_VERIFIED", "false");
  else await f.t.run(async ctx => {
    if (condition === "role") await ctx.db.patch(f.adminId, { accountType: "client" });
    if (condition === "ingestion") await ctx.db.patch(f.result.ingestionId, { status: "failed" });
    if (condition === "copy") await ctx.storage.delete(f.image.storageId);
    if (condition === "moderation") await ctx.db.patch(f.image._id, { moderationStatus: "pending" });
    if (condition === "source") await ctx.db.patch(f.companyId, { logoMediaId: undefined });
    if (condition === "dependency") await ctx.db.patch(f.companyId, { coverMediaId: f.mediaId });
    if (condition === "pointer") await ctx.db.patch(f.companyId, { approvedLogoImageId: undefined });
    if (condition === "grant") await ctx.db.insert("publicMediaUploadIntents", { companyId: f.companyId, userId: f.ownerId, purpose: "companyLogo", expectedContentType: "image/png", expectedSize: png.length, objectKey: f.key, token: "live", expiresAt: Date.now() + 1000, createdAt: Date.now() });
  });
  await expect(f.admin.action(retire, { ...f.request, expectedFingerprint: fingerprint })).rejects.toThrow();
  expect(retireLegacyImageObject).not.toHaveBeenCalled();
  expect((await f.t.run(ctx => ctx.db.get(f.result.ingestionId)))?.retirementAttempts).toBe(1);
});
test("native already absent remains safe/idempotent only after preserved final state check", async () => {
  const f = await fixture("companyLogo", "convex"); await f.decision("approve"); await f.t.run(ctx => ctx.storage.delete(f.originalId));
  expect((await f.get()).ready).toBe(true); expect((await f.run()).retirementStatus).toBe("retired");
});
test("shared native and duplicate R2 provenance/dependencies fail closed", async () => {
  const f = await fixture("companyLogo", "convex"); await f.decision("approve");
  await f.t.run(ctx => ctx.db.insert("companies", { logoStorageId: f.originalId, onboardingStatus: "completed", verificationStatus: "draft", createdAt: 1, updatedAt: 1 }));
  expect((await f.get()).blockers).toContain("dependency_found"); await expect(f.run()).rejects.toThrow();
  const r2 = await fixture(); await r2.decision("approve");
  await r2.t.run(async ctx => { const media = (await ctx.db.get(r2.mediaId))!; const { _id, _creationTime, ...fields } = media; void _id; void _creationTime; await ctx.db.insert("publicMedia", fields); });
  expect((await r2.get()).blockers).toContain("dependency_ambiguous");
});
test("claimed-but-live upload grant blocks R2 retirement", async () => {
  const f = await fixture(); await f.decision("approve");
  await f.t.run(ctx => ctx.db.insert("publicMediaUploadIntents", { companyId: f.companyId, userId: f.ownerId, purpose: "companyLogo", expectedContentType: "image/png", expectedSize: png.length,
    objectKey: f.key, token: "old", expiresAt: now + 1, claimedAt: 1, createdAt: 1 }));
  expect((await f.get()).blockers).toContain("upload_grant_active"); await expect(f.run()).rejects.toThrow();
});
test("current moderated or verification file can never be original target", async () => {
  const f = await fixture("companyLogo", "convex"); await f.decision("approve");
  await f.t.run(ctx => ctx.db.insert("companyVerificationUploadIntents", { companyId: f.companyId, userId: f.ownerId, documentType: "other", contentType: "image/png", token: "verification", expiresAt: 1, storageId: f.originalId, createdAt: 1 }));
  expect((await f.get()).blockers).toContain("dependency_found"); await expect(f.run()).rejects.toThrow();
  const copy = await fixture("companyLogo", "convex"); await copy.decision("approve");
  await copy.t.run(ctx => ctx.db.insert("companyCoverImages", { companyId: copy.companyId, storageId: copy.originalId, contentType: "image/png", size: png.length, sha256: copy.image.sha256, uploadedBy: copy.ownerId, uploadedAt: 1, moderationStatus: "pending" }));
  expect((await copy.get()).blockers).toContain("dependency_found");
});
test("browser cannot supply operative URL/key/storage ID and list DTOs contain no private references", async () => {
  const f = await fixture(); await f.decision("approve");
  const args = { ingestionId: f.result.ingestionId, expectedFingerprint: (await f.get()).fingerprint, confirmation: "RETIRE" as const };
  await expect(f.admin.action(retire, { ...args, objectKey: "arbitrary" } as typeof args)).rejects.toThrow();
  const dto = await f.admin.query(api.legacyMediaIngestion.retirement.listRetirements, { paginationOpts: page });
  expect(JSON.stringify(dto)).not.toContain(f.key); expect(JSON.stringify(dto)).not.toContain(f.image.storageId);
  expect(JSON.stringify(await f.get())).not.toContain(f.image.storageId);
});

test.each(["message", "quote", "project", "verification"] as const)("native %s dependency prevents deletion even when the legacy field is otherwise valid", async kind => {
  const f = await fixture("companyLogo", "convex"); await f.decision("approve");
  await f.t.run(async ctx => {
    const projectId = await ctx.db.insert("projects", { clientId: f.ownerId, countryCode: "MA", surfaceUnknown: true, visibility: "marketplace", status: "draft", lastCompletedStep: 0, createdAt: 1, updatedAt: 1 });
    if (kind === "project") { await ctx.db.insert("projectAttachments", { projectId, clientId: f.ownerId, storageId: f.originalId, fileName: "legacy.pdf", contentType: "application/pdf", size: png.length, createdAt: 1 }); return; }
    if (kind === "verification") {
      const verificationId = await ctx.db.insert("companyVerifications", { companyId: f.companyId, legalName: "Atlas", ice: "ice", rcNumber: "rc", legalRepresentative: "Owner", phone: "phone", address: "address", submittedAt: 1, createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("companyVerificationDocuments", { verificationId, companyId: f.companyId, documentType: "other", storageId: f.originalId, fileName: "file", contentType: "image/png", size: png.length, createdAt: 1, updatedAt: 1 }); return;
    }
    const conversationId = await ctx.db.insert("conversations", { projectId, clientId: f.ownerId, companyId: f.companyId, status: "active", createdBy: f.ownerId, createdAt: 1, updatedAt: 1 });
    if (kind === "message") {
      const messageId = await ctx.db.insert("messages", { conversationId, senderUserId: f.ownerId, senderType: "company", body: "PDF", createdAt: 1 });
      await ctx.db.insert("messageAttachments", { conversationId, messageId, storageId: f.originalId, uploadedByUserId: f.ownerId, kind: "pdf", originalFileName: "file.pdf", mimeType: "application/pdf", sizeBytes: png.length, createdAt: 1 }); return;
    }
    const initialQuoteId = await ctx.db.insert("projectQuotes", { projectId, companyId: f.companyId, submittedByUserId: f.ownerId, message: "Quote", estimatedPrice: 100, currency: "MAD", estimatedDuration: 1, availableStartDate: "2026-10-06", scope: "Work", quoteType: "initial", status: "submitted", createdAt: 1, updatedAt: 1, submittedAt: 1 });
    const finalQuoteId = await ctx.db.insert("finalQuotes", { projectId, companyId: f.companyId, clientId: f.ownerId, initialQuoteId, conversationId, status: "draft", requestedAt: 1, requestedByUserId: f.ownerId, requestTrigger: "client_request", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("finalQuoteRevisions", { finalQuoteId, revisionNumber: 1, price: 100, currency: "MAD", duration: 1, plannedStartDate: "2026-10-06", validUntil: "2026-11-06", scope: "Work", inclusions: "Work", exclusions: "None", paymentTerms: "Later", pdfStorageId: f.originalId, submittedByUserId: f.ownerId, submittedAt: 1, createdAt: 1 });
  });
  expect((await f.get()).blockers).toContain("dependency_found"); await expect(f.run()).rejects.toThrow();
  expect(await f.t.run(async ctx => !!(await ctx.storage.get(f.originalId)))).toBe(true);
});
test.each(["project", "avatar", "seo", "cover_alias", "provenance"] as const)("R2 %s alias/dependency fails closed", async kind => {
  const f = await fixture(); await f.decision("approve");
  await f.t.run(async ctx => {
    if (kind === "cover_alias") { await ctx.db.patch(f.companyId, { coverMediaId: f.mediaId }); return; }
    if (kind === "provenance") { const record = (await ctx.db.get(f.result.ingestionId))!; const { _id, _creationTime, ...fields } = record; void _id; void _creationTime; await ctx.db.insert("legacyMediaIngestions", { ...fields, sourceKey: "another-target" }); return; }
    if (kind === "avatar") { await ctx.db.insert("clientProfiles", { userId: f.ownerId, avatarObjectKey: f.key, onboardingStatus: "completed", createdAt: 1, updatedAt: 1 }); return; }
    if (kind === "seo") { await ctx.db.insert("seoMedia", { objectKey: f.key, filename: "legacy.png", mimeType: "image/png", size: png.length, uploadedBy: f.ownerId, status: "archived", createdAt: 1, updatedAt: 1 }); return; }
    const projectId = await ctx.db.insert("projects", { clientId: f.ownerId, countryCode: "MA", surfaceUnknown: true, visibility: "marketplace", status: "draft", lastCompletedStep: 0, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("projectMedia", { projectId, clientId: f.ownerId, storageProvider: "r2", objectKey: f.key, mimeType: "image/png", size: png.length, sortOrder: 0, createdAt: 1 });
  });
  expect((await f.get()).ready).toBe(false); await expect(f.run()).rejects.toThrow(); expect(retireLegacyImageObject).not.toHaveBeenCalled();
});
