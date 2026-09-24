"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action, internalAction } from "../_generated/server";
import { extensionForContentType } from "../storage/constants";
import { getPublicMediaBaseUrl } from "../storage/publicUrl";
import { createPresignedPutUrl, deletePublicMediaObject, headPublicMediaObject, readPublicMediaBytes } from "../storage/r2Client";
import { matchesImageSignature, validateHeadMetadata } from "../storage/r2";
import { SEO_MEDIA_DIMENSION_PROBE_BYTES } from "./mediaConstants";

export const requestSeoMediaUpload = action({
  args: {
    fileName: v.string(), contentType: v.string(), size: v.number(),
    replacesMediaId: v.optional(v.id("seoMedia")),
  },
  returns: v.object({ uploadUrl: v.string(), uploadToken: v.string() }),
  handler: async (ctx, args): Promise<{ uploadUrl: string; uploadToken: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
    if (!getPublicMediaBaseUrl()) throw new ConvexError("PUBLIC_MEDIA_URL_NOT_CONFIGURED");
    await ctx.runQuery(internal.seo.mediaModel.getUploadAccess, { userId, ...args });
    const objectKey = `seo/media/${crypto.randomUUID()}.${extensionForContentType(args.contentType)}`;
    const uploadToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    try {
      const uploadUrl = await createPresignedPutUrl(objectKey, args.contentType);
      await ctx.runMutation(internal.seo.mediaModel.createUploadIntent, {
        userId, ...args, objectKey, uploadToken,
      });
      return { uploadUrl, uploadToken };
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      console.error("Unable to create SEO media upload", error instanceof Error ? error.name : "UnknownError");
      throw new ConvexError("SEO_MEDIA_UPLOAD_FAILED");
    }
  },
});

export const verifySeoMediaUpload = action({
  args: { uploadToken: v.string() }, returns: v.id("seoMedia"),
  handler: async (ctx, args): Promise<Id<"seoMedia">> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
    const intent: {
      objectKey: string; fileName: string; expectedContentType: string;
      expectedSize: number; replacesMediaId: Id<"seoMedia"> | null;
    } = await ctx.runQuery(internal.seo.mediaModel.getUploadIntentForVerification, { userId, uploadToken: args.uploadToken });
    try {
      const metadata = await headPublicMediaObject(intent.objectKey);
      if (!validateHeadMetadata({ contentType: intent.expectedContentType, size: intent.expectedSize }, metadata)) {
        throw new ConvexError("INVALID_SEO_MEDIA_UPLOAD");
      }
      const bytes = await readPublicMediaBytes(intent.objectKey, SEO_MEDIA_DIMENSION_PROBE_BYTES);
      if (!matchesImageSignature(intent.expectedContentType, bytes)) throw new ConvexError("INVALID_SEO_MEDIA_UPLOAD");
      const dimensions = imageDimensions(intent.expectedContentType, bytes);
      if (!dimensions) throw new ConvexError("INVALID_SEO_MEDIA_UPLOAD");
      return await ctx.runMutation(internal.seo.mediaModel.completeVerifiedUpload, {
        userId, uploadToken: args.uploadToken, objectKey: intent.objectKey,
        contentType: intent.expectedContentType, size: intent.expectedSize,
        width: dimensions.width, height: dimensions.height, etag: metadata.ETag,
      });
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      console.error("Unable to verify SEO media upload", error instanceof Error ? error.name : "UnknownError");
      throw new ConvexError("INVALID_SEO_MEDIA_UPLOAD");
    }
  },
});

export const cleanupExpiredUploadIntent = internalAction({
  args: { uploadToken: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const intent: { objectKey: string } | null = await ctx.runQuery(internal.seo.mediaModel.getExpiredUnclaimedIntent, args);
    if (!intent) return null;
    try { await deletePublicMediaObject(intent.objectKey); }
    catch (error) {
      console.error("Unable to clean up SEO media upload", error instanceof Error ? error.name : "UnknownError");
      return null;
    }
    await ctx.runMutation(internal.seo.mediaModel.deleteExpiredUnclaimedIntent, { uploadToken: args.uploadToken, objectKey: intent.objectKey });
    return null;
  },
});

export function imageDimensions(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/png" && bytes.length >= 24) {
    return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
  }
  if (contentType === "image/jpeg") return jpegDimensions(bytes);
  if (contentType === "image/webp") return webpDimensions(bytes);
  return null;
}

function jpegDimensions(bytes: Uint8Array) {
  let offset = 2;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    const length = readUint16BE(bytes, offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (sof.has(marker) && length >= 7) {
      return { height: readUint16BE(bytes, offset + 5), width: readUint16BE(bytes, offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array) {
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === "VP8X") return { width: 1 + readUint24LE(bytes, 24), height: 1 + readUint24LE(bytes, 27) };
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: readUint16LE(bytes, 26) & 0x3fff, height: readUint16LE(bytes, 28) & 0x3fff };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = (bytes[21] ?? 0) | ((bytes[22] ?? 0) << 8) | ((bytes[23] ?? 0) << 16) | ((bytes[24] ?? 0) << 24);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

function readUint16BE(bytes: Uint8Array, offset: number) { return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0); }
function readUint16LE(bytes: Uint8Array, offset: number) { return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8); }
function readUint24LE(bytes: Uint8Array, offset: number) { return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16); }
function readUint32BE(bytes: Uint8Array, offset: number) { return (((bytes[offset] ?? 0) * 0x1000000) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0)) >>> 0; }
