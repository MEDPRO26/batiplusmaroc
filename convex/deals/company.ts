import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCompanyUser } from "../companies/access";
import {
  canAccessDetailedProjectLocation,
  companyProjectLocationValidator,
  toDetailedProjectLocation,
  toGeneralProjectLocation,
} from "../projects/location";
import { commissionStatusValidator, dealStatusValidator } from "./constants";
import { readCommissionSummary } from "./commissionSummary";
import { hasCompleteCommissionSnapshot } from "./money";

const nullableNumber = v.union(v.number(), v.null());

const companyCommissionValidator = v.object({
  dealId: v.id("deals"),
  projectTitle: v.string(),
  agreedAmountMad: nullableNumber,
  commissionRateBps: nullableNumber,
  commissionAmountMad: nullableNumber,
  commissionConfigVersion: nullableNumber,
  commissionStatus: commissionStatusValidator,
  beneficiary: v.literal("batiplus"),
  createdAt: v.number(),
  paidAt: nullableNumber,
  snapshotComplete: v.boolean(),
});

export const getMyCommissionSummary = query({
  args: {},
  returns: v.object({
    totalDueMad: v.number(),
    totalPaidMad: v.number(),
    dueCount: v.number(),
  }),
  handler: async (ctx) => {
    const { company } = await requireCompanyUser(ctx);
    return await readCommissionSummary(ctx, company._id);
  },
});

/**
 * Read-only Company projection. The authenticated membership determines the
 * debtor Company; callers cannot supply or probe another Company ID.
 */
export const listMyCommissionObligations = query({
  args: {},
  returns: v.array(companyCommissionValidator),
  handler: async (ctx) => {
    const { company } = await requireCompanyUser(ctx);
    const deals = await ctx.db
      .query("deals")
      .withIndex("by_commissionDebtorCompanyId_and_createdAt", (q) =>
        q.eq("commissionDebtorCompanyId", company._id),
      )
      .order("desc")
      .take(200);

    const rows = [];
    for (const deal of deals) {
      // Defense in depth if a legacy/corrupt row violates the Company/beneficiary invariant.
      if (deal.companyId !== company._id || deal.commissionBeneficiary !== "batiplus") continue;
      const project = await ctx.db.get(deal.projectId);
      const snapshotComplete = hasCompleteCommissionSnapshot(deal);
      rows.push({
        dealId: deal._id,
        projectTitle: project?.title ?? "—",
        agreedAmountMad: snapshotComplete ? deal.agreedAmountMad : null,
        commissionRateBps: snapshotComplete ? deal.commissionRateBps : null,
        commissionAmountMad: snapshotComplete ? deal.commissionAmountMad : null,
        commissionConfigVersion: snapshotComplete ? deal.commissionConfigVersion : null,
        commissionStatus: deal.commissionStatus,
        beneficiary: "batiplus" as const,
        createdAt: deal.createdAt,
        paidAt: deal.commissionStatus === "paid" ? (deal.commissionPaidAt ?? null) : null,
        snapshotComplete,
      });
    }
    return rows;
  },
});

const companyDealValidator = v.object({
  dealId: v.id("deals"),
  projectId: v.id("projects"),
  projectTitle: v.string(),
  city: v.union(v.string(), v.null()),
  location: companyProjectLocationValidator,
  status: dealStatusValidator,
  agreedAmountMad: v.number(),
  conversationId: v.id("conversations"),
  createdAt: v.number(),
  completedAt: nullableNumber,
});

/**
 * Read-only Company projection of won work (Deals) for the "Manage work" area.
 * The authenticated membership determines the Company; no Company ID is accepted.
 */
export const listMyDeals = query({
  args: {},
  returns: v.array(companyDealValidator),
  handler: async (ctx) => {
    const { company } = await requireCompanyUser(ctx);
    const deals = await ctx.db
      .query("deals")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .order("desc")
      .take(200);

    const rows = [];
    for (const deal of deals) {
      const project = await ctx.db.get(deal.projectId);
      // A Deal alone does not grant locality access; recheck the existing conversation gates.
      const location = project && await canAccessDetailedProjectLocation(ctx, project, company._id)
        ? toDetailedProjectLocation(project)
        : toGeneralProjectLocation(project ?? {});
      rows.push({
        dealId: deal._id,
        projectId: deal.projectId,
        projectTitle: project?.title ?? "—",
        city: project?.city ?? null,
        location,
        status: deal.status,
        agreedAmountMad: deal.agreedAmountMad,
        conversationId: deal.conversationId,
        createdAt: deal.createdAt,
        completedAt: deal.completedAt ?? null,
      });
    }
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});
