import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type {
  MarketplaceActivityActorType,
  MarketplaceActivityEventType,
} from "./constants";

type AppendMarketplaceActivityArgs = {
  projectId: Id<"projects">;
  eventType: MarketplaceActivityEventType;
  actorUserId: Id<"users">;
  actorType: MarketplaceActivityActorType;
  companyId?: Id<"companies">;
  quoteId?: Id<"projectQuotes">;
  conversationId?: Id<"conversations">;
  siteAssessmentId?: Id<"siteAssessments">;
  siteVisitId?: Id<"siteVisits">;
  finalQuoteId?: Id<"finalQuotes">;
  finalQuoteRevisionId?: Id<"finalQuoteRevisions">;
  dealId?: Id<"deals">;
  reviewId?: Id<"reviews">;
  oldStatus?: string;
  newStatus?: string;
  reason?: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt: number;
};

/**
 * Append-only projection for the admin funnel. Call only from the trusted
 * business mutation that owns the state change so both writes commit together.
 */
export async function appendMarketplaceActivity(
  ctx: MutationCtx,
  args: AppendMarketplaceActivityArgs,
) {
  const [project, actor, company, quote, conversation, siteAssessment, siteVisit, finalQuote, finalQuoteRevision, deal, review] = await Promise.all([
    ctx.db.get(args.projectId),
    ctx.db.get(args.actorUserId),
    args.companyId ? ctx.db.get(args.companyId) : null,
    args.quoteId ? ctx.db.get(args.quoteId) : null,
    args.conversationId ? ctx.db.get(args.conversationId) : null,
    args.siteAssessmentId ? ctx.db.get(args.siteAssessmentId) : null,
    args.siteVisitId ? ctx.db.get(args.siteVisitId) : null,
    args.finalQuoteId ? ctx.db.get(args.finalQuoteId) : null,
    args.finalQuoteRevisionId ? ctx.db.get(args.finalQuoteRevisionId) : null,
    args.dealId ? ctx.db.get(args.dealId) : null,
    args.reviewId ? ctx.db.get(args.reviewId) : null,
  ]);

  if (!project) throw new ConvexError("PROJECT_NOT_FOUND");
  if (!actor || actor.accountType !== args.actorType) {
    throw new ConvexError("INVALID_ACTIVITY_ACTOR");
  }
  if (args.companyId && !company) throw new ConvexError("COMPANY_NOT_FOUND");
  if (
    args.finalQuoteId &&
    (!finalQuote || finalQuote.projectId !== args.projectId ||
      (args.companyId !== undefined && finalQuote.companyId !== args.companyId) ||
      (args.quoteId !== undefined && finalQuote.initialQuoteId !== args.quoteId) ||
      (args.conversationId !== undefined && finalQuote.conversationId !== args.conversationId))
  ) throw new ConvexError("INVALID_ACTIVITY_FINAL_QUOTE");
  if (
    args.finalQuoteRevisionId &&
    (!finalQuoteRevision || !args.finalQuoteId || finalQuoteRevision.finalQuoteId !== args.finalQuoteId)
  ) throw new ConvexError("INVALID_ACTIVITY_FINAL_QUOTE_REVISION");
  if (
    args.dealId &&
    (!deal ||
      deal.projectId !== args.projectId ||
      (args.companyId !== undefined && deal.companyId !== args.companyId) ||
      (args.quoteId !== undefined && deal.initialQuoteId !== args.quoteId) ||
      (args.conversationId !== undefined && deal.conversationId !== args.conversationId) ||
      (args.finalQuoteId !== undefined && deal.acceptedFinalQuoteId !== args.finalQuoteId) ||
      (args.finalQuoteRevisionId !== undefined &&
        deal.acceptedFinalQuoteRevisionId !== args.finalQuoteRevisionId))
  ) throw new ConvexError("INVALID_ACTIVITY_DEAL");
  if (
    args.reviewId &&
    (!review ||
      review.projectId !== args.projectId ||
      (args.companyId !== undefined && review.companyId !== args.companyId) ||
      (args.dealId !== undefined && review.dealId !== args.dealId))
  ) throw new ConvexError("INVALID_ACTIVITY_REVIEW");
  if (
    args.siteVisitId &&
    (!siteVisit ||
      siteVisit.projectId !== args.projectId ||
      (args.companyId !== undefined && siteVisit.companyId !== args.companyId) ||
      (args.quoteId !== undefined && siteVisit.initialQuoteId !== args.quoteId) ||
      (args.conversationId !== undefined && siteVisit.conversationId !== args.conversationId) ||
      (args.siteAssessmentId !== undefined && siteVisit.assessmentId !== args.siteAssessmentId))
  ) {
    throw new ConvexError("INVALID_ACTIVITY_SITE_VISIT");
  }
  if (
    args.quoteId &&
    (!quote ||
      quote.projectId !== args.projectId ||
      (args.companyId !== undefined && quote.companyId !== args.companyId))
  ) {
    throw new ConvexError("INVALID_ACTIVITY_QUOTE");
  }
  if (
    args.siteAssessmentId &&
    (!siteAssessment ||
      siteAssessment.projectId !== args.projectId ||
      (args.companyId !== undefined && siteAssessment.companyId !== args.companyId) ||
      (args.quoteId !== undefined && siteAssessment.initialQuoteId !== args.quoteId) ||
      (args.conversationId !== undefined && siteAssessment.conversationId !== args.conversationId))
  ) {
    throw new ConvexError("INVALID_ACTIVITY_SITE_ASSESSMENT");
  }
  if (
    args.conversationId &&
    (!conversation ||
      conversation.projectId !== args.projectId ||
      (args.quoteId !== undefined && conversation.quoteId !== args.quoteId) ||
      (args.companyId !== undefined && conversation.companyId !== args.companyId))
  ) {
    throw new ConvexError("INVALID_ACTIVITY_CONVERSATION");
  }

  return await ctx.db.insert("marketplaceActivity", args);
}
