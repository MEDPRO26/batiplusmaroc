import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction, internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { verificationCorsHeaders, verificationPreflight } from "../companyVerification/httpAccess";
import { assertNotVerificationStorage } from "../storage/verificationPrivacy";
import { requireClientUser, requireOwnedProject } from "./access";
import { PROJECT_DOCUMENT_MAX_BYTES } from "./constants";

export async function requireOwnedAttachment(ctx: QueryCtx, attachmentId: Id<"projectAttachments">) {
  const { userId } = await requireClientUser(ctx);
  const attachment = await ctx.db.get(attachmentId);
  if (!attachment || attachment.clientId !== userId) throw new ConvexError("PROJECT_ATTACHMENT_NOT_FOUND");
  await requireOwnedProject(ctx, userId, attachment.projectId);
  return attachment;
}

export const authorizeAttachmentDownload = internalQuery({
  args: { attachmentId: v.id("projectAttachments") },
  returns: v.object({ storageId: v.id("_storage"), fileName: v.string(), size: v.number() }),
  handler: async (ctx, args) => {
    const attachment = await requireOwnedAttachment(ctx, args.attachmentId);
    await assertNotVerificationStorage(ctx, attachment.storageId);
    if (attachment.contentType !== "application/pdf" || !Number.isInteger(attachment.size) ||
        attachment.size < 1 || attachment.size > PROJECT_DOCUMENT_MAX_BYTES) throw new ConvexError("PROJECT_ATTACHMENT_NOT_FOUND");
    return { storageId: attachment.storageId, fileName: attachment.fileName, size: attachment.size };
  },
});

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export const serveAttachment = httpAction(async (ctx, request) => {
  const cors = verificationCorsHeaders(request);
  const headers = { ...privateHeaders, ...(cors ?? { Vary: "Origin" }) };
  try {
    if (!cors) throw new Error("Not found");
    const attachmentId = decodeURIComponent(new URL(request.url).pathname.slice("/projects/attachments/".length));
    if (!attachmentId || attachmentId.includes("/")) throw new Error("Not found");
    const file = await ctx.runQuery(internal.projects.download.authorizeAttachmentDownload, {
      attachmentId: attachmentId as Id<"projectAttachments">,
    });
    const blob = await ctx.storage.get(file.storageId);
    if (!blob || blob.size !== file.size || (blob.type && blob.type !== "application/pdf")) throw new Error("Not found");
    const cleaned = file.fileName.replace(/[\u0000-\u001f\u007f"\\/]/g, "_").trim().slice(0, 180);
    const fileName = cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "document"}.pdf`;
    return new Response(blob, { headers: { ...headers,
      "Content-Type": "application/pdf", "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Access-Control-Expose-Headers": "Content-Disposition",
    } });
  } catch {
    return new Response("Not found", { status: 404, headers });
  }
});

export const downloadPreflight = httpAction(async (_ctx, request) => verificationPreflight(request, "GET"));
