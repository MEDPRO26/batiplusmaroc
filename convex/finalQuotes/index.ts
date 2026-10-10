import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { requireCompanyUser, requireVerifiedCompanyMarketplaceUser } from "../companies/access";
import { companyFileNamesForConversation, companyNameForAudience, companyNamesToMask, companyPdfFileNameForAudience, maskCompanyNamesInText, resolveCompanyIdentityAudience, type CompanyNameAudience, type CompanyFileNameReference } from "../lib/companyName";
import { assertCompanyMarketplaceWriteAllowed, getCompanyOperationalStatus, requireCompanyMarketplaceWriteAllowed } from "../companies/operationalStatus";
import {
  createDealFromFreshFinalQuoteAcceptance,
  reuseDealFromAcceptedFinalQuote,
} from "../deals/index";
import { appendMarketplaceActivity } from "../marketplaceActivity/model";
import {
  createNotification,
  createNotificationForActiveCompanyMembers,
} from "../notifications/model";
import { requireClientUser, requireOwnedProject } from "../projects/access";
import { assertProjectTransition } from "../projects/state";
import { isCentimePrecisionMadAmount } from "../deals/money";
import { assertFinalQuoteTransition } from "./state";
import { claimPdfUpload, createPdfUploadIntent } from "./pdfUploads";

const MAX_PRICE_MAD = 100_000_000;
const MAX_DURATION_DAYS = 1_825;
const MAX_REVISIONS = 100;
const statusValidator = v.union(v.literal("draft"), v.literal("submitted"), v.literal("changes_requested"), v.literal("accepted"), v.literal("declined"), v.literal("withdrawn"));
const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const revisionValidator = v.object({
  id: v.id("finalQuoteRevisions"), revisionNumber: v.number(), price: v.number(), currency: v.literal("MAD"),
  duration: v.number(), plannedStartDate: v.string(), validUntil: v.string(), scope: v.string(),
  inclusions: v.string(), exclusions: v.string(), paymentTerms: v.string(), companyNote: nullableString,
  hasPdf: v.boolean(), pdfFileName: nullableString, pdfSize: nullableNumber, submittedAt: v.number(),
});
const finalQuoteValidator = v.object({
  id: v.id("finalQuotes"), projectId: v.id("projects"), companyId: v.id("companies"),
  companyName: v.string(), conversationId: v.id("conversations"), status: statusValidator,
  requestTrigger: v.union(v.literal("client_request"), v.literal("completed_site_visit")), requestedAt: v.number(),
  changesRequestReason: nullableString, acceptedAt: nullableNumber, declinedAt: nullableNumber, withdrawnAt: nullableNumber,
  currentRevisionId: v.union(v.id("finalQuoteRevisions"), v.null()), revisions: v.array(revisionValidator),
  canRequest: v.boolean(), canSubmit: v.boolean(), canReview: v.boolean(), canWithdraw: v.boolean(),
});
const resultValidator = v.object({
  viewerType: v.union(v.literal("client"), v.literal("company"), v.literal("admin")),
  canRequest: v.boolean(), canPrepare: v.boolean(), finalQuote: v.union(finalQuoteValidator, v.null()),
});
type Ctx = QueryCtx | MutationCtx;

function assertEligibleProject(status: Doc<"projects">["status"]) {
  if (status !== "published" && status !== "in_discussion") throw new ConvexError("FINAL_QUOTE_PROJECT_NOT_ELIGIBLE");
}

function normalizeText(value: string, min: number, max: number, code: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < min || normalized.length > max) throw new ConvexError(code);
  return normalized;
}

function normalizeOptionalText(value: string | undefined, max: number, code: string) {
  if (value === undefined) return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length > max) throw new ConvexError(code);
  return normalized || undefined;
}

function dateValue(value: string, now: number, allowToday: boolean, code: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ConvexError(code);
  const [, y, m, d] = match;
  const parsed = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (parsed.getUTCFullYear() !== Number(y) || parsed.getUTCMonth() !== Number(m) - 1 || parsed.getUTCDate() !== Number(d)) throw new ConvexError(code);
  const today = new Date(now).toISOString().slice(0, 10);
  if (allowToday ? value < today : value <= today) throw new ConvexError(code);
  return value;
}

async function contextForConversation(ctx: Ctx, conversationId: Id<"conversations">) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) throw new ConvexError("CONVERSATION_NOT_FOUND");
  const quoteId = conversation.quoteId;
  if (!quoteId) throw new ConvexError("CONVERSATION_LOCKED");
  const [project, initialQuote, company] = await Promise.all([
    ctx.db.get(conversation.projectId), ctx.db.get(quoteId), ctx.db.get(conversation.companyId),
  ]);
  if (!project || !initialQuote || !company || conversation.status !== "active" || project.clientId !== conversation.clientId ||
    initialQuote.projectId !== project._id || initialQuote.companyId !== company._id || initialQuote.status !== "discussion_open") {
    throw new ConvexError("CONVERSATION_NOT_FOUND");
  }
  return { conversation, project, initialQuote, company };
}

async function parentForRelationship(ctx: Ctx, projectId: Id<"projects">, companyId: Id<"companies">) {
  const rows = await ctx.db.query("finalQuotes").withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", projectId).eq("companyId", companyId)).take(2);
  if (rows.length > 1) throw new ConvexError("FINAL_QUOTE_INTEGRITY_ERROR");
  return rows[0] ?? null;
}

async function completedVisitForConversation(ctx: Ctx, conversationId: Id<"conversations">) {
  const visits = await ctx.db.query("siteVisits").withIndex("by_conversationId_and_createdAt", (q) => q.eq("conversationId", conversationId)).order("desc").take(20);
  return visits.find((visit) => visit.status === "completed") ?? null;
}

/** PATH A: active assessment/visit that is not completed blocks final-quote request/submit. */
async function hasIncompleteSiteVisitWorkflow(ctx: Ctx, conversationId: Id<"conversations">) {
  const assessments = await ctx.db
    .query("siteAssessments")
    .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
    .order("desc")
    .take(10);
  const assessment = assessments.find((row) => row.active) ?? null;
  if (!assessment) return false;
  if (
    assessment.status === "declined" ||
    assessment.status === "cancelled" ||
    assessment.status === "completed"
  ) {
    return false;
  }

  const completed = await completedVisitForConversation(ctx, conversationId);
  if (completed && completed.assessmentId === assessment._id) return false;

  // invited / accepted / scheduled without a completed visit = still on PATH A
  if (
    assessment.status === "invited" ||
    assessment.status === "accepted" ||
    assessment.status === "scheduled"
  ) {
    return true;
  }

  const activeVisits = await ctx.db
    .query("siteVisits")
    .withIndex("by_assessmentId_and_active", (q) =>
      q.eq("assessmentId", assessment._id).eq("active", true),
    )
    .take(5);
  return activeVisits.some(
    (visit) => visit.status === "proposed" || visit.status === "confirmed",
  );
}

async function assertSiteVisitAllowsFinalQuote(ctx: Ctx, conversationId: Id<"conversations">) {
  if (await hasIncompleteSiteVisitWorkflow(ctx, conversationId)) {
    throw new ConvexError("FINAL_QUOTE_SITE_VISIT_INCOMPLETE");
  }
}

async function activitySiteRefs(parent: Doc<"finalQuotes">) {
  return {
    siteAssessmentId: parent.siteAssessmentId,
    siteVisitId: parent.siteVisitId,
  };
}

function notificationPayload(
  project: Doc<"projects">,
  company: Doc<"companies">,
  amountMad: number,
) {
  const projectTitle = project.title?.trim();
  const companyName = company.name?.trim();
  return {
    ...(projectTitle ? { projectTitle } : {}),
    ...(companyName ? { companyName } : {}),
    amountMad,
  };
}

async function createFinalQuoteSubmittedNotification(
  ctx: MutationCtx,
  args: {
    parent: Doc<"finalQuotes">;
    project: Doc<"projects">;
    company: Doc<"companies">;
    revisionId: Id<"finalQuoteRevisions">;
    actorUserId: Id<"users">;
    amountMad: number;
  },
) {
  await createNotification(ctx, {
    recipientUserId: args.parent.clientId,
    actorUserId: args.actorUserId,
    type: "final_quote_submitted",
    entity: { type: "final_quote", id: args.parent._id },
    payload: notificationPayload(args.project, args.company, args.amountMad),
    dedupeKey: `final_quote_revision:${args.revisionId}:submitted`,
  });
}

async function createFinalQuoteAcceptedNotifications(
  ctx: MutationCtx,
  args: {
    parent: Doc<"finalQuotes">;
    project: Doc<"projects">;
    company: Doc<"companies">;
    actorUserId: Id<"users">;
    amountMad: number;
  },
) {
  await createNotificationForActiveCompanyMembers(ctx, {
    companyId: args.parent.companyId,
    actorUserId: args.actorUserId,
    type: "final_quote_accepted",
    entity: { type: "final_quote", id: args.parent._id },
    payload: notificationPayload(args.project, args.company, args.amountMad),
    dedupeKey: `final_quote:${args.parent._id}:accepted`,
  });
}

async function createVisitTriggeredParent(ctx: MutationCtx, context: Awaited<ReturnType<typeof contextForConversation>>, userId: Id<"users">) {
  const visit = await completedVisitForConversation(ctx, context.conversation._id);
  if (!visit || visit.projectId !== context.project._id || visit.companyId !== context.company._id || visit.initialQuoteId !== context.initialQuote._id) {
    throw new ConvexError("FINAL_QUOTE_NOT_REQUESTED");
  }
  const assessment = await ctx.db.get(visit.assessmentId);
  if (!assessment || assessment.conversationId !== context.conversation._id) throw new ConvexError("FINAL_QUOTE_INTEGRITY_ERROR");
  const now = Date.now();
  const triggerUserId = visit.completedByUserId ?? userId;
  const triggerActorType = triggerUserId === visit.clientId ? "client" as const : "company" as const;
  const finalQuoteId = await ctx.db.insert("finalQuotes", {
    projectId: context.project._id, clientId: context.project.clientId, companyId: context.company._id,
    initialQuoteId: context.initialQuote._id, conversationId: context.conversation._id,
    siteAssessmentId: assessment._id, siteVisitId: visit._id, status: "draft", requestedAt: visit.completedAt ?? now,
    requestedByUserId: triggerUserId, requestTrigger: "completed_site_visit", createdAt: now, updatedAt: now,
  });
  await appendMarketplaceActivity(ctx, { projectId: context.project._id, eventType: "final_quote_requested", actorUserId: triggerUserId,
    actorType: triggerActorType, companyId: context.company._id, quoteId: context.initialQuote._id, conversationId: context.conversation._id,
    siteAssessmentId: assessment._id, siteVisitId: visit._id, finalQuoteId, newStatus: "draft",
    metadata: { trigger: "completed_site_visit" }, createdAt: now });
  return await ctx.db.get(finalQuoteId) as Doc<"finalQuotes">;
}

export async function requireFinalQuoteParticipant(ctx: Ctx, parent: Doc<"finalQuotes">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("USER_NOT_FOUND");
  if (user.accountType === "client" && user.onboardingStatus === "completed" && parent.clientId === userId) return { userId, viewerType: "client" as const };
  if (user.accountType === "company" && user.onboardingStatus === "completed") {
    const member = await ctx.db.query("companyMembers").withIndex("by_companyId_and_userId", (q) => q.eq("companyId", parent.companyId).eq("userId", userId)).unique();
    if (member?.status === "active") return { userId, viewerType: "company" as const };
  }
  if (user.accountType === "admin") return { userId, viewerType: "admin" as const };
  throw new ConvexError("FINAL_QUOTE_NOT_FOUND");
}

async function revisionDto(revision: Doc<"finalQuoteRevisions">, maskedNames: readonly unknown[], audience: CompanyNameAudience, files: readonly CompanyFileNameReference[]) {
  return { id: revision._id, revisionNumber: revision.revisionNumber, price: revision.price, currency: revision.currency,
    duration: revision.duration, plannedStartDate: revision.plannedStartDate, validUntil: revision.validUntil,
    scope: maskCompanyNamesInText(revision.scope, maskedNames, files), inclusions: maskCompanyNamesInText(revision.inclusions, maskedNames, files),
    exclusions: maskCompanyNamesInText(revision.exclusions, maskedNames, files), paymentTerms: maskCompanyNamesInText(revision.paymentTerms, maskedNames, files),
    companyNote: revision.companyNote === undefined ? null : maskCompanyNamesInText(revision.companyNote, maskedNames, files), hasPdf: revision.pdfStorageId !== undefined,
    pdfFileName: revision.pdfFileName === undefined ? null : companyPdfFileNameForAudience(revision.pdfFileName, audience, "final-quote"), pdfSize: revision.pdfSize ?? null, submittedAt: revision.submittedAt };
}

async function finalQuoteDto(
  ctx: Ctx,
  parent: Doc<"finalQuotes">,
  viewerType: "client" | "company" | "admin",
  canSubmitOverride?: boolean,
) {
  const [company, revisions] = await Promise.all([
    ctx.db.get(parent.companyId),
    ctx.db.query("finalQuoteRevisions").withIndex("by_finalQuoteId_and_revisionNumber", (q) => q.eq("finalQuoteId", parent._id)).order("asc").take(100),
  ]);
  if (!company) throw new ConvexError("FINAL_QUOTE_INTEGRITY_ERROR");
  const audience = await resolveCompanyIdentityAudience(ctx, company._id);
  const maskedNames = companyNamesToMask(company, audience);
  let files: readonly CompanyFileNameReference[] = [];
  if (viewerType === "client") {
    const conversation = await ctx.db.get(parent.conversationId);
    if (!conversation || conversation.companyId !== parent.companyId || conversation.clientId !== parent.clientId || conversation.projectId !== parent.projectId) throw new ConvexError("FINAL_QUOTE_INTEGRITY_ERROR");
    files = await companyFileNamesForConversation(ctx, conversation,
      [parent.changesRequestReason, ...revisions.flatMap(revision => [revision.scope, revision.inclusions, revision.exclusions, revision.paymentTerms, revision.companyNote])],
      revisions.flatMap(revision => revision.pdfFileName ? [{ originalFileName: revision.pdfFileName, kind: "final-quote" as const }] : []));
  }
  const canSubmit =
    canSubmitOverride ??
    (viewerType === "company" &&
      (parent.status === "draft" || parent.status === "changes_requested"));
  return { id: parent._id, projectId: parent.projectId, companyId: parent.companyId, companyName: companyNameForAudience(company.name?.trim(), audience),
    conversationId: parent.conversationId, status: parent.status, requestTrigger: parent.requestTrigger, requestedAt: parent.requestedAt,
    changesRequestReason: parent.changesRequestReason === undefined ? null : maskCompanyNamesInText(parent.changesRequestReason, maskedNames, files), acceptedAt: parent.acceptedAt ?? null,
    declinedAt: parent.declinedAt ?? null, withdrawnAt: parent.withdrawnAt ?? null, currentRevisionId: parent.currentRevisionId ?? null,
    revisions: await Promise.all(revisions.map((revision) => revisionDto(revision, maskedNames, audience, files))), canRequest: false,
    canSubmit,
    canReview: viewerType === "client" && parent.status === "submitted", canWithdraw: viewerType === "company" && parent.status === "submitted" };
}

async function getViewerForContext(ctx: Ctx, context: Awaited<ReturnType<typeof contextForConversation>>) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("NOT_AUTHENTICATED");
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("USER_NOT_FOUND");
  if (user.accountType === "client" && user.onboardingStatus === "completed" && context.project.clientId === userId) return { userId, viewerType: "client" as const };
  if (user.accountType === "company" && user.onboardingStatus === "completed") {
    const access = await requireCompanyUser(ctx);
    if (access.company._id === context.company._id) return { userId, viewerType: "company" as const };
  }
  if (user.accountType === "admin") return { userId, viewerType: "admin" as const };
  throw new ConvexError("CONVERSATION_NOT_FOUND");
}

export const getForConversation = query({
  args: { conversationId: v.id("conversations") }, returns: resultValidator,
  handler: async (ctx, args) => {
    const context = await contextForConversation(ctx, args.conversationId);
    const viewer = await getViewerForContext(ctx, context);
    const parent = await parentForRelationship(ctx, context.project._id, context.company._id);
    const accepted = await ctx.db.query("finalQuotes").withIndex("by_projectId_and_status", (q) => q.eq("projectId", context.project._id).eq("status", "accepted")).take(1);
    const incompleteVisit = await hasIncompleteSiteVisitWorkflow(ctx, context.conversation._id);
    const marketplaceAvailable = getCompanyOperationalStatus(context.company) !== "suspended";
    const completedVisit = parent || incompleteVisit ? null : await completedVisitForConversation(ctx, context.conversation._id);
    const canSubmit =
      viewer.viewerType === "company" &&
      marketplaceAvailable &&
      !incompleteVisit &&
      parent !== null &&
      (parent.status === "draft" || parent.status === "changes_requested");
    return { viewerType: viewer.viewerType,
      canRequest: viewer.viewerType === "client" && marketplaceAvailable && !parent && accepted.length === 0 && !incompleteVisit,
      canPrepare: viewer.viewerType === "company" && marketplaceAvailable && !parent && accepted.length === 0 && !incompleteVisit && completedVisit !== null,
      finalQuote: parent ? await finalQuoteDto(ctx, parent, viewer.viewerType, canSubmit) : null };
  },
});

export const request = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.object({ finalQuoteId: v.id("finalQuotes"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const client = await requireClientUser(ctx);
    const context = await contextForConversation(ctx, args.conversationId);
    await requireCompanyMarketplaceWriteAllowed(ctx, context.company._id);
    await requireOwnedProject(ctx, client.userId, context.project._id);
    assertEligibleProject(context.project.status);
    if (context.project.status === "company_selected") throw new ConvexError("FINAL_QUOTE_PROJECT_ALREADY_SELECTED");
    await assertSiteVisitAllowsFinalQuote(ctx, context.conversation._id);
    const existing = await parentForRelationship(ctx, context.project._id, context.company._id);
    if (existing) return { finalQuoteId: existing._id, duplicate: true };
    const accepted = await ctx.db.query("finalQuotes").withIndex("by_projectId_and_status", (q) => q.eq("projectId", context.project._id).eq("status", "accepted")).take(1);
    if (accepted.length) throw new ConvexError("FINAL_QUOTE_PROJECT_ALREADY_SELECTED");
    const now = Date.now();
    const finalQuoteId = await ctx.db.insert("finalQuotes", { projectId: context.project._id, clientId: client.userId,
      companyId: context.company._id, initialQuoteId: context.initialQuote._id, conversationId: context.conversation._id,
      status: "draft", requestedAt: now, requestedByUserId: client.userId, requestTrigger: "client_request", createdAt: now, updatedAt: now });
    await appendMarketplaceActivity(ctx, { projectId: context.project._id, eventType: "final_quote_requested", actorUserId: client.userId,
      actorType: "client", companyId: context.company._id, quoteId: context.initialQuote._id, conversationId: context.conversation._id,
      finalQuoteId, newStatus: "draft", createdAt: now });
    return { finalQuoteId, duplicate: false };
  },
});

export const prepareAfterSiteVisit = mutation({
  args: { conversationId: v.id("conversations") }, returns: v.object({ finalQuoteId: v.id("finalQuotes"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const access = await requireVerifiedCompanyMarketplaceUser(ctx);
    const context = await contextForConversation(ctx, args.conversationId);
    if (access.company._id !== context.company._id) throw new ConvexError("CONVERSATION_NOT_FOUND");
    assertEligibleProject(context.project.status);
    await assertSiteVisitAllowsFinalQuote(ctx, context.conversation._id);
    const existing = await parentForRelationship(ctx, context.project._id, context.company._id);
    if (existing) return { finalQuoteId: existing._id, duplicate: true };
    const parent = await createVisitTriggeredParent(ctx, context, access.userId);
    return { finalQuoteId: parent._id, duplicate: false };
  },
});

export const generatePdfUploadUrl = mutation({
  args: { finalQuoteId: v.id("finalQuotes"), fileName: v.string(), contentType: v.string(), size: v.number() },
  returns: v.object({ uploadUrl: v.string(), uploadToken: v.string() }),
  handler: createPdfUploadIntent,
});

export const submitRevision = mutation({
  args: { conversationId: v.id("conversations"), price: v.number(), duration: v.number(), plannedStartDate: v.string(), validUntil: v.string(),
    scope: v.string(), inclusions: v.string(), exclusions: v.string(), paymentTerms: v.string(), companyNote: v.optional(v.string()),
    pdf: v.optional(v.object({ uploadToken: v.string() })) },
  returns: v.object({ finalQuoteId: v.id("finalQuotes"), revisionId: v.id("finalQuoteRevisions"), revisionNumber: v.number() }),
  handler: async (ctx, args) => {
    const access = await requireVerifiedCompanyMarketplaceUser(ctx); const context = await contextForConversation(ctx, args.conversationId);
    if (access.company._id !== context.company._id) throw new ConvexError("CONVERSATION_NOT_FOUND");
    assertEligibleProject(context.project.status);
    if (context.project.status === "company_selected") throw new ConvexError("FINAL_QUOTE_PROJECT_ALREADY_SELECTED");
    let parent = await parentForRelationship(ctx, context.project._id, context.company._id);
    if (!parent) {
      await assertSiteVisitAllowsFinalQuote(ctx, context.conversation._id);
      parent = await createVisitTriggeredParent(ctx, context, access.userId);
    } else if (parent.status === "draft" || parent.status === "changes_requested") {
      // Existing draft still cannot bypass an incomplete active visit workflow.
      await assertSiteVisitAllowsFinalQuote(ctx, context.conversation._id);
    }
    if (parent.clientId !== context.project.clientId || parent.initialQuoteId !== context.initialQuote._id || parent.conversationId !== context.conversation._id) throw new ConvexError("FINAL_QUOTE_INTEGRITY_ERROR");
    if (parent.status !== "draft" && parent.status !== "changes_requested") throw new ConvexError("FINAL_QUOTE_NOT_SUBMITTABLE");
    const now = Date.now(); const latest = await ctx.db.query("finalQuoteRevisions").withIndex("by_finalQuoteId_and_revisionNumber", (q) => q.eq("finalQuoteId", parent!._id)).order("desc").take(1);
    const revisionNumber = (latest[0]?.revisionNumber ?? 0) + 1;
    if (revisionNumber > MAX_REVISIONS) throw new ConvexError("FINAL_QUOTE_REVISION_LIMIT_REACHED");
    let pdfFields: { pdfStorageId?: Id<"_storage">; pdfFileName?: string; pdfUploadFileName?: string; pdfSize?: number } = {};
    if (args.pdf) {
      const file = await claimPdfUpload(ctx, parent._id, args.pdf.uploadToken);
      pdfFields = { pdfStorageId: file.storageId, pdfFileName: file.fileName, pdfUploadFileName: file.uploadFileName, pdfSize: file.size };
      await ctx.db.patch(file.intent._id, { claimedAt: now });
    }
    if (!isCentimePrecisionMadAmount(args.price) || args.price > MAX_PRICE_MAD) throw new ConvexError("INVALID_FINAL_QUOTE_PRICE");
    if (!Number.isInteger(args.duration) || args.duration < 1 || args.duration > MAX_DURATION_DAYS) throw new ConvexError("INVALID_FINAL_QUOTE_DURATION");
    const plannedStartDate = dateValue(args.plannedStartDate, now, true, "INVALID_FINAL_QUOTE_DATE");
    const validUntil = dateValue(args.validUntil, now, false, "INVALID_FINAL_QUOTE_DATE");
    if (validUntil < plannedStartDate) throw new ConvexError("INVALID_FINAL_QUOTE_DATE");
    const revisionId = await ctx.db.insert("finalQuoteRevisions", { finalQuoteId: parent._id, revisionNumber,
      price: args.price, currency: "MAD", duration: args.duration, plannedStartDate, validUntil,
      scope: normalizeText(args.scope, 20, 5000, "INVALID_FINAL_QUOTE_SCOPE"), inclusions: normalizeText(args.inclusions, 2, 4000, "INVALID_FINAL_QUOTE_INCLUSIONS"),
      exclusions: normalizeText(args.exclusions, 2, 4000, "INVALID_FINAL_QUOTE_EXCLUSIONS"), paymentTerms: normalizeText(args.paymentTerms, 5, 3000, "INVALID_FINAL_QUOTE_PAYMENT_TERMS"),
      companyNote: normalizeOptionalText(args.companyNote, 2000, "INVALID_FINAL_QUOTE_NOTE"), ...pdfFields,
      submittedByUserId: access.userId, submittedAt: now, createdAt: now });
    assertFinalQuoteTransition(parent.status, "submitted");
    await ctx.db.patch(parent._id, { status: "submitted", currentRevisionId: revisionId, changesRequestReason: undefined,
      changesRequestedAt: undefined, changesRequestedByUserId: undefined, updatedAt: now });
    const siteRefs = await activitySiteRefs(parent);
    await appendMarketplaceActivity(ctx, { projectId: parent.projectId, eventType: revisionNumber === 1 ? "final_quote_submitted" : "final_quote_revised",
      actorUserId: access.userId, actorType: "company", companyId: parent.companyId, quoteId: parent.initialQuoteId, conversationId: parent.conversationId,
      ...siteRefs, finalQuoteId: parent._id, finalQuoteRevisionId: revisionId, oldStatus: parent.status, newStatus: "submitted",
      metadata: { revisionNumber, price: args.price, currency: "MAD" }, createdAt: now });
    await createFinalQuoteSubmittedNotification(ctx, {
      parent,
      project: context.project,
      company: context.company,
      revisionId,
      actorUserId: access.userId,
      amountMad: Math.round(args.price * 100) / 100,
    });
    return { finalQuoteId: parent._id, revisionId, revisionNumber };
  },
});

export const review = mutation({
  args: { finalQuoteId: v.id("finalQuotes"), revisionId: v.id("finalQuoteRevisions"), action: v.union(v.literal("accept"), v.literal("request_changes"), v.literal("decline")), reason: v.optional(v.string()) },
  returns: v.object({ status: statusValidator, duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const client = await requireClientUser(ctx); const parent = await ctx.db.get(args.finalQuoteId);
    if (!parent || parent.clientId !== client.userId) throw new ConvexError("FINAL_QUOTE_NOT_FOUND");
    const [project, revision, initialQuote, conversation, company] = await Promise.all([
      requireOwnedProject(ctx, client.userId, parent.projectId), ctx.db.get(args.revisionId), ctx.db.get(parent.initialQuoteId),
      ctx.db.get(parent.conversationId), ctx.db.get(parent.companyId),
    ]);
    if (!revision || revision.finalQuoteId !== parent._id || parent.currentRevisionId !== revision._id) throw new ConvexError("FINAL_QUOTE_REVISION_NOT_CURRENT");
    if (parent.status === "accepted" && args.action === "accept" && parent.acceptedRevisionId === revision._id) {
      await reuseDealFromAcceptedFinalQuote(ctx, parent._id);
      if (!company) throw new ConvexError("FINAL_QUOTE_NOT_REVIEWABLE");
      await createFinalQuoteAcceptedNotifications(ctx, {
        parent,
        project,
        company,
        actorUserId: client.userId,
        amountMad: revision.price,
      });
      return { status: "accepted" as const, duplicate: true };
    }
    if (parent.status !== "submitted") throw new ConvexError("FINAL_QUOTE_NOT_REVIEWABLE");
    if (args.action === "accept" && company) assertCompanyMarketplaceWriteAllowed(company);
    if (!initialQuote || !conversation || !company || initialQuote.projectId !== project._id || initialQuote.companyId !== parent.companyId || initialQuote.status !== "discussion_open" ||
      conversation.projectId !== project._id || conversation.quoteId !== initialQuote._id || conversation.companyId !== parent.companyId || conversation.clientId !== client.userId || conversation.status !== "active" ||
      company.verificationStatus !== "verified" || company.onboardingStatus !== "completed") throw new ConvexError("FINAL_QUOTE_NOT_REVIEWABLE");
    const activeCompanyMember = await ctx.db.query("companyMembers")
      .withIndex("by_companyId_and_status", (q) =>
        q.eq("companyId", parent.companyId).eq("status", "active"),
      )
      .first();
    if (!activeCompanyMember) throw new ConvexError("FINAL_QUOTE_NOT_REVIEWABLE");
    if (project.status === "company_selected") throw new ConvexError("FINAL_QUOTE_PROJECT_ALREADY_SELECTED");
    const now = Date.now(); const reason = args.action === "request_changes" ? normalizeText(args.reason ?? "", 3, 1000, "FINAL_QUOTE_CHANGE_REASON_REQUIRED") : normalizeOptionalText(args.reason, 1000, "INVALID_FINAL_QUOTE_REASON");
    if (args.action === "accept" && revision.validUntil < new Date(now).toISOString().slice(0, 10)) throw new ConvexError("FINAL_QUOTE_EXPIRED");
    const next = args.action === "accept" ? "accepted" as const : args.action === "request_changes" ? "changes_requested" as const : "declined" as const;
    assertFinalQuoteTransition(parent.status, next);
    const dealCreationNonce = next === "accepted" ? crypto.randomUUID() : undefined;
    await ctx.db.patch(parent._id, { status: next, updatedAt: now,
      ...(next === "accepted" ? { acceptedAt: now, acceptedByUserId: client.userId, acceptedRevisionId: revision._id, dealCreationNonce } : {}),
      ...(next === "changes_requested" ? { changesRequestedAt: now, changesRequestedByUserId: client.userId, changesRequestReason: reason } : {}),
      ...(next === "declined" ? { declinedAt: now, declinedByUserId: client.userId, declineReason: reason } : {}) });
    const eventType = next === "accepted" ? "final_quote_accepted" as const : next === "changes_requested" ? "final_quote_changes_requested" as const : "final_quote_declined" as const;
    const siteRefs = await activitySiteRefs(parent);
    await appendMarketplaceActivity(ctx, { projectId: parent.projectId, eventType, actorUserId: client.userId, actorType: "client", companyId: parent.companyId,
      quoteId: parent.initialQuoteId, conversationId: parent.conversationId, ...siteRefs, finalQuoteId: parent._id, finalQuoteRevisionId: revision._id,
      oldStatus: parent.status, newStatus: next, reason, metadata: { revisionNumber: revision.revisionNumber, price: revision.price, currency: "MAD" }, createdAt: now });
    if (next === "accepted") {
      if (!dealCreationNonce) throw new ConvexError("DEAL_CREATION_AUTHORIZATION_FAILED");
      assertProjectTransition(project.status, "company_selected");
      await ctx.db.patch(project._id, { status: "company_selected", selectedCompanyId: parent.companyId, selectedFinalQuoteId: parent._id, selectedAt: now, updatedAt: now });
      await ctx.db.insert("projectStatusHistory", { projectId: project._id, oldStatus: project.status, newStatus: "company_selected", changedBy: client.userId, changedAt: now });
      await appendMarketplaceActivity(ctx, { projectId: parent.projectId, eventType: "company_selected", actorUserId: client.userId, actorType: "client", companyId: parent.companyId,
        quoteId: parent.initialQuoteId, conversationId: parent.conversationId, ...siteRefs, finalQuoteId: parent._id, finalQuoteRevisionId: revision._id,
        oldStatus: project.status, newStatus: "company_selected", metadata: { revisionNumber: revision.revisionNumber, price: revision.price, currency: "MAD" }, createdAt: now });
      await createDealFromFreshFinalQuoteAcceptance(ctx, parent._id, dealCreationNonce);
      await createFinalQuoteAcceptedNotifications(ctx, {
        parent,
        project,
        company,
        actorUserId: client.userId,
        amountMad: revision.price,
      });
    }
    return { status: next, duplicate: false };
  },
});

export const withdraw = mutation({
  args: { finalQuoteId: v.id("finalQuotes"), reason: v.optional(v.string()) }, returns: v.object({ status: v.literal("withdrawn"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const access = await requireCompanyUser(ctx); const parent = await ctx.db.get(args.finalQuoteId);
    if (!parent || parent.companyId !== access.company._id) throw new ConvexError("FINAL_QUOTE_NOT_FOUND");
    if (parent.status === "withdrawn") return { status: "withdrawn" as const, duplicate: true };
    assertFinalQuoteTransition(parent.status, "withdrawn"); const now = Date.now(); const reason = normalizeOptionalText(args.reason, 1000, "INVALID_FINAL_QUOTE_REASON");
    await ctx.db.patch(parent._id, { status: "withdrawn", withdrawnAt: now, withdrawnByUserId: access.userId, withdrawalReason: reason, updatedAt: now });
    await appendMarketplaceActivity(ctx, { projectId: parent.projectId, eventType: "final_quote_withdrawn", actorUserId: access.userId, actorType: "company", companyId: parent.companyId,
      quoteId: parent.initialQuoteId, conversationId: parent.conversationId, ...(await activitySiteRefs(parent)), finalQuoteId: parent._id, finalQuoteRevisionId: parent.currentRevisionId,
      oldStatus: parent.status, newStatus: "withdrawn", reason, createdAt: now });
    return { status: "withdrawn" as const, duplicate: false };
  },
});

export const getPdfDownloadUrl = query({
  args: { revisionId: v.id("finalQuoteRevisions") }, returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const revision = await ctx.db.get(args.revisionId); if (!revision?.pdfStorageId) throw new ConvexError("FINAL_QUOTE_PDF_NOT_FOUND");
    const parent = await ctx.db.get(revision.finalQuoteId); if (!parent) throw new ConvexError("FINAL_QUOTE_PDF_NOT_FOUND");
    await requireFinalQuoteParticipant(ctx, parent);
    return `/api/final-quotes/${revision._id}/pdf`;
  },
});
