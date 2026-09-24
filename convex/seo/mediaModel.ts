import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { audit } from "./model";
import { requireSeoTeamUserById } from "./access";
import { normalizeSeoMediaFileName, SEO_MEDIA_UPLOAD_TTL_MS, validateSeoMediaInput } from "./mediaConstants";

async function requireReplacement(ctx: Parameters<typeof requireSeoTeamUserById>[0], mediaId?: Id<"seoMedia">) {
  if (!mediaId) return null;
  const media = await ctx.db.get("seoMedia", mediaId);
  if (!media || media.status !== "active") throw new ConvexError("INVALID_SEO_MEDIA_REFERENCE");
  return media;
}

export const getUploadAccess = internalQuery({
  args: {
    userId: v.id("users"), fileName: v.string(), contentType: v.string(), size: v.number(),
    replacesMediaId: v.optional(v.id("seoMedia")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeoTeamUserById(ctx, args.userId);
    await requireReplacement(ctx, args.replacesMediaId);
    if (!validateSeoMediaInput(args.contentType, args.size) || !normalizeSeoMediaFileName(args.fileName)) {
      throw new ConvexError("INVALID_SEO_MEDIA");
    }
    return null;
  },
});

export const createUploadIntent = internalMutation({
  args: {
    userId: v.id("users"), fileName: v.string(), contentType: v.string(), size: v.number(),
    objectKey: v.string(), uploadToken: v.string(), replacesMediaId: v.optional(v.id("seoMedia")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeoTeamUserById(ctx, args.userId);
    await requireReplacement(ctx, args.replacesMediaId);
    const fileName = normalizeSeoMediaFileName(args.fileName);
    if (
      !fileName || !validateSeoMediaInput(args.contentType, args.size) ||
      !args.objectKey.startsWith("seo/media/") || args.objectKey.includes("..")
    ) throw new ConvexError("INVALID_SEO_MEDIA");
    const now = Date.now();
    await ctx.db.insert("seoMediaUploadIntents", {
      userId: args.userId, objectKey: args.objectKey, fileName,
      expectedContentType: args.contentType, expectedSize: args.size,
      token: args.uploadToken, replacesMediaId: args.replacesMediaId,
      expiresAt: now + SEO_MEDIA_UPLOAD_TTL_MS, createdAt: now,
    });
    await ctx.scheduler.runAfter(
      SEO_MEDIA_UPLOAD_TTL_MS + 60_000,
      internal.seo.media.cleanupExpiredUploadIntent,
      { uploadToken: args.uploadToken },
    );
    return null;
  },
});

export const getUploadIntentForVerification = internalQuery({
  args: { userId: v.id("users"), uploadToken: v.string() },
  returns: v.object({
    objectKey: v.string(), fileName: v.string(), expectedContentType: v.string(),
    expectedSize: v.number(), replacesMediaId: v.union(v.id("seoMedia"), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireSeoTeamUserById(ctx, args.userId);
    const intent = await ctx.db.query("seoMediaUploadIntents")
      .withIndex("by_token", (q) => q.eq("token", args.uploadToken)).unique();
    if (
      !intent || intent.userId !== args.userId || intent.claimedAt !== undefined ||
      intent.verifiedAt !== undefined || intent.expiresAt < Date.now() ||
      !intent.objectKey.startsWith("seo/media/")
    ) throw new ConvexError("INVALID_SEO_MEDIA_UPLOAD");
    await requireReplacement(ctx, intent.replacesMediaId);
    return {
      objectKey: intent.objectKey, fileName: intent.fileName,
      expectedContentType: intent.expectedContentType, expectedSize: intent.expectedSize,
      replacesMediaId: intent.replacesMediaId ?? null,
    };
  },
});

export const completeVerifiedUpload = internalMutation({
  args: {
    userId: v.id("users"), uploadToken: v.string(), objectKey: v.string(),
    contentType: v.string(), size: v.number(), width: v.number(), height: v.number(),
    etag: v.optional(v.string()),
  },
  returns: v.id("seoMedia"),
  handler: async (ctx, args) => {
    const actor = await requireSeoTeamUserById(ctx, args.userId);
    const intent = await ctx.db.query("seoMediaUploadIntents")
      .withIndex("by_token", (q) => q.eq("token", args.uploadToken)).unique();
    if (
      !intent || intent.userId !== args.userId || intent.claimedAt !== undefined ||
      intent.verifiedAt !== undefined || intent.expiresAt < Date.now() ||
      intent.objectKey !== args.objectKey || intent.expectedContentType !== args.contentType ||
      intent.expectedSize !== args.size || !Number.isInteger(args.width) || args.width < 1 ||
      !Number.isInteger(args.height) || args.height < 1
    ) throw new ConvexError("INVALID_SEO_MEDIA_UPLOAD");
    const replaced = await requireReplacement(ctx, intent.replacesMediaId);
    const [featuredReferences, ogReferences, pageReferences, contentReferences] = replaced
      ? await Promise.all([
          ctx.db.query("seoArticles").withIndex("by_featuredMediaId", (q) => q.eq("featuredMediaId", replaced._id)).take(101),
          ctx.db.query("seoArticles").withIndex("by_ogMediaId", (q) => q.eq("ogMediaId", replaced._id)).take(101),
          ctx.db.query("seoPageMetadata").withIndex("by_ogMediaId", (q) => q.eq("ogMediaId", replaced._id)).take(101),
          ctx.db.query("seoArticleMedia").withIndex("by_mediaId", (q) => q.eq("mediaId", replaced._id)).take(101),
        ])
      : [[], [], [], []];
    if ([featuredReferences, ogReferences, pageReferences, contentReferences].some((rows) => rows.length > 100)) {
      throw new ConvexError("SEO_MEDIA_REPLACEMENT_TOO_MANY_REFERENCES");
    }
    const now = Date.now();
    const mediaId = await ctx.db.insert("seoMedia", {
      objectKey: intent.objectKey, filename: intent.fileName,
      mimeType: intent.expectedContentType, width: args.width, height: args.height,
      size: intent.expectedSize, etag: args.etag, uploadedBy: actor._id,
      status: "active", replacesMediaId: replaced?._id, createdAt: now, updatedAt: now,
    });
    if (replaced) {
      await ctx.db.patch(replaced._id, {
        status: "archived", archivedAt: now, replacedByMediaId: mediaId, updatedAt: now,
      });
      await audit(ctx, actor._id, "media", replaced._id, "media.replaced", ["status", "replacedByMediaId"], { before: "active", after: "archived" });
      const localizedMetadata = await Promise.all((["fr", "en"] as const).map((locale) =>
        ctx.db.query("seoMediaMetadata")
          .withIndex("by_mediaId_and_locale", (q) => q.eq("mediaId", replaced._id).eq("locale", locale))
          .unique(),
      ));
      for (const metadata of localizedMetadata) {
        if (!metadata) continue;
        await ctx.db.patch(metadata._id, { mediaId, updatedBy: actor._id, updatedAt: now });
        await audit(ctx, actor._id, "media_metadata", metadata._id, "image_metadata.media_replaced", ["mediaId"]);
      }
      const articleChanges = new Map<Id<"seoArticles">, { featuredMediaId?: Id<"seoMedia">; ogMediaId?: Id<"seoMedia">; content?: string }>();
      for (const article of featuredReferences) articleChanges.set(article._id, { ...(articleChanges.get(article._id) ?? {}), featuredMediaId: mediaId });
      for (const article of ogReferences) articleChanges.set(article._id, { ...(articleChanges.get(article._id) ?? {}), ogMediaId: mediaId });
      for (const relation of contentReferences) {
        const article = await ctx.db.get("seoArticles", relation.articleId);
        if (!article) { await ctx.db.delete(relation._id); continue; }
        const content = article.content.replaceAll(`media:${replaced._id}`, `media:${mediaId}`);
        articleChanges.set(article._id, { ...(articleChanges.get(article._id) ?? {}), content });
        await ctx.db.patch(relation._id, { mediaId });
      }
      for (const [articleId, changes] of articleChanges) {
        await ctx.db.patch(articleId, { ...changes, updatedBy: actor._id, updatedAt: now });
        await audit(ctx, actor._id, "article", articleId, "article.media_replaced", ["media"]);
      }
      for (const page of pageReferences) {
        await ctx.db.patch(page._id, { ogMediaId: mediaId, updatedBy: actor._id, updatedAt: now });
        await audit(ctx, actor._id, "page_metadata", page._id, "page_metadata.media_replaced", ["ogMediaId"]);
      }
    }
    await ctx.db.patch(intent._id, { verifiedAt: now, claimedAt: now, etag: args.etag });
    await audit(ctx, actor._id, "media", mediaId, "media.uploaded", ["objectKey", "filename", "mimeType", "size", "dimensions"]);
    return mediaId;
  },
});

export const getExpiredUnclaimedIntent = internalQuery({
  args: { uploadToken: v.string() },
  returns: v.union(v.null(), v.object({ objectKey: v.string() })),
  handler: async (ctx, args) => {
    const intent = await ctx.db.query("seoMediaUploadIntents")
      .withIndex("by_token", (q) => q.eq("token", args.uploadToken)).unique();
    return !intent || intent.claimedAt !== undefined || intent.expiresAt > Date.now()
      ? null : { objectKey: intent.objectKey };
  },
});

export const deleteExpiredUnclaimedIntent = internalMutation({
  args: { uploadToken: v.string(), objectKey: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const intent = await ctx.db.query("seoMediaUploadIntents")
      .withIndex("by_token", (q) => q.eq("token", args.uploadToken)).unique();
    if (intent && intent.claimedAt === undefined && intent.expiresAt <= Date.now() && intent.objectKey === args.objectKey) {
      await ctx.db.delete(intent._id);
    }
    return null;
  },
});
