import { assertNotVerificationStorage } from "../storage/verificationPrivacy";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { api, internal } from "../_generated/api";
import { assertUnreferencedPrivateFile } from "../storage/privateFileReferences";
import type { Id } from "../_generated/dataModel";
import { action, env, internalMutation, internalQuery, mutation } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  hasPdfMagicBytes,
  MESSAGE_ATTACHMENT_UPLOAD_TTL_MS,
  normalizePdfContentType,
  sanitizeMessagePdfFileName,
  validateMessagePdfMetadata,
  validateUploadFileName,
} from "./attachmentRules";
import { requireConversationAccess, requireConversationAccessForUser, sendAuthorizedMessage } from "./index";

const uploadDescriptorValidator = v.object({
  uploadIntentId: v.id("messageAttachmentUploadIntents"),
  originalFileName: v.string(),
  sizeBytes: v.number(),
  storageId: v.id("_storage"),
});

type UploadDescriptor = {
  uploadIntentId: Id<"messageAttachmentUploadIntents">;
  originalFileName: string;
  sizeBytes: number;
  storageId: Id<"_storage">;
};

type AttachmentMessageResult = {
  messageId: Id<"messages">;
  attachmentId: Id<"messageAttachments">;
  createdAt: number;
  duplicate: boolean;
};

async function requireVerifiedCompanyConversation(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  conversationId: Id<"conversations">,
) {
  const access = await requireConversationAccessForUser(ctx, userId, conversationId);
  if (access.viewer.viewerType !== "company" || access.conversation.status !== "active") {
    throw new ConvexError("CONVERSATION_NOT_FOUND");
  }
  const company = await ctx.db.get(access.conversation.companyId);
  if (!company || company.onboardingStatus !== "completed" || company.verificationStatus !== "verified") {
    throw new ConvexError("COMPANY_VERIFICATION_REQUIRED");
  }
  return access;
}

export const generateAttachmentUploadUrl = mutation({
  args: {
    conversationId: v.id("conversations"),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.object({ uploadUrl: v.string(), uploadToken: v.string(), fileName: v.string() }),
  handler: async (ctx, args) => {
    const access = await requireConversationAccess(ctx, args.conversationId);
    if (access.viewer.viewerType !== "company" || access.conversation.status !== "active") {
      throw new ConvexError("CONVERSATION_NOT_FOUND");
    }
    const company = await ctx.db.get(access.conversation.companyId);
    if (!company || company.onboardingStatus !== "completed" || company.verificationStatus !== "verified") {
      throw new ConvexError("COMPANY_VERIFICATION_REQUIRED");
    }
    validateMessagePdfMetadata(args.contentType, args.size);
    const fileName = sanitizeMessagePdfFileName(args.fileName);
    const uploadToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const now = Date.now();
    await ctx.db.insert("messageAttachmentUploadIntents", {
      conversationId: access.conversation._id,
      companyId: access.conversation.companyId,
      userId: access.viewer.userId,
      token: uploadToken,
      originalFileName: fileName,
      uploadFileName: validateUploadFileName(args.fileName, "INVALID_MESSAGE_PDF"),
      expectedContentType: "application/pdf",
      expectedSize: args.size,
      expiresAt: now + MESSAGE_ATTACHMENT_UPLOAD_TTL_MS,
      createdAt: now,
    });
    return { uploadUrl: `${env.CONVEX_SITE_URL.replace(/\/$/, "")}/messages/attachments/upload`, uploadToken, fileName };
  },
});

/** Reauthorize current identity and the immutable conversation/Company binding. */
async function ownedUploadIntent(ctx: QueryCtx | MutationCtx, uploadToken: string) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
  if (!uploadToken || uploadToken.length > 256) throw new ConvexError("INVALID_MESSAGE_PDF");
  const intent = await ctx.db.query("messageAttachmentUploadIntents").withIndex("by_token", q => q.eq("token", uploadToken)).unique();
  if (!intent || intent.userId !== userId) throw new ConvexError("INVALID_MESSAGE_PDF");
  const access = await requireVerifiedCompanyConversation(ctx, userId, intent.conversationId);
  if (intent.companyId !== access.conversation.companyId) throw new ConvexError("INVALID_MESSAGE_PDF");
  return { intent, access };
}

export const authorizeUpload = internalQuery({
  args: { uploadToken: v.string(), now: v.number() },
  returns: v.object({ size: v.number() }),
  handler: async (ctx, args) => {
    const { intent } = await ownedUploadIntent(ctx, args.uploadToken);
    if (intent.claimedAt !== undefined || intent.discardedAt !== undefined || intent.storageId || intent.expiresAt <= args.now) throw new ConvexError("INVALID_MESSAGE_PDF");
    return { size: intent.expectedSize };
  },
});

/** Only the authenticated HTTP upload calls this after storing a newly created file. */
export const bindUpload = internalMutation({
  args: { uploadToken: v.string(), storageId: v.id("_storage") }, returns: v.null(),
  handler: async (ctx, args) => {
    const { intent } = await ownedUploadIntent(ctx, args.uploadToken);
    if (intent.claimedAt !== undefined || intent.discardedAt !== undefined || intent.storageId || intent.expiresAt <= Date.now()) throw new ConvexError("INVALID_MESSAGE_PDF");
    await assertUnreferencedPrivateFile(ctx, args.storageId);
    const bound = await ctx.db.query("messageAttachmentUploadIntents").withIndex("by_storageId", q => q.eq("storageId", args.storageId)).first();
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (bound || !metadata || metadata.size !== intent.expectedSize ||
        (metadata.contentType && normalizePdfContentType(metadata.contentType) !== intent.expectedContentType)) throw new ConvexError("INVALID_MESSAGE_PDF");
    await ctx.db.patch(intent._id, { storageId: args.storageId });
    return null;
  },
});

/** The caller supplies only a fresh server-created object, never a browser cleanup target. */
export const cleanupFailedUpload = internalMutation({
  args: { storageId: v.id("_storage") }, returns: v.null(),
  handler: async (ctx, args) => {
    const bound = await ctx.db.query("messageAttachmentUploadIntents").withIndex("by_storageId", q => q.eq("storageId", args.storageId)).first();
    if (bound) return null;
    await assertUnreferencedPrivateFile(ctx, args.storageId);
    await ctx.storage.delete(args.storageId);
    return null;
  },
});

export const inspectUpload = internalQuery({
  args: {
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    uploadToken: v.string(),
    storageId: v.optional(v.id("_storage")),
    clientMessageId: v.string(),
    now: v.number(),
  },
  returns: uploadDescriptorValidator,
  handler: async (ctx, args) => {
    const access = await requireVerifiedCompanyConversation(ctx, args.userId, args.conversationId);
    const intent = await ctx.db.query("messageAttachmentUploadIntents").withIndex("by_token", (q) => q.eq("token", args.uploadToken)).unique();
    if (args.storageId) await assertNotVerificationStorage(ctx, args.storageId);
    const storageId = intent?.storageId;
    if (!intent || !storageId || (args.storageId && args.storageId !== storageId) || intent.discardedAt !== undefined) throw new ConvexError("INVALID_MESSAGE_PDF");
    await assertNotVerificationStorage(ctx, storageId);
    const metadata = await ctx.db.system.get("_storage", storageId);
    const existing = await ctx.db.query("messages").withIndex("by_conversationId_and_senderUserId_and_clientMessageId", (q) => q.eq("conversationId", args.conversationId).eq("senderUserId", args.userId).eq("clientMessageId", args.clientMessageId)).unique();
    const existingAttachment = existing
      ? await ctx.db.query("messageAttachments").withIndex("by_messageId", (q) => q.eq("messageId", existing._id)).unique()
      : null;
    const isCommittedRetry = intent.claimedAt !== undefined && existingAttachment?.storageId === storageId;
    if (intent.conversationId !== args.conversationId || intent.userId !== args.userId ||
        intent.companyId !== access.conversation.companyId || (intent.claimedAt !== undefined && !isCommittedRetry) || intent.expiresAt <= args.now || !metadata) {
      throw new ConvexError("INVALID_MESSAGE_PDF");
    }
    validateMessagePdfMetadata(metadata.contentType ?? intent.expectedContentType, metadata.size);
    if ((metadata.contentType && normalizePdfContentType(metadata.contentType) !== intent.expectedContentType) || metadata.size !== intent.expectedSize) {
      throw new ConvexError("INVALID_MESSAGE_PDF");
    }
    return { uploadIntentId: intent._id, originalFileName: intent.originalFileName, sizeBytes: metadata.size, storageId };
  },
});

export const commitAttachmentMessage = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    body: v.string(),
    clientMessageId: v.string(),
    uploadToken: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.object({
    messageId: v.id("messages"),
    attachmentId: v.id("messageAttachments"),
    createdAt: v.number(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const access = await requireVerifiedCompanyConversation(ctx, args.userId, args.conversationId);
    const intent = await ctx.db.query("messageAttachmentUploadIntents").withIndex("by_token", q => q.eq("token", args.uploadToken)).unique();
    if (!intent || intent.userId !== args.userId || intent.conversationId !== args.conversationId ||
        intent.companyId !== access.conversation.companyId || intent.storageId !== args.storageId || intent.discardedAt !== undefined || intent.expiresAt <= Date.now()) throw new ConvexError("INVALID_MESSAGE_PDF");
    const existing = await ctx.db.query("messages").withIndex("by_conversationId_and_senderUserId_and_clientMessageId", (q) => q.eq("conversationId", args.conversationId).eq("senderUserId", args.userId).eq("clientMessageId", args.clientMessageId)).unique();
    if (existing) {
      const attachment = await ctx.db.query("messageAttachments").withIndex("by_messageId", (q) => q.eq("messageId", existing._id)).unique();
      if (!attachment || attachment.storageId !== args.storageId) throw new ConvexError("INVALID_MESSAGE_PDF");
      return { messageId: existing._id, attachmentId: attachment._id, createdAt: existing.createdAt, duplicate: true };
    }
    await assertUnreferencedPrivateFile(ctx, args.storageId);
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (intent.claimedAt !== undefined || !metadata) {
      throw new ConvexError("INVALID_MESSAGE_PDF");
    }
    validateMessagePdfMetadata(metadata.contentType ?? intent.expectedContentType, metadata.size);
    if (metadata.size !== intent.expectedSize || (metadata.contentType && normalizePdfContentType(metadata.contentType) !== intent.expectedContentType)) {
      throw new ConvexError("INVALID_MESSAGE_PDF");
    }
    const result = await sendAuthorizedMessage(ctx, access.conversation, access.viewer, {
      body: args.body,
      clientMessageId: args.clientMessageId,
      attachment: {
        storageId: args.storageId,
        originalFileName: intent.originalFileName,
        uploadFileName: intent.uploadFileName,
        sizeBytes: metadata.size,
        uploadIntentId: intent._id,
      },
    });
    if (!result.attachmentId) throw new ConvexError("INVALID_MESSAGE_PDF");
    return { ...result, attachmentId: result.attachmentId };
  },
});

export const sendMessageWithAttachment = action({
  args: {
    conversationId: v.id("conversations"),
    body: v.string(),
    clientMessageId: v.string(),
    uploadToken: v.string(),
    storageId: v.optional(v.id("_storage")),
  },
  returns: v.object({
    messageId: v.id("messages"),
    attachmentId: v.id("messageAttachments"),
    createdAt: v.number(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args): Promise<AttachmentMessageResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
    const descriptor: UploadDescriptor = await ctx.runQuery(internal.messages.attachments.inspectUpload, {
      userId,
      conversationId: args.conversationId,
      uploadToken: args.uploadToken,
      storageId: args.storageId,
      clientMessageId: args.clientMessageId,
      now: Date.now(),
    });
    const blob = await ctx.storage.get(descriptor.storageId);
    const prefix = blob ? new Uint8Array(await blob.slice(0, 5).arrayBuffer()) : new Uint8Array();
    if (!blob || blob.size !== descriptor.sizeBytes || !hasPdfMagicBytes(prefix)) {
      await ctx.runMutation(api.messages.attachments.discardAttachmentUpload, {
        conversationId: args.conversationId, uploadToken: args.uploadToken, storageId: descriptor.storageId,
      });
      throw new ConvexError("INVALID_MESSAGE_PDF");
    }
    return await ctx.runMutation(internal.messages.attachments.commitAttachmentMessage, {
      userId,
      conversationId: args.conversationId,
      body: args.body,
      clientMessageId: args.clientMessageId,
      uploadToken: args.uploadToken,
      storageId: descriptor.storageId,
    });
  },
});

export const discardAttachmentUpload = mutation({
  args: { conversationId: v.id("conversations"), uploadToken: v.string(), storageId: v.optional(v.id("_storage")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { intent } = await ownedUploadIntent(ctx, args.uploadToken);
    if (intent.conversationId !== args.conversationId || intent.claimedAt !== undefined) throw new ConvexError("INVALID_MESSAGE_PDF");
    if (args.storageId) {
      await assertNotVerificationStorage(ctx, args.storageId);
      if (args.storageId !== intent.storageId) throw new ConvexError("INVALID_MESSAGE_PDF");
    }
    // Retain a tombstone so retries cannot delete a different file or reopen an upload.
    if (intent.discardedAt !== undefined) return null;
    if (intent.expiresAt <= Date.now()) throw new ConvexError("INVALID_MESSAGE_PDF");
    if (intent.storageId) {
      await assertUnreferencedPrivateFile(ctx, intent.storageId);
      await ctx.storage.delete(intent.storageId);
    }
    await ctx.db.patch(intent._id, { discardedAt: Date.now() });
    return null;
  },
});
