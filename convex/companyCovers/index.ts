import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { hasPublicCompanyProfile } from "../companyLogos/model";
import { requireAdminUser } from "../admin/access";
import { requireOwnerCompany } from "../companies/index";
import { validatePublicImageInput } from "../storage/constants";
import { COVER_UPLOAD_TTL_MS, coverContentTypeValidator, coverStatusValidator } from "./constants";
import { assertCoverFile, coverDto, coverHttpUrl } from "./model";

const imageDtoValidator = v.object({
  imageId: v.id("companyCoverImages"), companyId: v.id("companies"),
  contentType: coverContentTypeValidator, size: v.number(), sha256: v.string(),
  uploadedBy: v.id("users"), uploadedAt: v.number(), moderationStatus: coverStatusValidator,
  reason: v.union(v.string(), v.null()), previewUrl: v.string(),
});
const fileDescriptorValidator = v.object({
  storageId: v.id("_storage"), contentType: coverContentTypeValidator, size: v.number(), sha256: v.string(),
});
export type CoverFileDescriptor = {
  storageId: Id<"_storage">; contentType: Doc<"companyCoverImages">["contentType"]; size: number; sha256: string;
};

function validatePageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > 100) throw new ConvexError("INVALID_PAGINATION");
}

async function ownedUploadIntent(ctx: QueryCtx | MutationCtx, uploadToken: string, now: number) {
  const { company, userId } = await requireOwnerCompany(ctx);
  const intent = await ctx.db.query("companyCoverUploadIntents")
    .withIndex("by_token", q => q.eq("token", uploadToken)).unique();
  if (!intent || intent.userId !== userId || intent.companyId !== company._id ||
      intent.claimedAt !== undefined || intent.imageId !== undefined || intent.expiresAt <= now) {
    throw new ConvexError("INVALID_COMPANY_COVER_UPLOAD");
  }
  return { intent, company, userId };
}

/** Usable before onboarding; Company verification is deliberately irrelevant. */
export const generateUploadIntent = mutation({
  args: { contentType: coverContentTypeValidator, size: v.number() },
  returns: v.object({ uploadUrl: v.string(), uploadToken: v.string() }),
  handler: async (ctx, args) => {
    const { company, userId } = await requireOwnerCompany(ctx);
    if (!validatePublicImageInput("companyCover", args.contentType, args.size)) throw new ConvexError("INVALID_COMPANY_COVER_UPLOAD");
    const now = Date.now();
    const uploadToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    await ctx.db.insert("companyCoverUploadIntents", {
      companyId: company._id, userId, token: uploadToken,
      expectedContentType: args.contentType, expectedSize: args.size,
      expiresAt: now + COVER_UPLOAD_TTL_MS, createdAt: now,
    });
    return { uploadUrl: coverHttpUrl("upload"), uploadToken };
  },
});

export const authorizeUpload = internalQuery({
  args: { uploadToken: v.string(), now: v.number() },
  returns: v.object({ contentType: coverContentTypeValidator, size: v.number() }),
  handler: async (ctx, args) => {
    const { intent } = await ownedUploadIntent(ctx, args.uploadToken, args.now);
    return { contentType: intent.expectedContentType, size: intent.expectedSize };
  },
});

/** Only the HTTP handler that received and validated these bytes can bind a storage ID. */
export const bindUpload = internalMutation({
  args: { uploadToken: v.string(), storageId: v.id("_storage"), contentType: coverContentTypeValidator, size: v.number() },
  returns: v.id("companyCoverImages"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { intent, company, userId } = await ownedUploadIntent(ctx, args.uploadToken, now);
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata || metadata.size !== args.size || (metadata.contentType !== undefined && metadata.contentType !== args.contentType) ||
        args.size !== intent.expectedSize || args.contentType !== intent.expectedContentType ||
        !validatePublicImageInput("companyCover", args.contentType, args.size)) throw new ConvexError("INVALID_COMPANY_COVER_UPLOAD");
    const referenced = await ctx.db.query("companyCoverImages").withIndex("by_storageId", q => q.eq("storageId", args.storageId)).first();
    if (referenced) throw new ConvexError("INVALID_COMPANY_COVER_UPLOAD");
    const imageId = await ctx.db.insert("companyCoverImages", {
      companyId: company._id, storageId: args.storageId, contentType: args.contentType,
      size: metadata.size, sha256: metadata.sha256, uploadedBy: userId, uploadedAt: now,
      moderationStatus: "pending",
    });
    await ctx.db.patch(intent._id, { claimedAt: now, imageId });
    await ctx.db.patch(company._id, { submittedCoverImageId: imageId, updatedAt: now });
    await ctx.db.insert("companyCoverModerationHistory", {
      companyId: company._id, imageId, action: "uploaded", oldStatus: null, newStatus: "pending", changedBy: userId, changedAt: now,
    });
    return imageId;
  },
});

/** An uncertain bind outcome must never delete a successfully committed image. */
export const cleanupFailedUpload = internalMutation({
  args: { storageId: v.id("_storage") }, returns: v.null(),
  handler: async (ctx, args) => {
    const referenced = await ctx.db.query("companyCoverImages").withIndex("by_storageId", q => q.eq("storageId", args.storageId)).first();
    if (!referenced) await ctx.storage.delete(args.storageId);
    return null;
  },
});

async function requirePrivateImage(ctx: QueryCtx, imageId: Id<"companyCoverImages">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("COMPANY_COVER_NOT_FOUND");
  const user = await ctx.db.get(userId);
  if (user?.accountType === "admin") await requireAdminUser(ctx);
  else {
    const { company } = await requireOwnerCompany(ctx);
    const image = await ctx.db.get(imageId);
    if (!image || image.companyId !== company._id) throw new ConvexError("COMPANY_COVER_NOT_FOUND");
  }
  const image = await ctx.db.get(imageId);
  if (!image || !(await ctx.db.get(image.companyId))) throw new ConvexError("COMPANY_COVER_NOT_FOUND");
  return image;
}

function fileDescriptor(image: Doc<"companyCoverImages">): CoverFileDescriptor {
  return { storageId: image.storageId, contentType: image.contentType, size: image.size, sha256: image.sha256 };
}

export const authorizePrivatePreview = internalQuery({
  args: { imageId: v.id("companyCoverImages") }, returns: fileDescriptorValidator,
  handler: async (ctx, args) => {
    const image = await requirePrivateImage(ctx, args.imageId);
    await assertCoverFile(ctx, image);
    return fileDescriptor(image);
  },
});

export const authorizePublicCover = internalQuery({
  args: { imageId: v.id("companyCoverImages") }, returns: fileDescriptorValidator,
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    const company = image ? await ctx.db.get(image.companyId) : null;
    if (!image || image.moderationStatus !== "approved" || !company ||
        company.approvedCoverImageId !== image._id || !hasPublicCompanyProfile(company)) throw new ConvexError("COMPANY_COVER_NOT_FOUND");
    await assertCoverFile(ctx, image);
    return fileDescriptor(image);
  },
});

export const getMyCovers = query({
  args: {},
  returns: v.object({ submitted: v.union(imageDtoValidator, v.null()), approved: v.union(imageDtoValidator, v.null()) }),
  handler: async ctx => {
    const { company } = await requireOwnerCompany(ctx);
    const submitted = company.submittedCoverImageId ? await ctx.db.get(company.submittedCoverImageId) : null;
    const approved = company.approvedCoverImageId ? await ctx.db.get(company.approvedCoverImageId) : null;
    return {
      submitted: submitted?.companyId === company._id ? coverDto(submitted) : null,
      approved: approved?.companyId === company._id && approved.moderationStatus === "approved" ? coverDto(approved) : null,
    };
  },
});

/** Includes hidden/superseded images so the owner can still see their reasons. */
export const listMyCovers = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(imageDtoValidator),
  handler: async (ctx, args) => {
    const { company } = await requireOwnerCompany(ctx);
    validatePageSize(args.paginationOpts.numItems);
    const page = await ctx.db.query("companyCoverImages")
      .withIndex("by_companyId_and_uploadedAt", q => q.eq("companyId", company._id)).order("desc").paginate(args.paginationOpts);
    return { ...page, page: page.page.map(coverDto) };
  },
});

export const getAdminReview = query({
  args: { imageId: v.id("companyCoverImages") },
  returns: v.object({
    image: imageDtoValidator, isCurrentSubmission: v.boolean(), isCurrentApproved: v.boolean(),
    company: v.object({ companyId: v.id("companies"), name: v.union(v.string(), v.null()), legalName: v.union(v.string(), v.null()) }),
    currentSubmissionId: v.union(v.id("companyCoverImages"), v.null()),
    approved: v.union(imageDtoValidator, v.null()),
  }),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const image = await requirePrivateImage(ctx, args.imageId);
    const company = await ctx.db.get(image.companyId);
    if (!company) throw new ConvexError("COMPANY_COVER_NOT_FOUND");
    const approved = company.approvedCoverImageId ? await ctx.db.get(company.approvedCoverImageId) : null;
    return {
      image: coverDto(image), isCurrentSubmission: company.submittedCoverImageId === image._id, isCurrentApproved: company.approvedCoverImageId === image._id,
      company: { companyId: company._id, name: company.name ?? null, legalName: company.legalName ?? null },
      currentSubmissionId: company.submittedCoverImageId ?? null,
      approved: approved?.companyId === company._id && approved.moderationStatus === "approved" ? coverDto(approved) : null,
    };
  },
});

export const listAdminCovers = query({
  args: { status: coverStatusValidator, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(imageDtoValidator.extend({ companyName: v.union(v.string(), v.null()), isCurrentSubmission: v.boolean() })),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    validatePageSize(args.paginationOpts.numItems);
    const page = await ctx.db.query("companyCoverImages")
      .withIndex("by_moderationStatus_and_uploadedAt", q => q.eq("moderationStatus", args.status))
      .order("desc").paginate(args.paginationOpts);
    return { ...page, page: await Promise.all(page.page.map(async image => {
      const company = await ctx.db.get(image.companyId);
      return { ...coverDto(image), companyName: company?.name ?? company?.legalName ?? null, isCurrentSubmission: company?.submittedCoverImageId === image._id };
    })) };
  },
});

export const getHistory = query({
  args: { imageId: v.id("companyCoverImages"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({
    historyId: v.id("companyCoverModerationHistory"), action: v.union(v.literal("uploaded"), v.literal("approved"), v.literal("rejected"), v.literal("hidden")),
    oldStatus: v.union(coverStatusValidator, v.null()), newStatus: coverStatusValidator,
    changedBy: v.id("users"), changedAt: v.number(), reason: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    await requirePrivateImage(ctx, args.imageId);
    validatePageSize(args.paginationOpts.numItems);
    const page = await ctx.db.query("companyCoverModerationHistory")
      .withIndex("by_imageId_and_changedAt", q => q.eq("imageId", args.imageId)).order("desc").paginate(args.paginationOpts);
    return { ...page, page: page.page.map(row => ({
      historyId: row._id, action: row.action, oldStatus: row.oldStatus, newStatus: row.newStatus,
      changedBy: row.changedBy, changedAt: row.changedAt, reason: row.reason ?? null,
    })) };
  },
});

async function moderate(ctx: MutationCtx, args: { imageId: Id<"companyCoverImages">; expectedSha256: string; reason?: string }, action: "approved" | "rejected" | "hidden") {
  const admin = await requireAdminUser(ctx);
  const image = await ctx.db.get(args.imageId);
  const company = image ? await ctx.db.get(image.companyId) : null;
  const hiding = action === "hidden";
  if (!image || !company || image.sha256 !== args.expectedSha256 ||
      image.moderationStatus !== (hiding ? "approved" : "pending") ||
      (hiding ? company.approvedCoverImageId : company.submittedCoverImageId) !== image._id) throw new ConvexError("COMPANY_COVER_REVIEW_STALE");
  const reason = args.reason?.trim().replace(/\s+/g, " ");
  if (action !== "approved" && (!reason || reason.length < 3 || reason.length > 500)) throw new ConvexError("REJECTION_REASON_REQUIRED");
  await assertCoverFile(ctx, image);
  const now = Date.now();
  const newStatus = action === "approved" ? "approved" as const : "rejected" as const;
  await ctx.db.patch(image._id, { moderationStatus: newStatus, moderationReason: reason, moderatedBy: admin._id, moderatedAt: now });
  if (action === "approved" || hiding) await ctx.db.patch(company._id, { approvedCoverImageId: hiding ? undefined : image._id, updatedAt: now });
  await ctx.db.insert("companyCoverModerationHistory", {
    companyId: company._id, imageId: image._id, action, oldStatus: image.moderationStatus, newStatus,
    changedBy: admin._id, changedAt: now, reason,
  });
  return null;
}

const reviewArgs = { imageId: v.id("companyCoverImages"), expectedSha256: v.string() };
export const approve = mutation({ args: reviewArgs, returns: v.null(), handler: async (ctx, args) => await moderate(ctx, args, "approved") });
export const reject = mutation({ args: { ...reviewArgs, reason: v.string() }, returns: v.null(), handler: async (ctx, args) => await moderate(ctx, args, "rejected") });
export const hide = mutation({ args: { ...reviewArgs, reason: v.string() }, returns: v.null(), handler: async (ctx, args) => await moderate(ctx, args, "hidden") });
