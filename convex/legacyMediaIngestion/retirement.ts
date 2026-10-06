import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, query, type MutationCtx } from "../_generated/server";
import { requireAdminUser } from "../admin/access";
import { ingestionStatusValidator, mediaTypeValidator, providerValidator } from "./constants";
import { readinessValidator, retirementRequestValidator, retirementResultValidator, retirementStatusValidator, RETIREMENT_LEASE_MS } from "./retirementConstants";
import { assertRevocationEnabled, evaluateRetirement, hasActiveRetirementLease, originalStorageId, retirementResult } from "./retirementModel";

function validatePage(size: number) {
  if (!Number.isInteger(size) || size < 1 || size > 20) throw new ConvexError("INVALID_PAGINATION");
}
export const getReadiness = query({
  args: { ingestionId: v.id("legacyMediaIngestions"), checkedAt: v.number() }, returns: readinessValidator,
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    // A display-time hint refreshes cached queries. Destructive mutations use server time only.
    if (!Number.isSafeInteger(args.checkedAt) || args.checkedAt < 0) throw new ConvexError("INVALID_CHECK_TIME");
    const record = await ctx.db.get(args.ingestionId);
    if (!record) throw new ConvexError("LEGACY_MEDIA_SOURCE_UNAVAILABLE");
    return await evaluateRetirement(ctx, record, args.checkedAt);
  },
});

/** Provenance stays visible after the original native source has gone. Metadata only. */
export const listRetirements = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({
    ingestionId: v.id("legacyMediaIngestions"), companyName: v.union(v.string(), v.null()), projectTitle: v.union(v.string(), v.null()),
    companyId: v.id("companies"), mediaType: mediaTypeValidator, provider: providerValidator,
    ingestionStatus: ingestionStatusValidator, moderationStatus: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.null()),
    retirementStatus: retirementStatusValidator, cacheVerificationRequired: v.boolean(),
  })),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx); validatePage(args.paginationOpts.numItems);
    const page = await ctx.db.query("legacyMediaIngestions").withIndex("by_companyId_and_updatedAt").paginate(args.paginationOpts);
    return { ...page, page: await Promise.all(page.page.map(async record => {
      const [company, project, image] = await Promise.all([ctx.db.get(record.companyId),
        record.portfolioProjectId ? ctx.db.get(record.portfolioProjectId) : null, record.imageId ? ctx.db.get(record.imageId) : null]);
      return { ingestionId: record._id, companyId: record.companyId, companyName: company?.name ?? null, projectTitle: project?.title ?? null,
        mediaType: record.mediaType, provider: record.provider, ingestionStatus: record.status, moderationStatus: image?.moderationStatus ?? null,
        retirementStatus: record.retirementStatus ?? "not_ready" as const, cacheVerificationRequired: record.cacheVerification === "verification_required" };
    })) };
  },
});
export const getHistory = query({
  args: { ingestionId: v.id("legacyMediaIngestions"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ historyId: v.id("legacyMediaRetirementHistory"), action: v.union(v.literal("requested"), v.literal("retired"), v.literal("failed")), changedAt: v.number() })),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx); validatePage(args.paginationOpts.numItems);
    const page = await ctx.db.query("legacyMediaRetirementHistory").withIndex("by_ingestionId_and_changedAt", q => q.eq("ingestionId", args.ingestionId)).order("desc").paginate(args.paginationOpts);
    return { ...page, page: page.page.map(row => ({ historyId: row._id, action: row.action, changedAt: row.changedAt })) };
  },
});

const sourceValidator = v.object({ provider: providerValidator, sourceRef: v.string(), sourceEtag: v.optional(v.string()), size: v.number(), contentType: v.string() });
export const reserve = internalMutation({
  args: retirementRequestValidator.fields,
  returns: v.object({ result: retirementResultValidator, attemptId: v.union(v.string(), v.null()), source: v.union(sourceValidator, v.null()) }),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const record = await ctx.db.get(args.ingestionId);
    if (!record) throw new ConvexError("LEGACY_MEDIA_SOURCE_UNAVAILABLE");
    if (record.retirementStatus === "retired") return { result: retirementResult(record), attemptId: null, source: null };
    assertRevocationEnabled(record.provider);
    const now = Date.now();
    if (hasActiveRetirementLease(record, now)) {
      return { result: retirementResult(record), attemptId: null, source: null };
    }
    const readiness = await evaluateRetirement(ctx, record, now);
    if (readiness.blockers.length) throw new ConvexError("LEGACY_MEDIA_RETIREMENT_NOT_READY");
    if (readiness.fingerprint !== args.expectedFingerprint) throw new ConvexError("LEGACY_MEDIA_RETIREMENT_STALE");
    const attemptId = crypto.randomUUID();
    await ctx.db.patch(record._id, { retirementStatus: "retiring", retirementAttemptId: attemptId,
      retirementLeaseUntil: now + RETIREMENT_LEASE_MS, retirementAttempts: (record.retirementAttempts ?? 0) + 1,
      retirementAttemptedBy: admin._id, retirementFingerprint: readiness.fingerprint, retirementErrorCode: undefined,
      retirementUrls: readiness.knownUrls });
    await ctx.db.insert("legacyMediaRetirementHistory", { ingestionId: record._id, sourceKey: record.sourceKey,
      recoveryImageId: record.imageId!, attemptId, action: "requested", changedBy: admin._id, changedAt: now });
    return { result: retirementResult((await ctx.db.get(record._id))!), attemptId,
      source: { provider: record.provider, sourceRef: record.sourceRef, sourceEtag: record.sourceEtag, size: record.size!, contentType: record.contentType! } };
  },
});

const attemptValidator = v.object({ ingestionId: v.id("legacyMediaIngestions"), attemptId: v.string() });
async function checkAttempt(ctx: MutationCtx, args: typeof attemptValidator.type) {
  const admin = await requireAdminUser(ctx);
  const record = await ctx.db.get(args.ingestionId);
  const now = Date.now();
  if (!record || record.retirementStatus !== "retiring" || record.retirementAttemptId !== args.attemptId ||
    record.retirementAttemptedBy !== admin._id || record.retirementLeaseUntil === undefined ||
    !Number.isFinite(record.retirementLeaseUntil) || !hasActiveRetirementLease(record, now)) throw new ConvexError("LEGACY_MEDIA_RETIREMENT_STALE");
  assertRevocationEnabled(record.provider);
  const readiness = await evaluateRetirement(ctx, record, now);
  if (readiness.blockers.length || readiness.fingerprint !== record.retirementFingerprint) throw new ConvexError("LEGACY_MEDIA_RETIREMENT_STALE");
  return record;
}
export const authorizeDeletion = internalMutation({
  args: attemptValidator.fields, returns: v.null(),
  handler: async (ctx, args) => { await checkAttempt(ctx, args); return null; },
});
async function recordSuccess(ctx: MutationCtx, record: Doc<"legacyMediaIngestions">) {
  const now = Date.now();
  await ctx.db.patch(record._id, { retirementStatus: "retired", retiredBy: record.retirementAttemptedBy,
    retiredAt: now, retirementErrorCode: undefined, cacheVerification: "verification_required" });
  await ctx.db.insert("legacyMediaRetirementHistory", { ingestionId: record._id, sourceKey: record.sourceKey,
    recoveryImageId: record.imageId!, attemptId: record.retirementAttemptId!, action: "retired", changedBy: record.retirementAttemptedBy!, changedAt: now });
  return retirementResult((await ctx.db.get(record._id))!);
}
/** Native deletion, dependency recheck and audit commit share the guarded mutation. */
export const retireNative = internalMutation({
  args: attemptValidator.fields, returns: retirementResultValidator,
  handler: async (ctx, args) => {
    const record = await checkAttempt(ctx, args);
    const id = originalStorageId(ctx, record);
    if (await ctx.db.system.get("_storage", id)) await ctx.storage.delete(id);
    return await recordSuccess(ctx, record);
  },
});
/** Only the action that confirmed R2 origin absence records success; no browser/provider data accepted. */
export const finishR2 = internalMutation({
  args: attemptValidator.fields, returns: retirementResultValidator,
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const record = await ctx.db.get(args.ingestionId);
    if (!record || record.provider !== "r2" || record.retirementAttemptId !== args.attemptId || record.retirementAttemptedBy !== admin._id) throw new ConvexError("LEGACY_MEDIA_RETIREMENT_STALE");
    if (record.retirementStatus === "retired") return retirementResult(record);
    if (record.retirementLeaseUntil === undefined || !Number.isFinite(record.retirementLeaseUntil) ||
      !hasActiveRetirementLease(record, Date.now())) throw new ConvexError("LEGACY_MEDIA_RETIREMENT_STALE");
    // Origin IO is not a DB transaction. Preserve its confirmed outcome even if later pointers changed.
    // authorizeDeletion already reauthorized/rechecked immediately before the conditional provider call.
    return await recordSuccess(ctx, record);
  },
});
export const fail = internalMutation({
  args: attemptValidator.fields, returns: retirementResultValidator,
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.ingestionId);
    if (!record) throw new ConvexError("LEGACY_MEDIA_SOURCE_UNAVAILABLE");
    if (record.retirementStatus === "retiring" && record.retirementAttemptId === args.attemptId) {
      await ctx.db.patch(record._id, { retirementStatus: "failed", retirementErrorCode: "RETIREMENT_FAILED" });
      await ctx.db.insert("legacyMediaRetirementHistory", { ingestionId: record._id, sourceKey: record.sourceKey, recoveryImageId: record.imageId!,
        attemptId: args.attemptId, action: "failed", changedBy: record.retirementAttemptedBy!, changedAt: Date.now(), errorCode: "RETIREMENT_FAILED" });
    }
    return retirementResult((await ctx.db.get(record._id))!);
  },
});
