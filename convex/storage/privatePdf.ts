import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { hasPdfMagicBytes, normalizePdfContentType } from "../messages/attachmentRules";
import { assertUnreferencedPrivateFile } from "./privateFileReferences";

export function validatePdfSize(size: number, maxBytes: number, code: string) {
  if (!Number.isInteger(size) || size < 1 || size > maxBytes) throw new ConvexError(code);
}

/** Read actual bytes with a hard bound before creating an immutable storage object. */
export async function readPdfUpload(request: Request, expectedSize: number, maxBytes: number) {
  validatePdfSize(expectedSize, maxBytes, "INVALID_PRIVATE_PDF");
  if (request.headers.get("Content-Type") !== "application/pdf") throw new Error("Invalid PDF");
  const length = request.headers.get("Content-Length");
  if (length !== null && Number(length) !== expectedSize) throw new Error("Invalid size");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Empty PDF");
  let size = 0;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > expectedSize || size > maxBytes) { await reader.cancel(); throw new Error("Too large"); }
    chunks.push(new Uint8Array(value));
  }
  const blob = new Blob(chunks, { type: "application/pdf" });
  if (size !== expectedSize || !hasPdfMagicBytes(new Uint8Array(await blob.slice(0, 5).arrayBuffer()))) throw new Error("Invalid PDF");
  return blob;
}

export async function isPrivatePdfUploadBound(ctx: QueryCtx | MutationCtx, storageId: Id<"_storage">) {
  const bound = await Promise.all([
    ctx.db.query("projectAttachmentUploadIntents").withIndex("by_storageId", q => q.eq("storageId", storageId)).first(),
    ctx.db.query("finalQuoteUploadIntents").withIndex("by_storageId", q => q.eq("storageId", storageId)).first(),
    ctx.db.query("messageAttachmentUploadIntents").withIndex("by_storageId", q => q.eq("storageId", storageId)).first(),
  ]);
  return bound.some(Boolean);
}

export async function freshPdfMetadata(ctx: MutationCtx, storageId: Id<"_storage">, expectedSize: number, maxBytes: number) {
  await assertUnreferencedPrivateFile(ctx, storageId);
  if (await isPrivatePdfUploadBound(ctx, storageId)) throw new ConvexError("PRIVATE_FILE_REFERENCED");
  const metadata = await ctx.db.system.get("_storage", storageId);
  validatePdfSize(expectedSize, maxBytes, "INVALID_PRIVATE_PDF");
  if (!metadata || metadata.size !== expectedSize ||
      (metadata.contentType && normalizePdfContentType(metadata.contentType) !== "application/pdf")) throw new ConvexError("INVALID_PRIVATE_PDF");
  return metadata;
}

export async function boundPdfMetadata(ctx: MutationCtx, intent: {
  storageId?: Id<"_storage">; size?: number; sha256?: string; expectedSize?: number;
}, maxBytes: number, code: string) {
  if (!intent.storageId || !intent.sha256 || intent.size !== intent.expectedSize || intent.size === undefined) throw new ConvexError(code);
  validatePdfSize(intent.size, maxBytes, code);
  await assertUnreferencedPrivateFile(ctx, intent.storageId);
  const metadata = await ctx.db.system.get("_storage", intent.storageId);
  if (!metadata || metadata.sha256 !== intent.sha256 || metadata.size !== intent.size ||
      (metadata.contentType && normalizePdfContentType(metadata.contentType) !== "application/pdf")) throw new ConvexError(code);
  return { storageId: intent.storageId, size: metadata.size };
}

/** Only upload HTTP handlers call this with their freshly created, unbound object. */
export const cleanupFailedUpload = internalMutation({
  args: { storageId: v.id("_storage") }, returns: v.null(),
  handler: async (ctx, args) => {
    if (await isPrivatePdfUploadBound(ctx, args.storageId)) return null;
    await assertUnreferencedPrivateFile(ctx, args.storageId);
    await ctx.storage.delete(args.storageId);
    return null;
  },
});
