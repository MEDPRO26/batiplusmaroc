import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { projectStatusValidator } from "../projects/constants";
import { requireAdminUser } from "./access";

const timelineEventTypeValidator = v.union(
  v.literal("verification_submitted"),
  v.literal("verification_approved"),
  v.literal("verification_rejected"),
  v.literal("company_invited"),
  v.literal("company_invitation_accepted"),
  v.literal("company_invitation_declined"),
  v.literal("initial_quote_submitted"),
  v.literal("discussion_opened"),
  v.literal("site_assessment_invited"),
  v.literal("site_assessment_accepted"),
  v.literal("site_assessment_declined"),
  v.literal("site_assessment_cancelled"),
  v.literal("site_visit_scheduled"),
  v.literal("site_visit_proposed"),
  v.literal("site_visit_rescheduled"),
  v.literal("site_visit_confirmed"),
  v.literal("site_visit_declined"),
  v.literal("site_visit_completed"),
  v.literal("site_visit_cancelled"),
  v.literal("final_quote_requested"),
  v.literal("final_quote_submitted"),
  v.literal("final_quote_changes_requested"),
  v.literal("final_quote_revised"),
  v.literal("final_quote_declined"),
  v.literal("final_quote_withdrawn"),
  v.literal("final_quote_accepted"),
  v.literal("company_selected"),
  v.literal("deal_created"),
  v.literal("commission_due"),
  v.literal("commission_paid"),
  v.literal("deal_completed"),
  v.literal("review_received"),
  v.literal("review_hidden"),
  v.literal("review_restored"),
  v.literal("operational_status_changed"),
);

type TimelineEventType = typeof timelineEventTypeValidator.type;
type TimelineCategory = "verification" | "marketplace" | "deals" | "reviews";

const entityValidator = v.union(
  v.object({ type: v.literal("company"), id: v.id("companies") }),
  v.object({ type: v.literal("company_verification"), id: v.id("companies") }),
  v.object({ type: v.literal("project"), id: v.id("projects") }),
  v.object({ type: v.literal("invitation"), id: v.id("invitations") }),
  v.object({ type: v.literal("initial_quote"), id: v.id("projectQuotes") }),
  v.object({ type: v.literal("conversation"), id: v.id("conversations") }),
  v.object({ type: v.literal("site_assessment"), id: v.id("siteAssessments") }),
  v.object({ type: v.literal("site_visit"), id: v.id("siteVisits") }),
  v.object({ type: v.literal("final_quote"), id: v.id("finalQuotes") }),
  v.object({ type: v.literal("deal"), id: v.id("deals") }),
  v.object({ type: v.literal("review"), id: v.id("reviews") }),
);

const timelineItemValidator = v.object({
  id: v.string(),
  source: v.union(v.literal("marketplace_activity"), v.literal("verification_history"), v.literal("operational_status_history")),
  eventType: timelineEventTypeValidator,
  category: v.union(
    v.literal("verification"),
    v.literal("marketplace"),
    v.literal("deals"),
    v.literal("reviews"),
  ),
  companyId: v.id("companies"),
  project: v.union(
    v.null(),
    v.object({
      projectId: v.id("projects"),
      title: v.union(v.string(), v.null()),
      status: projectStatusValidator,
    }),
  ),
  entity: entityValidator,
  actor: v.object({
    type: v.union(
      v.literal("client"),
      v.literal("company"),
      v.literal("admin"),
      v.literal("system"),
    ),
    displayName: v.union(v.string(), v.null()),
  }),
  occurredAt: v.number(),
  oldStatus: v.union(v.string(), v.null()),
  newStatus: v.union(v.string(), v.null()),
  context: v.object({
    amountMad: v.union(v.number(), v.null()),
    commissionAmountMad: v.union(v.number(), v.null()),
    commissionRateBps: v.union(v.number(), v.null()),
    currency: v.union(v.string(), v.null()),
    rating: v.union(v.number(), v.null()),
    revisionNumber: v.union(v.number(), v.null()),
    proposedDate: v.union(v.string(), v.null()),
    proposedTime: v.union(v.string(), v.null()),
    timezone: v.union(v.string(), v.null()),
    scheduledEpoch: v.union(v.number(), v.null()),
  }),
});

type TimelineItem = typeof timelineItemValidator.type;
type SourceCursor = {
  beforeAt: number | null;
  beforeCreationTime: number | null;
  beforeId: string | null;
  done: boolean;
};
type TimelineCursor = {
  version: 2;
  marketplace: SourceCursor;
  verification: SourceCursor;
  operational: SourceCursor;
};

const INITIAL_SOURCE_CURSOR: SourceCursor = {
  beforeAt: null,
  beforeCreationTime: null,
  beforeId: null,
  done: false,
};
const MAX_PAGE_SIZE = 30;
const SOURCE_BATCH_MULTIPLIER = 3;

function initialCursor(): TimelineCursor {
  return {
    version: 2,
    marketplace: { ...INITIAL_SOURCE_CURSOR },
    verification: { ...INITIAL_SOURCE_CURSOR },
    operational: { ...INITIAL_SOURCE_CURSOR },
  };
}

function isSourceCursor(value: unknown): value is SourceCursor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SourceCursor>;
  return (
    (candidate.beforeAt === null || typeof candidate.beforeAt === "number") &&
    (candidate.beforeCreationTime === null || typeof candidate.beforeCreationTime === "number") &&
    (candidate.beforeId === null || typeof candidate.beforeId === "string") &&
    typeof candidate.done === "boolean"
  );
}

function decodeCursor(cursor: string | null): TimelineCursor {
  if (cursor === null) return initialCursor();
  try {
    const parsed = JSON.parse(cursor) as Partial<TimelineCursor>;
    if (
      parsed.version !== 2 ||
      !isSourceCursor(parsed.marketplace) ||
      !isSourceCursor(parsed.verification) ||
      !isSourceCursor(parsed.operational)
    ) {
      throw new Error("invalid cursor");
    }
    return parsed as TimelineCursor;
  } catch {
    throw new ConvexError("INVALID_COMPANY_ACTIVITY_CURSOR");
  }
}

function encodeCursor(cursor: TimelineCursor) {
  return JSON.stringify(cursor);
}

function normalizeMarketplaceEventType(
  eventType: Doc<"marketplaceActivity">["eventType"],
): TimelineEventType | null {
  if (
    eventType === "project_created" ||
    eventType === "project_submitted" ||
    eventType === "project_approved" ||
    eventType === "project_needs_changes" ||
    eventType === "quote_viewed" ||
    eventType === "quote_shortlisted" ||
    eventType === "quote_declined"
  ) {
    return null;
  }
  return eventType === "review_created" ? "review_received" : eventType;
}

function normalizeVerificationEventType(
  row: Doc<"companyVerificationHistory">,
): TimelineEventType | null {
  if (row.newStatus === "pending") return "verification_submitted";
  if (row.newStatus === "verified") return "verification_approved";
  if (row.newStatus === "rejected") return "verification_rejected";
  return null;
}

function categoryFor(eventType: TimelineEventType): TimelineCategory {
  if (eventType.startsWith("verification_")) return "verification";
  if (eventType.startsWith("review_")) return "reviews";
  if (
    eventType === "deal_created" ||
    eventType === "deal_completed" ||
    eventType === "commission_due" ||
    eventType === "commission_paid"
  ) {
    return "deals";
  }
  return "marketplace";
}

function entityFor(row: Doc<"marketplaceActivity">): TimelineItem["entity"] {
  if (row.reviewId) return { type: "review", id: row.reviewId };
  if (row.dealId) return { type: "deal", id: row.dealId };
  if (row.finalQuoteId) return { type: "final_quote", id: row.finalQuoteId };
  if (row.siteVisitId) return { type: "site_visit", id: row.siteVisitId };
  if (row.siteAssessmentId) return { type: "site_assessment", id: row.siteAssessmentId };
  if (row.conversationId) return { type: "conversation", id: row.conversationId };
  if (row.quoteId) return { type: "initial_quote", id: row.quoteId };
  if (row.invitationId) return { type: "invitation", id: row.invitationId };
  return { type: "project", id: row.projectId };
}

function safeNumber(value: string | number | boolean | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeString(value: string | number | boolean | undefined) {
  return typeof value === "string" ? value : null;
}

function safeContext(row: Doc<"marketplaceActivity">): TimelineItem["context"] {
  const metadata = row.metadata;
  return {
    amountMad: safeNumber(metadata?.agreedAmountMad ?? metadata?.price),
    commissionAmountMad: safeNumber(metadata?.commissionAmountMad),
    commissionRateBps: safeNumber(metadata?.commissionRateBps),
    currency: safeString(metadata?.currency),
    rating: safeNumber(metadata?.rating),
    revisionNumber: safeNumber(metadata?.revisionNumber),
    proposedDate: safeString(metadata?.proposedDate),
    proposedTime: safeString(metadata?.proposedTime),
    timezone: safeString(metadata?.timezone),
    scheduledEpoch: safeNumber(metadata?.scheduledEpoch),
  };
}

function displayName(user: Doc<"users"> | null) {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

function verificationActorType(user: Doc<"users"> | null): TimelineItem["actor"]["type"] {
  if (user?.accountType === "admin") return "admin";
  if (user?.accountType === "company") return "company";
  if (user?.accountType === "client") return "client";
  return "system";
}

type MarketplaceCandidate = {
  source: "marketplace_activity";
  row: Doc<"marketplaceActivity">;
  eventType: TimelineEventType;
  rawIndex: number;
};

type VerificationCandidate = {
  source: "verification_history";
  row: Doc<"companyVerificationHistory">;
  eventType: TimelineEventType;
  rawIndex: number;
};

type OperationalCandidate = {
  source: "operational_status_history";
  row: Doc<"companyOperationalStatusHistory">;
  eventType: "operational_status_changed";
  rawIndex: number;
};

type Candidate = MarketplaceCandidate | VerificationCandidate | OperationalCandidate;

function candidateTime(candidate: Candidate) {
  return candidate.source === "marketplace_activity"
    ? candidate.row.createdAt
    : candidate.source === "verification_history"
      ? candidate.row.changedAt
      : candidate.row.createdAt;
}

function candidateCreationTime(candidate: Candidate) {
  return candidate.row._creationTime;
}

function compareCandidates(left: Candidate, right: Candidate) {
  const sourceRank = {
    marketplace_activity: 0,
    verification_history: 1,
    operational_status_history: 2,
  } as const;
  return (
    candidateTime(right) - candidateTime(left) ||
    candidateCreationTime(right) - candidateCreationTime(left) ||
    sourceRank[left.source] - sourceRank[right.source] ||
    left.row._id.localeCompare(right.row._id)
  );
}

async function loadMarketplaceBatch(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  cursor: SourceCursor,
  batchSize: number,
) {
  if (cursor.done) return [];
  if (cursor.beforeAt === null) {
    return await ctx.db
      .query("marketplaceActivity")
      .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(batchSize);
  }

  const sameTimestamp = await ctx.db
    .query("marketplaceActivity")
    .withIndex("by_companyId_and_createdAt", (q) =>
      q
        .eq("companyId", companyId)
        .eq("createdAt", cursor.beforeAt!)
        .lt("_creationTime", cursor.beforeCreationTime!),
    )
    .order("desc")
    .take(batchSize);
  if (sameTimestamp.length >= batchSize) {
    return sameTimestamp;
  }
  const older = await ctx.db
    .query("marketplaceActivity")
    .withIndex("by_companyId_and_createdAt", (q) =>
      q.eq("companyId", companyId).lt("createdAt", cursor.beforeAt!),
    )
    .order("desc")
    .take(batchSize - sameTimestamp.length);
  return [...sameTimestamp, ...older];
}

async function loadVerificationBatch(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  cursor: SourceCursor,
  batchSize: number,
) {
  if (cursor.done) return [];
  if (cursor.beforeAt === null) {
    return await ctx.db
      .query("companyVerificationHistory")
      .withIndex("by_companyId_and_changedAt", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(batchSize);
  }

  const sameTimestamp = await ctx.db
    .query("companyVerificationHistory")
    .withIndex("by_companyId_and_changedAt", (q) =>
      q
        .eq("companyId", companyId)
        .eq("changedAt", cursor.beforeAt!)
        .lt("_creationTime", cursor.beforeCreationTime!),
    )
    .order("desc")
    .take(batchSize);
  if (sameTimestamp.length >= batchSize) {
    return sameTimestamp;
  }
  const older = await ctx.db
    .query("companyVerificationHistory")
    .withIndex("by_companyId_and_changedAt", (q) =>
      q.eq("companyId", companyId).lt("changedAt", cursor.beforeAt!),
    )
    .order("desc")
    .take(batchSize - sameTimestamp.length);
  return [...sameTimestamp, ...older];
}

async function loadOperationalBatch(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  cursor: SourceCursor,
  batchSize: number,
) {
  if (cursor.done) return [];
  if (cursor.beforeAt === null) {
    return await ctx.db.query("companyOperationalStatusHistory")
      .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", companyId))
      .order("desc").take(batchSize);
  }
  const sameTimestamp = await ctx.db.query("companyOperationalStatusHistory")
    .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", companyId).eq("createdAt", cursor.beforeAt!).lt("_creationTime", cursor.beforeCreationTime!))
    .order("desc").take(batchSize);
  if (sameTimestamp.length >= batchSize) return sameTimestamp;
  const older = await ctx.db.query("companyOperationalStatusHistory")
    .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", companyId).lt("createdAt", cursor.beforeAt!))
    .order("desc").take(batchSize - sameTimestamp.length);
  return [...sameTimestamp, ...older];
}

function nextSourceCursor<T extends { _id: string; _creationTime: number }>(
  current: SourceCursor,
  rows: T[],
  selectedRawIndices: number[],
  consumeWholeBatch: boolean,
  batchSize: number,
  occurredAt: (row: T) => number,
): SourceCursor {
  if (current.done) return current;
  if (rows.length === 0 && consumeWholeBatch) {
    return { ...current, done: true };
  }
  const consumedThrough = consumeWholeBatch
    ? rows.length
    : selectedRawIndices.length > 0
      ? Math.max(...selectedRawIndices) + 1
      : 0;
  if (consumedThrough === 0) return current;
  const lastConsumed = rows[consumedThrough - 1];
  return {
    beforeAt: occurredAt(lastConsumed),
    beforeCreationTime: lastConsumed._creationTime,
    beforeId: lastConsumed._id,
    done: consumedThrough === rows.length && rows.length < batchSize,
  };
}

async function loadActorMap(ctx: QueryCtx, candidates: Candidate[]) {
  const actorIds = [...new Set(candidates.map((candidate) =>
    candidate.source === "marketplace_activity"
      ? candidate.row.actorUserId
      : candidate.source === "verification_history"
        ? candidate.row.changedBy
        : candidate.row.changedByAdminUserId,
  ))];
  const actors = await Promise.all(actorIds.map((id) => ctx.db.get(id)));
  return new Map(actorIds.map((id, index) => [id, actors[index] ?? null]));
}

async function loadProjectMap(ctx: QueryCtx, candidates: Candidate[]) {
  const projectIds = [...new Set(candidates.flatMap((candidate) =>
    candidate.source === "marketplace_activity" ? [candidate.row.projectId] : [],
  ))];
  const projects = await Promise.all(projectIds.map((id) => ctx.db.get(id)));
  return new Map(projectIds.map((id, index) => [id, projects[index] ?? null]));
}

/**
 * Admin-only, bounded merge of the canonical Company activity projection and
 * verification history. The opaque cursor keeps independent source positions
 * so neither source is duplicated or skipped while pages are merged.
 */
export const listCompanyActivity = query({
  args: {
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(timelineItemValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new ConvexError("COMPANY_NOT_FOUND");

    if (!Number.isFinite(args.paginationOpts.numItems)) {
      throw new ConvexError("INVALID_COMPANY_ACTIVITY_PAGE_SIZE");
    }
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(args.paginationOpts.numItems)),
    );
    const batchSize = pageSize * SOURCE_BATCH_MULTIPLIER;
    const cursor = decodeCursor(args.paginationOpts.cursor);

    const [marketplaceRows, verificationRows, operationalRows] = await Promise.all([
      loadMarketplaceBatch(ctx, args.companyId, cursor.marketplace, batchSize),
      loadVerificationBatch(ctx, args.companyId, cursor.verification, batchSize),
      loadOperationalBatch(ctx, args.companyId, cursor.operational, batchSize),
    ]);

    const marketplaceCandidates: MarketplaceCandidate[] = marketplaceRows
      .map((row, index) => ({ row, rawIndex: index, eventType: normalizeMarketplaceEventType(row.eventType) }))
      .filter((candidate): candidate is MarketplaceCandidate =>
        candidate.eventType !== null,
      )
      .map((candidate) => ({
        source: "marketplace_activity" as const,
        row: candidate.row,
        eventType: candidate.eventType,
        rawIndex: candidate.rawIndex,
      }));

    const verificationCandidates: VerificationCandidate[] = verificationRows
      .map((row, index) => ({ row, rawIndex: index, eventType: normalizeVerificationEventType(row) }))
      .filter((candidate): candidate is VerificationCandidate =>
        candidate.eventType !== null,
      )
      .map((candidate) => ({
        source: "verification_history" as const,
        row: candidate.row,
        eventType: candidate.eventType,
        rawIndex: candidate.rawIndex,
      }));

    const operationalCandidates: OperationalCandidate[] = operationalRows.map((row, rawIndex) => ({
      source: "operational_status_history" as const,
      row,
      eventType: "operational_status_changed" as const,
      rawIndex,
    }));

    const selected = [...marketplaceCandidates, ...verificationCandidates, ...operationalCandidates]
      .sort(compareCandidates)
      .slice(0, pageSize);
    const consumeWholeBatch = selected.length < pageSize;
    const nextCursor: TimelineCursor = {
      version: 2,
      marketplace: nextSourceCursor(
        cursor.marketplace,
        marketplaceRows,
        selected
          .filter((candidate): candidate is MarketplaceCandidate => candidate.source === "marketplace_activity")
          .map((candidate) => candidate.rawIndex),
        consumeWholeBatch,
        batchSize,
        (row) => row.createdAt,
      ),
      verification: nextSourceCursor(
        cursor.verification,
        verificationRows,
        selected
          .filter((candidate): candidate is VerificationCandidate => candidate.source === "verification_history")
          .map((candidate) => candidate.rawIndex),
        consumeWholeBatch,
        batchSize,
        (row) => row.changedAt,
      ),
      operational: nextSourceCursor(
        cursor.operational,
        operationalRows,
        selected.filter((candidate): candidate is OperationalCandidate => candidate.source === "operational_status_history").map((candidate) => candidate.rawIndex),
        consumeWholeBatch,
        batchSize,
        (row) => row.createdAt,
      ),
    };

    const [actorById, projectById] = await Promise.all([
      loadActorMap(ctx, selected),
      loadProjectMap(ctx, selected),
    ]);

    const page: TimelineItem[] = selected.map((candidate) => {
      if (candidate.source === "operational_status_history") {
        const actor = actorById.get(candidate.row.changedByAdminUserId) ?? null;
        return {
          id: `operational:${candidate.row._id}`,
          source: candidate.source,
          eventType: candidate.eventType,
          category: "marketplace",
          companyId: candidate.row.companyId,
          project: null,
          entity: { type: "company", id: candidate.row.companyId },
          actor: { type: "admin", displayName: displayName(actor) },
          occurredAt: candidate.row.createdAt,
          oldStatus: candidate.row.fromStatus,
          newStatus: candidate.row.toStatus,
          context: { amountMad: null, commissionAmountMad: null, commissionRateBps: null, currency: null, rating: null, revisionNumber: null, proposedDate: null, proposedTime: null, timezone: null, scheduledEpoch: null },
        };
      }
      if (candidate.source === "verification_history") {
        const actor = actorById.get(candidate.row.changedBy) ?? null;
        return {
          id: `verification:${candidate.row._id}`,
          source: candidate.source,
          eventType: candidate.eventType,
          category: "verification",
          companyId: candidate.row.companyId,
          project: null,
          entity: { type: "company_verification", id: candidate.row.companyId },
          actor: {
            type: verificationActorType(actor),
            displayName: displayName(actor),
          },
          occurredAt: candidate.row.changedAt,
          oldStatus: candidate.row.oldStatus,
          newStatus: candidate.row.newStatus,
          context: {
            amountMad: null,
            commissionAmountMad: null,
            commissionRateBps: null,
            currency: null,
            rating: null,
            revisionNumber: null,
            proposedDate: null,
            proposedTime: null,
            timezone: null,
            scheduledEpoch: null,
          },
        };
      }

      const actor = actorById.get(candidate.row.actorUserId) ?? null;
      const project = projectById.get(candidate.row.projectId) ?? null;
      return {
        id: `activity:${candidate.row._id}`,
        source: candidate.source,
        eventType: candidate.eventType,
        category: categoryFor(candidate.eventType),
        companyId: candidate.row.companyId ?? args.companyId,
        project: project
          ? {
              projectId: project._id,
              title: project.title ?? null,
              status: project.status,
            }
          : null,
        entity: entityFor(candidate.row),
        actor: {
          type: candidate.row.actorType,
          displayName: displayName(actor),
        },
        occurredAt: candidate.row.createdAt,
        oldStatus: candidate.row.oldStatus ?? null,
        newStatus: candidate.row.newStatus ?? null,
        context: safeContext(candidate.row),
      };
    });

    const isDone = nextCursor.marketplace.done && nextCursor.verification.done && nextCursor.operational.done;
    return {
      page,
      isDone,
      continueCursor: encodeCursor(nextCursor),
    };
  },
});
