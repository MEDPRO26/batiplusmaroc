import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ALLOWED_PUBLIC_IMAGE_TYPES, COMPANY_LOGO_MAX_BYTES } from "./storage/constants";

export const CLIENT_AVATAR_MAX_BYTES = COMPANY_LOGO_MAX_BYTES;
export const CLIENT_AVATAR_UPLOAD_TTL_MS = 10 * 60 * 1000;

function isValidAvatarInput(contentType: string, size: number) {
  return (
    ALLOWED_PUBLIC_IMAGE_TYPES.has(contentType) &&
    Number.isInteger(size) &&
    size >= 1 &&
    size <= CLIENT_AVATAR_MAX_BYTES
  );
}

async function requireClientUserId(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("USER_NOT_FOUND");
  if (user.accountType !== "client") throw new ConvexError("CLIENT_ACCOUNT_REQUIRED");
  return user;
}

export const getUploadAccess = internalQuery({
  args: {
    userId: v.id("users"),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireClientUserId(ctx, args.userId);
    if (!isValidAvatarInput(args.contentType, args.size)) {
      throw new ConvexError("INVALID_CLIENT_AVATAR");
    }
    return null;
  },
});

export const createUploadIntent = internalMutation({
  args: {
    userId: v.id("users"),
    contentType: v.string(),
    size: v.number(),
    objectKey: v.string(),
    uploadToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireClientUserId(ctx, args.userId);
    if (
      !isValidAvatarInput(args.contentType, args.size) ||
      !args.objectKey.startsWith(`clients/${args.userId}/avatar/`)
    ) {
      throw new ConvexError("INVALID_CLIENT_AVATAR");
    }
    const now = Date.now();
    await ctx.db.insert("clientAvatarUploadIntents", {
      userId: args.userId,
      expectedContentType: args.contentType,
      expectedSize: args.size,
      objectKey: args.objectKey,
      token: args.uploadToken,
      expiresAt: now + CLIENT_AVATAR_UPLOAD_TTL_MS,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(
      CLIENT_AVATAR_UPLOAD_TTL_MS + 60_000,
      internal.clientAvatarMedia.cleanupExpiredUploadIntent,
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
      .query("clientAvatarUploadIntents")
      .withIndex("by_token", (q) => q.eq("token", args.uploadToken))
      .unique();
    if (
      !intent ||
      intent.userId !== args.userId ||
      intent.claimedAt !== undefined ||
      intent.verifiedAt !== undefined ||
      intent.expiresAt < Date.now()
    ) {
      throw new ConvexError("INVALID_CLIENT_AVATAR");
    }
    await requireClientUserId(ctx, args.userId);
    if (!intent.objectKey.startsWith(`clients/${args.userId}/avatar/`)) {
      throw new ConvexError("INVALID_CLIENT_AVATAR");
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
      .query("clientAvatarUploadIntents")
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
      throw new ConvexError("INVALID_CLIENT_AVATAR");
    }
    await ctx.db.patch(intent._id, { verifiedAt: Date.now(), etag: args.etag });
    return null;
  },
});

export const getExpiredUnclaimedIntent = internalQuery({
  args: { uploadToken: v.string() },
  returns: v.union(v.null(), v.object({ objectKey: v.string() })),
  handler: async (ctx, args) => {
    const intent = await ctx.db
      .query("clientAvatarUploadIntents")
      .withIndex("by_token", (q) => q.eq("token", args.uploadToken))
      .unique();
    if (!intent || intent.claimedAt !== undefined || intent.expiresAt > Date.now()) {
      return null;
    }
    return { objectKey: intent.objectKey };
  },
});

export const deleteExpiredUnclaimedIntent = internalMutation({
  args: { uploadToken: v.string(), objectKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intent = await ctx.db
      .query("clientAvatarUploadIntents")
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

export const isAvatarObjectKeyReferenced = internalQuery({
  args: { objectKey: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("clientProfiles")
      .withIndex("by_avatarObjectKey", (q) => q.eq("avatarObjectKey", args.objectKey))
      .take(1);
    return rows.length > 0;
  },
});
