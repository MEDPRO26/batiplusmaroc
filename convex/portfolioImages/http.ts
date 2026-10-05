import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction } from "../_generated/server";
import { verificationCorsHeaders, verificationPreflight } from "../companyVerification/httpAccess";
import { PUBLIC_MEDIA_MAX_BYTES } from "../storage/constants";
import { matchesImageSignature } from "../storage/imageValidation";
import { PORTFOLIO_IMAGE_HTTP_PREFIX } from "./constants";
import type { PortfolioImageFileDescriptor } from "./index";

const noStore = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export const uploadImage = httpAction(async (ctx, request) => {
  const cors = verificationCorsHeaders(request);
  if (!cors) return new Response("Upload rejected", { status: 400, headers: { ...noStore, Vary: "Origin" } });
  const headers = { ...noStore, ...cors };
  let storageId: Id<"_storage"> | undefined;
  try {
    const uploadToken = request.headers.get("X-Upload-Token") ?? "";
    const expected: { contentType: string; size: number } = await ctx.runQuery(internal.portfolioImages.index.authorizeUpload, { uploadToken, now: Date.now() });
    const contentType = request.headers.get("Content-Type");
    if (contentType !== expected.contentType || Number(request.headers.get("Content-Length")) > PUBLIC_MEDIA_MAX_BYTES) throw new Error("Invalid file");
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Empty file");
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PUBLIC_MEDIA_MAX_BYTES || size > expected.size) { await reader.cancel(); throw new Error("Too large"); }
      chunks.push(new Uint8Array(value));
    }
    const blob = new Blob(chunks, { type: contentType });
    if (!size || size !== expected.size || !matchesImageSignature(contentType, new Uint8Array(await blob.slice(0, 16).arrayBuffer()))) throw new Error("Invalid file");
    storageId = await ctx.storage.store(blob);
    const imageId: Id<"portfolioImages"> = await ctx.runMutation(internal.portfolioImages.index.bindUpload, {
      uploadToken, storageId, contentType: contentType as PortfolioImageFileDescriptor["contentType"], size,
    });
    // The native storage ID is deliberately never returned, even to the uploader.
    return Response.json({ imageId }, { headers });
  } catch {
    if (storageId) {
      try { await ctx.runMutation(internal.portfolioImages.index.cleanupFailedUpload, { storageId }); }
      catch { await ctx.scheduler.runAfter(0, internal.portfolioImages.index.cleanupFailedUpload, { storageId }); }
    }
    return new Response("Upload rejected", { status: 400, headers });
  }
});

export const privatePreview = httpAction(async (ctx, request) => {
  const cors = verificationCorsHeaders(request);
  if (!cors) return new Response("Not found", { status: 404, headers: { ...noStore, Vary: "Origin" } });
  try {
    const imageId = new URL(request.url).pathname.slice(`${PORTFOLIO_IMAGE_HTTP_PREFIX}private/`.length) as Id<"portfolioImages">;
    const file: PortfolioImageFileDescriptor = await ctx.runQuery(internal.portfolioImages.index.authorizePrivatePreview, { imageId });
    const blob = await ctx.storage.get(file.storageId);
    if (!blob || blob.size !== file.size || (blob.type && blob.type !== file.contentType)) throw new Error("Missing file");
    return new Response(blob, { headers: { ...noStore, ...cors, "Content-Type": file.contentType, "Content-Length": String(file.size) } });
  } catch { return new Response("Not found", { status: 404, headers: { ...noStore, ...cors } }); }
});

export const publicImage = httpAction(async (ctx, request) => {
  try {
    const imageId = new URL(request.url).pathname.slice(`${PORTFOLIO_IMAGE_HTTP_PREFIX}public/`.length) as Id<"portfolioImages">;
    const file: PortfolioImageFileDescriptor = await ctx.runQuery(internal.portfolioImages.index.authorizePublicImage, { imageId });
    const blob = await ctx.storage.get(file.storageId);
    if (!blob || blob.size !== file.size || (blob.type && blob.type !== file.contentType)) throw new Error("Missing file");
    return new Response(blob, { headers: { ...noStore, "Content-Type": file.contentType, "Content-Length": String(file.size) } });
  } catch { return new Response("Not found", { status: 404, headers: noStore }); }
});

export const uploadPreflight = httpAction(async (_ctx, request) => verificationPreflight(request, "POST"));
export const previewPreflight = httpAction(async (_ctx, request) => verificationPreflight(request, "GET"));
