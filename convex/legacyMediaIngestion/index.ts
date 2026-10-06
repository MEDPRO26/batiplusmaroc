import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, query } from "../_generated/server";
import { requireAdminUser } from "../admin/access";
import { createPendingLogo } from "../companyLogos/index";
import { createPendingCover } from "../companyCovers/index";
import { createPendingPortfolioImage } from "../portfolioImages/index";
import { validatePublicImageInput } from "../storage/constants";
import { assertNotVerificationStorage } from "../storage/verificationPrivacy";
import { INGESTION_LEASE_MS, mediaTypeValidator, providerValidator, requestValidator, resultValidator, sourceValidator } from "./constants";
import { imagePurpose, resolveSource, resultDto, storageHashMatches } from "./model";

const candidateValidator = requestValidator.extend({
  companyName: v.union(v.string(), v.null()), projectTitle: v.union(v.string(), v.null()), order: v.union(v.number(), v.null()),
  state: v.union(resultValidator, v.null()), hasModeratedState: v.boolean(), retryable: v.boolean(),
});
function validatePageSize(size: number) {
  if (!Number.isInteger(size) || size < 1 || size > 20) throw new ConvexError("INVALID_PAGINATION");
}
function sameTarget(record: Doc<"legacyMediaIngestions">, target: typeof requestValidator.type) {
  return record.companyId === target.companyId && record.mediaType === target.mediaType && record.provider === target.provider &&
    record.portfolioProjectId === target.portfolioProjectId && record.gallerySlotId === target.gallerySlotId;
}

/** Bounded source-table pages; some pages can contain no legacy fields. No bytes/URLs are read. */
export const listCandidates = query({
  args: { mediaType: mediaTypeValidator, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(candidateValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    validatePageSize(args.paginationOpts.numItems);
    const page = args.mediaType === "companyLogo" || args.mediaType === "companyCover"
      ? await ctx.db.query("companies").withIndex("by_updatedAt").order("desc").paginate(args.paginationOpts)
      : args.mediaType === "portfolioCover"
        ? await ctx.db.query("portfolioProjects").withIndex("by_companyId").paginate(args.paginationOpts)
        : await ctx.db.query("portfolioMedia").withIndex("by_portfolioProjectId").paginate(args.paginationOpts);
    const candidates: (typeof candidateValidator.type)[] = [];
    for (const row of page.page) {
      const project = "portfolioProjectId" in row ? await ctx.db.get(row.portfolioProjectId) : "title" in row ? row : null;
      const companyId = "onboardingStatus" in row ? row._id : "companyId" in row ? row.companyId : project?.companyId;
      if (!companyId) continue;
      for (const provider of ["r2", "convex"] as const) {
        const target = { mediaType: args.mediaType, provider, companyId,
          portfolioProjectId: project?._id, gallerySlotId: "sortOrder" in row ? row._id : undefined };
        let resolved;
        try { resolved = await resolveSource(ctx, target); }
        catch (error) {
          // Missing or malformed legacy associations are not permitted ingestion sources.
          if (error instanceof ConvexError) continue;
          throw error;
        }
        const record = await ctx.db.query("legacyMediaIngestions").withIndex("by_sourceKey", q => q.eq("sourceKey", resolved.sourceKey)).unique();
        candidates.push({ ...target, sourceKey: resolved.sourceKey,
          companyName: resolved.company.name ?? null, projectTitle: resolved.project?.title ?? null, order: resolved.slot?.sortOrder ?? null,
          state: record ? resultDto(record) : null, hasModeratedState: resolved.conflict,
          retryable: !!record && (record.status === "failed" || (record.status === "processing" && record.leaseUntil <= Date.now())),
        });
      }
    }
    return { ...page, page: candidates };
  },
});

/** Admin-only provenance inspection, with private original references omitted. */
export const listState = query({
  args: { companyId: v.id("companies"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(resultValidator.extend({ mediaType: mediaTypeValidator, provider: providerValidator, updatedAt: v.number() })),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx); validatePageSize(args.paginationOpts.numItems);
    const page = await ctx.db.query("legacyMediaIngestions").withIndex("by_companyId_and_updatedAt", q => q.eq("companyId", args.companyId)).order("desc").paginate(args.paginationOpts);
    return { ...page, page: page.page.map(row => ({ ...resultDto(row), mediaType: row.mediaType, provider: row.provider, updatedAt: row.updatedAt })) };
  },
});

/** Atomic reservation makes concurrent/repeated actions share a single source/target record. */
export const begin = internalMutation({
  args: requestValidator.fields,
  returns: v.object({ result: resultValidator, attemptId: v.union(v.string(), v.null()), source: v.union(sourceValidator, v.null()) }),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const existing = await ctx.db.query("legacyMediaIngestions").withIndex("by_sourceKey", q => q.eq("sourceKey", args.sourceKey)).unique();
    if (existing && !sameTarget(existing, args)) throw new ConvexError("LEGACY_MEDIA_SOURCE_UNAVAILABLE");
    const now = Date.now();
    if (existing && (existing.status === "ingested" || existing.status === "conflict" || (existing.status === "processing" && existing.leaseUntil > now))) {
      return { result: resultDto(existing), attemptId: null, source: null };
    }
    const resolved = await resolveSource(ctx, args);
    if (args.sourceKey !== resolved.sourceKey) throw new ConvexError("LEGACY_MEDIA_SOURCE_UNAVAILABLE");
    const attemptId = crypto.randomUUID();
    const fields = { status: resolved.conflict ? "conflict" as const : "processing" as const, attemptId,
      leaseUntil: now + INGESTION_LEASE_MS, attemptedBy: admin._id, updatedAt: now, failureCode: undefined };
    const id = existing?._id ?? await ctx.db.insert("legacyMediaIngestions", {
      ...fields, sourceKey: resolved.sourceKey, sourceRef: resolved.source.sourceRef, sourceRecordId: resolved.source.sourceRecordId,
      mediaType: args.mediaType, provider: args.provider, companyId: args.companyId, portfolioProjectId: args.portfolioProjectId,
      gallerySlotId: args.gallerySlotId, attempts: 1, createdBy: admin._id, createdAt: now,
    });
    if (existing) await ctx.db.patch(id, { ...fields, attempts: existing.attempts + 1 });
    const record = (await ctx.db.get(id))!;
    return { result: resultDto(record), attemptId: resolved.conflict ? null : attemptId, source: resolved.conflict ? null : resolved.source };
  },
});

/** One transaction commits immutable pending image/history, provenance and safe submitted pointer. */
export const finish = internalMutation({
  args: { ingestionId: v.id("legacyMediaIngestions"), attemptId: v.string(), storageId: v.id("_storage"),
    contentType: v.union(v.literal("image/jpeg"), v.literal("image/png"), v.literal("image/webp")), size: v.number(), sha256: v.string(), sourceEtag: v.optional(v.string()) },
  returns: resultValidator,
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const record = await ctx.db.get(args.ingestionId);
    if (!record) throw new ConvexError("LEGACY_MEDIA_SOURCE_UNAVAILABLE");
    if (record.status === "ingested" || record.status === "conflict") return resultDto(record);
    if (record.status !== "processing" || record.attemptId !== args.attemptId || record.attemptedBy !== admin._id || record.leaseUntil <= Date.now()) {
      throw new ConvexError("LEGACY_MEDIA_STALE_ATTEMPT");
    }
    if (record.provider === "convex" && record.sourceRef === args.storageId) throw new ConvexError("LEGACY_MEDIA_INVALID_COPY");
    await assertNotVerificationStorage(ctx, args.storageId);
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata || metadata.size !== args.size || !storageHashMatches(metadata.sha256, args.sha256) ||
      (metadata.contentType !== undefined && metadata.contentType !== args.contentType) || !validatePublicImageInput(imagePurpose(record.mediaType), args.contentType, args.size)) {
      throw new ConvexError("LEGACY_MEDIA_INVALID_COPY");
    }
    let resolved = null;
    try { resolved = await resolveSource(ctx, record); }
    catch (error) { if (!(error instanceof ConvexError)) throw error; }
    const conflict = !resolved || resolved.sourceKey !== record.sourceKey || resolved.conflict;
    const now = Date.now();
    const file = { companyId: record.companyId, storageId: args.storageId, contentType: args.contentType,
      size: metadata.size, sha256: metadata.sha256, uploadedBy: admin._id };
    const imageId = record.mediaType === "companyLogo" ? await createPendingLogo(ctx, file, now)
      : record.mediaType === "companyCover" ? await createPendingCover(ctx, file, now)
        : await createPendingPortfolioImage(ctx, { ...file, portfolioProjectId: record.portfolioProjectId!,
          purpose: record.mediaType === "portfolioCover" ? "cover" : "gallery", gallerySlotId: record.gallerySlotId }, now);
    if (!conflict) {
      if (record.mediaType === "companyLogo") await ctx.db.patch(record.companyId, { submittedLogoImageId: imageId as Doc<"companyLogoImages">["_id"], updatedAt: now });
      else if (record.mediaType === "companyCover") await ctx.db.patch(record.companyId, { submittedCoverImageId: imageId as Doc<"companyCoverImages">["_id"], updatedAt: now });
      else await ctx.db.patch(record.gallerySlotId ?? record.portfolioProjectId!, { submittedImageId: imageId as Doc<"portfolioImages">["_id"] });
    }
    await ctx.db.patch(record._id, { status: conflict ? "conflict" : "ingested", imageId, sha256: args.sha256,
      contentType: args.contentType, size: metadata.size, sourceEtag: args.sourceEtag, completedAt: now, updatedAt: now });
    return resultDto((await ctx.db.get(record._id))!);
  },
});

export const fail = internalMutation({
  args: { ingestionId: v.id("legacyMediaIngestions"), attemptId: v.string() }, returns: resultValidator,
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.ingestionId);
    if (!record) throw new ConvexError("LEGACY_MEDIA_SOURCE_UNAVAILABLE");
    if (record.status === "processing" && record.attemptId === args.attemptId) await ctx.db.patch(record._id, {
      status: "failed", failureCode: "COPY_FAILED", updatedAt: Date.now(),
    });
    return resultDto((await ctx.db.get(record._id))!);
  },
});

/** Only new unbound copies may be removed, including after an uncertain successful commit. */
export const cleanupCopy = internalMutation({
  args: { ingestionId: v.id("legacyMediaIngestions"), storageId: v.id("_storage") }, returns: v.null(),
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.ingestionId);
    if (!record || record.sourceRef === args.storageId) return null;
    try { await assertNotVerificationStorage(ctx, args.storageId); }
    catch (error) { if (error instanceof ConvexError && String(error.data).startsWith("PRIVATE_")) return null; throw error; }
    await ctx.storage.delete(args.storageId);
    return null;
  },
});

export const scheduleCleanup = internalMutation({
  args: { ingestionId: v.id("legacyMediaIngestions"), storageId: v.id("_storage") }, returns: v.null(),
  handler: async (ctx, args) => { await ctx.scheduler.runAfter(1_000, internal.legacyMediaIngestion.index.cleanupCopy, args); return null; },
});
