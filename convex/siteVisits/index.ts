import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { requireCompanyUser } from "../companies/access";
import { appendMarketplaceActivity } from "../marketplaceActivity/model";
import { requireClientUser, requireOwnedProject } from "../projects/access";
import { assertSiteAssessmentTransition, isActiveSiteAssessmentStatus } from "./state";

const statusValidator = v.union(v.literal("invited"), v.literal("accepted"), v.literal("scheduled"), v.literal("completed"), v.literal("declined"), v.literal("cancelled"));
const viewerTypeValidator = v.union(v.literal("client"), v.literal("company"), v.literal("admin"));
const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const assessmentValidator = v.object({
  id: v.id("siteAssessments"), projectId: v.id("projects"), companyId: v.id("companies"), companyName: v.string(),
  initialQuoteId: v.id("projectQuotes"), conversationId: v.id("conversations"), status: statusValidator,
  invitedAt: v.number(), acceptedAt: nullableNumber, scheduledAt: nullableNumber, clientNote: nullableString,
  companyNote: nullableString, siteAddress: nullableString, updatedAt: v.number(),
});
const assessmentResultValidator = v.object({ viewerType: viewerTypeValidator, canInvite: v.boolean(), assessment: v.union(assessmentValidator, v.null()) });
type Ctx = QueryCtx | MutationCtx;

function normalizeOptionalText(value: string | undefined, max: number, code: string) {
  if (value === undefined) return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length > max) throw new ConvexError(code);
  return normalized || undefined;
}

async function getConversationContext(ctx: Ctx, conversationId: Id<"conversations">) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) throw new ConvexError("CONVERSATION_NOT_FOUND");
  const [project, quote, company] = await Promise.all([ctx.db.get(conversation.projectId), ctx.db.get(conversation.quoteId), ctx.db.get(conversation.companyId)]);
  if (!project || !quote || !company || project.clientId !== conversation.clientId || quote.projectId !== project._id || quote.companyId !== company._id || conversation.status !== "active") {
    throw new ConvexError("CONVERSATION_INTEGRITY_ERROR");
  }
  return { conversation, project, quote, company };
}

async function activeAssessmentForProject(ctx: Ctx, projectId: Id<"projects">) {
  const rows = await ctx.db.query("siteAssessments").withIndex("by_projectId_and_active", (q) => q.eq("projectId", projectId).eq("active", true)).take(2);
  if (rows.length > 1) throw new ConvexError("SITE_ASSESSMENT_INTEGRITY_ERROR");
  return rows[0] ?? null;
}

async function assessmentDto(ctx: Ctx, assessment: Doc<"siteAssessments">) {
  const company = await ctx.db.get(assessment.companyId);
  if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
  const maySeeAddress = assessment.status !== "invited" && assessment.status !== "declined";
  return {
    id: assessment._id, projectId: assessment.projectId, companyId: assessment.companyId,
    companyName: company.name?.trim() || "", initialQuoteId: assessment.initialQuoteId,
    conversationId: assessment.conversationId, status: assessment.status, invitedAt: assessment.invitedAt,
    acceptedAt: assessment.acceptedAt ?? null, scheduledAt: assessment.scheduledAt ?? null,
    clientNote: assessment.clientNote ?? null, companyNote: assessment.companyNote ?? null,
    siteAddress: maySeeAddress ? assessment.siteAddress ?? null : null, updatedAt: assessment.updatedAt,
  };
}

export const invite = mutation({
  args: { conversationId: v.id("conversations"), clientNote: v.optional(v.string()) },
  returns: v.object({ assessmentId: v.id("siteAssessments"), status: v.literal("invited"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const client = await requireClientUser(ctx);
    const { conversation, project, quote } = await getConversationContext(ctx, args.conversationId);
    await requireOwnedProject(ctx, client.userId, project._id);
    if (quote.status !== "discussion_open") throw new ConvexError("SITE_ASSESSMENT_REQUIRES_DISCUSSION");
    if (project.status !== "published" && project.status !== "in_discussion") throw new ConvexError("PROJECT_NOT_ELIGIBLE_FOR_SITE_ASSESSMENT");
    const existing = await activeAssessmentForProject(ctx, project._id);
    if (existing) {
      if (existing.conversationId === conversation._id && existing.companyId === conversation.companyId && existing.status === "invited") {
        return { assessmentId: existing._id, status: "invited" as const, duplicate: true };
      }
      throw new ConvexError("ACTIVE_SITE_ASSESSMENT_ALREADY_EXISTS");
    }
    const clientNote = normalizeOptionalText(args.clientNote, 1_000, "INVALID_SITE_ASSESSMENT_NOTE");
    const now = Date.now();
    const assessmentId = await ctx.db.insert("siteAssessments", {
      projectId: project._id, clientId: client.userId, companyId: conversation.companyId, initialQuoteId: quote._id,
      conversationId: conversation._id, status: "invited", active: true, invitedByUserId: client.userId,
      invitedAt: now, clientNote, createdAt: now, updatedAt: now,
    });
    await appendMarketplaceActivity(ctx, {
      projectId: project._id, eventType: "site_assessment_invited", actorUserId: client.userId, actorType: "client",
      companyId: conversation.companyId, quoteId: quote._id, conversationId: conversation._id, siteAssessmentId: assessmentId,
      newStatus: "invited", createdAt: now,
    });
    return { assessmentId, status: "invited" as const, duplicate: false };
  },
});

export const respond = mutation({
  args: { assessmentId: v.id("siteAssessments"), decision: v.union(v.literal("accept"), v.literal("decline")), companyNote: v.optional(v.string()) },
  returns: v.object({ status: v.union(v.literal("accepted"), v.literal("declined")), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const access = await requireCompanyUser(ctx);
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment || assessment.companyId !== access.company._id) throw new ConvexError("SITE_ASSESSMENT_NOT_FOUND");
    const context = await getConversationContext(ctx, assessment.conversationId);
    if (context.project._id !== assessment.projectId || context.quote._id !== assessment.initialQuoteId) throw new ConvexError("SITE_ASSESSMENT_INTEGRITY_ERROR");
    if (context.quote.status !== "discussion_open") throw new ConvexError("SITE_ASSESSMENT_REQUIRES_DISCUSSION");
    const desired: "accepted" | "declined" = args.decision === "accept" ? "accepted" : "declined";
    if (assessment.status === desired) return { status: desired, duplicate: true };
    assertSiteAssessmentTransition(assessment.status, desired);
    const companyNote = normalizeOptionalText(args.companyNote, 1_000, "INVALID_SITE_ASSESSMENT_NOTE");
    const now = Date.now();
    await ctx.db.patch(assessment._id, {
      status: desired, active: isActiveSiteAssessmentStatus(desired), companyNote,
      acceptedAt: desired === "accepted" ? now : undefined,
      acceptedMarketplaceTermsAt: desired === "accepted" ? now : undefined,
      declinedAt: desired === "declined" ? now : undefined, updatedAt: now,
    });
    await appendMarketplaceActivity(ctx, {
      projectId: assessment.projectId, eventType: desired === "accepted" ? "site_assessment_accepted" : "site_assessment_declined",
      actorUserId: access.userId, actorType: "company", companyId: assessment.companyId, quoteId: assessment.initialQuoteId,
      conversationId: assessment.conversationId, siteAssessmentId: assessment._id, oldStatus: assessment.status,
      newStatus: desired, createdAt: now,
    });
    return { status: desired, duplicate: false };
  },
});

export const schedule = mutation({
  args: { assessmentId: v.id("siteAssessments"), scheduledAt: v.number(), siteAddress: v.string(), clientNote: v.optional(v.string()) },
  returns: v.object({ status: v.literal("scheduled") }),
  handler: async (ctx, args) => {
    const client = await requireClientUser(ctx);
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment || assessment.clientId !== client.userId) throw new ConvexError("SITE_ASSESSMENT_NOT_FOUND");
    await requireOwnedProject(ctx, client.userId, assessment.projectId);
    const context = await getConversationContext(ctx, assessment.conversationId);
    if (context.quote._id !== assessment.initialQuoteId || context.quote.status !== "discussion_open") throw new ConvexError("SITE_ASSESSMENT_REQUIRES_DISCUSSION");
    assertSiteAssessmentTransition(assessment.status, "scheduled");
    const now = Date.now();
    if (!Number.isFinite(args.scheduledAt) || args.scheduledAt < now - 5 * 60_000 || args.scheduledAt > now + 2 * 365 * 24 * 60 * 60_000) throw new ConvexError("INVALID_SITE_VISIT_DATE");
    const siteAddress = args.siteAddress.trim().replace(/\s+/g, " ");
    if (siteAddress.length < 8 || siteAddress.length > 500) throw new ConvexError("INVALID_SITE_VISIT_ADDRESS");
    const clientNote = normalizeOptionalText(args.clientNote, 1_000, "INVALID_SITE_ASSESSMENT_NOTE");
    await ctx.db.patch(assessment._id, { status: "scheduled", scheduledAt: args.scheduledAt, siteAddress, clientNote, updatedAt: now });
    await appendMarketplaceActivity(ctx, {
      projectId: assessment.projectId, eventType: "site_visit_scheduled", actorUserId: client.userId, actorType: "client",
      companyId: assessment.companyId, quoteId: assessment.initialQuoteId, conversationId: assessment.conversationId,
      siteAssessmentId: assessment._id, oldStatus: assessment.status, newStatus: "scheduled", createdAt: now,
    });
    return { status: "scheduled" as const };
  },
});

export const cancel = mutation({
  args: { assessmentId: v.id("siteAssessments") }, returns: v.object({ status: v.literal("cancelled") }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
    const [user, assessment] = await Promise.all([ctx.db.get(userId), ctx.db.get(args.assessmentId)]);
    if (!user || !assessment) throw new ConvexError("SITE_ASSESSMENT_NOT_FOUND");
    let actorType: "client" | "company";
    if (user.accountType === "client" && user.onboardingStatus === "completed" && assessment.clientId === userId) actorType = "client";
    else if (user.accountType === "company") {
      const access = await requireCompanyUser(ctx);
      if (access.company._id !== assessment.companyId) throw new ConvexError("SITE_ASSESSMENT_NOT_FOUND");
      actorType = "company";
    } else throw new ConvexError("SITE_ASSESSMENT_NOT_FOUND");
    assertSiteAssessmentTransition(assessment.status, "cancelled");
    const now = Date.now();
    await ctx.db.patch(assessment._id, { status: "cancelled", active: false, cancelledAt: now, updatedAt: now });
    await appendMarketplaceActivity(ctx, {
      projectId: assessment.projectId, eventType: "site_assessment_cancelled", actorUserId: userId, actorType,
      companyId: assessment.companyId, quoteId: assessment.initialQuoteId, conversationId: assessment.conversationId,
      siteAssessmentId: assessment._id, oldStatus: assessment.status, newStatus: "cancelled", createdAt: now,
    });
    return { status: "cancelled" as const };
  },
});

export const complete = mutation({
  args: { assessmentId: v.id("siteAssessments") }, returns: v.object({ status: v.literal("completed") }),
  handler: async (ctx, args) => {
    const client = await requireClientUser(ctx);
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment || assessment.clientId !== client.userId) throw new ConvexError("SITE_ASSESSMENT_NOT_FOUND");
    await requireOwnedProject(ctx, client.userId, assessment.projectId);
    assertSiteAssessmentTransition(assessment.status, "completed");
    const now = Date.now();
    await ctx.db.patch(assessment._id, { status: "completed", active: false, completedAt: now, updatedAt: now });
    await appendMarketplaceActivity(ctx, {
      projectId: assessment.projectId, eventType: "site_visit_completed", actorUserId: client.userId, actorType: "client",
      companyId: assessment.companyId, quoteId: assessment.initialQuoteId, conversationId: assessment.conversationId,
      siteAssessmentId: assessment._id, oldStatus: assessment.status, newStatus: "completed", createdAt: now,
    });
    return { status: "completed" as const };
  },
});

export const getForConversation = query({
  args: { conversationId: v.id("conversations") }, returns: assessmentResultValidator,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
    const [user, context] = await Promise.all([ctx.db.get(userId), getConversationContext(ctx, args.conversationId)]);
    if (!user) throw new ConvexError("USER_NOT_FOUND");
    let viewerType: "client" | "company";
    if (user.accountType === "client" && user.onboardingStatus === "completed" && context.conversation.clientId === userId) viewerType = "client";
    else if (user.accountType === "company") {
      const access = await requireCompanyUser(ctx);
      if (access.company._id !== context.company._id) throw new ConvexError("CONVERSATION_NOT_FOUND");
      viewerType = "company";
    } else throw new ConvexError("CONVERSATION_NOT_FOUND");
    if (context.quote.status !== "discussion_open") throw new ConvexError("CONVERSATION_LOCKED");
    const rows = await ctx.db.query("siteAssessments").withIndex("by_conversationId", (q) => q.eq("conversationId", args.conversationId)).order("desc").take(1);
    const active = await activeAssessmentForProject(ctx, context.project._id);
    return { viewerType, canInvite: viewerType === "client" && !active, assessment: rows[0] ? await assessmentDto(ctx, rows[0]) : null };
  },
});

export const getForProject = query({
  args: { projectId: v.id("projects") }, returns: assessmentResultValidator,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
    const [user, project] = await Promise.all([ctx.db.get(userId), ctx.db.get(args.projectId)]);
    if (!user || !project) throw new ConvexError("PROJECT_NOT_FOUND");
    let viewerType: "client" | "company" | "admin";
    let rows: Doc<"siteAssessments">[];
    if (user.accountType === "client" && user.onboardingStatus === "completed" && project.clientId === userId) {
      viewerType = "client";
      rows = await ctx.db.query("siteAssessments").withIndex("by_projectId_and_active", (q) => q.eq("projectId", project._id)).order("desc").take(20);
    } else if (user.accountType === "company") {
      const access = await requireCompanyUser(ctx);
      viewerType = "company";
      rows = await ctx.db.query("siteAssessments").withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", project._id).eq("companyId", access.company._id)).order("desc").take(1);
    } else if (user.accountType === "admin") {
      viewerType = "admin";
      rows = await ctx.db.query("siteAssessments").withIndex("by_projectId_and_active", (q) => q.eq("projectId", project._id)).order("desc").take(20);
    } else throw new ConvexError("PROJECT_NOT_FOUND");
    const assessment = rows.find((row) => row.active) ?? rows[0] ?? null;
    return { viewerType, canInvite: false, assessment: assessment ? await assessmentDto(ctx, assessment) : null };
  },
});
