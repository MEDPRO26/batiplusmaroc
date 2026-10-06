import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { env, httpAction, internalMutation, internalQuery, mutation } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireVerifiedCompanyMarketplaceUser } from "../companies/access";
import { verificationCorsHeaders, verificationPreflight } from "../companyVerification/httpAccess";
import { normalizePdfContentType, validateUploadFileName } from "../messages/attachmentRules";
import { assertUnreferencedPrivateFile } from "../storage/privateFileReferences";
import { boundPdfMetadata, freshPdfMetadata, readPdfUpload, validatePdfSize } from "../storage/privatePdf";

const code = "INVALID_FINAL_QUOTE_PDF";
const MAX_BYTES = 15 * 1024 * 1024;
const TTL_MS = 10 * 60 * 1000;

async function requireUploadRelationship(ctx: QueryCtx | MutationCtx, finalQuoteId: Id<"finalQuotes">) {
  const access = await requireVerifiedCompanyMarketplaceUser(ctx);
  const parent = await ctx.db.get(finalQuoteId);
  if (!parent || parent.companyId !== access.company._id || (parent.status !== "draft" && parent.status !== "changes_requested")) throw new ConvexError("FINAL_QUOTE_NOT_FOUND");
  const [project, conversation, quote] = await Promise.all([
    ctx.db.get(parent.projectId), ctx.db.get(parent.conversationId), ctx.db.get(parent.initialQuoteId),
  ]);
  if (!project || !conversation || !quote || (project.status !== "published" && project.status !== "in_discussion") ||
      project.clientId !== parent.clientId || conversation.status !== "active" || conversation.projectId !== parent.projectId ||
      conversation.companyId !== parent.companyId || conversation.clientId !== parent.clientId || conversation.quoteId !== parent.initialQuoteId ||
      quote.projectId !== parent.projectId || quote.companyId !== parent.companyId || quote.status !== "discussion_open") throw new ConvexError("FINAL_QUOTE_INTEGRITY_ERROR");
  return { ...access, parent };
}

export async function createPdfUploadIntent(ctx: MutationCtx, args: {
  finalQuoteId: Id<"finalQuotes">; fileName: string; contentType: string; size: number;
}) {
  const { parent, userId, company } = await requireUploadRelationship(ctx, args.finalQuoteId);
  validatePdfSize(args.size, MAX_BYTES, code);
  const fileName = args.fileName.trim().replace(/\s+/g, " ");
  if (!fileName || fileName.length > 180 || normalizePdfContentType(args.contentType) !== "application/pdf") throw new ConvexError(code);
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`, now = Date.now();
  await ctx.db.insert("finalQuoteUploadIntents", { finalQuoteId: parent._id, userId, companyId: company._id,
    conversationId: parent.conversationId, token, fileName, uploadFileName: validateUploadFileName(args.fileName, code),
    expectedSize: args.size, expiresAt: now + TTL_MS, createdAt: now });
  return { uploadUrl: `${env.CONVEX_SITE_URL.replace(/\/$/, "")}/final-quotes/pdf/upload`, uploadToken: token };
}

async function ownedIntent(ctx: QueryCtx | MutationCtx, token: string, finalQuoteId?: Id<"finalQuotes">) {
  if (!token || token.length > 256) throw new ConvexError(code);
  const intent = await ctx.db.query("finalQuoteUploadIntents").withIndex("by_token", q => q.eq("token", token)).unique();
  if (!intent || (finalQuoteId && intent.finalQuoteId !== finalQuoteId)) throw new ConvexError(code);
  const access = await requireUploadRelationship(ctx, intent.finalQuoteId);
  if (intent.userId !== access.userId || intent.companyId !== access.company._id || intent.conversationId !== access.parent.conversationId ||
      !intent.fileName || intent.uploadFileName === undefined || intent.expectedSize === undefined) throw new ConvexError(code);
  return intent;
}

export async function claimPdfUpload(ctx: MutationCtx, finalQuoteId: Id<"finalQuotes">, token: string) {
  const intent = await ownedIntent(ctx, token, finalQuoteId);
  if (intent.claimedAt !== undefined || intent.discardedAt !== undefined || intent.expiresAt <= Date.now()) throw new ConvexError(code);
  const file = await boundPdfMetadata(ctx, intent, MAX_BYTES, code);
  return { intent, ...file, fileName: intent.fileName!, uploadFileName: intent.uploadFileName! };
}

export const authorizeUpload = internalQuery({
  args: { uploadToken: v.string(), now: v.number() }, returns: v.object({ size: v.number() }),
  handler: async (ctx, args) => {
    const intent = await ownedIntent(ctx, args.uploadToken);
    if (intent.claimedAt !== undefined || intent.discardedAt !== undefined || intent.storageId || intent.expiresAt <= args.now) throw new ConvexError(code);
    return { size: intent.expectedSize! };
  },
});

export const bindUpload = internalMutation({
  args: { uploadToken: v.string(), storageId: v.id("_storage") }, returns: v.null(),
  handler: async (ctx, args) => {
    const intent = await ownedIntent(ctx, args.uploadToken);
    if (intent.claimedAt !== undefined || intent.discardedAt !== undefined || intent.storageId || intent.expiresAt <= Date.now()) throw new ConvexError(code);
    const metadata = await freshPdfMetadata(ctx, args.storageId, intent.expectedSize!, MAX_BYTES);
    await ctx.db.patch(intent._id, { storageId: args.storageId, size: metadata.size, sha256: metadata.sha256 });
    return null;
  },
});

export const discardUpload = mutation({
  args: { finalQuoteId: v.id("finalQuotes"), uploadToken: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    // Committed intents are never discardable, irrespective of current parent state.
    const access = await requireVerifiedCompanyMarketplaceUser(ctx);
    const intent = await ctx.db.query("finalQuoteUploadIntents").withIndex("by_token", q => q.eq("token", args.uploadToken)).unique();
    const parent = await ctx.db.get(args.finalQuoteId);
    if (!parent || !intent || intent.finalQuoteId !== parent._id || intent.userId !== access.userId ||
        intent.companyId !== access.company._id || parent.companyId !== access.company._id || intent.conversationId !== parent.conversationId ||
        intent.claimedAt !== undefined) throw new ConvexError(code);
    if (intent.discardedAt !== undefined) return null;
    if (intent.storageId) { await assertUnreferencedPrivateFile(ctx, intent.storageId); await ctx.storage.delete(intent.storageId); }
    await ctx.db.patch(intent._id, { discardedAt: Date.now() });
    return null;
  },
});

const noStore = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export const uploadPdf = httpAction(async (ctx, request) => {
  const cors = verificationCorsHeaders(request);
  const headers = { ...noStore, ...(cors ?? { Vary: "Origin" }) };
  let storageId: Id<"_storage"> | undefined;
  try {
    if (!cors) throw new Error("Invalid origin");
    const uploadToken = request.headers.get("X-Upload-Token") ?? "";
    const expected = await ctx.runQuery(internal.finalQuotes.pdfUploads.authorizeUpload, { uploadToken, now: Date.now() });
    storageId = await ctx.storage.store(await readPdfUpload(request, expected.size, MAX_BYTES));
    await ctx.runMutation(internal.finalQuotes.pdfUploads.bindUpload, { uploadToken, storageId });
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
