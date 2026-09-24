import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireOwnerCompany } from "../companies/index";

const documentTypeValidator = v.union(
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
    documents: v.array(v.object({ documentType: documentTypeValidator, fileName: v.string() })),
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

    return {
      status: company.verificationStatus,
      legalName: verification?.legalName ?? company.legalName ?? "",
      ice: verification?.ice ?? "",
      rcNumber: verification?.rcNumber ?? "",
      legalRepresentative: verification?.legalRepresentative ?? "",
      phone: verification?.phone ?? company.phone ?? "",
      address: verification?.address ?? "",
      submittedAt: verification?.submittedAt ?? null,
      documents: documents.map(({ documentType, fileName }) => ({ documentType, fileName })),
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
    return { uploadUrl: await ctx.storage.generateUploadUrl(), uploadToken };
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
    if (args.documents.length > 4 || new Set(args.documents.map((item) => item.documentType)).size !== args.documents.length) {
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
        intent.documentType !== document.documentType || intent.claimedAt !== undefined || intent.expiresAt < now
      ) {
        throw new ConvexError("INVALID_VERIFICATION_DOCUMENT");
      }
      const metadata = await ctx.db.system.get("_storage", document.storageId);
      if (!metadata || metadata.size > MAX_DOCUMENT_SIZE || !metadata.contentType || !ALLOWED_DOCUMENT_TYPES.has(metadata.contentType)) {
        throw new ConvexError("INVALID_VERIFICATION_DOCUMENT");
      }
      validatedDocuments.push({ document, intent, metadata: { size: metadata.size, contentType: metadata.contentType } });
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
    }

    await ctx.db.patch(company._id, { legalName, phone, verificationStatus: "pending", updatedAt: now });
    await ctx.db.insert("companyVerificationHistory", {
      companyId: company._id,
      oldStatus: company.verificationStatus,
      newStatus: "pending",
      changedBy: userId,
      changedAt: now,
    });
    return { status: "pending" as const };
  },
});
