import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireAdminUser } from "./access";

const reviewStatusValidator = v.union(
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
);

const historyStatusValidator = v.union(
  v.literal("draft"),
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
);

const documentTypeValidator = v.union(
  v.literal("rc"),
  v.literal("ice"),
  v.literal("insurance"),
  v.literal("other"),
);

const listItemValidator = v.object({
  companyId: v.id("companies"),
  companyName: v.string(),
  city: v.string(),
  ice: v.string(),
  rcNumber: v.string(),
  legalRepresentative: v.string(),
  submittedAt: v.union(v.number(), v.null()),
  documentCount: v.number(),
  status: reviewStatusValidator,
});

const documentValidator = v.object({
  documentId: v.id("companyVerificationDocuments"),
  documentType: documentTypeValidator,
  fileName: v.string(),
  contentType: v.string(),
  size: v.number(),
  downloadUrl: v.union(v.string(), v.null()),
});

const historyItemValidator = v.object({
  historyId: v.id("companyVerificationHistory"),
  oldStatus: historyStatusValidator,
  newStatus: historyStatusValidator,
  changedAt: v.number(),
  rejectionReason: v.union(v.string(), v.null()),
  changedBy: v.object({
    userId: v.id("users"),
    email: v.union(v.string(), v.null()),
    firstName: v.union(v.string(), v.null()),
    lastName: v.union(v.string(), v.null()),
  }),
});

function normalizeSearch(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase() ?? "";
}

function normalizeRejectionReason(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 3 || normalized.length > 500) {
    throw new ConvexError("REJECTION_REASON_REQUIRED");
  }
  return normalized;
}

/**
 * Admin verification queue. Status is required so every call stays indexed.
 */
export const listCompanyVerifications = query({
  args: {
    status: reviewStatusValidator,
    search: v.optional(v.string()),
    city: v.optional(v.string()),
  },
  returns: v.array(listItemValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);

    const companies = await ctx.db
      .query("companies")
      .withIndex("by_verificationStatus", (q) => q.eq("verificationStatus", args.status))
      .take(200);

    const needle = normalizeSearch(args.search);
    const cityNeedle = normalizeSearch(args.city);

    const rows = [];
    for (const company of companies) {
      const companyName = company.name ?? company.legalName ?? "";
      const city = company.city ?? "";
      if (
        needle &&
        !companyName.toLocaleLowerCase().includes(needle) &&
        !(company.legalName ?? "").toLocaleLowerCase().includes(needle)
      ) {
        continue;
      }
      if (cityNeedle && !city.toLocaleLowerCase().includes(cityNeedle)) {
        continue;
      }

      const verification = await ctx.db
        .query("companyVerifications")
        .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
        .unique();
      const documents = await ctx.db
        .query("companyVerificationDocuments")
        .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
        .collect();

      rows.push({
        companyId: company._id,
        companyName,
        city,
        ice: verification?.ice ?? "",
        rcNumber: verification?.rcNumber ?? "",
        legalRepresentative: verification?.legalRepresentative ?? "",
        submittedAt: verification?.submittedAt ?? null,
        documentCount: documents.length,
        status: company.verificationStatus as "pending" | "verified" | "rejected",
      });
    }

    rows.sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
    return rows;
  },
});

export const getCompanyVerificationReview = query({
  args: { companyId: v.id("companies") },
  returns: v.union(
    v.null(),
    v.object({
      companyId: v.id("companies"),
      companyName: v.string(),
      slug: v.union(v.string(), v.null()),
      city: v.string(),
      description: v.union(v.string(), v.null()),
      publicPhone: v.union(v.string(), v.null()),
      legalName: v.string(),
      ice: v.string(),
      rcNumber: v.string(),
      legalRepresentative: v.string(),
      phone: v.string(),
      address: v.string(),
      submittedAt: v.union(v.number(), v.null()),
      status: reviewStatusValidator,
      latestRejectionReason: v.union(v.string(), v.null()),
      documents: v.array(documentValidator),
      history: v.array(historyItemValidator),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);

    const company = await ctx.db.get(args.companyId);
    if (!company) return null;
    if (
      company.verificationStatus !== "pending" &&
      company.verificationStatus !== "verified" &&
      company.verificationStatus !== "rejected"
    ) {
      return null;
    }

    const verification = await ctx.db
      .query("companyVerifications")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .unique();

    const documents = await ctx.db
      .query("companyVerificationDocuments")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .collect();

    const historyRows = await ctx.db
      .query("companyVerificationHistory")
      .withIndex("by_companyId_and_changedAt", (q) => q.eq("companyId", company._id))
      .order("desc")
      .collect();

    const history = [];
    for (const row of historyRows) {
      const actor = await ctx.db.get(row.changedBy);
      history.push({
        historyId: row._id,
        oldStatus: row.oldStatus,
        newStatus: row.newStatus,
        changedAt: row.changedAt,
        rejectionReason: row.rejectionReason ?? null,
        changedBy: {
          userId: row.changedBy,
          email: actor?.email ?? null,
          firstName: actor?.firstName ?? null,
          lastName: actor?.lastName ?? null,
        },
      });
    }

    const documentsWithUrls = [];
    for (const document of documents) {
      documentsWithUrls.push({
        documentId: document._id,
        documentType: document.documentType,
        fileName: document.fileName,
        contentType: document.contentType,
        size: document.size,
        downloadUrl: await ctx.storage.getUrl(document.storageId),
      });
    }

    const latestRejection =
      history.find((row) => row.newStatus === "rejected" && row.rejectionReason)?.rejectionReason ?? null;

    return {
      companyId: company._id,
      companyName: company.name ?? company.legalName ?? "",
      slug: company.slug ?? null,
      city: company.city ?? "",
      description: company.description ?? null,
      publicPhone: company.phone ?? null,
      legalName: verification?.legalName ?? company.legalName ?? "",
      ice: verification?.ice ?? "",
      rcNumber: verification?.rcNumber ?? "",
      legalRepresentative: verification?.legalRepresentative ?? "",
      phone: verification?.phone ?? company.phone ?? "",
      address: verification?.address ?? "",
      submittedAt: verification?.submittedAt ?? null,
      status: company.verificationStatus,
      latestRejectionReason: latestRejection,
      documents: documentsWithUrls,
      history,
    };
  },
});

export const getVerificationDocumentUrl = query({
  args: { documentId: v.id("companyVerificationDocuments") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new ConvexError("VERIFICATION_DOCUMENT_NOT_FOUND");
    return await ctx.storage.getUrl(document.storageId);
  },
});

export const approveCompanyVerification = mutation({
  args: { companyId: v.id("companies") },
  returns: v.object({ status: v.literal("verified") }),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
    if (company.verificationStatus !== "pending") {
      throw new ConvexError("VERIFICATION_NOT_PENDING");
    }

    const now = Date.now();
    await ctx.db.patch(company._id, { verificationStatus: "verified", updatedAt: now });
    await ctx.db.insert("companyVerificationHistory", {
      companyId: company._id,
      oldStatus: "pending",
      newStatus: "verified",
      changedBy: admin._id,
      changedAt: now,
    });

    return { status: "verified" as const };
  },
});

export const rejectCompanyVerification = mutation({
  args: {
    companyId: v.id("companies"),
    reason: v.string(),
  },
  returns: v.object({ status: v.literal("rejected") }),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
    if (company.verificationStatus !== "pending") {
      throw new ConvexError("VERIFICATION_NOT_PENDING");
    }

    const rejectionReason = normalizeRejectionReason(args.reason);
    const now = Date.now();
    await ctx.db.patch(company._id, { verificationStatus: "rejected", updatedAt: now });
    await ctx.db.insert("companyVerificationHistory", {
      companyId: company._id,
      oldStatus: "pending",
      newStatus: "rejected",
      changedBy: admin._id,
      changedAt: now,
      rejectionReason,
    });

    return { status: "rejected" as const };
  },
});
