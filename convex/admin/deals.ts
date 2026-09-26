import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { commissionStatusValidator, type CommissionStatus } from "../deals/constants";
import { appendMarketplaceActivity } from "../marketplaceActivity/model";
import { requireAdminUser } from "./access";

const listStatusValidator = v.union(v.literal("all"), commissionStatusValidator);
const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

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

export const listCommissionObligations = query({
  args: {
    status: listStatusValidator,
    search: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  returns: v.array(rowValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const deals = args.companyId
      ? args.status === "all"
        ? await ctx.db.query("deals").withIndex("by_companyId", (q) => q.eq("companyId", args.companyId!)).order("desc").take(200)
        : await ctx.db.query("deals").withIndex("by_companyId_and_commissionStatus", (q) => q.eq("companyId", args.companyId!).eq("commissionStatus", args.status as CommissionStatus)).order("desc").take(200)
      : args.status === "all"
        ? await ctx.db.query("deals").order("desc").take(200)
        : await ctx.db.query("deals").withIndex("by_commissionStatus_and_createdAt", (q) => q.eq("commissionStatus", args.status as CommissionStatus)).order("desc").take(200);
    const needle = args.search?.trim().toLocaleLowerCase() ?? "";
    const rows = [];
    for (const deal of deals) {
      const [project, company, paidBy] = await Promise.all([
        ctx.db.get(deal.projectId),
        ctx.db.get(deal.companyId),
        deal.commissionPaidByAdminUserId ? ctx.db.get(deal.commissionPaidByAdminUserId) : null,
      ]);
      const projectTitle = project?.title ?? "—";
      const companyName = company?.name ?? company?.legalName ?? "—";
      if (needle && !`${projectTitle} ${companyName}`.toLocaleLowerCase().includes(needle)) continue;
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
    return rows;
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
    if (deal.commissionDebtorCompanyId !== deal.companyId || deal.commissionBeneficiary !== "batiplus" || !Number.isSafeInteger(deal.commissionAmountMad) || deal.commissionAmountMad < 0 || !Number.isSafeInteger(deal.commissionConfigVersion)) {
      throw new ConvexError("COMMISSION_SNAPSHOT_INCOMPLETE");
    }
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
    return { dealId: deal._id, commissionStatus: "paid" as const, paidAt: now };
  },
});
