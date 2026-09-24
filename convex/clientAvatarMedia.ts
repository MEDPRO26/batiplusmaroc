"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { extensionForContentType } from "./storage/constants";
import { getPublicMediaBaseUrl } from "./storage/publicUrl";
import {
  createPresignedPutUrl,
  deletePublicMediaObject,
  headPublicMediaObject,
  readPublicMediaSignature,
} from "./storage/r2Client";
import { matchesImageSignature, validateHeadMetadata } from "./storage/r2";

export const requestAvatarUpload = action({
  args: {
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.object({ uploadUrl: v.string(), uploadToken: v.string() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
    if (!getPublicMediaBaseUrl()) throw new ConvexError("PUBLIC_MEDIA_URL_NOT_CONFIGURED");

    await ctx.runQuery(internal.clientAvatarMediaModel.getUploadAccess, {
      userId,
      contentType: args.contentType,
      size: args.size,
    });

    const objectKey = `clients/${userId}/avatar/${crypto.randomUUID()}.${extensionForContentType(args.contentType)}`;
    const uploadToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;

    try {
      const uploadUrl = await createPresignedPutUrl(objectKey, args.contentType);
      await ctx.runMutation(internal.clientAvatarMediaModel.createUploadIntent, {
        userId,
        contentType: args.contentType,
        size: args.size,
        objectKey,
        uploadToken,
      });
      return { uploadUrl, uploadToken };
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      console.error(
        "Unable to create client avatar upload",
        error instanceof Error ? error.name : "UnknownError",
      );
      throw new ConvexError("CLIENT_AVATAR_UPLOAD_FAILED");
    }
  },
});

export const verifyAvatarUpload = action({
  args: { uploadToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");

    const intent: {
      objectKey: string;
      expectedContentType: string;
      expectedSize: number;
    } = await ctx.runQuery(internal.clientAvatarMediaModel.getUploadIntentForVerification, {
      userId,
      uploadToken: args.uploadToken,
    });

    try {
      const metadata = await headPublicMediaObject(intent.objectKey);
      if (
        !validateHeadMetadata(
          { contentType: intent.expectedContentType, size: intent.expectedSize },
          metadata,
        )
      ) {
        throw new ConvexError("INVALID_CLIENT_AVATAR");
      }
      const signature = await readPublicMediaSignature(intent.objectKey);
      if (!matchesImageSignature(intent.expectedContentType, signature)) {
        throw new ConvexError("INVALID_CLIENT_AVATAR");
      }
      await ctx.runMutation(internal.clientAvatarMediaModel.markUploadVerified, {
        userId,
        uploadToken: args.uploadToken,
        objectKey: intent.objectKey,
        contentType: intent.expectedContentType,
        size: intent.expectedSize,
        etag: metadata.ETag,
      });
      return null;
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      console.error(
        "Unable to verify client avatar upload",
        error instanceof Error ? error.name : "UnknownError",
      );
      throw new ConvexError("INVALID_CLIENT_AVATAR");
    }
  },
});

export const cleanupExpiredUploadIntent = internalAction({
  args: { uploadToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intent: { objectKey: string } | null = await ctx.runQuery(
      internal.clientAvatarMediaModel.getExpiredUnclaimedIntent,
      args,
    );
    if (!intent) return null;
    try {
      await deletePublicMediaObject(intent.objectKey);
    } catch (error) {
      console.error(
        "Unable to clean up client avatar upload",
        error instanceof Error ? error.name : "UnknownError",
      );
      return null;
    }
    await ctx.runMutation(internal.clientAvatarMediaModel.deleteExpiredUnclaimedIntent, {
      uploadToken: args.uploadToken,
      objectKey: intent.objectKey,
    });
    return null;
  },
});

export const deleteAvatarObjectIfUnreferenced = internalAction({
  args: { objectKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const referenced: boolean = await ctx.runQuery(
      internal.clientAvatarMediaModel.isAvatarObjectKeyReferenced,
      { objectKey: args.objectKey },
    );
    if (referenced) return null;
    try {
      await deletePublicMediaObject(args.objectKey);
    } catch (error) {
      console.error(
        "Unable to delete unreferenced client avatar",
        error instanceof Error ? error.name : "UnknownError",
      );
    }
    return null;
  },
});
