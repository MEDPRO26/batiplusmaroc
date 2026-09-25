import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation, query } from "../_generated/server";
import {
  marketplaceActivityActorTypeValidator,
  marketplaceActivityEventTypeValidator,
  marketplaceActivityMetadataValidator,
} from "../marketplaceActivity/constants";
import { appendMarketplaceActivity } from "../marketplaceActivity/model";
import {
  marketplaceBudgetRank,
  projectBudgetRangeValidator,
  projectCategoryValidator,
  projectCityValidator,
  projectPropertyTypeValidator,
  projectStatusValidator,
  projectTimelineValidator,
  type ProjectStatus,
} from "../projects/constants";
import { assertProjectTransition } from "../projects/state";
import { buildProjectMarketplaceSearchText } from "../projects/marketplaceSearch";
import { requireAdminUser } from "./access";

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const listStatusValidator = v.union(v.literal("all"), projectStatusValidator);

const listItemValidator = v.object({
  projectId: v.id("projects"),
  title: v.string(),
  clientName: v.string(),
  city: v.union(projectCityValidator, v.null()),
  category: v.union(projectCategoryValidator, v.null()),
  customCategoryText: nullableString,
  budgetRange: v.union(projectBudgetRangeValidator, v.null()),
  submittedAt: nullableNumber,
  status: projectStatusValidator,
});

const actorValidator = v.object({
  userId: v.id("users"),
  displayName: v.string(),
  role: v.union(
    v.literal("client"),
    v.literal("company"),
    v.literal("admin"),
    v.literal("seo_team"),
    v.null(),
  ),
});

const historyItemValidator = v.object({
  historyId: v.id("projectStatusHistory"),
  oldStatus: projectStatusValidator,
  newStatus: projectStatusValidator,
  changedAt: v.number(),
  reason: nullableString,
  changedBy: actorValidator,
});

const activityItemValidator = v.object({
  activityId: v.id("marketplaceActivity"),
  eventType: marketplaceActivityEventTypeValidator,
  actor: v.object({
    userId: v.id("users"),
    displayName: v.string(),
    type: marketplaceActivityActorTypeValidator,
  }),
  company: v.union(
    v.null(),
    v.object({ id: v.id("companies"), name: v.string() }),
  ),
  quoteId: v.union(v.id("projectQuotes"), v.null()),
  conversationId: v.union(v.id("conversations"), v.null()),
  siteAssessmentId: v.union(v.id("siteAssessments"), v.null()),
  siteVisitId: v.union(v.id("siteVisits"), v.null()),
  finalQuoteId: v.union(v.id("finalQuotes"), v.null()),
  finalQuoteRevisionId: v.union(v.id("finalQuoteRevisions"), v.null()),
  dealId: nullableString,
  oldStatus: nullableString,
  newStatus: nullableString,
  reason: nullableString,
  metadata: v.union(marketplaceActivityMetadataValidator, v.null()),
  createdAt: v.number(),
});

const reviewValidator = v.object({
  projectId: v.id("projects"),
  title: v.string(),
  client: v.object({ displayName: v.string() }),
  category: v.union(projectCategoryValidator, v.null()),
  customCategoryText: nullableString,
  city: v.union(projectCityValidator, v.null()),
  neighborhood: nullableString,
  propertyType: v.union(projectPropertyTypeValidator, v.null()),
  surface: nullableNumber,
  surfaceUnknown: v.boolean(),
  description: nullableString,
  budgetRange: v.union(projectBudgetRangeValidator, v.null()),
  budgetMin: nullableNumber,
  budgetMax: nullableNumber,
  budgetUnknown: v.boolean(),
  timeline: v.union(projectTimelineValidator, v.null()),
  submittedAt: nullableNumber,
  publishedAt: nullableNumber,
  status: projectStatusValidator,
  history: v.array(historyItemValidator),
});

function normalizeSearch(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase() ?? "";
}

function normalizeReason(value: string) {
  const reason = value.trim().replace(/\s+/g, " ");
  if (reason.length < 3 || reason.length > 500) {
    throw new ConvexError("PROJECT_REVIEW_REASON_REQUIRED");
  }
  return reason;
}

function displayName(user: { firstName?: string; lastName?: string } | null) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—";
}

/** Admin-only entry point for the bounded, self-continuing marketplace field backfill. */
export const startMarketplaceBackfill = mutation({
  args: {},
  returns: v.object({ scheduled: v.literal(true) }),
  handler: async (ctx) => {
    await requireAdminUser(ctx);
    await ctx.scheduler.runAfter(
      0,
      internal.projects.marketplace.backfillMarketplaceSearchText,
      { cursor: null },
    );
    return { scheduled: true as const };
  },
});

/** Admin project queue. Every response exposes only project data and a safe client name. */
export const listProjects = query({
  args: {
    status: listStatusValidator,
    search: v.optional(v.string()),
    city: v.optional(projectCityValidator),
  },
  returns: v.array(listItemValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);

    const projects =
      args.status === "all"
        ? await ctx.db.query("projects").withIndex("by_createdAt").order("desc").take(200)
        : args.city
          ? await ctx.db
              .query("projects")
              .withIndex("by_status_and_city", (q) =>
                q.eq("status", args.status as ProjectStatus).eq("city", args.city),
              )
              .order("desc")
              .take(200)
          : await ctx.db
              .query("projects")
              .withIndex("by_status", (q) => q.eq("status", args.status as ProjectStatus))
              .order("desc")
              .take(200);

    const needle = normalizeSearch(args.search);
    const rows = [];
    for (const project of projects) {
      if (args.city && args.status === "all" && project.city !== args.city) continue;
      const title = project.title ?? "";
      if (needle && !title.toLocaleLowerCase().includes(needle)) continue;
      const client = await ctx.db.get(project.clientId);
      rows.push({
        projectId: project._id,
        title: title || "—",
        clientName: displayName(client),
        city: project.city ?? null,
        category: project.primaryCategory ?? null,
        customCategoryText: project.customCategoryText ?? null,
        budgetRange: project.budgetRange ?? null,
        submittedAt: project.submittedAt ?? null,
        status: project.status,
      });
    }

    rows.sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
    return rows;
  },
});

export const getProjectReview = query({
  args: { projectId: v.id("projects") },
  returns: v.union(v.null(), reviewValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    const client = await ctx.db.get(project.clientId);
    const historyRows = await ctx.db
      .query("projectStatusHistory")
      .withIndex("by_projectId_and_changedAt", (q) => q.eq("projectId", project._id))
      .order("desc")
      .take(100);
    const history = [];
    for (const row of historyRows) {
      const actor = await ctx.db.get(row.changedBy);
      history.push({
        historyId: row._id,
        oldStatus: row.oldStatus,
        newStatus: row.newStatus,
        changedAt: row.changedAt,
        reason: row.reason ?? null,
        changedBy: {
          userId: row.changedBy,
          displayName: displayName(actor),
          role: actor?.accountType ?? null,
        },
      });
    }

    return {
      projectId: project._id,
      title: project.title ?? "—",
      client: { displayName: displayName(client) },
      category: project.primaryCategory ?? null,
      customCategoryText: project.customCategoryText ?? null,
      city: project.city ?? null,
      neighborhood: project.neighborhood ?? null,
      propertyType: project.propertyType ?? null,
      surface: project.surface ?? null,
      surfaceUnknown: project.surfaceUnknown,
      description: project.description ?? null,
      budgetRange: project.budgetRange ?? null,
      budgetMin: project.budgetMin ?? null,
      budgetMax: project.budgetMax ?? null,
      budgetUnknown: project.budgetUnknown,
      timeline: project.timeline ?? null,
      submittedAt: project.submittedAt ?? null,
      publishedAt: project.publishedAt ?? null,
      status: project.status,
      history,
    };
  },
});

/** Admin-only cross-domain funnel. Convex subscriptions keep the open timeline live. */
export const listProjectActivity = query({
  args: { projectId: v.id("projects") },
  returns: v.array(activityItemValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return [];

    const rows = await ctx.db
      .query("marketplaceActivity")
      .withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", project._id))
      .order("desc")
      .take(250);

    const actorIds = [...new Set(rows.map((row) => row.actorUserId))];
    const companyIds = [...new Set(rows.flatMap((row) => row.companyId ? [row.companyId] : []))];
    const [actors, companies] = await Promise.all([
      Promise.all(actorIds.map((userId) => ctx.db.get(userId))),
      Promise.all(companyIds.map((companyId) => ctx.db.get(companyId))),
    ]);
    const actorById = new Map(actorIds.map((id, index) => [id, actors[index]]));
    const companyById = new Map(companyIds.map((id, index) => [id, companies[index]]));

    return rows.reverse().map((row) => {
      const actor = actorById.get(row.actorUserId) ?? null;
      const company = row.companyId ? companyById.get(row.companyId) ?? null : null;
      return {
        activityId: row._id,
        eventType: row.eventType,
        actor: {
          userId: row.actorUserId,
          displayName: displayName(actor),
          type: row.actorType,
        },
        company: row.companyId
          ? { id: row.companyId, name: company?.name ?? "—" }
          : null,
        quoteId: row.quoteId ?? null,
        conversationId: row.conversationId ?? null,
        siteAssessmentId: row.siteAssessmentId ?? null,
        siteVisitId: row.siteVisitId ?? null,
        finalQuoteId: row.finalQuoteId ?? null,
        finalQuoteRevisionId: row.finalQuoteRevisionId ?? null,
        dealId: row.dealId ?? null,
        oldStatus: row.oldStatus ?? null,
        newStatus: row.newStatus ?? null,
        reason: row.reason ?? null,
        metadata: row.metadata ?? null,
        createdAt: row.createdAt,
      };
    });
  },
});

export const approveProject = mutation({
  args: { projectId: v.id("projects") },
  returns: v.object({ status: v.literal("published") }),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError("PROJECT_NOT_FOUND");
    if (project.status !== "pending_review") throw new ConvexError("PROJECT_NOT_PENDING_REVIEW");
    assertProjectTransition(project.status, "published");

    const now = Date.now();
    await ctx.db.patch(project._id, {
      status: "published",
      publishedAt: now,
      updatedAt: now,
      marketplaceSearchText: buildProjectMarketplaceSearchText(project),
      marketplaceBudgetRank: marketplaceBudgetRank(project.budgetRange),
    });
    await ctx.db.insert("projectStatusHistory", {
      projectId: project._id,
      oldStatus: "pending_review",
      newStatus: "published",
      changedBy: admin._id,
      changedAt: now,
    });
    await appendMarketplaceActivity(ctx, {
      projectId: project._id,
      eventType: "project_approved",
      actorUserId: admin._id,
      actorType: "admin",
      oldStatus: "pending_review",
      newStatus: "published",
      createdAt: now,
    });
    return { status: "published" as const };
  },
});

export const requestProjectChanges = mutation({
  args: { projectId: v.id("projects"), reason: v.string() },
  returns: v.object({ status: v.literal("needs_changes") }),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError("PROJECT_NOT_FOUND");
    if (project.status !== "pending_review") throw new ConvexError("PROJECT_NOT_PENDING_REVIEW");
    assertProjectTransition(project.status, "needs_changes");

    const reason = normalizeReason(args.reason);
    const now = Date.now();
    await ctx.db.patch(project._id, { status: "needs_changes", updatedAt: now });
    await ctx.db.insert("projectStatusHistory", {
      projectId: project._id,
      oldStatus: "pending_review",
      newStatus: "needs_changes",
      changedBy: admin._id,
      changedAt: now,
      reason,
    });
    await appendMarketplaceActivity(ctx, {
      projectId: project._id,
      eventType: "project_needs_changes",
      actorUserId: admin._id,
      actorType: "admin",
      oldStatus: "pending_review",
      newStatus: "needs_changes",
      reason,
      createdAt: now,
    });
    return { status: "needs_changes" as const };
  },
});

export const cancelProject = mutation({
  args: { projectId: v.id("projects"), reason: v.string() },
  returns: v.object({ status: v.literal("cancelled") }),
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError("PROJECT_NOT_FOUND");
    if (project.status !== "pending_review") throw new ConvexError("PROJECT_NOT_PENDING_REVIEW");
    assertProjectTransition(project.status, "cancelled");

    const reason = normalizeReason(args.reason);
    const now = Date.now();
    await ctx.db.patch(project._id, { status: "cancelled", updatedAt: now });
    await ctx.db.insert("projectStatusHistory", {
      projectId: project._id,
      oldStatus: "pending_review",
      newStatus: "cancelled",
      changedBy: admin._id,
      changedAt: now,
      reason,
    });
    return { status: "cancelled" as const };
  },
});
