import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import {
  PUBLIC_MEDIA_UPLOAD_TTL_MS,
  publicMediaPurposeValidator,
  validatePublicImageInput,
} from "./constants";
import { requireOwnerCompanyByUserId } from "./publicMediaModel";

export const getUploadAccess = internalQuery({
  args: {
    userId: v.id("users"),
    purpose: publicMediaPurposeValidator,
    contentType: v.string(),
    size: v.number(),
    portfolioProjectId: v.optional(v.id("portfolioProjects")),
  },
  returns: v.object({ companyId: v.id("companies") }),
  handler: async (ctx, args) => {
    const { company } = await requireOwnerCompanyByUserId(ctx, args.userId);
    if (!validatePublicImageInput(args.purpose, args.contentType, args.size)) {
      throw new ConvexError("INVALID_PUBLIC_MEDIA_UPLOAD");
    }
    if (args.purpose.startsWith("portfolio") && company.onboardingStatus !== "completed") {
      throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
    }
    if (args.portfolioProjectId) {
      const project = await ctx.db.get(args.portfolioProjectId);
      if (!project || project.companyId !== company._id) {
        throw new ConvexError("PORTFOLIO_PROJECT_NOT_FOUND");
      }
    }
    return { companyId: company._id };
  },
});

export const createUploadIntent = internalMutation({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
    purpose: publicMediaPurposeValidator,
    contentType: v.string(),
    size: v.number(),
    objectKey: v.string(),
    uploadToken: v.string(),
    portfolioProjectId: v.optional(v.id("portfolioProjects")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { company } = await requireOwnerCompanyByUserId(ctx, args.userId);
    if (
      company._id !== args.companyId ||
      !validatePublicImageInput(args.purpose, args.contentType, args.size) ||
      !args.objectKey.startsWith(`companies/${company._id}/`)
    ) {
      throw new ConvexError("INVALID_PUBLIC_MEDIA_UPLOAD");
    }
    if (args.portfolioProjectId) {
      const project = await ctx.db.get(args.portfolioProjectId);
      if (!project || project.companyId !== company._id) {
        throw new ConvexError("PORTFOLIO_PROJECT_NOT_FOUND");
      }
    }
    const now = Date.now();
    await ctx.db.insert("publicMediaUploadIntents", {
      companyId: company._id,
      userId: args.userId,
      portfolioProjectId: args.portfolioProjectId,
      purpose: args.purpose,
      expectedContentType: args.contentType,
      expectedSize: args.size,
      objectKey: args.objectKey,
      token: args.uploadToken,
      expiresAt: now + PUBLIC_MEDIA_UPLOAD_TTL_MS,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(
      PUBLIC_MEDIA_UPLOAD_TTL_MS + 60_000,
      internal.storage.r2.cleanupExpiredUploadIntent,
      { uploadToken: args.uploadToken },
    );
    return null;
  },
});

export const getUploadIntentForVerification = internalQuery({
  args: { userId: v.id("users"), uploadToken: v.string() },
  returns: v.object({
    objectKey: v.string(),
    expectedContentType: v.string(),
    expectedSize: v.number(),
  }),
  handler: async (ctx, args) => {
    const intent = await ctx.db
      .query("publicMediaUploadIntents")
      .withIndex("by_token", (q) => q.eq("token", args.uploadToken))
      .unique();
    if (
      !intent ||
      intent.userId !== args.userId ||
      intent.claimedAt !== undefined ||
      intent.verifiedAt !== undefined ||
      intent.expiresAt < Date.now()
    ) {
      throw new ConvexError("INVALID_PUBLIC_MEDIA_UPLOAD");
    }
    const { company } = await requireOwnerCompanyByUserId(ctx, args.userId);
    if (company._id !== intent.companyId || !intent.objectKey.startsWith(`companies/${company._id}/`)) {
      throw new ConvexError("INVALID_PUBLIC_MEDIA_UPLOAD");
    }
    return {
      objectKey: intent.objectKey,
      expectedContentType: intent.expectedContentType,
      expectedSize: intent.expectedSize,
    };
  },
});

export const markUploadVerified = internalMutation({
  args: {
    userId: v.id("users"),
    uploadToken: v.string(),
    objectKey: v.string(),
    contentType: v.string(),
    size: v.number(),
    etag: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intent = await ctx.db
      .query("publicMediaUploadIntents")
      .withIndex("by_token", (q) => q.eq("token", args.uploadToken))
      .unique();
    if (
      !intent ||
      intent.userId !== args.userId ||
      intent.claimedAt !== undefined ||
      intent.verifiedAt !== undefined ||
      intent.expiresAt < Date.now() ||
      intent.objectKey !== args.objectKey ||
      intent.expectedContentType !== args.contentType ||
      intent.expectedSize !== args.size
    ) {
      throw new ConvexError("INVALID_PUBLIC_MEDIA_UPLOAD");
    }
    await ctx.db.patch(intent._id, { verifiedAt: Date.now(), etag: args.etag });
    return null;
  },
});

export const isObjectKeyReferenced = internalQuery({
  args: { objectKey: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("publicMedia")
      .withIndex("by_objectKey", (q) => q.eq("objectKey", args.objectKey))
      .take(1);
    return rows.length > 0;
  },
});

export const getExpiredUnclaimedIntent = internalQuery({
  args: { uploadToken: v.string() },
  returns: v.union(v.null(), v.object({ objectKey: v.string() })),
  handler: async (ctx, args) => {
    const intent = await ctx.db
      .query("publicMediaUploadIntents")
      .withIndex("by_token", (q) => q.eq("token", args.uploadToken))
      .unique();
    if (!intent || intent.claimedAt !== undefined || intent.expiresAt > Date.now()) return null;
    return { objectKey: intent.objectKey };
  },
});

export const deleteExpiredUnclaimedIntent = internalMutation({
  args: { uploadToken: v.string(), objectKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intent = await ctx.db
      .query("publicMediaUploadIntents")
      .withIndex("by_token", (q) => q.eq("token", args.uploadToken))
      .unique();
    if (
      intent &&
      intent.claimedAt === undefined &&
      intent.expiresAt <= Date.now() &&
      intent.objectKey === args.objectKey
    ) {
      await ctx.db.delete(intent._id);
    }
    return null;
  },
});
