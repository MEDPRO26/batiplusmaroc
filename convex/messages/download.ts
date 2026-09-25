import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction, internalQuery } from "../_generated/server";
import { requireConversationAccess } from "./index";

export const authorizeAttachmentDownload = internalQuery({
  args: { attachmentId: v.id("messageAttachments") },
  returns: v.object({ storageId: v.id("_storage"), fileName: v.string(), sizeBytes: v.number() }),
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) throw new ConvexError("MESSAGE_ATTACHMENT_NOT_FOUND");
    await requireConversationAccess(ctx, attachment.conversationId);
    const message = await ctx.db.get(attachment.messageId);
    if (!message || message.conversationId !== attachment.conversationId || message.senderUserId !== attachment.uploadedByUserId) {
      throw new ConvexError("MESSAGE_ATTACHMENT_NOT_FOUND");
    }
    return { storageId: attachment.storageId, fileName: attachment.originalFileName, sizeBytes: attachment.sizeBytes };
  },
});

function contentDispositionFileName(value: string) {
  return value.replace(/[\r\n"\\/]/g, "_").trim() || "document.pdf";
}

export const serveAttachment = httpAction(async (ctx, request) => {
  const prefix = "/messages/attachments/";
  const pathname = new URL(request.url).pathname;
  const rawAttachmentId = decodeURIComponent(pathname.slice(prefix.length));
  if (!rawAttachmentId || rawAttachmentId.includes("/")) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
  try {
    const descriptor = await ctx.runQuery(internal.messages.download.authorizeAttachmentDownload, {
      attachmentId: rawAttachmentId as Id<"messageAttachments">,
    });
    const blob = await ctx.storage.get(descriptor.storageId);
    if (!blob || blob.size !== descriptor.sizeBytes) throw new ConvexError("MESSAGE_ATTACHMENT_NOT_FOUND");
    const fileName = contentDispositionFileName(descriptor.fileName);
    return new Response(blob, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(descriptor.sizeBytes),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
});
