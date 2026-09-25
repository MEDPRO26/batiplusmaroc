import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { requireCompanyUser } from "../companies/access";
import { appendMarketplaceActivity } from "../marketplaceActivity/model";
import { requireClientUser, requireOwnedProject } from "../projects/access";
import { assertSiteAssessmentTransition, assertSiteVisitTransition, isActiveSiteAssessmentStatus } from "./state";

const MOROCCO_TIMEZONE = "Africa/Casablanca" as const;
const MAX_SCHEDULING_DAYS = 365;
const assessmentStatusValidator = v.union(v.literal("invited"), v.literal("accepted"), v.literal("scheduled"), v.literal("completed"), v.literal("declined"), v.literal("cancelled"));
const visitStatusValidator = v.union(v.literal("proposed"), v.literal("confirmed"), v.literal("completed"), v.literal("declined"), v.literal("cancelled"));
const viewerTypeValidator = v.union(v.literal("client"), v.literal("company"), v.literal("admin"));
const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const nullableUserId = v.union(v.id("users"), v.null());
const proposalValidator = v.object({
  id: v.id("siteVisitProposals"), sequence: v.number(), proposedByUserId: v.id("users"),
  proposedDate: v.string(), proposedTime: v.string(), timezone: v.literal(MOROCCO_TIMEZONE),
  siteAddress: v.string(), note: nullableString, proposedAt: v.number(),
});
const visitValidator = v.object({
  id: v.id("siteVisits"), assessmentId: v.id("siteAssessments"), projectId: v.id("projects"),
  clientId: v.id("users"), companyId: v.id("companies"), conversationId: v.id("conversations"),
  initialQuoteId: v.id("projectQuotes"), proposedByUserId: v.id("users"), proposedDate: v.string(),
  proposedTime: v.string(), timezone: v.literal(MOROCCO_TIMEZONE), scheduledEpoch: v.number(), siteAddress: v.string(), note: nullableString,
  status: visitStatusValidator, proposedAt: v.number(), confirmedByUserId: nullableUserId,
  confirmedAt: nullableNumber, declinedByUserId: nullableUserId, declinedAt: nullableNumber,
  cancelledByUserId: nullableUserId, cancelledAt: nullableNumber, cancellationReason: nullableString,
  completedByUserId: nullableUserId, completedAt: nullableNumber, createdAt: v.number(), updatedAt: v.number(),
  proposals: v.array(proposalValidator), canPropose: v.boolean(), canConfirm: v.boolean(),
  canDecline: v.boolean(), canCancel: v.boolean(), canComplete: v.boolean(),
});
const assessmentValidator = v.object({
  id: v.id("siteAssessments"), projectId: v.id("projects"), companyId: v.id("companies"), companyName: v.string(),
  initialQuoteId: v.id("projectQuotes"), conversationId: v.id("conversations"), status: assessmentStatusValidator,
  invitedAt: v.number(), acceptedAt: nullableNumber, clientNote: nullableString, companyNote: nullableString,
  updatedAt: v.number(), visit: v.union(visitValidator, v.null()),
});
const assessmentResultValidator = v.object({ viewerType: viewerTypeValidator, canInvite: v.boolean(), assessment: v.union(assessmentValidator, v.null()) });
type Ctx = QueryCtx | MutationCtx;
type Participant = { userId: Id<"users">; actorType: "client" | "company" };

function proposerActorType(visit: Pick<Doc<"siteVisits">, "clientId" | "proposedByUserId">) {
  return visit.proposedByUserId === visit.clientId ? "client" as const : "company" as const;
}

function normalizeOptionalText(value: string | undefined, max: number, code: string) {
  if (value === undefined) return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length > max) throw new ConvexError(code);
  return normalized || undefined;
}

function normalizeAddress(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 8 || normalized.length > 500) throw new ConvexError("INVALID_SITE_VISIT_ADDRESS");
  return normalized;
}

/** Convert an Africa/Casablanca wall-clock value to an instant and reject DST gaps. */
function moroccoDateTimeToEpoch(proposedDate: string, proposedTime: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(proposedDate);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(proposedTime);
  if (!dateMatch || !timeMatch) throw new ConvexError("INVALID_SITE_VISIT_DATE");
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hour, minute] = timeMatch.slice(1).map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59) {
    throw new ConvexError("INVALID_SITE_VISIT_DATE");
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOROCCO_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  let instant = naiveUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
    const representedUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    instant = naiveUtc - (representedUtc - instant);
  }
  const check = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  if (`${check.year}-${check.month}-${check.day}` !== proposedDate || `${check.hour}:${check.minute}` !== proposedTime) throw new ConvexError("INVALID_SITE_VISIT_DATE");
  return instant;
}

function validateFutureSchedule(proposedDate: string, proposedTime: string, now: number) {
  const epoch = moroccoDateTimeToEpoch(proposedDate, proposedTime);
  if (epoch <= now || epoch > now + MAX_SCHEDULING_DAYS * 24 * 60 * 60_000) throw new ConvexError("INVALID_SITE_VISIT_DATE");
  return epoch;
}

async function getConversationContext(ctx: Ctx, conversationId: Id<"conversations">) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) throw new ConvexError("CONVERSATION_NOT_FOUND");
  const [project, quote, company] = await Promise.all([ctx.db.get(conversation.projectId), ctx.db.get(conversation.quoteId), ctx.db.get(conversation.companyId)]);
  if (!project || !quote || !company || project.clientId !== conversation.clientId || quote.projectId !== project._id || quote.companyId !== company._id || conversation.status !== "active") throw new ConvexError("CONVERSATION_INTEGRITY_ERROR");
  return { conversation, project, quote, company };
}

async function activeAssessmentForProject(ctx: Ctx, projectId: Id<"projects">) {
  const rows = await ctx.db.query("siteAssessments").withIndex("by_projectId_and_active", (q) => q.eq("projectId", projectId).eq("active", true)).take(2);
  if (rows.length > 1) throw new ConvexError("SITE_ASSESSMENT_INTEGRITY_ERROR");
  return rows[0] ?? null;
}

async function activeVisitForAssessment(ctx: Ctx, assessmentId: Id<"siteAssessments">) {
  const rows = await ctx.db.query("siteVisits").withIndex("by_assessmentId_and_active", (q) => q.eq("assessmentId", assessmentId).eq("active", true)).take(2);
  if (rows.length > 1) throw new ConvexError("SITE_VISIT_INTEGRITY_ERROR");
  return rows[0] ?? null;
}

async function latestVisitForAssessment(ctx: Ctx, assessmentId: Id<"siteAssessments">) {
  return (await ctx.db.query("siteVisits").withIndex("by_assessmentId_and_active", (q) => q.eq("assessmentId", assessmentId)).order("desc").take(1))[0] ?? null;
}

async function requireAssessmentParticipant(ctx: MutationCtx, assessment: Doc<"siteAssessments">): Promise<Participant> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("USER_NOT_FOUND");
  const context = await getConversationContext(ctx, assessment.conversationId);
  if (context.project._id !== assessment.projectId || context.project.clientId !== assessment.clientId || context.quote._id !== assessment.initialQuoteId || context.company._id !== assessment.companyId) throw new ConvexError("SITE_ASSESSMENT_INTEGRITY_ERROR");
  const activeCompanyMembers = await ctx.db.query("companyMembers")
    .withIndex("by_companyId_and_status", (q) => q.eq("companyId", assessment.companyId).eq("status", "active"))
    .take(1);
  if (activeCompanyMembers.length === 0) throw new ConvexError("COMPANY_MEMBERSHIP_REQUIRED");
  let actorType: Participant["actorType"];
  if (user.accountType === "client" && user.onboardingStatus === "completed" && assessment.clientId === userId) {
    await requireOwnedProject(ctx, userId, assessment.projectId);
    actorType = "client";
  } else if (user.accountType === "company") {
    const access = await requireCompanyUser(ctx);
    if (access.company._id !== assessment.companyId) throw new ConvexError("SITE_ASSESSMENT_NOT_FOUND");
    actorType = "company";
  } else throw new ConvexError("SITE_ASSESSMENT_NOT_FOUND");
  if (assessment.status !== "accepted" || !assessment.active || context.quote.status !== "discussion_open") throw new ConvexError("SITE_VISIT_REQUIRES_ACCEPTED_ASSESSMENT");
  return { userId, actorType };
}

async function requireVisitParticipant(ctx: MutationCtx, visitId: Id<"siteVisits">) {
  const visit = await ctx.db.get(visitId);
  if (!visit) throw new ConvexError("SITE_VISIT_NOT_FOUND");
  const assessment = await ctx.db.get(visit.assessmentId);
  if (!assessment || assessment.projectId !== visit.projectId || assessment.clientId !== visit.clientId || assessment.companyId !== visit.companyId || assessment.conversationId !== visit.conversationId || assessment.initialQuoteId !== visit.initialQuoteId) throw new ConvexError("SITE_VISIT_NOT_FOUND");
  return { visit, assessment, participant: await requireAssessmentParticipant(ctx, assessment) };
}

function proposalMatches(visit: Doc<"siteVisits">, args: { proposedDate: string; proposedTime: string; siteAddress: string; note?: string }) {
  return visit.proposedDate === args.proposedDate && visit.proposedTime === args.proposedTime && visit.siteAddress === args.siteAddress && (visit.note ?? undefined) === args.note;
}

async function visitDto(ctx: Ctx, visit: Doc<"siteVisits">, viewer: Participant | null) {
  const newestProposals = await ctx.db.query("siteVisitProposals").withIndex("by_visitId_and_sequence", (q) => q.eq("visitId", visit._id)).order("desc").take(50);
  if (!visit.currentProposalId || newestProposals.length === 0 || newestProposals[0]?._id !== visit.currentProposalId) throw new ConvexError("SITE_VISIT_INTEGRITY_ERROR");
  const proposals = newestProposals.reverse();
  const other = viewer !== null && viewer.actorType !== proposerActorType(visit);
  return {
    id: visit._id, assessmentId: visit.assessmentId, projectId: visit.projectId, clientId: visit.clientId,
    companyId: visit.companyId, conversationId: visit.conversationId, initialQuoteId: visit.initialQuoteId,
    proposedByUserId: visit.proposedByUserId, proposedDate: visit.proposedDate, proposedTime: visit.proposedTime,
    timezone: visit.timezone, scheduledEpoch: moroccoDateTimeToEpoch(visit.proposedDate, visit.proposedTime), siteAddress: visit.siteAddress, note: visit.note ?? null, status: visit.status,
    proposedAt: visit.proposedAt, confirmedByUserId: visit.confirmedByUserId ?? null, confirmedAt: visit.confirmedAt ?? null,
    declinedByUserId: visit.declinedByUserId ?? null, declinedAt: visit.declinedAt ?? null,
    cancelledByUserId: visit.cancelledByUserId ?? null, cancelledAt: visit.cancelledAt ?? null,
    cancellationReason: visit.cancellationReason ?? null, completedByUserId: visit.completedByUserId ?? null,
    completedAt: visit.completedAt ?? null, createdAt: visit.createdAt, updatedAt: visit.updatedAt,
    proposals: proposals.map((proposal) => ({
      id: proposal._id, sequence: proposal.sequence, proposedByUserId: proposal.proposedByUserId,
      proposedDate: proposal.proposedDate, proposedTime: proposal.proposedTime, timezone: proposal.timezone,
      siteAddress: proposal.siteAddress, note: proposal.note ?? null, proposedAt: proposal.proposedAt,
    })),
    canPropose: viewer !== null && visit.status === "proposed" && other,
    canConfirm: viewer !== null && visit.status === "proposed" && other,
    canDecline: viewer !== null && visit.status === "proposed" && other,
    canCancel: viewer !== null && visit.status === "confirmed",
    canComplete: viewer !== null && visit.status === "confirmed",
  };
}

async function assessmentDto(ctx: Ctx, assessment: Doc<"siteAssessments">, viewer: Participant | null) {
  const [company, visit] = await Promise.all([ctx.db.get(assessment.companyId), latestVisitForAssessment(ctx, assessment._id)]);
  if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
  return {
    id: assessment._id, projectId: assessment.projectId, companyId: assessment.companyId,
    companyName: company.name?.trim() || "", initialQuoteId: assessment.initialQuoteId,
    conversationId: assessment.conversationId, status: assessment.status, invitedAt: assessment.invitedAt,
    acceptedAt: assessment.acceptedAt ?? null, clientNote: assessment.clientNote ?? null,
    companyNote: assessment.companyNote ?? null, updatedAt: assessment.updatedAt,
    visit: visit ? await visitDto(ctx, visit, viewer) : null,
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
      if (existing.conversationId === conversation._id && existing.companyId === conversation.companyId && existing.status === "invited") return { assessmentId: existing._id, status: "invited" as const, duplicate: true };
      throw new ConvexError("ACTIVE_SITE_ASSESSMENT_ALREADY_EXISTS");
    }
    const clientNote = normalizeOptionalText(args.clientNote, 1_000, "INVALID_SITE_ASSESSMENT_NOTE");
    const now = Date.now();
    const assessmentId = await ctx.db.insert("siteAssessments", {
      projectId: project._id, clientId: client.userId, companyId: conversation.companyId, initialQuoteId: quote._id,
      conversationId: conversation._id, status: "invited", active: true, invitedByUserId: client.userId,
      invitedAt: now, clientNote, createdAt: now, updatedAt: now,
    });
    await appendMarketplaceActivity(ctx, { projectId: project._id, eventType: "site_assessment_invited", actorUserId: client.userId, actorType: "client", companyId: conversation.companyId, quoteId: quote._id, conversationId: conversation._id, siteAssessmentId: assessmentId, newStatus: "invited", createdAt: now });
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
    await ctx.db.patch(assessment._id, { status: desired, active: isActiveSiteAssessmentStatus(desired), companyNote, acceptedAt: desired === "accepted" ? now : undefined, acceptedMarketplaceTermsAt: desired === "accepted" ? now : undefined, declinedAt: desired === "declined" ? now : undefined, updatedAt: now });
    await appendMarketplaceActivity(ctx, { projectId: assessment.projectId, eventType: desired === "accepted" ? "site_assessment_accepted" : "site_assessment_declined", actorUserId: access.userId, actorType: "company", companyId: assessment.companyId, quoteId: assessment.initialQuoteId, conversationId: assessment.conversationId, siteAssessmentId: assessment._id, oldStatus: assessment.status, newStatus: desired, createdAt: now });
    return { status: desired, duplicate: false };
  },
});

export const proposeVisit = mutation({
  args: { assessmentId: v.id("siteAssessments"), proposedDate: v.string(), proposedTime: v.string(), timezone: v.literal(MOROCCO_TIMEZONE), siteAddress: v.string(), note: v.optional(v.string()) },
  returns: v.object({ visitId: v.id("siteVisits"), status: v.literal("proposed"), duplicate: v.boolean(), rescheduled: v.boolean() }),
  handler: async (ctx, args) => {
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment) throw new ConvexError("SITE_ASSESSMENT_NOT_FOUND");
    const participant = await requireAssessmentParticipant(ctx, assessment);
    const now = Date.now();
    const scheduledEpoch = validateFutureSchedule(args.proposedDate, args.proposedTime, now);
    const siteAddress = normalizeAddress(args.siteAddress);
    const note = normalizeOptionalText(args.note, 1_000, "INVALID_SITE_VISIT_NOTE");
    const proposal = { proposedDate: args.proposedDate, proposedTime: args.proposedTime, siteAddress, note };
    const active = await activeVisitForAssessment(ctx, assessment._id);
    if (active) {
      if (active.status !== "proposed") throw new ConvexError("ACTIVE_SITE_VISIT_ALREADY_EXISTS");
      if (proposerActorType(active) === participant.actorType) {
        if (active.proposedByUserId === participant.userId && proposalMatches(active, proposal)) return { visitId: active._id, status: "proposed" as const, duplicate: true, rescheduled: false };
        throw new ConvexError("SITE_VISIT_RESPONSE_REQUIRED_FROM_OTHER_PARTICIPANT");
      }
      if (!active.currentProposalId) throw new ConvexError("SITE_VISIT_INTEGRITY_ERROR");
      const currentProposal = await ctx.db.get(active.currentProposalId);
      if (!currentProposal || currentProposal.visitId !== active._id) throw new ConvexError("SITE_VISIT_INTEGRITY_ERROR");
      const proposalId = await ctx.db.insert("siteVisitProposals", { visitId: active._id, assessmentId: assessment._id, sequence: currentProposal.sequence + 1, proposedByUserId: participant.userId, proposedDate: args.proposedDate, proposedTime: args.proposedTime, timezone: MOROCCO_TIMEZONE, siteAddress, note, proposedAt: now });
      await ctx.db.patch(active._id, { proposedByUserId: participant.userId, currentProposalId: proposalId, proposedDate: args.proposedDate, proposedTime: args.proposedTime, timezone: MOROCCO_TIMEZONE, siteAddress, note, proposedAt: now, updatedAt: now });
      await appendMarketplaceActivity(ctx, { projectId: assessment.projectId, eventType: "site_visit_rescheduled", actorUserId: participant.userId, actorType: participant.actorType, companyId: assessment.companyId, quoteId: assessment.initialQuoteId, conversationId: assessment.conversationId, siteAssessmentId: assessment._id, siteVisitId: active._id, oldStatus: "proposed", newStatus: "proposed", metadata: { proposedDate: args.proposedDate, proposedTime: args.proposedTime, timezone: MOROCCO_TIMEZONE, scheduledEpoch }, createdAt: now });
      return { visitId: active._id, status: "proposed" as const, duplicate: false, rescheduled: true };
    }
    const latest = await latestVisitForAssessment(ctx, assessment._id);
    if (latest?.status === "completed") throw new ConvexError("INVALID_SITE_VISIT_TRANSITION");
    const visitId = await ctx.db.insert("siteVisits", { assessmentId: assessment._id, projectId: assessment.projectId, clientId: assessment.clientId, companyId: assessment.companyId, conversationId: assessment.conversationId, initialQuoteId: assessment.initialQuoteId, proposedByUserId: participant.userId, proposedDate: args.proposedDate, proposedTime: args.proposedTime, timezone: MOROCCO_TIMEZONE, siteAddress, note, status: "proposed", active: true, proposedAt: now, createdAt: now, updatedAt: now });
    const proposalId = await ctx.db.insert("siteVisitProposals", { visitId, assessmentId: assessment._id, sequence: 1, proposedByUserId: participant.userId, proposedDate: args.proposedDate, proposedTime: args.proposedTime, timezone: MOROCCO_TIMEZONE, siteAddress, note, proposedAt: now });
    await ctx.db.patch(visitId, { currentProposalId: proposalId });
    await appendMarketplaceActivity(ctx, { projectId: assessment.projectId, eventType: "site_visit_proposed", actorUserId: participant.userId, actorType: participant.actorType, companyId: assessment.companyId, quoteId: assessment.initialQuoteId, conversationId: assessment.conversationId, siteAssessmentId: assessment._id, siteVisitId: visitId, newStatus: "proposed", metadata: { proposedDate: args.proposedDate, proposedTime: args.proposedTime, timezone: MOROCCO_TIMEZONE, scheduledEpoch }, createdAt: now });
    return { visitId, status: "proposed" as const, duplicate: false, rescheduled: false };
  },
});

export const respondToVisit = mutation({
  args: { visitId: v.id("siteVisits"), decision: v.union(v.literal("confirm"), v.literal("decline")) },
  returns: v.object({ status: v.union(v.literal("confirmed"), v.literal("declined")), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const { visit, assessment, participant } = await requireVisitParticipant(ctx, args.visitId);
    const desired = args.decision === "confirm" ? "confirmed" as const : "declined" as const;
    if (proposerActorType(visit) === participant.actorType) throw new ConvexError("SITE_VISIT_RESPONSE_REQUIRED_FROM_OTHER_PARTICIPANT");
    if (visit.status === desired) return { status: desired, duplicate: true };
    assertSiteVisitTransition(visit.status, desired);
    const now = Date.now();
    const scheduledEpoch = moroccoDateTimeToEpoch(visit.proposedDate, visit.proposedTime);
    await ctx.db.patch(visit._id, desired === "confirmed" ? { status: desired, confirmedByUserId: participant.userId, confirmedAt: now, updatedAt: now } : { status: desired, active: false, declinedByUserId: participant.userId, declinedAt: now, updatedAt: now });
    await appendMarketplaceActivity(ctx, { projectId: visit.projectId, eventType: desired === "confirmed" ? "site_visit_confirmed" : "site_visit_declined", actorUserId: participant.userId, actorType: participant.actorType, companyId: visit.companyId, quoteId: visit.initialQuoteId, conversationId: visit.conversationId, siteAssessmentId: assessment._id, siteVisitId: visit._id, oldStatus: visit.status, newStatus: desired, metadata: { proposedDate: visit.proposedDate, proposedTime: visit.proposedTime, timezone: MOROCCO_TIMEZONE, scheduledEpoch }, createdAt: now });
    return { status: desired, duplicate: false };
  },
});

export const cancelVisit = mutation({
  args: { visitId: v.id("siteVisits"), reason: v.optional(v.string()) },
  returns: v.object({ status: v.literal("cancelled"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const { visit, assessment, participant } = await requireVisitParticipant(ctx, args.visitId);
    if (visit.status === "cancelled") return { status: "cancelled" as const, duplicate: true };
    assertSiteVisitTransition(visit.status, "cancelled");
    const reason = normalizeOptionalText(args.reason, 500, "INVALID_SITE_VISIT_CANCELLATION_REASON");
    const now = Date.now();
    await ctx.db.patch(visit._id, { status: "cancelled", active: false, cancelledByUserId: participant.userId, cancelledAt: now, cancellationReason: reason, updatedAt: now });
    await appendMarketplaceActivity(ctx, { projectId: visit.projectId, eventType: "site_visit_cancelled", actorUserId: participant.userId, actorType: participant.actorType, companyId: visit.companyId, quoteId: visit.initialQuoteId, conversationId: visit.conversationId, siteAssessmentId: assessment._id, siteVisitId: visit._id, oldStatus: visit.status, newStatus: "cancelled", reason, createdAt: now });
    return { status: "cancelled" as const, duplicate: false };
  },
});

export const completeVisit = mutation({
  args: { visitId: v.id("siteVisits") },
  returns: v.object({ status: v.literal("completed"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const { visit, assessment, participant } = await requireVisitParticipant(ctx, args.visitId);
    if (visit.status === "completed") return { status: "completed" as const, duplicate: true };
    assertSiteVisitTransition(visit.status, "completed");
    const now = Date.now();
    if (moroccoDateTimeToEpoch(visit.proposedDate, visit.proposedTime) > now) {
      throw new ConvexError("SITE_VISIT_NOT_YET_DUE");
    }
    await ctx.db.patch(visit._id, { status: "completed", active: false, completedByUserId: participant.userId, completedAt: now, updatedAt: now });
    await appendMarketplaceActivity(ctx, { projectId: visit.projectId, eventType: "site_visit_completed", actorUserId: participant.userId, actorType: participant.actorType, companyId: visit.companyId, quoteId: visit.initialQuoteId, conversationId: visit.conversationId, siteAssessmentId: assessment._id, siteVisitId: visit._id, oldStatus: visit.status, newStatus: "completed", createdAt: now });
    return { status: "completed" as const, duplicate: false };
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
    const viewer = { userId, actorType: viewerType } satisfies Participant;
    return { viewerType, canInvite: viewerType === "client" && !active, assessment: rows[0] ? await assessmentDto(ctx, rows[0], viewer) : null };
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
    let viewer: Participant | null;
    let rows: Doc<"siteAssessments">[];
    if (user.accountType === "client" && user.onboardingStatus === "completed" && project.clientId === userId) {
      viewerType = "client"; viewer = { userId, actorType: "client" };
      rows = await ctx.db.query("siteAssessments").withIndex("by_projectId_and_active", (q) => q.eq("projectId", project._id)).order("desc").take(20);
    } else if (user.accountType === "company") {
      const access = await requireCompanyUser(ctx);
      viewerType = "company"; viewer = { userId, actorType: "company" };
      rows = await ctx.db.query("siteAssessments").withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", project._id).eq("companyId", access.company._id)).order("desc").take(1);
    } else if (user.accountType === "admin") {
      viewerType = "admin"; viewer = null;
      rows = await ctx.db.query("siteAssessments").withIndex("by_projectId_and_active", (q) => q.eq("projectId", project._id)).order("desc").take(20);
    } else throw new ConvexError("PROJECT_NOT_FOUND");
    const assessment = rows.find((row) => row.active) ?? rows[0] ?? null;
    return { viewerType, canInvite: false, assessment: assessment ? await assessmentDto(ctx, assessment, viewer) : null };
  },
});
