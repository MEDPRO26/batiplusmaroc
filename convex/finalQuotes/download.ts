import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction, internalQuery } from "../_generated/server";
import { requireFinalQuoteParticipant } from "./index";

export const authorizePdfDownload = internalQuery({
  args: { revisionId: v.id("finalQuoteRevisions") },
  returns: v.object({
    storageId: v.id("_storage"),
    fileName: v.string(),
  }),
  handler: async (ctx, args) => {
    const revision = await ctx.db.get(args.revisionId);
    if (!revision?.pdfStorageId) throw new ConvexError("FINAL_QUOTE_PDF_NOT_FOUND");
    const parent = await ctx.db.get(revision.finalQuoteId);
    if (!parent) throw new ConvexError("FINAL_QUOTE_PDF_NOT_FOUND");
    await requireFinalQuoteParticipant(ctx, parent);
    return {
      storageId: revision.pdfStorageId,
      fileName: revision.pdfFileName ?? `final-quote-revision-${revision.revisionNumber}.pdf`,
    };
  },
});

function safeFileName(value: string) {
  const cleaned = value.replace(/[\r\n"\\/]/g, "_").trim();
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "final-quote"}.pdf`;
}

export const servePdf = httpAction(async (ctx, request) => {
  const prefix = "/final-quotes/pdf/";
  const pathname = new URL(request.url).pathname;
  const rawRevisionId = decodeURIComponent(pathname.slice(prefix.length));
  if (!rawRevisionId || rawRevisionId.includes("/")) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const descriptor = await ctx.runQuery(internal.finalQuotes.download.authorizePdfDownload, {
      revisionId: rawRevisionId as Id<"finalQuoteRevisions">,
    });
    const blob = await ctx.storage.get(descriptor.storageId);
    if (!blob) return new Response("Not found", { status: 404 });
    const fileName = safeFileName(descriptor.fileName);
    return new Response(blob, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // Avoid revealing whether a private revision exists.
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
});
