"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalAction } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  extensionForContentType,
  publicMediaPurposeValidator,
  type PublicMediaPurpose,
} from "./constants";
import { getPublicMediaBaseUrl } from "./publicUrl";
import { matchesImageSignature } from "./imageValidation";
export { matchesImageSignature } from "./imageValidation";
import {
  createPresignedPutUrl,
  deletePublicMediaObject,
  headPublicMediaObject,
  readPublicMediaSignature,
} from "./r2Client";

function keySegmentForPurpose(purpose: PublicMediaPurpose) {
  if (purpose === "companyLogo") return "logo";
  if (purpose === "companyCover") return "cover";
  if (purpose === "portfolioCover") return "cover";
  return "media";
}

export function buildPublicMediaObjectKey(args: {
  companyId: Id<"companies">;
  purpose: PublicMediaPurpose;
  contentType: string;
  randomId: string;
  portfolioProjectId?: Id<"portfolioProjects">;
}) {
  const extension = extensionForContentType(args.contentType);
  if (args.purpose === "companyLogo" || args.purpose === "companyCover") {
    return `companies/${args.companyId}/${keySegmentForPurpose(args.purpose)}/${args.randomId}.${extension}`;
  }
  const projectSegment = args.portfolioProjectId ?? "pending";
  return `companies/${args.companyId}/portfolio/${projectSegment}/${keySegmentForPurpose(args.purpose)}/${args.randomId}.${extension}`;
}

export function validateHeadMetadata(
  expected: { contentType: string; size: number },
  actual: { ContentType?: string; ContentLength?: number },
) {
  const contentType = actual.ContentType?.split(";", 1)[0]?.trim().toLowerCase();
  return contentType === expected.contentType && actual.ContentLength === expected.size;
}

export const requestPublicMediaUpload = action({
  args: {
    purpose: publicMediaPurposeValidator,
    contentType: v.string(),
    size: v.number(),
    portfolioProjectId: v.optional(v.id("portfolioProjects")),
  },
  returns: v.object({ uploadUrl: v.string(), uploadToken: v.string() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
    if (args.purpose === "companyLogo") throw new ConvexError("COMPANY_LOGO_PRIVATE_UPLOAD_REQUIRED");
    if (args.purpose === "companyCover") throw new ConvexError("COMPANY_COVER_PRIVATE_UPLOAD_REQUIRED");
    if (args.purpose === "portfolioCover" || args.purpose === "portfolioMedia") throw new ConvexError("PORTFOLIO_PRIVATE_UPLOAD_REQUIRED");
    if (!getPublicMediaBaseUrl()) throw new ConvexError("PUBLIC_MEDIA_URL_NOT_CONFIGURED");

    const access: { companyId: Id<"companies"> } = await ctx.runQuery(
      internal.storage.publicMedia.getUploadAccess,
      { userId, ...args },
    );
    const objectKey = buildPublicMediaObjectKey({
      companyId: access.companyId,
      purpose: args.purpose,
      contentType: args.contentType,
      randomId: crypto.randomUUID(),
      portfolioProjectId: args.portfolioProjectId,
    });
    const uploadToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;

    try {
      const uploadUrl = await createPresignedPutUrl(objectKey, args.contentType);
      await ctx.runMutation(internal.storage.publicMedia.createUploadIntent, {
        userId,
        companyId: access.companyId,
        purpose: args.purpose,
        contentType: args.contentType,
        size: args.size,
        objectKey,
        uploadToken,
        portfolioProjectId: args.portfolioProjectId,
      });
      return { uploadUrl, uploadToken };
    } catch (error) {
      console.error("Unable to create R2 upload intent", error instanceof Error ? error.name : "UnknownError");
      throw new ConvexError("PUBLIC_MEDIA_UPLOAD_FAILED");
    }
  },
});

export const verifyPublicMediaUpload = action({
  args: { uploadToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
    const intent: { objectKey: string; expectedContentType: string; expectedSize: number } =
      await ctx.runQuery(internal.storage.publicMedia.getUploadIntentForVerification, {
        userId,
        uploadToken: args.uploadToken,
      });
    try {
      const metadata = await headPublicMediaObject(intent.objectKey);
      if (!validateHeadMetadata(
        { contentType: intent.expectedContentType, size: intent.expectedSize },
        metadata,
      )) {
        throw new ConvexError("INVALID_PUBLIC_MEDIA_UPLOAD");
      }
      const signature = await readPublicMediaSignature(intent.objectKey);
      if (!matchesImageSignature(intent.expectedContentType, signature)) {
        throw new ConvexError("INVALID_PUBLIC_MEDIA_UPLOAD");
      }
      await ctx.runMutation(internal.storage.publicMedia.markUploadVerified, {
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
      console.error("Unable to verify R2 upload", error instanceof Error ? error.name : "UnknownError");
      throw new ConvexError("INVALID_PUBLIC_MEDIA_UPLOAD");
    }
  },
});

export const deleteObjectIfUnreferenced = internalAction({
  args: { objectKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const referenced: boolean = await ctx.runQuery(
      internal.storage.publicMedia.isObjectKeyReferenced,
      { objectKey: args.objectKey },
    );
    if (referenced) return null;
    try {
      await deletePublicMediaObject(args.objectKey);
    } catch (error) {
      console.error("Unable to delete unreferenced R2 object", error instanceof Error ? error.name : "UnknownError");
    }
    return null;
  },
});

export const cleanupExpiredUploadIntent = internalAction({
  args: { uploadToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intent: { objectKey: string } | null = await ctx.runQuery(
      internal.storage.publicMedia.getExpiredUnclaimedIntent,
      args,
    );
    if (!intent) return null;
    try {
      await deletePublicMediaObject(intent.objectKey);
    } catch (error) {
      console.error("Unable to clean up expired R2 upload", error instanceof Error ? error.name : "UnknownError");
      return null;
    }
    await ctx.runMutation(internal.storage.publicMedia.deleteExpiredUnclaimedIntent, {
      uploadToken: args.uploadToken,
      objectKey: intent.objectKey,
    });
    return null;
  },
});
