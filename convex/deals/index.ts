import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, query } from "../_generated/server";
import { appendMarketplaceActivity } from "../marketplaceActivity/model";
import { resolveCommissionForDealAmount } from "../marketplaceSettings/index";
import { dealStatusValidator } from "./constants";

const dealValidator = v.object({
  id: v.id("deals"),
  projectId: v.id("projects"),
  clientUserId: v.id("users"),
  companyId: v.id("companies"),
  createdByUserId: v.id("users"),
  acceptedFinalQuoteId: v.id("finalQuotes"),
  acceptedFinalQuoteRevisionId: v.id("finalQuoteRevisions"),
  conversationId: v.id("conversations"),
  initialQuoteId: v.id("projectQuotes"),
  agreedAmountMad: v.number(),
  currency: v.literal("MAD"),
  commissionRateBps: v.number(),
  commissionAmountMad: v.number(),
  commissionTierMinAmountMad: v.number(),
  commissionTierMaxAmountMad: v.union(v.number(), v.null()),
  commissionConfigVersion: v.number(),
  commissionDebtorCompanyId: v.id("companies"),
  commissionBeneficiary: v.literal("batiplus"),
  commissionStatus: v.literal("due"),
  status: dealStatusValidator,
  createdAt: v.number(),
});

type Ctx = QueryCtx | MutationCtx;

async function requireDealViewer(ctx: Ctx, deal: Doc<"deals">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("USER_NOT_FOUND");

  if (
    user.accountType === "client" &&
    user.onboardingStatus === "completed" &&
    deal.clientUserId === userId
  ) {
    return;
  }
  if (user.accountType === "company" && user.onboardingStatus === "completed") {
    const membership = await ctx.db
      .query("companyMembers")
      .withIndex("by_companyId_and_userId", (q) =>
        q.eq("companyId", deal.companyId).eq("userId", userId),
      )
      .unique();
    if (membership?.status === "active") return;
  }
  if (user.accountType === "admin") return;

  // Do not disclose whether another party's commercial record exists.
  throw new ConvexError("DEAL_NOT_FOUND");
}

function toDealDto(deal: Doc<"deals">) {
  return {
    id: deal._id,
    projectId: deal.projectId,
    clientUserId: deal.clientUserId,
    companyId: deal.companyId,
    createdByUserId: deal.createdByUserId,
    acceptedFinalQuoteId: deal.acceptedFinalQuoteId,
    acceptedFinalQuoteRevisionId: deal.acceptedFinalQuoteRevisionId,
    conversationId: deal.conversationId,
    initialQuoteId: deal.initialQuoteId,
    agreedAmountMad: deal.agreedAmountMad,
    currency: deal.currency,
    commissionRateBps: deal.commissionRateBps,
    commissionAmountMad: deal.commissionAmountMad,
    commissionTierMinAmountMad: deal.commissionTierMinAmountMad,
    commissionTierMaxAmountMad: deal.commissionTierMaxAmountMad,
    commissionConfigVersion: deal.commissionConfigVersion,
    commissionDebtorCompanyId: deal.commissionDebtorCompanyId,
    commissionBeneficiary: deal.commissionBeneficiary,
    commissionStatus: deal.commissionStatus,
    status: deal.status,
    createdAt: deal.createdAt,
  };
}

/** Participant/admin read. The project ID is a lookup key, never an authorization claim. */
export const getByProject = query({
  args: { projectId: v.id("projects") },
  returns: v.union(dealValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
    const deal = await ctx.db
      .query("deals")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (!deal) return null;
    await requireDealViewer(ctx, deal);
    return toDealDto(deal);
  },
});

async function validateCreationSource(ctx: MutationCtx, finalQuoteId: Id<"finalQuotes">) {
  const finalQuote = await ctx.db.get(finalQuoteId);
  if (
    !finalQuote ||
    finalQuote.status !== "accepted" ||
    !finalQuote.acceptedRevisionId ||
    !finalQuote.currentRevisionId ||
    finalQuote.acceptedRevisionId !== finalQuote.currentRevisionId ||
    !finalQuote.acceptedByUserId
  ) {
    throw new ConvexError("DEAL_REQUIRES_ACCEPTED_CURRENT_FINAL_QUOTE");
  }

  const [project, revision, initialQuote, conversation, company, acceptedBy] = await Promise.all([
    ctx.db.get(finalQuote.projectId),
    ctx.db.get(finalQuote.acceptedRevisionId),
    ctx.db.get(finalQuote.initialQuoteId),
    ctx.db.get(finalQuote.conversationId),
    ctx.db.get(finalQuote.companyId),
    ctx.db.get(finalQuote.acceptedByUserId),
  ]);
  const activeCompanyMember = company
    ? await ctx.db
        .query("companyMembers")
        .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first()
    : null;

  if (
    !project ||
    project.status !== "company_selected" ||
    project.clientId !== finalQuote.clientId ||
    project.selectedCompanyId !== finalQuote.companyId ||
    project.selectedFinalQuoteId !== finalQuote._id ||
    !revision ||
    revision.finalQuoteId !== finalQuote._id ||
    revision.currency !== "MAD" ||
    !initialQuote ||
    initialQuote.projectId !== project._id ||
    initialQuote.companyId !== finalQuote.companyId ||
    initialQuote.status !== "discussion_open" ||
    !conversation ||
    conversation.status !== "active" ||
    conversation.projectId !== project._id ||
    conversation.clientId !== project.clientId ||
    conversation.companyId !== finalQuote.companyId ||
    conversation.quoteId !== initialQuote._id ||
    !company ||
    company.verificationStatus !== "verified" ||
    company.onboardingStatus !== "completed" ||
    !activeCompanyMember ||
    !acceptedBy ||
    acceptedBy.accountType !== "client" ||
    acceptedBy.onboardingStatus !== "completed" ||
    finalQuote.acceptedByUserId !== project.clientId
  ) {
    throw new ConvexError("DEAL_SOURCE_INTEGRITY_ERROR");
  }

  return {
    finalQuote,
    project,
    revision,
    actorUserId: finalQuote.acceptedByUserId,
  };
}

/**
 * Trusted command used by the Final Quote acceptance transaction. It accepts
 * only a relationship ID; all commercial values are resolved server-side.
 */
export async function createDealFromAcceptedFinalQuote(
  ctx: MutationCtx,
  finalQuoteId: Id<"finalQuotes">,
) {
  const existingForQuote = await ctx.db
    .query("deals")
    .withIndex("by_acceptedFinalQuoteId", (q) => q.eq("acceptedFinalQuoteId", finalQuoteId))
    .unique();
  if (existingForQuote) return { dealId: existingForQuote._id, duplicate: true };

  const { finalQuote, project, revision, actorUserId } = await validateCreationSource(
    ctx,
    finalQuoteId,
  );
  const existingForProject = await ctx.db
    .query("deals")
    .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
    .unique();
  if (existingForProject) {
    if (existingForProject.acceptedFinalQuoteId === finalQuote._id) {
      return { dealId: existingForProject._id, duplicate: true };
    }
    throw new ConvexError("DEAL_ALREADY_EXISTS_FOR_PROJECT");
  }

  const commission = await resolveCommissionForDealAmount(ctx, revision.price);
  const now = Date.now();
  const dealId = await ctx.db.insert("deals", {
    projectId: project._id,
    clientUserId: project.clientId,
    companyId: finalQuote.companyId,
    createdByUserId: actorUserId,
    acceptedFinalQuoteId: finalQuote._id,
    acceptedFinalQuoteRevisionId: revision._id,
    conversationId: finalQuote.conversationId,
    initialQuoteId: finalQuote.initialQuoteId,
    agreedAmountMad: commission.agreedAmountMad,
    currency: "MAD",
    commissionRateBps: commission.commissionRateBps,
    commissionAmountMad: commission.commissionAmountMad,
    commissionTierMinAmountMad: commission.matchedTier.minAmountMad,
    commissionTierMaxAmountMad: commission.matchedTier.maxAmountMad,
    commissionConfigVersion: commission.configurationVersion,
    commissionDebtorCompanyId: finalQuote.companyId,
    commissionBeneficiary: "batiplus",
    commissionStatus: "due",
    status: "active",
    createdAt: now,
  });
  await ctx.db.insert("dealStatusHistory", {
    dealId,
    toStatus: "active",
    actorUserId,
    createdAt: now,
  });
  await appendMarketplaceActivity(ctx, {
    projectId: project._id,
    eventType: "deal_created",
    actorUserId,
    actorType: "client",
    companyId: finalQuote.companyId,
    quoteId: finalQuote.initialQuoteId,
    conversationId: finalQuote.conversationId,
    finalQuoteId: finalQuote._id,
    finalQuoteRevisionId: revision._id,
    dealId,
    newStatus: "active",
    metadata: {
      agreedAmountMad: commission.agreedAmountMad,
      commissionRateBps: commission.commissionRateBps,
      commissionAmountMad: commission.commissionAmountMad,
      commissionTierMinAmountMad: commission.matchedTier.minAmountMad,
      commissionConfigVersion: commission.configurationVersion,
      ...(commission.matchedTier.maxAmountMad === null
        ? {}
        : { commissionTierMaxAmountMad: commission.matchedTier.maxAmountMad }),
      currency: "MAD",
    },
    createdAt: now,
  });
  await appendMarketplaceActivity(ctx, {
    projectId: project._id,
    eventType: "commission_due",
    actorUserId,
    actorType: "client",
    companyId: finalQuote.companyId,
    quoteId: finalQuote.initialQuoteId,
    conversationId: finalQuote.conversationId,
    finalQuoteId: finalQuote._id,
    finalQuoteRevisionId: revision._id,
    dealId,
    newStatus: "due",
    metadata: {
      debtor: "company",
      beneficiary: "batiplus",
      agreedAmountMad: commission.agreedAmountMad,
      commissionRateBps: commission.commissionRateBps,
      commissionAmountMad: commission.commissionAmountMad,
      commissionTierMinAmountMad: commission.matchedTier.minAmountMad,
      commissionConfigVersion: commission.configurationVersion,
      ...(commission.matchedTier.maxAmountMad === null
        ? {}
        : { commissionTierMaxAmountMad: commission.matchedTier.maxAmountMad }),
      currency: "MAD",
    },
    createdAt: now,
  });
  return { dealId, duplicate: false };
}

export const createFromAcceptedFinalQuote = internalMutation({
  args: { finalQuoteId: v.id("finalQuotes") },
  returns: v.object({ dealId: v.id("deals"), duplicate: v.boolean() }),
  handler: async (ctx, args) => createDealFromAcceptedFinalQuote(ctx, args.finalQuoteId),
});
