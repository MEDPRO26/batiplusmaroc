import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { requireCompanyUser, requireVerifiedCompanyUser } from "../companies/access";
import { requireClientUser, requireOwnedProject } from "../projects/access";
import {
  projectBudgetRangeValidator,
  projectCategoryValidator,
  projectCityValidator,
  projectTimelineValidator,
} from "../projects/constants";
import { getPublicMediaUrl } from "../storage/publicUrl";
import { ensureConversationForQuote } from "../messages/index";
import { assertQuoteTransition, isActiveQuoteStatus, type QuoteStatus } from "./state";

const MAX_ESTIMATED_PRICE_MAD = 100_000_000;
const MAX_ESTIMATED_DURATION_DAYS = 730;
const MESSAGE_MIN_LENGTH = 20;
const MESSAGE_MAX_LENGTH = 2_000;
const SCOPE_MIN_LENGTH = 20;
const SCOPE_MAX_LENGTH = 2_000;
const MAX_QUOTES_PER_PROJECT_RESPONSE = 100;

const quoteStatusValidator = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("viewed"),
  v.literal("shortlisted"),
  v.literal("discussion_open"),
  v.literal("declined"),
  v.literal("withdrawn"),
);

const projectSummaryValidator = v.object({
  id: v.id("projects"),
  title: v.string(),
  city: projectCityValidator,
  primaryCategory: projectCategoryValidator,
  budgetRange: projectBudgetRangeValidator,
  timeline: projectTimelineValidator,
});

const quoteFields = {
  id: v.id("projectQuotes"),
  projectId: v.id("projects"),
  companyId: v.id("companies"),
  message: v.string(),
  estimatedPrice: v.number(),
  currency: v.literal("MAD"),
  estimatedDuration: v.number(),
  availableStartDate: v.string(),
  scope: v.string(),
  quoteType: v.literal("initial"),
  status: quoteStatusValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
  submittedAt: v.number(),
  withdrawnAt: v.union(v.number(), v.null()),
};

const quoteDetailValidator = v.object({
  ...quoteFields,
  project: projectSummaryValidator,
  history: v.array(
    v.object({
      oldStatus: quoteStatusValidator,
      newStatus: quoteStatusValidator,
      changedAt: v.number(),
      reason: v.union(v.string(), v.null()),
    }),
  ),
});

const receivedCompanyValidator = v.object({
  name: v.string(),
  slug: v.union(v.string(), v.null()),
  city: v.union(v.string(), v.null()),
  description: v.union(v.string(), v.null()),
  logoUrl: v.union(v.string(), v.null()),
  isVerified: v.boolean(),
});

const receivedQuoteValidator = v.object({ ...quoteFields, company: receivedCompanyValidator });

const receivedQuoteDetailValidator = v.object({
  ...quoteFields,
  company: receivedCompanyValidator,
  history: v.array(
    v.object({
      oldStatus: quoteStatusValidator,
      newStatus: quoteStatusValidator,
      changedAt: v.number(),
      reason: v.union(v.string(), v.null()),
    }),
  ),
});

type QuoteCtx = QueryCtx | MutationCtx;

function normalizeText(value: string, min: number, max: number, code: string) {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ConvexError(code);
  }
  return normalized;
}

function assertPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_ESTIMATED_PRICE_MAD) {
    throw new ConvexError("INVALID_QUOTE_PRICE");
  }
  return Math.round(value * 100) / 100;
}

function assertDuration(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_ESTIMATED_DURATION_DAYS) {
    throw new ConvexError("INVALID_QUOTE_DURATION");
  }
  return value;
}

function todayIso(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

function assertAvailableStartDate(value: string, now: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ConvexError("INVALID_QUOTE_DATE");
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    value < todayIso(now)
  ) {
    throw new ConvexError("INVALID_QUOTE_DATE");
  }
  return value;
}

function projectSummary(project: Doc<"projects">) {
  if (
    !project.title ||
    !project.city ||
    !project.primaryCategory ||
    !project.budgetRange ||
    !project.timeline
  ) {
    throw new ConvexError("PROJECT_INCOMPLETE");
  }
  return {
    id: project._id,
    title: project.title,
    city: project.city,
    primaryCategory: project.primaryCategory,
    budgetRange: project.budgetRange,
    timeline: project.timeline,
  };
}

function quoteFieldsFor(quote: Doc<"projectQuotes">) {
  return {
    id: quote._id,
    projectId: quote.projectId,
    companyId: quote.companyId,
    message: quote.message,
    estimatedPrice: quote.estimatedPrice,
    currency: quote.currency,
    estimatedDuration: quote.estimatedDuration,
    availableStartDate: quote.availableStartDate,
    scope: quote.scope,
    quoteType: quote.quoteType,
    status: quote.status,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
    submittedAt: quote.submittedAt,
    withdrawnAt: quote.withdrawnAt ?? null,
  };
}

async function quotesForCompanyProject(
  ctx: QuoteCtx,
  projectId: Id<"projects">,
  companyId: Id<"companies">,
) {
  return await ctx.db
    .query("projectQuotes")
    .withIndex("by_projectId_and_companyId", (q) =>
      q.eq("projectId", projectId).eq("companyId", companyId),
    )
    .order("desc")
    .take(20);
}

function activeQuote(quotes: Doc<"projectQuotes">[]) {
  return quotes.find((quote) => isActiveQuoteStatus(quote.status)) ?? null;
}

async function requireOwnQuote(ctx: QuoteCtx, rawQuoteId: string) {
  const { company, userId } = await requireCompanyUser(ctx);
  const quoteId = ctx.db.normalizeId("projectQuotes", rawQuoteId);
  if (!quoteId) throw new ConvexError("QUOTE_NOT_FOUND");
  const quote = await ctx.db.get(quoteId);
  if (!quote || quote.companyId !== company._id) throw new ConvexError("QUOTE_NOT_FOUND");
  return { quote, userId };
}

async function requireProjectOwnerQuote(ctx: QuoteCtx, rawQuoteId: string) {
  const { userId } = await requireClientUser(ctx);
  const quoteId = ctx.db.normalizeId("projectQuotes", rawQuoteId);
  if (!quoteId) throw new ConvexError("QUOTE_NOT_FOUND");
  const quote = await ctx.db.get(quoteId);
  if (!quote) throw new ConvexError("QUOTE_NOT_FOUND");
  await requireOwnedProject(ctx, userId, quote.projectId);
  return { quote, userId };
}

async function companySummary(ctx: QuoteCtx, companyId: Id<"companies">) {
  const company = await ctx.db.get(companyId);
  if (!company?.name) throw new ConvexError("COMPANY_NOT_FOUND");
  const logoMedia = company.logoMediaId ? await ctx.db.get(company.logoMediaId) : null;
  const logoUrl = logoMedia && logoMedia.companyId === company._id && logoMedia.purpose === "companyLogo"
    ? getPublicMediaUrl(logoMedia.objectKey)
    : company.logoStorageId
      ? await ctx.storage.getUrl(company.logoStorageId)
      : null;
  return {
    name: company.name,
    slug: company.slug ?? null,
    city: company.city ?? null,
    description: company.description ?? null,
    logoUrl,
    isVerified: company.verificationStatus === "verified",
  };
}

async function appendStatusHistory(
  ctx: MutationCtx,
  quote: Doc<"projectQuotes">,
  nextStatus: QuoteStatus,
  changedBy: Id<"users">,
  reason?: string,
) {
  assertQuoteTransition(quote.status, nextStatus);
  const now = Date.now();
  await ctx.db.patch(quote._id, { status: nextStatus, updatedAt: now });
  await ctx.db.insert("quoteStatusHistory", {
    quoteId: quote._id,
    oldStatus: quote.status,
    newStatus: nextStatus,
    changedBy,
    changedAt: now,
    reason,
  });
  return nextStatus;
}

/** Eligibility and safe project summary for the company quote workspace. */
export const getSubmissionContext = query({
  args: { projectId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      project: projectSummaryValidator,
      verificationStatus: v.union(
        v.literal("draft"),
        v.literal("pending"),
        v.literal("verified"),
        v.literal("rejected"),
      ),
      activeQuoteId: v.union(v.id("projectQuotes"), v.null()),
      latestQuoteId: v.union(v.id("projectQuotes"), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const { company } = await requireCompanyUser(ctx);
    const projectId = ctx.db.normalizeId("projects", args.projectId);
    if (!projectId) return null;
    const project = await ctx.db.get(projectId);
    if (
      !project ||
      project.status !== "published" ||
      project.visibility !== "marketplace"
    ) {
      return null;
    }
    const recentQuotes = await quotesForCompanyProject(ctx, projectId, company._id);
    const existing = activeQuote(recentQuotes);
    return {
      project: projectSummary(project),
      verificationStatus: company.verificationStatus,
      activeQuoteId: existing?._id ?? null,
      latestQuoteId: recentQuotes[0]?._id ?? null,
    };
  },
});

/** A company can only read its own quote, including immutable status history. */
export const getMyQuote = query({
  args: { quoteId: v.string() },
  returns: v.union(v.null(), quoteDetailValidator),
  handler: async (ctx, args) => {
    const { quote } = await requireOwnQuote(ctx, args.quoteId);
    const project = await ctx.db.get(quote.projectId);
    if (!project) return null;
    const history = await ctx.db
      .query("quoteStatusHistory")
      .withIndex("by_quoteId_and_changedAt", (q) => q.eq("quoteId", quote._id))
      .order("asc")
      .take(50);
    return {
      ...quoteFieldsFor(quote),
      project: projectSummary(project),
      history: history.map((item) => ({
        oldStatus: item.oldStatus,
        newStatus: item.newStatus,
        changedAt: item.changedAt,
        reason: item.reason ?? null,
      })),
    };
  },
});

/** Submit the first commercial response. This transaction never creates or unlocks messaging. */
export const submitInitialQuote = mutation({
  args: {
    projectId: v.id("projects"),
    message: v.string(),
    estimatedPrice: v.number(),
    estimatedDuration: v.number(),
    availableStartDate: v.string(),
    scope: v.string(),
  },
  returns: v.object({ quoteId: v.id("projectQuotes"), status: v.literal("submitted") }),
  handler: async (ctx, args) => {
    const { company, userId } = await requireVerifiedCompanyUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError("PROJECT_NOT_FOUND");
    if (project.status !== "published") throw new ConvexError("PROJECT_NOT_ACCEPTING_QUOTES");
    if (project.visibility !== "marketplace") throw new ConvexError("PROJECT_NOT_ACCEPTING_QUOTES");

    const existing = activeQuote(
      await quotesForCompanyProject(ctx, project._id, company._id),
    );
    if (existing) throw new ConvexError("ACTIVE_QUOTE_ALREADY_EXISTS");

    const now = Date.now();
    const quoteId = await ctx.db.insert("projectQuotes", {
      projectId: project._id,
      companyId: company._id,
      submittedByUserId: userId,
      message: normalizeText(
        args.message,
        MESSAGE_MIN_LENGTH,
        MESSAGE_MAX_LENGTH,
        "INVALID_QUOTE_MESSAGE",
      ),
      estimatedPrice: assertPrice(args.estimatedPrice),
      currency: "MAD",
      estimatedDuration: assertDuration(args.estimatedDuration),
      availableStartDate: assertAvailableStartDate(args.availableStartDate, now),
      scope: normalizeText(
        args.scope,
        SCOPE_MIN_LENGTH,
        SCOPE_MAX_LENGTH,
        "INVALID_QUOTE_SCOPE",
      ),
      quoteType: "initial",
      status: "submitted",
      createdAt: now,
      updatedAt: now,
      submittedAt: now,
    });
    await ctx.db.insert("quoteStatusHistory", {
      quoteId,
      oldStatus: "draft",
      newStatus: "submitted",
      changedBy: userId,
      changedAt: now,
    });
    return { quoteId, status: "submitted" as const };
  },
});

/** Withdraw without deleting; only the owning company may perform the transition. */
export const withdrawInitialQuote = mutation({
  args: { quoteId: v.id("projectQuotes"), reason: v.optional(v.string()) },
  returns: v.object({ status: v.literal("withdrawn") }),
  handler: async (ctx, args) => {
    const { quote, userId } = await requireOwnQuote(ctx, args.quoteId);
    if (quote.status !== "submitted") throw new ConvexError("QUOTE_NOT_WITHDRAWABLE");
    const reason = args.reason?.trim();
    if (reason && reason.length > 300) throw new ConvexError("INVALID_QUOTE_WITHDRAWAL_REASON");
    assertQuoteTransition(quote.status, "withdrawn");
    const now = Date.now();
    await ctx.db.patch(quote._id, { status: "withdrawn", withdrawnAt: now, updatedAt: now });
    await ctx.db.insert("quoteStatusHistory", { quoteId: quote._id, oldStatus: quote.status, newStatus: "withdrawn", changedBy: userId, changedAt: now, reason: reason || undefined });
    return { status: "withdrawn" as const };
  },
});

/** Project-owner-only list. Companies and other clients cannot inspect competitors. */
export const listReceivedInitialQuotes = query({
  args: { projectId: v.id("projects") },
  returns: v.array(receivedQuoteValidator),
  handler: async (ctx, args) => {
    const { userId } = await requireClientUser(ctx);
    await requireOwnedProject(ctx, userId, args.projectId);
    const statuses = ["submitted", "viewed", "shortlisted", "discussion_open", "declined", "withdrawn"] as const;
    const byStatus = await Promise.all(statuses.map((status) => ctx.db
      .query("projectQuotes")
      .withIndex("by_projectId_and_status", (q) => q.eq("projectId", args.projectId).eq("status", status))
      .order("desc")
      .take(MAX_QUOTES_PER_PROJECT_RESPONSE)));
    const quotes = byStatus.flat()
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .slice(0, MAX_QUOTES_PER_PROJECT_RESPONSE);
    return await Promise.all(
      quotes.map(async (quote) => {
        return {
          ...quoteFieldsFor(quote),
          company: await companySummary(ctx, quote.companyId),
        };
      }),
    );
  },
});

/** Full quote contents for the owning client only. */
export const getReceivedInitialQuote = query({
  args: { quoteId: v.string() },
  returns: v.union(v.null(), receivedQuoteDetailValidator),
  handler: async (ctx, args) => {
    const { quote } = await requireProjectOwnerQuote(ctx, args.quoteId);
    const history = await ctx.db
      .query("quoteStatusHistory")
      .withIndex("by_quoteId_and_changedAt", (q) => q.eq("quoteId", quote._id))
      .order("asc")
      .take(50);
    return {
      ...quoteFieldsFor(quote),
      company: await companySummary(ctx, quote.companyId),
      history: history.map((item) => ({ oldStatus: item.oldStatus, newStatus: item.newStatus, changedAt: item.changedAt, reason: item.reason ?? null })),
    };
  },
});

/** First owner open records the immutable submitted -> viewed transition. */
export const markInitialQuoteViewed = mutation({
  args: { quoteId: v.id("projectQuotes") },
  returns: v.object({ status: quoteStatusValidator }),
  handler: async (ctx, args) => {
    const { quote, userId } = await requireProjectOwnerQuote(ctx, args.quoteId);
    if (quote.status !== "submitted") return { status: quote.status };
    return { status: await appendStatusHistory(ctx, quote, "viewed", userId) };
  },
});

const reviewActionValidator = v.union(
  v.literal("shortlist"),
  v.literal("decline"),
  v.literal("open_discussion"),
);

/** Owner review action. Opening discussion atomically unlocks one conversation. */
export const reviewInitialQuote = mutation({
  args: {
    quoteId: v.id("projectQuotes"),
    action: reviewActionValidator,
    reason: v.optional(v.string()),
  },
  returns: v.object({
    status: quoteStatusValidator,
    conversationId: v.union(v.id("conversations"), v.null()),
  }),
  handler: async (ctx, args) => {
    const { quote, userId } = await requireProjectOwnerQuote(ctx, args.quoteId);
    const reason = args.reason?.trim();
    if (reason && reason.length > 300) throw new ConvexError("INVALID_QUOTE_REVIEW_REASON");
    const nextStatus: QuoteStatus = args.action === "shortlist"
      ? "shortlisted"
      : args.action === "decline"
        ? "declined"
        : "discussion_open";
    if (args.action === "open_discussion") {
      const project = await requireOwnedProject(ctx, userId, quote.projectId);
      if (quote.status === "discussion_open") {
        return {
          status: quote.status,
          conversationId: await ensureConversationForQuote(ctx, quote, project, userId),
        };
      }
      const status = await appendStatusHistory(ctx, quote, nextStatus, userId, reason || undefined);
      return {
        status,
        conversationId: await ensureConversationForQuote(
          ctx,
          { ...quote, status, updatedAt: Date.now() },
          project,
          userId,
        ),
      };
    }
    return {
      status: await appendStatusHistory(ctx, quote, nextStatus, userId, reason || undefined),
      conversationId: null,
    };
  },
});
