import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { env, httpAction, internalMutation, internalQuery, mutation } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { verificationCorsHeaders, verificationPreflight } from "../companyVerification/httpAccess";
import { normalizePdfContentType } from "../messages/attachmentRules";
import { assertUnreferencedPrivateFile } from "../storage/privateFileReferences";
import { boundPdfMetadata, freshPdfMetadata, readPdfUpload, validatePdfSize } from "../storage/privatePdf";
import { requireClientUser, requireOwnedEditableProject, requireOwnedProject } from "./access";
import { PROJECT_DOCUMENT_MAX_BYTES, PROJECT_UPLOAD_TTL_MS } from "./constants";
import type { Id } from "../_generated/dataModel";

const code = "INVALID_PROJECT_DOCUMENT";
export async function createAttachmentUploadIntent(ctx: MutationCtx, args: {
  projectId: Id<"projects">; fileName: string; contentType: string; size: number;
}) {
  const { userId } = await requireClientUser(ctx);
  await requireOwnedEditableProject(ctx, userId, args.projectId);
  validatePdfSize(args.size, PROJECT_DOCUMENT_MAX_BYTES, code);
  const fileName = args.fileName.trim();
  if (!fileName || fileName.length > 180 || normalizePdfContentType(args.contentType) !== "application/pdf") throw new ConvexError(code);
  const uploadToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const now = Date.now();
  await ctx.db.insert("projectAttachmentUploadIntents", { projectId: args.projectId, userId, token: uploadToken,
    fileName, expectedSize: args.size, expiresAt: now + PROJECT_UPLOAD_TTL_MS, createdAt: now });
  return { uploadUrl: `${env.CONVEX_SITE_URL.replace(/\/$/, "")}/projects/attachments/upload`, uploadToken };
}

async function ownedIntent(ctx: QueryCtx | MutationCtx, token: string, editable: boolean) {
  const { userId } = await requireClientUser(ctx);
  if (!token || token.length > 256) throw new ConvexError(code);
  const intent = await ctx.db.query("projectAttachmentUploadIntents").withIndex("by_token", q => q.eq("token", token)).unique();
  if (!intent || intent.userId !== userId || !intent.fileName || intent.expectedSize === undefined) throw new ConvexError(code);
  if (editable) await requireOwnedEditableProject(ctx, userId, intent.projectId);
  else await requireOwnedProject(ctx, userId, intent.projectId);
  return intent;
}

export async function claimAttachmentUpload(ctx: MutationCtx, projectId: Id<"projects">, token: string) {
  const intent = await ownedIntent(ctx, token, true);
  if (intent.projectId !== projectId || intent.claimedAt !== undefined || intent.discardedAt !== undefined || intent.expiresAt <= Date.now()) throw new ConvexError(code);
  const file = await boundPdfMetadata(ctx, intent, PROJECT_DOCUMENT_MAX_BYTES, code);
  return { intent, ...file, fileName: intent.fileName! };
}

export const authorizeUpload = internalQuery({
  args: { uploadToken: v.string(), now: v.number() }, returns: v.object({ size: v.number() }),
  handler: async (ctx, args) => {
    const intent = await ownedIntent(ctx, args.uploadToken, true);
    if (intent.claimedAt !== undefined || intent.discardedAt !== undefined || intent.storageId || intent.expiresAt <= args.now) throw new ConvexError(code);
    return { size: intent.expectedSize! };
  },
});

export const bindUpload = internalMutation({
  args: { uploadToken: v.string(), storageId: v.id("_storage") }, returns: v.null(),
  handler: async (ctx, args) => {
    const intent = await ownedIntent(ctx, args.uploadToken, true);
    if (intent.claimedAt !== undefined || intent.discardedAt !== undefined || intent.storageId || intent.expiresAt <= Date.now()) throw new ConvexError(code);
    const metadata = await freshPdfMetadata(ctx, args.storageId, intent.expectedSize!, PROJECT_DOCUMENT_MAX_BYTES);
    await ctx.db.patch(intent._id, { storageId: args.storageId, size: metadata.size, sha256: metadata.sha256 });
    return null;
  },
});

export const discardUpload = mutation({
  args: { projectId: v.id("projects"), uploadToken: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const intent = await ownedIntent(ctx, args.uploadToken, false);
    if (intent.projectId !== args.projectId || intent.claimedAt !== undefined) throw new ConvexError(code);
    if (intent.discardedAt !== undefined) return null;
    if (intent.storageId) { await assertUnreferencedPrivateFile(ctx, intent.storageId); await ctx.storage.delete(intent.storageId); }
    await ctx.db.patch(intent._id, { discardedAt: Date.now() });
    return null;
  },
});

const noStore = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export const uploadAttachment = httpAction(async (ctx, request) => {
  const cors = verificationCorsHeaders(request);
  const headers = { ...noStore, ...(cors ?? { Vary: "Origin" }) };
  let storageId: Id<"_storage"> | undefined;
  try {
    if (!cors) throw new Error("Invalid origin");
    const uploadToken = request.headers.get("X-Upload-Token") ?? "";
    const expected = await ctx.runQuery(internal.projects.attachments.authorizeUpload, { uploadToken, now: Date.now() });
    storageId = await ctx.storage.store(await readPdfUpload(request, expected.size, PROJECT_DOCUMENT_MAX_BYTES));
    await ctx.runMutation(internal.projects.attachments.bindUpload, { uploadToken, storageId });
    return Response.json({ uploaded: true }, { headers });
  } catch {
    if (storageId) {
      try { await ctx.runMutation(internal.storage.privatePdf.cleanupFailedUpload, { storageId }); }
      catch { await ctx.scheduler.runAfter(0, internal.storage.privatePdf.cleanupFailedUpload, { storageId }); }
    }
    return new Response("Upload rejected", { status: 400, headers });
  }
});
export const uploadPreflight = httpAction(async (_ctx, request) => verificationPreflight(request, "POST"));
