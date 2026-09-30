import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const MAD_MINOR_UNITS = 100;

type ReadCtx = Pick<QueryCtx, "db">;
type WriteCtx = Pick<MutationCtx, "db">;

function toCentimes(amountMad: number) {
  const centimes = Math.round(amountMad * MAD_MINOR_UNITS);
  if (!Number.isSafeInteger(centimes) || centimes < 0) {
    throw new ConvexError("INVALID_COMMISSION_AMOUNT");
  }
  return centimes;
}

async function getSummary(ctx: ReadCtx, companyId: Id<"companies">) {
  return await ctx.db
    .query("companyCommissionSummaries")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .unique();
}

export async function recordCommissionDue(
  ctx: WriteCtx,
  companyId: Id<"companies">,
  commissionAmountMad: number,
  now: number,
) {
  const amountCentimes = toCentimes(commissionAmountMad);
  const summary = await getSummary(ctx, companyId);
  if (!summary) {
    await ctx.db.insert("companyCommissionSummaries", {
      companyId,
      dueCount: 1,
      dueAmountCentimes: amountCentimes,
      paidAmountCentimes: 0,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.patch(summary._id, {
    dueCount: summary.dueCount + 1,
    dueAmountCentimes: summary.dueAmountCentimes + amountCentimes,
    updatedAt: now,
  });
}

export async function recordCommissionPaid(
  ctx: WriteCtx,
  companyId: Id<"companies">,
  commissionAmountMad: number,
  now: number,
) {
  const amountCentimes = toCentimes(commissionAmountMad);
  const summary = await getSummary(ctx, companyId);
  if (
    !summary ||
    summary.dueCount < 1 ||
    summary.dueAmountCentimes < amountCentimes
  ) {
    throw new ConvexError("COMMISSION_SUMMARY_INCONSISTENT");
  }
  await ctx.db.patch(summary._id, {
    dueCount: summary.dueCount - 1,
    dueAmountCentimes: summary.dueAmountCentimes - amountCentimes,
    paidAmountCentimes: summary.paidAmountCentimes + amountCentimes,
    updatedAt: now,
  });
}

export async function readCommissionSummary(ctx: ReadCtx, companyId: Id<"companies">) {
  const summary = await getSummary(ctx, companyId);
  return {
    totalDueMad: (summary?.dueAmountCentimes ?? 0) / MAD_MINOR_UNITS,
    totalPaidMad: (summary?.paidAmountCentimes ?? 0) / MAD_MINOR_UNITS,
    dueCount: summary?.dueCount ?? 0,
  };
}
