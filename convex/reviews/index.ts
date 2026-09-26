import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { appendMarketplaceActivity } from "../marketplaceActivity/model";
import { requireClientUser } from "../projects/access";
import {
  normalizeReviewComment,
  reviewModerationStatusValidator,
  validateReviewRating,
} from "./constants";
import { adjustCompanyReviewAggregate } from "./model";

const myReviewValidator = v.object({
  rating: v.number(),
  comment: v.string(),
  moderationStatus: reviewModerationStatusValidator,
  createdAt: v.number(),
});

async function requireReviewableDeal(
  ctx: MutationCtx,
  userId: Id<"users">,
  dealId: Id<"deals">,
) {
  const deal = await ctx.db.get(dealId);
  if (!deal || deal.clientUserId !== userId) throw new ConvexError("REVIEW_NOT_FOUND");
  if (deal.status !== "completed" || !deal.completedAt || deal.completedByUserId !== userId) {
    throw new ConvexError("REVIEW_NOT_ELIGIBLE");
  }
  const [project, company, quote, conversation, finalQuote, revision] = await Promise.all([
    ctx.db.get(deal.projectId),
    ctx.db.get(deal.companyId),
    ctx.db.get(deal.initialQuoteId),
    ctx.db.get(deal.conversationId),
    ctx.db.get(deal.acceptedFinalQuoteId),
    ctx.db.get(deal.acceptedFinalQuoteRevisionId),
  ]);
  if (
    !project || project.clientId !== userId || project.status !== "completed" ||
    project.selectedCompanyId !== deal.companyId ||
    project.selectedFinalQuoteId !== deal.acceptedFinalQuoteId ||
    !company || !quote || quote.projectId !== project._id || quote.companyId !== company._id ||
    !conversation || conversation.projectId !== project._id || conversation.clientId !== userId ||
    conversation.companyId !== company._id || conversation.quoteId !== quote._id ||
    !finalQuote || finalQuote.status !== "accepted" || finalQuote.projectId !== project._id ||
    finalQuote.clientId !== userId || finalQuote.companyId !== company._id ||
    finalQuote.initialQuoteId !== quote._id || finalQuote.conversationId !== conversation._id ||
    finalQuote.acceptedRevisionId !== deal.acceptedFinalQuoteRevisionId ||
    !revision || revision.finalQuoteId !== finalQuote._id
  ) {
    throw new ConvexError("REVIEW_DEAL_INTEGRITY_ERROR");
  }
  return { deal, project, company };
}

export const getMyReviewForDeal = query({
  args: { dealId: v.id("deals") },
  returns: v.union(myReviewValidator, v.null()),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    const deal = await ctx.db.get(args.dealId);
    if (!deal || deal.clientUserId !== userId) throw new ConvexError("REVIEW_NOT_FOUND");
    const review = await ctx.db.query("reviews").withIndex("by_dealId", (q) => q.eq("dealId", deal._id)).unique();
    return review ? {
      rating: review.rating,
      comment: review.comment,
      moderationStatus: review.moderationStatus,
      createdAt: review.createdAt,
    } : null;
  },
});

export const createReview = mutation({
  args: { dealId: v.id("deals"), rating: v.number(), comment: v.string() },
  returns: v.object({ reviewId: v.id("reviews"), moderationStatus: v.literal("visible"), createdAt: v.number() }),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    const { deal, project, company } = await requireReviewableDeal(ctx, userId, args.dealId);
    const existing = await ctx.db.query("reviews").withIndex("by_dealId", (q) => q.eq("dealId", deal._id)).unique();
    if (existing) throw new ConvexError("REVIEW_ALREADY_EXISTS");
    const rating = validateReviewRating(args.rating);
    const comment = normalizeReviewComment(args.comment);
    const now = Date.now();
    const reviewId = await ctx.db.insert("reviews", {
      dealId: deal._id, projectId: project._id, companyId: company._id, clientUserId: userId,
      rating, comment, moderationStatus: "visible", createdAt: now,
    });
    await adjustCompanyReviewAggregate(ctx, company, rating, 1);
    await appendMarketplaceActivity(ctx, {
      projectId: project._id, eventType: "review_created", actorUserId: userId, actorType: "client",
      companyId: company._id, dealId: deal._id, reviewId, newStatus: "visible",
      metadata: { rating }, createdAt: now,
    });
    return { reviewId, moderationStatus: "visible" as const, createdAt: now };
  },
});
