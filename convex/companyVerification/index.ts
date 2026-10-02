import { ConvexError, v } from "convex/values";
import { httpAction, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireActiveCompanyMembership } from "../companies/access";
import { verificationCorsHeaders, verificationDocumentUrl, verificationHttpUrl, verificationPreflight } from "./httpAccess";
import { requireOwnerCompany } from "../companies/index";

const documentTypeValidator = v.union(
  v.literal("tax_compliance"),
  v.literal("rc"),
  v.literal("ice"),
  v.literal("insurance"),
  v.literal("other"),
);

const statusValidator = v.union(
  v.literal("draft"),
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
);

const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
const UPLOAD_INTENT_TTL = 15 * 60 * 1000;
const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function normalizeText(value: string, min: number, max: number, errorCode: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < min || normalized.length > max) {
    throw new ConvexError(errorCode);
  }
  return normalized;
}

function normalizeIce(value: string) {
  const normalized = value.replace(/\s/g, "");
  if (!/^\d{15}$/.test(normalized)) throw new ConvexError("INVALID_ICE");
  return normalized;
}

function normalizePhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const normalized = compact.startsWith("00212") ? `+212${compact.slice(5)}` : compact;
  if (!/^(?:\+212[5-7]\d{8}|0[5-7]\d{8})$/.test(normalized)) {
    throw new ConvexError("INVALID_PHONE");
  }
  return normalized;
}

export const getVerificationForm = query({
  args: {},
  returns: v.object({
    status: statusValidator,
    legalName: v.string(),
    ice: v.string(),
    rcNumber: v.string(),
    legalRepresentative: v.string(),
    phone: v.string(),
    address: v.string(),
    submittedAt: v.union(v.number(), v.null()),
    rejectionReason: v.union(v.string(), v.null()),
    documents: v.array(v.object({ documentId: v.id("companyVerificationDocuments"), documentType: documentTypeValidator, fileName: v.string() })),
  }),
  handler: async (ctx) => {
    const { company } = await requireOwnerCompany(ctx);
    const verification = await ctx.db
      .query("companyVerifications")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .unique();
    const documents = await ctx.db
      .query("companyVerificationDocuments")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .take(5);

    const latestRejection = await ctx.db.query("companyVerificationHistory")
      .withIndex("by_companyId_and_action_and_changedAt", q => q.eq("companyId", company._id).eq("action", "verification_rejected"))
      .order("desc").first();
    const rejection = await ctx.db.query("companyVerificationHistory")
      .withIndex("by_companyId_and_changedAt", q => q.eq("companyId", company._id))
      .order("desc").take(100);
    return {
      rejectionReason: company.verificationStatus === "rejected"
        ? latestRejection?.rejectionReason ?? rejection.find(row => row.rejectionReason)?.rejectionReason ?? null : null,
      status: company.verificationStatus,
      legalName: verification?.legalName ?? company.legalName ?? "",
      ice: verification?.ice ?? "",
      rcNumber: verification?.rcNumber ?? "",
      legalRepresentative: verification?.legalRepresentative ?? "",
      phone: verification?.phone ?? company.phone ?? "",
      address: verification?.address ?? "",
      submittedAt: verification?.submittedAt ?? null,
      documents: documents.map(({ _id, documentType, fileName }) => ({ documentId: _id, documentType, fileName })),
    };
  },
});

export const generateDocumentUploadUrl = mutation({
  args: { documentType: documentTypeValidator },
  returns: v.object({ uploadUrl: v.string(), uploadToken: v.string() }),
  handler: async (ctx, args) => {
    const { userId, company } = await requireOwnerCompany(ctx);
    if (company.verificationStatus === "pending" || company.verificationStatus === "verified") {
      throw new ConvexError("INVALID_VERIFICATION_STATUS");
    }
    if (company.onboardingStatus !== "completed") throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
    const now = Date.now();
    const uploadToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    await ctx.db.insert("companyVerificationUploadIntents", {
      companyId: company._id,
      userId,
      documentType: args.documentType,
      token: uploadToken,
      expiresAt: now + UPLOAD_INTENT_TTL,
      createdAt: now,
    });
    return { uploadUrl: verificationHttpUrl("upload"), uploadToken };
  },
});

export const submitVerification = mutation({
  args: {
    legalName: v.string(),
    ice: v.string(),
    rcNumber: v.string(),
    legalRepresentative: v.string(),
    phone: v.string(),
    address: v.string(),
    documents: v.array(
      v.object({
        documentType: documentTypeValidator,
        storageId: v.id("_storage"),
        uploadToken: v.string(),
        fileName: v.string(),
      }),
    ),
  },
  returns: v.object({ status: v.literal("pending") }),
  handler: async (ctx, args) => {
    const { userId, company } = await requireOwnerCompany(ctx);
    if (company.onboardingStatus !== "completed") throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
    if (company.verificationStatus !== "draft" && company.verificationStatus !== "rejected") {
      throw new ConvexError("INVALID_VERIFICATION_STATUS");
    }
    if (args.documents.length > 5 || new Set(args.documents.map((item) => item.documentType)).size !== args.documents.length) {
      throw new ConvexError("INVALID_VERIFICATION_DOCUMENT");
    }

    const legalName = normalizeText(args.legalName, 2, 160, "INVALID_LEGAL_NAME");
    const ice = normalizeIce(args.ice);
    const rcNumber = normalizeText(args.rcNumber, 1, 80, "INVALID_RC_NUMBER");
    const legalRepresentative = normalizeText(args.legalRepresentative, 2, 160, "INVALID_LEGAL_REPRESENTATIVE");
    const phone = normalizePhone(args.phone);
    const address = normalizeText(args.address, 5, 300, "INVALID_ADDRESS");
    const now = Date.now();

    const validatedDocuments = [];
    for (const document of args.documents) {
      const intent = await ctx.db
        .query("companyVerificationUploadIntents")
        .withIndex("by_token", (q) => q.eq("token", document.uploadToken))
        .unique();
      if (
        !intent || intent.companyId !== company._id || intent.userId !== userId ||
        intent.storageId !== document.storageId || intent.documentType !== document.documentType || intent.claimedAt !== undefined || intent.expiresAt <= now
      ) {
        throw new ConvexError("INVALID_VERIFICATION_DOCUMENT");
      }
      const metadata = await ctx.db.system.get("_storage", document.storageId);
      const contentType = metadata?.contentType ?? intent.contentType;
      if (!metadata || metadata.size < 1 || metadata.size > MAX_DOCUMENT_SIZE || !contentType || !ALLOWED_DOCUMENT_TYPES.has(contentType)) {
        throw new ConvexError("INVALID_VERIFICATION_DOCUMENT");
      }
      validatedDocuments.push({ document, intent, metadata: { size: metadata.size, contentType } });
    }

    const existingTax = await ctx.db.query("companyVerificationDocuments")
      .withIndex("by_companyId_and_documentType", q => q.eq("companyId", company._id).eq("documentType", "tax_compliance")).unique();
    if (!validatedDocuments.some(({ document }) => document.documentType === "tax_compliance") && (!existingTax || !(await ctx.db.system.get("_storage", existingTax.storageId)))) {
      throw new ConvexError("TAX_COMPLIANCE_CERTIFICATE_REQUIRED");
    }

    const existing = await ctx.db
      .query("companyVerifications")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .unique();
    const values = { legalName, ice, rcNumber, legalRepresentative, phone, address, submittedAt: now, updatedAt: now };
    const verificationId = existing
      ? (await ctx.db.patch(existing._id, values), existing._id)
      : await ctx.db.insert("companyVerifications", { companyId: company._id, ...values, createdAt: now });

    for (const { document, intent, metadata } of validatedDocuments) {
      const previous = await ctx.db
        .query("companyVerificationDocuments")
        .withIndex("by_companyId_and_documentType", (q) =>
          q.eq("companyId", company._id).eq("documentType", document.documentType),
        )
        .unique();
      if (previous) {
        await ctx.db.delete(previous._id);
        await ctx.storage.delete(previous.storageId);
      }
      await ctx.db.insert("companyVerificationDocuments", {
        verificationId,
        companyId: company._id,
        documentType: document.documentType,
        storageId: document.storageId,
        fileName: normalizeText(document.fileName, 1, 180, "INVALID_VERIFICATION_DOCUMENT"),
        contentType: metadata.contentType,
        size: metadata.size,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(intent._id, { claimedAt: now });
      if (previous) await ctx.db.insert("companyVerificationHistory", {
        companyId: company._id, action: "document_replaced",
        oldStatus: company.verificationStatus, newStatus: company.verificationStatus, changedBy: userId, changedAt: now,
      });
    }

    await ctx.db.patch(company._id, { legalName, phone, verificationStatus: "pending", updatedAt: now });
    await ctx.db.insert("companyVerificationHistory", {
      companyId: company._id,
      action: company.verificationStatus === "rejected" ? "verification_resubmitted" : "verification_submitted",
      oldStatus: company.verificationStatus,
      newStatus: "pending",
      changedBy: userId,
      changedAt: now,
    });
    return { status: "pending" as const };
  },
});

export const getVerificationStatus = query({
  args: {},
  returns: v.object({ status: statusValidator, canManageDocuments: v.boolean() }),
  handler: async ctx => {
    const { company, membership } = await requireActiveCompanyMembership(ctx);
    return { status: company.verificationStatus, canManageDocuments: membership.role === "owner" };
  },
});

export const authorizeDocumentDownload = internalQuery({
  args: { documentId: v.id("companyVerificationDocuments") },
  returns: v.object({ storageId: v.id("_storage"), fileName: v.string(), contentType: v.string(), size: v.number() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
    const user = await ctx.db.get(userId);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new ConvexError("VERIFICATION_DOCUMENT_NOT_FOUND");
    if (user?.accountType !== "admin") {
      const { company } = await requireOwnerCompany(ctx);
      if (document.companyId !== company._id) throw new ConvexError("VERIFICATION_DOCUMENT_NOT_FOUND");
    }
    const verification = await ctx.db.get(document.verificationId);
    if (!verification || verification.companyId !== document.companyId) throw new ConvexError("VERIFICATION_DOCUMENT_NOT_FOUND");
    return { storageId: document.storageId, fileName: document.fileName, contentType: document.contentType, size: document.size };
  },
});

export const getDocumentDownloadUrl = query({
  args: { documentId: v.id("companyVerificationDocuments") },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    await ctx.runQuery(internal.companyVerification.index.authorizeDocumentDownload, args);
    return verificationDocumentUrl(args.documentId);
  },
});

export const authorizeDocumentUpload = internalQuery({
  args: { uploadToken: v.string(), now: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { company, userId } = await requireOwnerCompany(ctx);
    const intent = await ctx.db.query("companyVerificationUploadIntents")
      .withIndex("by_token", q => q.eq("token", args.uploadToken)).unique();
    if (!intent || intent.companyId !== company._id || intent.userId !== userId || intent.storageId || intent.claimedAt !== undefined || intent.expiresAt <= args.now) {
      throw new ConvexError("INVALID_VERIFICATION_DOCUMENT");
    }
    if (company.verificationStatus !== "draft" && company.verificationStatus !== "rejected") throw new ConvexError("INVALID_VERIFICATION_STATUS");
    return null;
  },
});

export const bindDocumentUpload = internalMutation({
  args: { uploadToken: v.string(), storageId: v.id("_storage"), contentType: v.union(v.literal("application/pdf"), v.literal("image/jpeg"), v.literal("image/png")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.companyVerification.index.authorizeDocumentUpload, { uploadToken: args.uploadToken, now: Date.now() });
    const { company, userId } = await requireOwnerCompany(ctx);
    const intent = await ctx.db.query("companyVerificationUploadIntents")
      .withIndex("by_token", q => q.eq("token", args.uploadToken)).unique();
    if (!intent || intent.expiresAt <= Date.now()) throw new ConvexError("INVALID_VERIFICATION_DOCUMENT");
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata || metadata.size < 1 || metadata.size > MAX_DOCUMENT_SIZE || (metadata.contentType !== undefined && metadata.contentType !== args.contentType)) throw new ConvexError("INVALID_VERIFICATION_DOCUMENT");
    await ctx.db.patch(intent._id, { storageId: args.storageId, contentType: args.contentType });
    await ctx.db.insert("companyVerificationHistory", {
      companyId: company._id, action: "document_uploaded", oldStatus: company.verificationStatus,
      newStatus: company.verificationStatus, changedBy: userId, changedAt: Date.now(),
    });
    return null;
  },
});

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

/** Receives bytes itself: a caller cannot bind an arbitrary guessed storage ID. */
export const uploadDocument = httpAction(async (ctx, request) => {
  const cors = verificationCorsHeaders(request);
  if (!cors) return new Response("Upload rejected", { status: 400, headers: { ...privateHeaders, Vary: "Origin" } });
  const headers = { ...privateHeaders, ...cors };
  let storageId: Id<"_storage"> | undefined;
  try {
    const uploadToken = request.headers.get("X-Upload-Token") ?? "";
    await ctx.runQuery(internal.companyVerification.index.authorizeDocumentUpload, { uploadToken, now: Date.now() });
    const contentType = request.headers.get("Content-Type") ?? "";
    if (!ALLOWED_DOCUMENT_TYPES.has(contentType)) throw new Error("Invalid type");
    if (Number(request.headers.get("Content-Length")) > MAX_DOCUMENT_SIZE) throw new Error("Too large");
    // Read at most 10 MB, even when the client omits or lies about Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Empty file");
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_DOCUMENT_SIZE) { await reader.cancel(); throw new Error("Too large"); }
      chunks.push(new Uint8Array(value));
    }
    const blob = new Blob(chunks, { type: contentType });
    const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    const matches = contentType === "application/pdf"
      ? new TextDecoder().decode(signature.slice(0, 5)) === "%PDF-"
      : contentType === "image/jpeg"
        ? signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
        : [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => signature[i] === byte);
    if (!size || !matches) throw new Error("Invalid file");
    storageId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.companyVerification.index.bindDocumentUpload, { uploadToken, storageId, contentType: contentType as "application/pdf" | "image/jpeg" | "image/png" });
    return Response.json({ storageId }, { headers });
  } catch {
    if (storageId) await ctx.storage.delete(storageId);
    return new Response("Upload rejected", { status: 400, headers });
  }
});

export const downloadDocument = httpAction(async (ctx, request) => {
  const cors = verificationCorsHeaders(request);
  if (!cors) return new Response("Not found", { status: 404, headers: { ...privateHeaders, Vary: "Origin" } });
  const headers = { ...privateHeaders, ...cors, "Access-Control-Expose-Headers": "Content-Disposition" };
  try {
    const rawId = new URL(request.url).pathname.slice("/company-verification/documents/".length);
    const descriptor = await ctx.runQuery(internal.companyVerification.index.authorizeDocumentDownload, {
      documentId: rawId as Id<"companyVerificationDocuments">,
    });
    const blob = await ctx.storage.get(descriptor.storageId);
    if (!blob || blob.size !== descriptor.size) throw new Error("Missing file");
    const fileName = descriptor.fileName.replace(/[^\x20-\x7E]|["\\/]/g, "_");
    return new Response(blob, { headers: { ...headers,
      "Content-Type": descriptor.contentType, "Content-Length": String(blob.size),
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(descriptor.fileName)}`,
    } });
  } catch {
    return new Response("Not found", { status: 404, headers });
  }
});

export const uploadDocumentPreflight = httpAction(async (_ctx, request) => verificationPreflight(request, "POST"));
export const downloadDocumentPreflight = httpAction(async (_ctx, request) => verificationPreflight(request, "GET"));
