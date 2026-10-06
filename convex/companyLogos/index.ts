import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireAdminUser } from "../admin/access";
import { requireOwnerCompany } from "../companies/index";
import { validatePublicImageInput } from "../storage/constants";
import { LOGO_UPLOAD_TTL_MS, logoContentTypeValidator, logoStatusValidator } from "./constants";
import { assertLogoFile, hasPublicCompanyProfile, logoDto, logoHttpUrl } from "./model";

const imageDtoValidator = v.object({
  imageId: v.id("companyLogoImages"), companyId: v.id("companies"),
  contentType: logoContentTypeValidator, size: v.number(), sha256: v.string(),
  uploadedBy: v.id("users"), uploadedAt: v.number(), moderationStatus: logoStatusValidator,
  reason: v.union(v.string(), v.null()), previewUrl: v.string(),
});
const fileDescriptorValidator = v.object({
  storageId: v.id("_storage"), contentType: logoContentTypeValidator, size: v.number(), sha256: v.string(),
});
export type LogoFileDescriptor = {
  storageId: Id<"_storage">; contentType: Doc<"companyLogoImages">["contentType"]; size: number; sha256: string;
};

function validatePageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > 100) throw new ConvexError("INVALID_PAGINATION");
}

async function ownedUploadIntent(ctx: QueryCtx | MutationCtx, uploadToken: string, now: number) {
  const { company, userId } = await requireOwnerCompany(ctx);
  const intent = await ctx.db.query("companyLogoUploadIntents")
    .withIndex("by_token", q => q.eq("token", uploadToken)).unique();
  if (!intent || intent.userId !== userId || intent.companyId !== company._id ||
      intent.claimedAt !== undefined || intent.imageId !== undefined || intent.expiresAt <= now) {
    throw new ConvexError("INVALID_COMPANY_LOGO_UPLOAD");
  }
  return { intent, company, userId };
}

/** Usable before onboarding; Company verification is deliberately irrelevant. */
export const generateUploadIntent = mutation({
  args: { contentType: logoContentTypeValidator, size: v.number() },
  returns: v.object({ uploadUrl: v.string(), uploadToken: v.string() }),
  handler: async (ctx, args) => {
    const { company, userId } = await requireOwnerCompany(ctx);
    if (!validatePublicImageInput("companyLogo", args.contentType, args.size)) throw new ConvexError("INVALID_COMPANY_LOGO_UPLOAD");
    const now = Date.now();
    const uploadToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    await ctx.db.insert("companyLogoUploadIntents", {
      companyId: company._id, userId, token: uploadToken,
      expectedContentType: args.contentType, expectedSize: args.size,
      expiresAt: now + LOGO_UPLOAD_TTL_MS, createdAt: now,
    });
    return { uploadUrl: logoHttpUrl("upload"), uploadToken };
  },
});

export const authorizeUpload = internalQuery({
  args: { uploadToken: v.string(), now: v.number() },
  returns: v.object({ contentType: logoContentTypeValidator, size: v.number() }),
  handler: async (ctx, args) => {
    const { intent } = await ownedUploadIntent(ctx, args.uploadToken, args.now);
    return { contentType: intent.expectedContentType, size: intent.expectedSize };
  },
});

/** Shared immutable pending record/history creation; callers own authorization and pointer checks. */
export async function createPendingLogo(ctx: MutationCtx, file: Pick<Doc<"companyLogoImages">, "companyId" | "storageId" | "contentType" | "size" | "sha256" | "uploadedBy">, now: number) {
  const imageId = await ctx.db.insert("companyLogoImages", { ...file, uploadedAt: now, moderationStatus: "pending" });
  await ctx.db.insert("companyLogoModerationHistory", {
    companyId: file.companyId, imageId, action: "uploaded", oldStatus: null, newStatus: "pending",
    changedBy: file.uploadedBy, changedAt: now,
  });
  return imageId;
}

/** Only the HTTP handler that received and validated these bytes can bind a storage ID. */
export const bindUpload = internalMutation({
  args: { uploadToken: v.string(), storageId: v.id("_storage"), contentType: logoContentTypeValidator, size: v.number() },
  returns: v.id("companyLogoImages"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { intent, company, userId } = await ownedUploadIntent(ctx, args.uploadToken, now);
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata || metadata.size !== args.size || (metadata.contentType !== undefined && metadata.contentType !== args.contentType) ||
        args.size !== intent.expectedSize || args.contentType !== intent.expectedContentType ||
        !validatePublicImageInput("companyLogo", args.contentType, args.size)) throw new ConvexError("INVALID_COMPANY_LOGO_UPLOAD");
    const referenced = await ctx.db.query("companyLogoImages").withIndex("by_storageId", q => q.eq("storageId", args.storageId)).first();
    if (referenced) throw new ConvexError("INVALID_COMPANY_LOGO_UPLOAD");
    const imageId = await createPendingLogo(ctx, {
      companyId: company._id, storageId: args.storageId, contentType: args.contentType,
      size: metadata.size, sha256: metadata.sha256, uploadedBy: userId,
    }, now);
    await ctx.db.patch(intent._id, { claimedAt: now, imageId });
    await ctx.db.patch(company._id, { submittedLogoImageId: imageId, updatedAt: now });
    return imageId;
  },
});

/** An uncertain bind outcome must never delete a successfully committed image. */
export const cleanupFailedUpload = internalMutation({
  args: { storageId: v.id("_storage") }, returns: v.null(),
  handler: async (ctx, args) => {
    const referenced = await ctx.db.query("companyLogoImages").withIndex("by_storageId", q => q.eq("storageId", args.storageId)).first();
    if (!referenced) await ctx.storage.delete(args.storageId);
    return null;
  },
});

async function requirePrivateImage(ctx: QueryCtx, imageId: Id<"companyLogoImages">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("COMPANY_LOGO_NOT_FOUND");
  const user = await ctx.db.get(userId);
  if (user?.accountType === "admin") await requireAdminUser(ctx);
  else {
    const { company } = await requireOwnerCompany(ctx);
    const image = await ctx.db.get(imageId);
    if (!image || image.companyId !== company._id) throw new ConvexError("COMPANY_LOGO_NOT_FOUND");
  }
  const image = await ctx.db.get(imageId);
  if (!image || !(await ctx.db.get(image.companyId))) throw new ConvexError("COMPANY_LOGO_NOT_FOUND");
  return image;
}

function fileDescriptor(image: Doc<"companyLogoImages">): LogoFileDescriptor {
  return { storageId: image.storageId, contentType: image.contentType, size: image.size, sha256: image.sha256 };
}

export const authorizePrivatePreview = internalQuery({
  args: { imageId: v.id("companyLogoImages") }, returns: fileDescriptorValidator,
  handler: async (ctx, args) => {
    const image = await requirePrivateImage(ctx, args.imageId);
    await assertLogoFile(ctx, image);
    return fileDescriptor(image);
  },
});

export const authorizePublicLogo = internalQuery({
  args: { imageId: v.id("companyLogoImages") }, returns: fileDescriptorValidator,
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    const company = image ? await ctx.db.get(image.companyId) : null;
    if (!image || image.moderationStatus !== "approved" || !company ||
        company.approvedLogoImageId !== image._id || !hasPublicCompanyProfile(company)) throw new ConvexError("COMPANY_LOGO_NOT_FOUND");
    await assertLogoFile(ctx, image);
    return fileDescriptor(image);
  },
});

export const getMyLogos = query({
  args: {},
  returns: v.object({ submitted: v.union(imageDtoValidator, v.null()), approved: v.union(imageDtoValidator, v.null()) }),
  handler: async ctx => {
    const { company } = await requireOwnerCompany(ctx);
    const submitted = company.submittedLogoImageId ? await ctx.db.get(company.submittedLogoImageId) : null;
    const approved = company.approvedLogoImageId ? await ctx.db.get(company.approvedLogoImageId) : null;
    return {
      submitted: submitted?.companyId === company._id ? logoDto(submitted) : null,
      approved: approved?.companyId === company._id && approved.moderationStatus === "approved" ? logoDto(approved) : null,
    };
  },
});

/** Includes hidden/superseded images so the owner can still see their reasons. */
export const listMyLogos = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(imageDtoValidator),
  handler: async (ctx, args) => {
    const { company } = await requireOwnerCompany(ctx);
    validatePageSize(args.paginationOpts.numItems);
    const page = await ctx.db.query("companyLogoImages")
      .withIndex("by_companyId_and_uploadedAt", q => q.eq("companyId", company._id)).order("desc").paginate(args.paginationOpts);
    return { ...page, page: page.page.map(logoDto) };
  },
});

export const getAdminReview = query({
  args: { imageId: v.id("companyLogoImages") },
  returns: v.object({
    image: imageDtoValidator, isCurrentSubmission: v.boolean(), isCurrentApproved: v.boolean(),
    company: v.object({ companyId: v.id("companies"), name: v.union(v.string(), v.null()), legalName: v.union(v.string(), v.null()) }),
    currentSubmissionId: v.union(v.id("companyLogoImages"), v.null()),
    approved: v.union(imageDtoValidator, v.null()),
  }),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const image = await requirePrivateImage(ctx, args.imageId);
    const company = await ctx.db.get(image.companyId);
    if (!company) throw new ConvexError("COMPANY_LOGO_NOT_FOUND");
    const approved = company.approvedLogoImageId ? await ctx.db.get(company.approvedLogoImageId) : null;
    return {
      image: logoDto(image), isCurrentSubmission: company.submittedLogoImageId === image._id, isCurrentApproved: company.approvedLogoImageId === image._id,
      company: { companyId: company._id, name: company.name ?? null, legalName: company.legalName ?? null },
      currentSubmissionId: company.submittedLogoImageId ?? null,
      approved: approved?.companyId === company._id && approved.moderationStatus === "approved" ? logoDto(approved) : null,
    };
  },
});

export const listAdminLogos = query({
  args: { status: logoStatusValidator, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(imageDtoValidator.extend({ companyName: v.union(v.string(), v.null()), isCurrentSubmission: v.boolean() })),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    validatePageSize(args.paginationOpts.numItems);
    const page = await ctx.db.query("companyLogoImages")
      .withIndex("by_moderationStatus_and_uploadedAt", q => q.eq("moderationStatus", args.status))
      .order("desc").paginate(args.paginationOpts);
    return { ...page, page: await Promise.all(page.page.map(async image => {
      const company = await ctx.db.get(image.companyId);
      return { ...logoDto(image), companyName: company?.name ?? company?.legalName ?? null, isCurrentSubmission: company?.submittedLogoImageId === image._id };
    })) };
  },
});

export const getHistory = query({
  args: { imageId: v.id("companyLogoImages"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({
    historyId: v.id("companyLogoModerationHistory"), action: v.union(v.literal("uploaded"), v.literal("approved"), v.literal("rejected"), v.literal("hidden")),
    oldStatus: v.union(logoStatusValidator, v.null()), newStatus: logoStatusValidator,
    changedBy: v.id("users"), changedAt: v.number(), reason: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    await requirePrivateImage(ctx, args.imageId);
    validatePageSize(args.paginationOpts.numItems);
    const page = await ctx.db.query("companyLogoModerationHistory")
      .withIndex("by_imageId_and_changedAt", q => q.eq("imageId", args.imageId)).order("desc").paginate(args.paginationOpts);
    return { ...page, page: page.page.map(row => ({
      historyId: row._id, action: row.action, oldStatus: row.oldStatus, newStatus: row.newStatus,
      changedBy: row.changedBy, changedAt: row.changedAt, reason: row.reason ?? null,
    })) };
  },
});

async function moderate(ctx: MutationCtx, args: { imageId: Id<"companyLogoImages">; expectedSha256: string; reason?: string }, action: "approved" | "rejected" | "hidden") {
  const admin = await requireAdminUser(ctx);
  const image = await ctx.db.get(args.imageId);
  const company = image ? await ctx.db.get(image.companyId) : null;
  const hiding = action === "hidden";
  if (!image || !company || image.sha256 !== args.expectedSha256 ||
      image.moderationStatus !== (hiding ? "approved" : "pending") ||
      (hiding ? company.approvedLogoImageId : company.submittedLogoImageId) !== image._id) throw new ConvexError("COMPANY_LOGO_REVIEW_STALE");
  const reason = args.reason?.trim().replace(/\s+/g, " ");
  if (action !== "approved" && (!reason || reason.length < 3 || reason.length > 500)) throw new ConvexError("REJECTION_REASON_REQUIRED");
  await assertLogoFile(ctx, image);
  const now = Date.now();
  const newStatus = action === "approved" ? "approved" as const : "rejected" as const;
  await ctx.db.patch(image._id, { moderationStatus: newStatus, moderationReason: reason, moderatedBy: admin._id, moderatedAt: now });
  if (action === "approved" || hiding) await ctx.db.patch(company._id, { approvedLogoImageId: hiding ? undefined : image._id, updatedAt: now });
  await ctx.db.insert("companyLogoModerationHistory", {
    companyId: company._id, imageId: image._id, action, oldStatus: image.moderationStatus, newStatus,
    changedBy: admin._id, changedAt: now, reason,
  });
  return null;
}

const reviewArgs = { imageId: v.id("companyLogoImages"), expectedSha256: v.string() };
export const approve = mutation({ args: reviewArgs, returns: v.null(), handler: async (ctx, args) => await moderate(ctx, args, "approved") });
export const reject = mutation({ args: { ...reviewArgs, reason: v.string() }, returns: v.null(), handler: async (ctx, args) => await moderate(ctx, args, "rejected") });
export const hide = mutation({ args: { ...reviewArgs, reason: v.string() }, returns: v.null(), handler: async (ctx, args) => await moderate(ctx, args, "hidden") });
