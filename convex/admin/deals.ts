import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalQuery, mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { commissionStatusValidator, type CommissionStatus } from "../deals/constants";
import { recordCommissionPaid } from "../deals/commissionSummary";
import { hasCompleteCommissionSnapshot } from "../deals/money";
import { appendMarketplaceActivity } from "../marketplaceActivity/model";
import { createNotificationForActiveCompanyMembers } from "../notifications/model";
import schema from "../schema";
import { requireAdminUser } from "./access";

const listStatusValidator = v.union(v.literal("all"), commissionStatusValidator);
const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const MAX_PAGE_SIZE = 30;
const MAX_SEARCH_SCAN_ROWS = 900;

const rowValidator = v.object({
  dealId: v.id("deals"),
  projectId: v.id("projects"),
  projectTitle: v.string(),
  companyId: v.id("companies"),
  companyName: v.string(),
  agreedAmountMad: v.number(),
  commissionRateBps: v.number(),
  commissionAmountMad: v.number(),
  commissionConfigVersion: v.number(),
  commissionStatus: commissionStatusValidator,
  createdAt: v.number(),
  paidAt: nullableNumber,
  paidByAdminName: nullableString,
  paymentReference: nullableString,
  paymentNote: nullableString,
});

function normalizeOptional(value: string | undefined, max: number, code: string) {
  if (value === undefined) return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return undefined;
  if (normalized.length > max) throw new ConvexError(code);
  return normalized;
}

function displayName(user: { firstName?: string; lastName?: string; email?: string } | null) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "—";
}

function normalizeDealAdminSearch(value: string | undefined) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized || null;
}

async function loadDealBatch(
  ctx: QueryCtx,
  args: {
    status: "all" | CommissionStatus;
    companyId?: import("../_generated/dataModel").Id<"companies">;
  },
  paginationOpts: { numItems: number; cursor: string | null },
) {
  const result: {
    page: Doc<"deals">[];
    isDone: boolean;
    continueCursor: string;
  } = await ctx.runQuery(internal.admin.deals.loadCommissionDealBatch, {
    status: args.status,
    companyId: args.companyId,
    paginationOpts,
  });
  return result;
}

export const loadCommissionDealBatch = internalQuery({
  args: {
    status: listStatusValidator,
    companyId: v.optional(v.id("companies")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(schema.doc("deals")),
  handler: async (ctx, args) => {
    if (args.companyId) {
      if (args.status === "all") {
        return await ctx.db
          .query("deals")
          .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", args.companyId!))
          .order("desc")
          .paginate(args.paginationOpts);
      }
      return await ctx.db
        .query("deals")
        .withIndex("by_companyId_and_commissionStatus_and_createdAt", (q) =>
          q
            .eq("companyId", args.companyId!)
            .eq("commissionStatus", args.status as CommissionStatus),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }
    if (args.status === "all") {
      return await ctx.db
        .query("deals")
        .withIndex("by_createdAt")
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return await ctx.db
      .query("deals")
      .withIndex("by_commissionStatus_and_createdAt", (q) =>
        q.eq("commissionStatus", args.status as CommissionStatus),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const listCommissionObligations = query({
  args: {
    status: listStatusValidator,
    search: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const search = normalizeDealAdminSearch(args.search);
    const requestedPageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(args.paginationOpts.numItems)));
    const rows: Array<typeof rowValidator.type> = [];
    let scannedRows = 0;
    let databaseCursor = args.paginationOpts.cursor;
    let isDone = false;

    while (rows.length < requestedPageSize && scannedRows < MAX_SEARCH_SCAN_ROWS && !isDone) {
      const remaining = requestedPageSize - rows.length;
      const batch = await loadDealBatch(ctx, args, {
        numItems: Math.min(remaining, MAX_SEARCH_SCAN_ROWS - scannedRows),
        cursor: databaseCursor,
      });
      databaseCursor = batch.continueCursor;
      isDone = batch.isDone;
      scannedRows += batch.page.length;

      const hydrated = await Promise.all(batch.page.map(async (deal) => ({
        deal,
        project: await ctx.db.get(deal.projectId),
        company: await ctx.db.get(deal.companyId),
      })));
      for (const { deal, project, company } of hydrated) {
        const projectTitle = project?.title ?? "—";
        const companyName = company?.name ?? company?.legalName ?? "—";
        if (
          search
          && !`${projectTitle} ${companyName}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
        ) continue;
        const paidBy = deal.commissionPaidByAdminUserId
          ? await ctx.db.get(deal.commissionPaidByAdminUserId)
          : null;
        rows.push({
        dealId: deal._id,
        projectId: deal.projectId,
        projectTitle,
        companyId: deal.companyId,
        companyName,
        agreedAmountMad: deal.agreedAmountMad,
        commissionRateBps: deal.commissionRateBps,
        commissionAmountMad: deal.commissionAmountMad,
        commissionConfigVersion: deal.commissionConfigVersion,
        commissionStatus: deal.commissionStatus,
        createdAt: deal.createdAt,
        paidAt: deal.commissionPaidAt ?? null,
        paidByAdminName: paidBy ? displayName(paidBy) : null,
        paymentReference: deal.commissionPaymentReference ?? null,
        paymentNote: deal.commissionPaymentNote ?? null,
        });
      }
    }
    if (databaseCursor === null) throw new Error("DEAL_PAGINATION_CURSOR_MISSING");
    return { page: rows, isDone, continueCursor: databaseCursor };
  },
});

export const markCommissionPaid = mutation({
  args: {
    dealId: v.id("deals"),
    paymentReference: v.optional(v.string()),
    paymentNote: v.optional(v.string()),
  },
  returns: v.object({ dealId: v.id("deals"), commissionStatus: v.literal("paid"), paidAt: v.number() }),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const deal = await ctx.db.get(args.dealId);
    if (!deal) throw new ConvexError("DEAL_NOT_FOUND");
    if (deal.commissionStatus === "paid") throw new ConvexError("COMMISSION_ALREADY_PAID");
    if (
      deal.commissionDebtorCompanyId !== deal.companyId ||
      deal.commissionBeneficiary !== "batiplus" ||
      !hasCompleteCommissionSnapshot(deal)
    ) {
      throw new ConvexError("COMMISSION_SNAPSHOT_INCOMPLETE");
    }
    const [project, company] = await Promise.all([
      ctx.db.get(deal.projectId),
      ctx.db.get(deal.companyId),
    ]);
    if (!project || !company) throw new ConvexError("COMMISSION_SNAPSHOT_INCOMPLETE");
    const paymentReference = normalizeOptional(args.paymentReference, 120, "INVALID_COMMISSION_PAYMENT_REFERENCE");
    const paymentNote = normalizeOptional(args.paymentNote, 1000, "INVALID_COMMISSION_PAYMENT_NOTE");
    const now = Date.now();
    await ctx.db.patch(deal._id, {
      commissionStatus: "paid",
      commissionPaidAt: now,
      commissionPaidByAdminUserId: admin._id,
      commissionPaymentReference: paymentReference,
      commissionPaymentNote: paymentNote,
    });
    await recordCommissionPaid(ctx, deal.companyId, deal.commissionAmountMad, now);
    await ctx.db.insert("commissionStatusHistory", {
      dealId: deal._id,
      companyId: deal.companyId,
      fromStatus: "due",
      toStatus: "paid",
      commissionAmountMad: deal.commissionAmountMad,
      actorAdminUserId: admin._id,
      paymentReference,
      paymentNote,
      createdAt: now,
    });
    await appendMarketplaceActivity(ctx, {
      projectId: deal.projectId,
      eventType: "commission_paid",
      actorUserId: admin._id,
      actorType: "admin",
      companyId: deal.companyId,
      quoteId: deal.initialQuoteId,
      conversationId: deal.conversationId,
      finalQuoteId: deal.acceptedFinalQuoteId,
      finalQuoteRevisionId: deal.acceptedFinalQuoteRevisionId,
      dealId: deal._id,
      oldStatus: "due",
      newStatus: "paid",
      metadata: { commissionAmountMad: deal.commissionAmountMad, commissionRateBps: deal.commissionRateBps, commissionConfigVersion: deal.commissionConfigVersion, currency: "MAD" },
      createdAt: now,
    });
    const projectTitle = project.title?.trim();
    const companyName = company.name?.trim() || company.legalName?.trim();
    await createNotificationForActiveCompanyMembers(ctx, {
      companyId: deal.companyId,
      actorUserId: admin._id,
      type: "commission_paid",
      entity: { type: "deal", id: deal._id },
      payload: {
        ...(projectTitle ? { projectTitle } : {}),
        ...(companyName ? { companyName } : {}),
        amountMad: deal.commissionAmountMad,
      },
      dedupeKey: `deal:${deal._id}:commission_paid`,
    });
    return { dealId: deal._id, commissionStatus: "paid" as const, paidAt: now };
  },
});
