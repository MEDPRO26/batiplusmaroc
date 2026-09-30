import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function adjustCompanyReviewAggregate(
  ctx: MutationCtx,
  company: Doc<"companies">,
  rating: number,
  direction: 1 | -1,
) {
  const reviewCount = company.reviewCount ?? 0;
  const reviewRatingTotal = company.reviewRatingTotal ?? 0;
  if (direction === -1 && (reviewCount < 1 || reviewRatingTotal < rating)) {
    throw new ConvexError("REVIEW_AGGREGATE_INTEGRITY_ERROR");
  }
  await ctx.db.patch(company._id, {
    reviewCount: reviewCount + direction,
    reviewRatingTotal: reviewRatingTotal + direction * rating,
    updatedAt: Date.now(),
  });
}
