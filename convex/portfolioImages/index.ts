import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireAdminUser } from "../admin/access";
import { requireOwnerCompany } from "../companies/index";
import { validatePublicImageInput } from "../storage/constants";
import { portfolioImagePurposeValidator, portfolioImageStatusValidator, portfolioImageTypeValidator, PORTFOLIO_GALLERY_LIMIT, PORTFOLIO_IMAGE_UPLOAD_TTL_MS } from "./constants";
import { assertPortfolioImageFile, hasPublicPortfolio, imageSlot, portfolioImageDto, portfolioImageHttpUrl } from "./model";

const imageDtoValidator = v.object({
  imageId: v.id("portfolioImages"), companyId: v.id("companies"), portfolioProjectId: v.id("portfolioProjects"),
  purpose: portfolioImagePurposeValidator, gallerySlotId: v.union(v.id("portfolioMedia"), v.null()),
  contentType: portfolioImageTypeValidator, size: v.number(), sha256: v.string(),
  uploadedBy: v.id("users"), uploadedAt: v.number(), moderationStatus: portfolioImageStatusValidator,
  moderatedBy: v.union(v.id("users"), v.null()), moderatedAt: v.union(v.number(), v.null()),
  reason: v.union(v.string(), v.null()), previewUrl: v.string(),
});
const imagePairValidator = v.object({
  submitted: v.union(imageDtoValidator, v.null()), approved: v.union(imageDtoValidator, v.null()),
});
const fileDescriptorValidator = v.object({
  storageId: v.id("_storage"), contentType: portfolioImageTypeValidator, size: v.number(), sha256: v.string(),
});
export type PortfolioImageFileDescriptor = Pick<Doc<"portfolioImages">, "storageId" | "contentType" | "size" | "sha256">;
type DatabaseCtx = QueryCtx | MutationCtx;
type Target = { portfolioProjectId: Id<"portfolioProjects">; purpose: "cover" | "gallery"; gallerySlotId?: Id<"portfolioMedia"> };

function validatePageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > 100) throw new ConvexError("INVALID_PAGINATION");
}

async function ownedProject(ctx: DatabaseCtx, portfolioProjectId: Id<"portfolioProjects">) {
  const access = await requireOwnerCompany(ctx);
  const project = await ctx.db.get(portfolioProjectId);
  if (!project || project.companyId !== access.company._id) throw new ConvexError("PORTFOLIO_PROJECT_NOT_FOUND");
  return { ...access, project };
}

async function ownedTarget(ctx: DatabaseCtx, target: Target) {
  const access = await ownedProject(ctx, target.portfolioProjectId);
  if (access.company.onboardingStatus !== "completed") throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
  if (target.purpose === "cover" && target.gallerySlotId === undefined) return { ...access, slot: access.project };
  const slot = target.purpose === "gallery" && target.gallerySlotId ? await ctx.db.get(target.gallerySlotId) : null;
  if (!slot || slot.portfolioProjectId !== access.project._id) throw new ConvexError("INVALID_PORTFOLIO_IMAGE_UPLOAD");
  return { ...access, slot };
}

/** Allocate an empty gallery slot explicitly, keeping order independent from file moderation. */
export const createGallerySlot = mutation({
  args: { portfolioProjectId: v.id("portfolioProjects"), caption: v.optional(v.string()) }, returns: v.id("portfolioMedia"),
  handler: async (ctx, args) => {
    const { project } = await ownedProject(ctx, args.portfolioProjectId);
    const rows = await ctx.db.query("portfolioMedia").withIndex("by_portfolioProjectId", q => q.eq("portfolioProjectId", project._id)).take(PORTFOLIO_GALLERY_LIMIT + 1);
    if (rows.length >= PORTFOLIO_GALLERY_LIMIT) throw new ConvexError("INVALID_PORTFOLIO_IMAGE");
    const caption = args.caption?.trim().replace(/\s+/g, " ");
    if (caption !== undefined && (!caption || caption.length > 200)) throw new ConvexError("INVALID_PORTFOLIO_CAPTION");
    return await ctx.db.insert("portfolioMedia", {
      portfolioProjectId: project._id, sortOrder: Math.max(-1, ...rows.map(row => row.sortOrder)) + 1,
      caption, createdAt: Date.now(),
    });
  },
});

export const reorderGallery = mutation({
  args: { portfolioProjectId: v.id("portfolioProjects"), slotIds: v.array(v.id("portfolioMedia")) }, returns: v.null(),
  handler: async (ctx, args) => {
    const { project } = await ownedProject(ctx, args.portfolioProjectId);
    const rows = await ctx.db.query("portfolioMedia").withIndex("by_portfolioProjectId", q => q.eq("portfolioProjectId", project._id)).take(PORTFOLIO_GALLERY_LIMIT + 1);
    if (args.slotIds.length > PORTFOLIO_GALLERY_LIMIT || rows.length !== args.slotIds.length ||
        new Set(args.slotIds).size !== rows.length || rows.some(row => !args.slotIds.includes(row._id))) throw new ConvexError("INVALID_PORTFOLIO_IMAGE");
    for (let index = 0; index < args.slotIds.length; index++) await ctx.db.patch(args.slotIds[index], { sortOrder: index });
    return null;
  },
});

async function ownedUploadIntent(ctx: DatabaseCtx, uploadToken: string, now: number) {
  const intent = await ctx.db.query("portfolioImageUploadIntents").withIndex("by_token", q => q.eq("token", uploadToken)).unique();
  if (!intent || intent.claimedAt !== undefined || intent.imageId !== undefined || intent.expiresAt <= now) throw new ConvexError("INVALID_PORTFOLIO_IMAGE_UPLOAD");
  const access = await ownedTarget(ctx, intent);
  if (intent.userId !== access.userId || intent.companyId !== access.company._id) throw new ConvexError("INVALID_PORTFOLIO_IMAGE_UPLOAD");
  return { intent, ...access };
}

export const generateUploadIntent = mutation({
  args: {
    portfolioProjectId: v.id("portfolioProjects"), purpose: portfolioImagePurposeValidator,
    gallerySlotId: v.optional(v.id("portfolioMedia")), contentType: portfolioImageTypeValidator, size: v.number(),
  },
  returns: v.object({ uploadUrl: v.string(), uploadToken: v.string() }),
  handler: async (ctx, args) => {
    const { company, userId } = await ownedTarget(ctx, args);
    if (!validatePublicImageInput("portfolioCover", args.contentType, args.size)) throw new ConvexError("INVALID_PORTFOLIO_IMAGE_UPLOAD");
    const now = Date.now();
    const uploadToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    await ctx.db.insert("portfolioImageUploadIntents", {
      companyId: company._id, portfolioProjectId: args.portfolioProjectId, purpose: args.purpose, gallerySlotId: args.gallerySlotId,
      userId, token: uploadToken, expectedContentType: args.contentType, expectedSize: args.size,
      expiresAt: now + PORTFOLIO_IMAGE_UPLOAD_TTL_MS, createdAt: now,
    });
    return { uploadUrl: portfolioImageHttpUrl("upload"), uploadToken };
  },
});

export const authorizeUpload = internalQuery({
  args: { uploadToken: v.string(), now: v.number() }, returns: v.object({ contentType: portfolioImageTypeValidator, size: v.number() }),
  handler: async (ctx, args) => {
    const { intent } = await ownedUploadIntent(ctx, args.uploadToken, args.now);
    return { contentType: intent.expectedContentType, size: intent.expectedSize };
  },
});

/** Internal only: the authenticated HTTP handler binds the newly received, validated bytes. */
export const bindUpload = internalMutation({
  args: { uploadToken: v.string(), storageId: v.id("_storage"), contentType: portfolioImageTypeValidator, size: v.number() }, returns: v.id("portfolioImages"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { intent, company, userId, slot } = await ownedUploadIntent(ctx, args.uploadToken, now);
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata || metadata.size !== args.size || (metadata.contentType !== undefined && metadata.contentType !== args.contentType) ||
        args.size !== intent.expectedSize || args.contentType !== intent.expectedContentType ||
        !validatePublicImageInput("portfolioCover", args.contentType, args.size)) throw new ConvexError("INVALID_PORTFOLIO_IMAGE_UPLOAD");
    const referenced = await ctx.db.query("portfolioImages").withIndex("by_storageId", q => q.eq("storageId", args.storageId)).first();
    if (referenced) throw new ConvexError("INVALID_PORTFOLIO_IMAGE_UPLOAD");
    const imageId = await ctx.db.insert("portfolioImages", {
      companyId: company._id, portfolioProjectId: intent.portfolioProjectId, purpose: intent.purpose, gallerySlotId: intent.gallerySlotId,
      storageId: args.storageId, contentType: args.contentType, size: metadata.size, sha256: metadata.sha256,
      uploadedBy: userId, uploadedAt: now, moderationStatus: "pending",
    });
    await ctx.db.patch(intent._id, { claimedAt: now, imageId });
    await ctx.db.patch(slot._id, { submittedImageId: imageId });
    await ctx.db.insert("portfolioImageModerationHistory", {
      companyId: company._id, portfolioProjectId: intent.portfolioProjectId, imageId,
      action: "uploaded", oldStatus: null, newStatus: "pending", changedBy: userId, changedAt: now,
    });
    return imageId;
  },
});

export const cleanupFailedUpload = internalMutation({
  args: { storageId: v.id("_storage") }, returns: v.null(),
  handler: async (ctx, args) => {
    const referenced = await ctx.db.query("portfolioImages").withIndex("by_storageId", q => q.eq("storageId", args.storageId)).first();
    if (!referenced) await ctx.storage.delete(args.storageId);
    return null;
  },
});

async function requirePrivateImage(ctx: QueryCtx, imageId: Id<"portfolioImages">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("PORTFOLIO_IMAGE_NOT_FOUND");
  const user = await ctx.db.get(userId);
  const image = await ctx.db.get(imageId);
  if (!image) throw new ConvexError("PORTFOLIO_IMAGE_NOT_FOUND");
  if (user?.accountType === "admin") await requireAdminUser(ctx);
  else {
    const { company } = await requireOwnerCompany(ctx);
    if (image.companyId !== company._id) throw new ConvexError("PORTFOLIO_IMAGE_NOT_FOUND");
  }
  await imageSlot(ctx, image);
  if (!(await ctx.db.get(image.companyId))) throw new ConvexError("PORTFOLIO_IMAGE_NOT_FOUND");
  return image;
}

function fileDescriptor(image: Doc<"portfolioImages">): PortfolioImageFileDescriptor {
  return { storageId: image.storageId, contentType: image.contentType, size: image.size, sha256: image.sha256 };
}

export const authorizePrivatePreview = internalQuery({
  args: { imageId: v.id("portfolioImages") }, returns: fileDescriptorValidator,
  handler: async (ctx, args) => {
    const image = await requirePrivateImage(ctx, args.imageId);
    await assertPortfolioImageFile(ctx, image);
    return fileDescriptor(image);
  },
});

export const authorizePublicImage = internalQuery({
  args: { imageId: v.id("portfolioImages") }, returns: fileDescriptorValidator,
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    if (!image || image.moderationStatus !== "approved") throw new ConvexError("PORTFOLIO_IMAGE_NOT_FOUND");
    const { project, slot } = await imageSlot(ctx, image);
    if (slot.approvedImageId !== image._id || !(await hasPublicPortfolio(ctx, project))) throw new ConvexError("PORTFOLIO_IMAGE_NOT_FOUND");
    await assertPortfolioImageFile(ctx, image);
    return fileDescriptor(image);
  },
});

async function imagePair(ctx: QueryCtx, slot: Doc<"portfolioProjects"> | Doc<"portfolioMedia">, project: Doc<"portfolioProjects">) {
  const submitted = slot.submittedImageId ? await ctx.db.get(slot.submittedImageId) : null;
  const approved = slot.approvedImageId ? await ctx.db.get(slot.approvedImageId) : null;
  const belongs = (image: Doc<"portfolioImages"> | null) => image && image.companyId === project.companyId && image.portfolioProjectId === project._id &&
    (slot._id === project._id ? image.purpose === "cover" && image.gallerySlotId === undefined : image.purpose === "gallery" && image.gallerySlotId === slot._id);
  return {
    submitted: belongs(submitted) && submitted ? portfolioImageDto(submitted) : null,
    approved: belongs(approved) && approved?.moderationStatus === "approved" ? portfolioImageDto(approved) : null,
  };
}

export const getMyImages = query({
  args: { portfolioProjectId: v.id("portfolioProjects") },
  returns: v.object({ cover: imagePairValidator, gallery: v.array(imagePairValidator.extend({ slotId: v.id("portfolioMedia"), sortOrder: v.number(), caption: v.union(v.string(), v.null()) })) }),
  handler: async (ctx, args) => {
    const { project } = await ownedProject(ctx, args.portfolioProjectId);
    const rows = await ctx.db.query("portfolioMedia").withIndex("by_portfolioProjectId", q => q.eq("portfolioProjectId", project._id)).take(PORTFOLIO_GALLERY_LIMIT);
    return {
      cover: await imagePair(ctx, project, project),
      gallery: await Promise.all(rows.sort((a, b) => a.sortOrder - b.sortOrder).map(async slot => ({
        slotId: slot._id, sortOrder: slot.sortOrder, caption: slot.caption ?? null, ...await imagePair(ctx, slot, project),
      }))),
    };
  },
});

export const listMyImages = query({
  args: { portfolioProjectId: v.id("portfolioProjects"), paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(imageDtoValidator),
  handler: async (ctx, args) => {
    const { company } = await ownedProject(ctx, args.portfolioProjectId);
    validatePageSize(args.paginationOpts.numItems);
    const page = await ctx.db.query("portfolioImages").withIndex("by_portfolioProjectId_and_uploadedAt", q => q.eq("portfolioProjectId", args.portfolioProjectId)).order("desc").paginate(args.paginationOpts);
    return { ...page, page: page.page.filter(image => image.companyId === company._id).map(portfolioImageDto) };
  },
});

export const getAdminReview = query({
  args: { imageId: v.id("portfolioImages") },
  returns: v.object({
    image: imageDtoValidator, isCurrentSubmission: v.boolean(), isCurrentApproved: v.boolean(), currentSubmissionId: v.union(v.id("portfolioImages"), v.null()),
    approved: v.union(imageDtoValidator, v.null()), company: v.object({ companyId: v.id("companies"), name: v.union(v.string(), v.null()), legalName: v.union(v.string(), v.null()) }),
    project: v.object({ portfolioProjectId: v.id("portfolioProjects"), title: v.string(), status: v.union(v.literal("draft"), v.literal("published"), v.literal("hidden")) }),
    submitted: v.union(imageDtoValidator, v.null()), gallerySortOrder: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const image = await requirePrivateImage(ctx, args.imageId);
    const { project, slot } = await imageSlot(ctx, image);
    const company = (await ctx.db.get(image.companyId))!;
    const pair = await imagePair(ctx, slot, project);
    return {
      image: portfolioImageDto(image), isCurrentSubmission: slot.submittedImageId === image._id, isCurrentApproved: slot.approvedImageId === image._id,
      currentSubmissionId: slot.submittedImageId ?? null, approved: pair.approved, submitted: pair.submitted,
      gallerySortOrder: "sortOrder" in slot ? slot.sortOrder : null,
      company: { companyId: company._id, name: company.name ?? null, legalName: company.legalName ?? null },
      project: { portfolioProjectId: project._id, title: project.title, status: project.status },
    };
  },
});

export const listAdminImages = query({
  args: { status: portfolioImageStatusValidator, companyId: v.optional(v.id("companies")), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(imageDtoValidator.extend({ companyName: v.union(v.string(), v.null()), projectTitle: v.union(v.string(), v.null()), isCurrentSubmission: v.boolean(), isCurrentApproved: v.boolean(), gallerySortOrder: v.union(v.number(), v.null()) })),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    validatePageSize(args.paginationOpts.numItems);
    const source = args.companyId
      ? ctx.db.query("portfolioImages").withIndex("by_companyId_and_moderationStatus_and_uploadedAt", q => q.eq("companyId", args.companyId!).eq("moderationStatus", args.status))
      : ctx.db.query("portfolioImages").withIndex("by_moderationStatus_and_uploadedAt", q => q.eq("moderationStatus", args.status));
    const page = await source.order("desc").paginate(args.paginationOpts);
    return { ...page, page: await Promise.all(page.page.map(async image => {
      const company = await ctx.db.get(image.companyId);
      const project = await ctx.db.get(image.portfolioProjectId);
      const slot = image.purpose === "gallery" && image.gallerySlotId ? await ctx.db.get(image.gallerySlotId) : project;
      return { ...portfolioImageDto(image), companyName: company?.name ?? company?.legalName ?? null, projectTitle: project?.title ?? null,
        isCurrentSubmission: slot?.submittedImageId === image._id, isCurrentApproved: slot?.approvedImageId === image._id,
        gallerySortOrder: slot && "sortOrder" in slot ? slot.sortOrder : null };
    })) };
  },
});

export const getHistory = query({
  args: { imageId: v.id("portfolioImages"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({
    historyId: v.id("portfolioImageModerationHistory"), action: v.union(v.literal("uploaded"), v.literal("approved"), v.literal("rejected"), v.literal("hidden")),
    oldStatus: v.union(portfolioImageStatusValidator, v.null()), newStatus: portfolioImageStatusValidator,
    changedBy: v.id("users"), changedAt: v.number(), reason: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    await requirePrivateImage(ctx, args.imageId);
    validatePageSize(args.paginationOpts.numItems);
    const page = await ctx.db.query("portfolioImageModerationHistory").withIndex("by_imageId_and_changedAt", q => q.eq("imageId", args.imageId)).order("desc").paginate(args.paginationOpts);
    return { ...page, page: page.page.map(row => ({ historyId: row._id, action: row.action, oldStatus: row.oldStatus, newStatus: row.newStatus, changedBy: row.changedBy, changedAt: row.changedAt, reason: row.reason ?? null })) };
  },
});

async function moderate(ctx: MutationCtx, args: { imageId: Id<"portfolioImages">; expectedSha256: string; reason?: string }, action: "approved" | "rejected" | "hidden") {
  const admin = await requireAdminUser(ctx);
  const image = await ctx.db.get(args.imageId);
  if (!image || image.sha256 !== args.expectedSha256 || image.moderationStatus !== (action === "hidden" ? "approved" : "pending")) throw new ConvexError("PORTFOLIO_IMAGE_REVIEW_STALE");
  const { slot } = await imageSlot(ctx, image);
  if ((action === "hidden" ? slot.approvedImageId : slot.submittedImageId) !== image._id) throw new ConvexError("PORTFOLIO_IMAGE_REVIEW_STALE");
  const reason = args.reason?.trim().replace(/\s+/g, " ");
  if (action !== "approved" && (!reason || reason.length < 3 || reason.length > 500)) throw new ConvexError("REJECTION_REASON_REQUIRED");
  await assertPortfolioImageFile(ctx, image);
  const now = Date.now();
  const newStatus = action === "approved" ? "approved" as const : "rejected" as const;
  await ctx.db.patch(image._id, { moderationStatus: newStatus, moderationReason: reason, moderatedBy: admin._id, moderatedAt: now });
  if (action === "approved" || action === "hidden") await ctx.db.patch(slot._id, { approvedImageId: action === "hidden" ? undefined : image._id });
  await ctx.db.insert("portfolioImageModerationHistory", {
    companyId: image.companyId, portfolioProjectId: image.portfolioProjectId, imageId: image._id, action,
    oldStatus: image.moderationStatus, newStatus, changedBy: admin._id, changedAt: now, reason,
  });
  return null;
}

const reviewArgs = { imageId: v.id("portfolioImages"), expectedSha256: v.string() };
export const approve = mutation({ args: reviewArgs, returns: v.null(), handler: async (ctx, args) => await moderate(ctx, args, "approved") });
export const reject = mutation({ args: { ...reviewArgs, reason: v.string() }, returns: v.null(), handler: async (ctx, args) => await moderate(ctx, args, "rejected") });
export const hide = mutation({ args: { ...reviewArgs, reason: v.string() }, returns: v.null(), handler: async (ctx, args) => await moderate(ctx, args, "hidden") });
