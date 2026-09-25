import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action, internalMutation, internalQuery, mutation } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  hasPdfMagicBytes,
  MESSAGE_ATTACHMENT_UPLOAD_TTL_MS,
  normalizePdfContentType,
  sanitizeMessagePdfFileName,
  validateMessagePdfMetadata,
} from "./attachmentRules";
import { requireConversationAccess, requireConversationAccessForUser, sendAuthorizedMessage } from "./index";

const uploadDescriptorValidator = v.object({
  uploadIntentId: v.id("messageAttachmentUploadIntents"),
  originalFileName: v.string(),
  sizeBytes: v.number(),
});

type UploadDescriptor = {
  uploadIntentId: Id<"messageAttachmentUploadIntents">;
  originalFileName: string;
  sizeBytes: number;
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
      userId: access.viewer.userId,
      token: uploadToken,
      originalFileName: fileName,
      expectedContentType: "application/pdf",
      expectedSize: args.size,
      expiresAt: now + MESSAGE_ATTACHMENT_UPLOAD_TTL_MS,
      createdAt: now,
    });
    return { uploadUrl: await ctx.storage.generateUploadUrl(), uploadToken, fileName };
  },
});

export const inspectUpload = internalQuery({
  args: {
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    uploadToken: v.string(),
    storageId: v.id("_storage"),
    clientMessageId: v.string(),
    now: v.number(),
  },
  returns: uploadDescriptorValidator,
  handler: async (ctx, args) => {
    await requireVerifiedCompanyConversation(ctx, args.userId, args.conversationId);
    const intent = await ctx.db.query("messageAttachmentUploadIntents").withIndex("by_token", (q) => q.eq("token", args.uploadToken)).unique();
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    const existing = await ctx.db.query("messages").withIndex("by_conversationId_and_senderUserId_and_clientMessageId", (q) => q.eq("conversationId", args.conversationId).eq("senderUserId", args.userId).eq("clientMessageId", args.clientMessageId)).unique();
    const existingAttachment = existing
      ? await ctx.db.query("messageAttachments").withIndex("by_messageId", (q) => q.eq("messageId", existing._id)).unique()
      : null;
    const isCommittedRetry = intent?.claimedAt !== undefined && existingAttachment?.storageId === args.storageId;
    if (!intent || intent.conversationId !== args.conversationId || intent.userId !== args.userId || (intent.claimedAt !== undefined && !isCommittedRetry) || intent.expiresAt < args.now || !metadata) {
      throw new ConvexError("INVALID_MESSAGE_PDF");
    }
    validateMessagePdfMetadata(metadata.contentType ?? intent.expectedContentType, metadata.size);
    if ((metadata.contentType && normalizePdfContentType(metadata.contentType) !== intent.expectedContentType) || metadata.size !== intent.expectedSize) {
      throw new ConvexError("INVALID_MESSAGE_PDF");
    }
    return { uploadIntentId: intent._id, originalFileName: intent.originalFileName, sizeBytes: metadata.size };
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
    const existing = await ctx.db.query("messages").withIndex("by_conversationId_and_senderUserId_and_clientMessageId", (q) => q.eq("conversationId", args.conversationId).eq("senderUserId", args.userId).eq("clientMessageId", args.clientMessageId)).unique();
    if (existing) {
      const attachment = await ctx.db.query("messageAttachments").withIndex("by_messageId", (q) => q.eq("messageId", existing._id)).unique();
      if (!attachment || attachment.storageId !== args.storageId) throw new ConvexError("INVALID_MESSAGE_PDF");
      return { messageId: existing._id, attachmentId: attachment._id, createdAt: existing.createdAt, duplicate: true };
    }
    const intent = await ctx.db.query("messageAttachmentUploadIntents").withIndex("by_token", (q) => q.eq("token", args.uploadToken)).unique();
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!intent || intent.conversationId !== args.conversationId || intent.userId !== args.userId || intent.claimedAt || intent.expiresAt < Date.now() || !metadata) {
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
        sizeBytes: metadata.size,
        uploadIntentId: intent._id,
      },
    });
    if (!result.attachmentId) throw new ConvexError("INVALID_MESSAGE_PDF");
    return { ...result, attachmentId: result.attachmentId };
  },
});

export const deleteRejectedUploadIntent = internalMutation({
  args: { userId: v.id("users"), uploadToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intent = await ctx.db.query("messageAttachmentUploadIntents").withIndex("by_token", (q) => q.eq("token", args.uploadToken)).unique();
    if (intent && intent.userId === args.userId && !intent.claimedAt) await ctx.db.delete(intent._id);
    return null;
  },
});

export const sendMessageWithAttachment = action({
  args: {
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
    const blob = await ctx.storage.get(args.storageId);
    const prefix = blob ? new Uint8Array(await blob.slice(0, 5).arrayBuffer()) : new Uint8Array();
    if (!blob || blob.size !== descriptor.sizeBytes || !hasPdfMagicBytes(prefix)) {
      if (blob) await ctx.storage.delete(args.storageId);
      await ctx.runMutation(internal.messages.attachments.deleteRejectedUploadIntent, { userId, uploadToken: args.uploadToken });
      throw new ConvexError("INVALID_MESSAGE_PDF");
    }
    return await ctx.runMutation(internal.messages.attachments.commitAttachmentMessage, {
      userId,
      conversationId: args.conversationId,
      body: args.body,
      clientMessageId: args.clientMessageId,
      uploadToken: args.uploadToken,
      storageId: args.storageId,
    });
  },
});

export const discardAttachmentUpload = mutation({
  args: { conversationId: v.id("conversations"), uploadToken: v.string(), storageId: v.optional(v.id("_storage")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireConversationAccess(ctx, args.conversationId);
    if (access.viewer.viewerType !== "company") throw new ConvexError("CONVERSATION_NOT_FOUND");
    const intent = await ctx.db.query("messageAttachmentUploadIntents").withIndex("by_token", (q) => q.eq("token", args.uploadToken)).unique();
    if (!intent || intent.conversationId !== args.conversationId || intent.userId !== access.viewer.userId || intent.claimedAt) {
      throw new ConvexError("INVALID_MESSAGE_PDF");
    }
    if (args.storageId) await ctx.storage.delete(args.storageId);
    await ctx.db.delete(intent._id);
    return null;
  },
});
