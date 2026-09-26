import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCompanyUser } from "../companies/access";
import { commissionStatusValidator } from "./constants";

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

function hasCompleteCommissionSnapshot(deal: {
  agreedAmountMad: number;
  commissionRateBps: number;
  commissionAmountMad: number;
  commissionConfigVersion: number;
}) {
  return (
    Number.isSafeInteger(deal.agreedAmountMad) &&
    deal.agreedAmountMad > 0 &&
    Number.isSafeInteger(deal.commissionRateBps) &&
    deal.commissionRateBps >= 0 &&
    deal.commissionRateBps <= 3_000 &&
    Number.isSafeInteger(deal.commissionAmountMad) &&
    deal.commissionAmountMad >= 0 &&
    Number.isSafeInteger(deal.commissionConfigVersion) &&
    deal.commissionConfigVersion > 0
  );
}

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
