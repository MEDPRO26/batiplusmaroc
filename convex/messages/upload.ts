import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction } from "../_generated/server";
import { verificationCorsHeaders, verificationPreflight } from "../companyVerification/httpAccess";
import { hasPdfMagicBytes, MESSAGE_PDF_MAX_BYTES } from "./attachmentRules";

const noStore = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export const uploadAttachment = httpAction(async (ctx, request) => {
  const cors = verificationCorsHeaders(request);
  if (!cors) return new Response("Upload rejected", { status: 400, headers: { ...noStore, Vary: "Origin" } });
  const headers = { ...noStore, ...cors };
  let storageId: Id<"_storage"> | undefined;
  try {
    const uploadToken = request.headers.get("X-Upload-Token") ?? "";
    const expected = await ctx.runQuery(internal.messages.attachments.authorizeUpload, { uploadToken, now: Date.now() });
    if (request.headers.get("Content-Type") !== "application/pdf" || Number(request.headers.get("Content-Length")) > MESSAGE_PDF_MAX_BYTES) throw new Error("Invalid file");
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Empty file");
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MESSAGE_PDF_MAX_BYTES || size > expected.size) { await reader.cancel(); throw new Error("Too large"); }
      chunks.push(new Uint8Array(value));
    }
    const blob = new Blob(chunks, { type: "application/pdf" });
    if (size !== expected.size || !hasPdfMagicBytes(new Uint8Array(await blob.slice(0, 5).arrayBuffer()))) throw new Error("Invalid file");
    storageId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.messages.attachments.bindUpload, { uploadToken, storageId });
    return Response.json({ uploaded: true }, { headers });
  } catch {
    if (storageId) {
      try { await ctx.runMutation(internal.messages.attachments.cleanupFailedUpload, { storageId }); }
      catch { await ctx.scheduler.runAfter(0, internal.messages.attachments.cleanupFailedUpload, { storageId }); }
    }
    return new Response("Upload rejected", { status: 400, headers });
  }
});

export const uploadPreflight = httpAction(async (_ctx, request) => verificationPreflight(request, "POST"));
