import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { query } from "../_generated/server";
import {
  marketplaceActivityActorTypeValidator,
  marketplaceActivityEventTypeValidator,
  marketplaceActivityMetadataValidator,
} from "../marketplaceActivity/constants";
import {
  projectCategoryValidator,
  projectCityValidator,
  projectStatusValidator,
} from "../projects/constants";
import { requireAdminUser } from "./access";

const assessmentStatusValidator = v.union(
  v.literal("invited"),
  v.literal("accepted"),
  v.literal("scheduled"),
  v.literal("completed"),
  v.literal("declined"),
  v.literal("cancelled"),
);
const visitStatusValidator = v.union(
  v.literal("proposed"),
  v.literal("confirmed"),
  v.literal("completed"),
  v.literal("declined"),
  v.literal("cancelled"),
);
const workflowStatusValidator = v.union(assessmentStatusValidator, visitStatusValidator);
const tabStatusValidator = v.union(
  v.literal("all"),
  v.literal("invited"),
  v.literal("accepted"),
  v.literal("proposed"),
  v.literal("confirmed"),
  v.literal("completed"),
  v.literal("cancelled_declined"),
);
const initialQuoteStatusValidator = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("viewed"),
  v.literal("shortlisted"),
  v.literal("discussion_open"),
  v.literal("declined"),
  v.literal("withdrawn"),
);
const verificationStatusValidator = v.union(
  v.literal("draft"),
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
);
const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const actorTypeValidator = v.union(v.literal("client"), v.literal("company"));
const riskSignalValidator = v.union(
  v.literal("scheduling_pending"),
  v.literal("visit_follow_up_needed"),
);

const finalQuoteStatusValidator = v.union(
  v.literal("not_available"),
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("changes_requested"),
  v.literal("accepted"),
  v.literal("declined"),
  v.literal("withdrawn"),
);

const finalQuoteDetailValidator = v.union(
  v.null(),
  v.object({
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("changes_requested"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("withdrawn"),
    ),
    revisionNumber: v.union(v.number(), v.null()),
    price: v.union(v.number(), v.null()),
    currency: v.literal("MAD"),
    submittedAt: nullableNumber,
    acceptedAt: nullableNumber,
    declinedAt: nullableNumber,
    changesRequestReason: nullableString,
    companySelected: v.boolean(),
  }),
);

const listRowValidator = v.object({
  assessmentId: v.id("siteAssessments"),
  projectId: v.id("projects"),
  projectTitle: v.string(),
  clientName: v.string(),
  companyName: v.string(),
  assessmentStatus: assessmentStatusValidator,
  visitDate: nullableString,
  visitTime: nullableString,
  city: v.union(projectCityValidator, v.null()),
  proposedBy: v.union(actorTypeValidator, v.null()),
  status: workflowStatusValidator,
  finalQuoteStatus: finalQuoteStatusValidator,
  riskSignal: v.union(riskSignalValidator, v.null()),
  sortAt: v.number(),
});

const actorValidator = v.object({
  displayName: v.string(),
  type: actorTypeValidator,
});

const activityItemValidator = v.object({
  activityId: v.id("marketplaceActivity"),
  eventType: marketplaceActivityEventTypeValidator,
  actor: v.object({
    displayName: v.string(),
    type: marketplaceActivityActorTypeValidator,
  }),
  oldStatus: nullableString,
  newStatus: nullableString,
  reason: nullableString,
  metadata: v.union(marketplaceActivityMetadataValidator, v.null()),
  createdAt: v.number(),
});

const detailValidator = v.object({
  assessmentId: v.id("siteAssessments"),
  project: v.object({
    title: v.string(),
    city: v.union(projectCityValidator, v.null()),
    category: v.union(projectCategoryValidator, v.null()),
    customCategoryText: nullableString,
    status: projectStatusValidator,
  }),
  client: v.object({
    displayName: v.string(),
    accountReference: v.string(),
  }),
  company: v.object({
    name: v.string(),
    verificationStatus: verificationStatusValidator,
    slug: nullableString,
  }),
  initialQuote: v.object({
    estimatedPrice: v.number(),
    currency: v.literal("MAD"),
    estimatedDuration: v.number(),
    status: initialQuoteStatusValidator,
  }),
  discussion: v.object({
    openedAt: v.number(),
    reference: v.string(),
    status: v.union(v.literal("active"), v.literal("closed")),
  }),
  assessment: v.object({
    status: assessmentStatusValidator,
    invitedBy: actorValidator,
    invitedAt: v.number(),
    acceptedAt: nullableNumber,
    declinedAt: nullableNumber,
    cancelledAt: nullableNumber,
    marketplaceAcknowledgedAt: nullableNumber,
  }),
  visit: v.union(
    v.null(),
    v.object({
      proposedBy: actorValidator,
      proposedAt: v.number(),
      proposedDate: v.string(),
      proposedTime: v.string(),
      timezone: v.literal("Africa/Casablanca"),
      confirmedBy: v.union(actorValidator, v.null()),
      confirmedAt: nullableNumber,
      siteAddress: v.string(),
      status: visitStatusValidator,
      cancellationReason: nullableString,
      declinedBy: v.union(actorValidator, v.null()),
      declinedAt: nullableNumber,
      cancelledBy: v.union(actorValidator, v.null()),
      cancelledAt: nullableNumber,
      completedBy: v.union(actorValidator, v.null()),
      completedAt: nullableNumber,
    }),
  ),
  finalQuoteStatus: finalQuoteStatusValidator,
  finalQuote: finalQuoteDetailValidator,
  riskSignal: v.union(riskSignalValidator, v.null()),
  activity: v.array(activityItemValidator),
});

function normalizeSearch(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase() ?? "";
}

function displayName(user: Pick<Doc<"users">, "firstName" | "lastName"> | null) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—";
}

function reference(prefix: string, id: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${prefix}-${(hash >>> 0).toString(36).padStart(7, "0").toLocaleUpperCase()}`;
}

function actorType(userId: Id<"users">, clientId: Id<"users">): "client" | "company" {
  return userId === clientId ? "client" : "company";
}

async function latestVisit(ctx: QueryCtx, assessmentId: Id<"siteAssessments">) {
  return (
    await ctx.db
      .query("siteVisits")
      .withIndex("by_assessmentId_and_active", (q) => q.eq("assessmentId", assessmentId))
      .order("desc")
      .take(1)
  )[0] ?? null;
}

function visitEpoch(visit: Pick<Doc<"siteVisits">, "proposedDate" | "proposedTime">) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(visit.proposedDate);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(visit.proposedTime);
  if (!dateMatch || !timeMatch) return null;
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hour, minute] = timeMatch.slice(1).map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    instant = target - (represented - instant);
  }
  return instant;
}

function workflowStatus(
  assessment: Doc<"siteAssessments">,
  visit: Doc<"siteVisits"> | null,
) {
  return visit?.status ?? assessment.status;
}

function riskSignal(
  assessment: Doc<"siteAssessments">,
  visit: Doc<"siteVisits"> | null,
  now: number,
): "scheduling_pending" | "visit_follow_up_needed" | null {
  if (assessment.status === "accepted" && !visit) return "scheduling_pending";
  const scheduledAt = visit ? visitEpoch(visit) : null;
  if (visit?.status === "confirmed" && scheduledAt !== null && scheduledAt < now) {
    return "visit_follow_up_needed";
  }
  return null;
}

async function loadFinalQuoteSummary(
  ctx: QueryCtx,
  assessment: Doc<"siteAssessments">,
  project: Doc<"projects">,
) {
  const parents = await ctx.db
    .query("finalQuotes")
    .withIndex("by_projectId_and_companyId", (q) =>
      q.eq("projectId", assessment.projectId).eq("companyId", assessment.companyId),
    )
    .take(2);
  const parent = parents[0] ?? null;
  if (!parent) {
    return {
      finalQuoteStatus: "not_available" as const,
      finalQuote: null as null,
    };
  }
  const revision = parent.currentRevisionId
    ? await ctx.db.get(parent.currentRevisionId)
    : null;
  return {
    finalQuoteStatus: parent.status,
    finalQuote: {
      status: parent.status,
      revisionNumber: revision?.revisionNumber ?? null,
      price: revision?.price ?? null,
      currency: "MAD" as const,
      submittedAt: revision?.submittedAt ?? null,
      acceptedAt: parent.acceptedAt ?? null,
      declinedAt: parent.declinedAt ?? null,
      changesRequestReason: parent.changesRequestReason ?? null,
      companySelected:
        project.status === "company_selected" &&
        project.selectedFinalQuoteId === parent._id,
    },
  };
}

function matchesTab(status: ReturnType<typeof workflowStatus>, tab: string) {
  if (tab === "all") return true;
  if (tab === "cancelled_declined") return status === "cancelled" || status === "declined";
  return status === tab;
}

function validDateKey(value: string | undefined) {
  if (value === undefined) return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateKey(epoch: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Casablanca",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(epoch).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function assertDateRange(from: string | undefined, to: string | undefined) {
  if (!validDateKey(from) || !validDateKey(to) || (from !== undefined && to !== undefined && from > to)) {
    throw new ConvexError("INVALID_ADMIN_SITE_VISIT_FILTER");
  }
}

/** Read-only admin projection. Convex subscriptions keep this operational list live. */
export const listSiteVisits = query({
  args: {
    status: tabStatusValidator,
    projectSearch: v.optional(v.string()),
    companySearch: v.optional(v.string()),
    city: v.optional(projectCityValidator),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    now: v.number(),
  },
  returns: v.array(listRowValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    assertDateRange(args.dateFrom, args.dateTo);
    const projectNeedle = normalizeSearch(args.projectSearch);
    const companyNeedle = normalizeSearch(args.companySearch);
    const assessments = await ctx.db.query("siteAssessments").order("desc").take(100);
    const rows = [];

    for (const assessment of assessments) {
      const visit = await latestVisit(ctx, assessment._id);
      const status = workflowStatus(assessment, visit);
      if (!matchesTab(status, args.status)) continue;

      const [project, client, company] = await Promise.all([
        ctx.db.get(assessment.projectId),
        ctx.db.get(assessment.clientId),
        ctx.db.get(assessment.companyId),
      ]);
      if (
        !project ||
        !client ||
        !company ||
        project.clientId !== assessment.clientId ||
        visit &&
          (visit.projectId !== assessment.projectId ||
            visit.clientId !== assessment.clientId ||
            visit.companyId !== assessment.companyId)
      ) {
        // A stale historical row must not take down the entire operational
        // list. Exact detail reads remain fail-closed below.
        continue;
      }

      const projectTitle = project.title?.trim() || "—";
      const companyName = company.name?.trim() || "—";
      if (projectNeedle && !projectTitle.toLocaleLowerCase().includes(projectNeedle)) continue;
      if (companyNeedle && !companyName.toLocaleLowerCase().includes(companyNeedle)) continue;
      if (args.city && project.city !== args.city) continue;

      const sortAt = visit ? visitEpoch(visit) ?? visit.proposedAt : assessment.invitedAt;
      const filterDate = visit?.proposedDate ?? dateKey(assessment.invitedAt);
      if (args.dateFrom !== undefined && filterDate < args.dateFrom) continue;
      if (args.dateTo !== undefined && filterDate > args.dateTo) continue;

      const quoteSummary = await loadFinalQuoteSummary(ctx, assessment, project);

      rows.push({
        assessmentId: assessment._id,
        projectId: assessment.projectId,
        projectTitle,
        clientName: displayName(client),
        companyName,
        assessmentStatus: assessment.status,
        visitDate: visit?.proposedDate ?? null,
        visitTime: visit?.proposedTime ?? null,
        city: project.city ?? null,
        proposedBy: visit ? actorType(visit.proposedByUserId, assessment.clientId) : null,
        status,
        finalQuoteStatus: quoteSummary.finalQuoteStatus,
        riskSignal: riskSignal(assessment, visit, args.now),
        sortAt,
      });
    }

    return rows.sort((left, right) => right.sortAt - left.sortAt);
  },
});

export const getSiteVisitDetail = query({
  args: { assessmentId: v.id("siteAssessments"), now: v.number() },
  returns: v.union(v.null(), detailValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment) return null;

    const visit = await latestVisit(ctx, assessment._id);
    const [project, client, company, quote, conversation, invitedBy] = await Promise.all([
      ctx.db.get(assessment.projectId),
      ctx.db.get(assessment.clientId),
      ctx.db.get(assessment.companyId),
      ctx.db.get(assessment.initialQuoteId),
      ctx.db.get(assessment.conversationId),
      ctx.db.get(assessment.invitedByUserId),
    ]);
    if (
      !project ||
      !client ||
      !company ||
      !quote ||
      !conversation ||
      !invitedBy ||
      project.clientId !== assessment.clientId ||
      quote.projectId !== assessment.projectId ||
      quote.companyId !== assessment.companyId ||
      conversation.projectId !== assessment.projectId ||
      conversation.clientId !== assessment.clientId ||
      conversation.companyId !== assessment.companyId ||
      conversation.quoteId !== assessment.initialQuoteId ||
      visit &&
        (visit.projectId !== assessment.projectId ||
          visit.clientId !== assessment.clientId ||
          visit.companyId !== assessment.companyId ||
          visit.initialQuoteId !== assessment.initialQuoteId ||
          visit.conversationId !== assessment.conversationId)
    ) {
      throw new ConvexError("SITE_VISIT_INTEGRITY_ERROR");
    }

    const [proposedBy, confirmedBy, declinedBy, cancelledBy, completedBy] = visit
      ? await Promise.all([
          ctx.db.get(visit.proposedByUserId),
          visit.confirmedByUserId ? ctx.db.get(visit.confirmedByUserId) : null,
          visit.declinedByUserId ? ctx.db.get(visit.declinedByUserId) : null,
          visit.cancelledByUserId ? ctx.db.get(visit.cancelledByUserId) : null,
          visit.completedByUserId ? ctx.db.get(visit.completedByUserId) : null,
        ])
      : [null, null, null, null, null];
    if (visit && !proposedBy) throw new ConvexError("SITE_VISIT_INTEGRITY_ERROR");

    const activityRows = (await ctx.db
      .query("marketplaceActivity")
      .withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", assessment.projectId))
      .order("desc")
      .take(250))
      .filter(
        (row) =>
          row.siteAssessmentId === assessment._id ||
          (row.conversationId === assessment.conversationId &&
            (row.eventType.startsWith("site_") ||
              row.eventType.startsWith("final_quote_") ||
              row.eventType === "company_selected")) ||
          (row.companyId === assessment.companyId &&
            (row.eventType.startsWith("final_quote_") ||
              row.eventType === "company_selected")),
      );
    const activityActorIds = [...new Set(activityRows.map((row) => row.actorUserId))];
    const activityActors = await Promise.all(activityActorIds.map((userId) => ctx.db.get(userId)));
    const activityActorById = new Map(activityActorIds.map((id, index) => [id, activityActors[index]]));
    const quoteSummary = await loadFinalQuoteSummary(ctx, assessment, project);

    return {
      assessmentId: assessment._id,
      project: {
        title: project.title?.trim() || "—",
        city: project.city ?? null,
        category: project.primaryCategory ?? null,
        customCategoryText: project.customCategoryText ?? null,
        status: project.status,
      },
      client: {
        displayName: displayName(client),
        accountReference: reference("BPM-C", client._id),
      },
      company: {
        name: company.name?.trim() || "—",
        verificationStatus: company.verificationStatus,
        slug: company.slug ?? null,
      },
      initialQuote: {
        estimatedPrice: quote.estimatedPrice,
        currency: quote.currency,
        estimatedDuration: quote.estimatedDuration,
        status: quote.status,
      },
      discussion: {
        openedAt: conversation.createdAt,
        reference: reference("BPM-D", conversation._id),
        status: conversation.status,
      },
      assessment: {
        status: assessment.status,
        invitedBy: {
          displayName: displayName(invitedBy),
          type: actorType(assessment.invitedByUserId, assessment.clientId),
        },
        invitedAt: assessment.invitedAt,
        acceptedAt: assessment.acceptedAt ?? null,
        declinedAt: assessment.declinedAt ?? null,
        cancelledAt: assessment.cancelledAt ?? null,
        marketplaceAcknowledgedAt: assessment.acceptedMarketplaceTermsAt ?? null,
      },
      visit: visit
        ? {
            proposedBy: {
              displayName: displayName(proposedBy),
              type: actorType(visit.proposedByUserId, assessment.clientId),
            },
            proposedAt: visit.proposedAt,
            proposedDate: visit.proposedDate,
            proposedTime: visit.proposedTime,
            timezone: visit.timezone,
            confirmedBy: visit.confirmedByUserId && confirmedBy
              ? {
                  displayName: displayName(confirmedBy),
                  type: actorType(visit.confirmedByUserId, assessment.clientId),
                }
              : null,
            confirmedAt: visit.confirmedAt ?? null,
            siteAddress: visit.siteAddress,
            status: visit.status,
            cancellationReason: visit.cancellationReason ?? null,
            declinedBy: visit.declinedByUserId && declinedBy
              ? {
                  displayName: displayName(declinedBy),
                  type: actorType(visit.declinedByUserId, assessment.clientId),
                }
              : null,
            declinedAt: visit.declinedAt ?? null,
            cancelledBy: visit.cancelledByUserId && cancelledBy
              ? {
                  displayName: displayName(cancelledBy),
                  type: actorType(visit.cancelledByUserId, assessment.clientId),
                }
              : null,
            cancelledAt: visit.cancelledAt ?? null,
            completedBy: visit.completedByUserId && completedBy
              ? {
                  displayName: displayName(completedBy),
                  type: actorType(visit.completedByUserId, assessment.clientId),
                }
              : null,
            completedAt: visit.completedAt ?? null,
          }
        : null,
      finalQuoteStatus: quoteSummary.finalQuoteStatus,
      finalQuote: quoteSummary.finalQuote,
      riskSignal: riskSignal(assessment, visit, args.now),
      activity: activityRows.reverse().map((row) => ({
        activityId: row._id,
        eventType: row.eventType,
        actor: {
          displayName: displayName(activityActorById.get(row.actorUserId) ?? null),
          type: row.actorType,
        },
        oldStatus: row.oldStatus ?? null,
        newStatus: row.newStatus ?? null,
        reason: row.reason ?? null,
        metadata: row.metadata ?? null,
        createdAt: row.createdAt,
      })),
    };
  },
});
