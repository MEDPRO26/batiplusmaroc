import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internalMutation, query } from "../_generated/server";
import { requireCompanyUser } from "../companies/access";
import { isActiveQuoteStatus } from "../quotes/state";
import { toPublicClientProfile } from "../lib/clientPublicShape";
import {
  marketplaceBudgetRank,
  postedWindowMs,
  projectBudgetRanges,
  projectBudgetRangeValidator,
  projectCategories,
  projectCategoryValidator,
  projectCities,
  projectCityValidator,
  projectMarketplaceSortOptions,
  projectMarketplaceSortValidator,
  projectPostedWindows,
  projectPostedWindowValidator,
  projectPropertyTypes,
  projectPropertyTypeValidator,
  projectSurfaceRanges,
  projectSurfaceRangeValidator,
  projectTimelines,
  projectTimelineValidator,
} from "./constants";
import {
  buildProjectMarketplaceSearchText,
  normalizeProjectSearch,
} from "./marketplaceSearch";

const MARKETPLACE_BACKFILL_BATCH_SIZE = 50;
const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const safeClientSummaryValidator = v.object({
  displayName: v.string(),
  joinedAt: v.number(),
});
const safeClientDetailValidator = v.object({
  displayName: v.string(),
  firstName: v.string(),
  lastInitial: v.string(),
  city: nullableString,
  joinedAt: v.number(),
  projectsPostedCount: v.number(),
  projectsCompletedCount: v.number(),
  emailVerified: v.boolean(),
  phoneVerified: v.boolean(),
});

const marketplaceCardValidator = v.object({
  id: v.id("projects"),
  title: v.string(),
  city: projectCityValidator,
  primaryCategory: projectCategoryValidator,
  customCategoryText: nullableString,
  budgetRange: projectBudgetRangeValidator,
  timeline: projectTimelineValidator,
  propertyType: v.union(projectPropertyTypeValidator, v.null()),
  surface: nullableNumber,
  surfaceUnknown: v.boolean(),
  description: v.string(),
  publishedAt: nullableNumber,
  client: v.union(safeClientSummaryValidator, v.null()),
});

const marketplaceDetailsValidator = marketplaceCardValidator.omit("client").extend({
  neighborhood: nullableString,
  budgetMin: nullableNumber,
  budgetMax: nullableNumber,
  budgetUnknown: v.boolean(),
  canSubmitQuote: v.boolean(),
  myQuoteId: v.union(v.id("projectQuotes"), v.null()),
  client: v.union(safeClientDetailValidator, v.null()),
});

type MarketplaceSort = (typeof projectMarketplaceSortOptions)[number];

type MarketplaceFilters = {
  city?: Doc<"projects">["city"];
  category?: Doc<"projects">["primaryCategory"];
  budgetRange?: Doc<"projects">["budgetRange"];
  timeline?: Doc<"projects">["timeline"];
  propertyType?: Doc<"projects">["propertyType"];
};

type MarketplaceSelections = {
  cities?: NonNullable<Doc<"projects">["city"]>[];
  categories?: NonNullable<Doc<"projects">["primaryCategory"]>[];
  budgetRanges?: NonNullable<Doc<"projects">["budgetRange"]>[];
  timelines?: NonNullable<Doc<"projects">["timeline"]>[];
  propertyTypes?: NonNullable<Doc<"projects">["propertyType"]>[];
  surfaceRanges?: (typeof projectSurfaceRanges)[number][];
  postedWindows?: (typeof projectPostedWindows)[number][];
};

function normalizeSelection<T>(values: T[] | undefined, fallback: T | undefined, limit: number) {
  if (values === undefined) return fallback === undefined ? undefined : [fallback];
  return Array.from(new Set(values)).slice(0, limit);
}

function singleOrUndefined<T>(values: T[] | undefined) {
  return values?.length === 1 ? values[0] : undefined;
}

function isMulti(selection: unknown[] | undefined) {
  return selection !== undefined && selection.length !== 1;
}

function postedSinceMs(windows: (typeof projectPostedWindows)[number][] | undefined) {
  if (!windows?.length) return undefined;
  return Math.max(...windows.map((window) => postedWindowMs[window]));
}

function emptyPage(cursor: string | null) {
  return { page: [] as never[], isDone: true, continueCursor: cursor ?? "" };
}

function safeClientSummary(user: Doc<"users"> | null) {
  if (!user) return null;
  const firstName = user.firstName?.trim() ?? "";
  const lastName = user.lastName?.trim() ?? "";
  if (!firstName) return null;
  const displayName = lastName
    ? `${firstName} ${lastName.charAt(0).toLocaleUpperCase("fr-MA")}.`
    : firstName;
  return {
    displayName,
    joinedAt: user.createdAt ?? user._creationTime,
  };
}

async function deriveClientProjectStats(ctx: QueryCtx, clientId: Id<"users">) {
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
    .take(500);
  let projectsPostedCount = 0;
  let projectsCompletedCount = 0;
  for (const project of projects) {
    if (project.status !== "draft") projectsPostedCount += 1;
    if (project.status === "completed") projectsCompletedCount += 1;
  }
  return { projectsPostedCount, projectsCompletedCount };
}

async function safeClientDetail(ctx: QueryCtx, clientId: Id<"users">) {
  const user = await ctx.db.get(clientId);
  if (!user) return null;
  const profiles = await ctx.db
    .query("clientProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", clientId))
    .take(2);
  const profile = profiles[0] ?? null;
  const stats = await deriveClientProjectStats(ctx, clientId);
  const publicProfile = toPublicClientProfile({
    user,
    profile,
    projectsPostedCount: stats.projectsPostedCount,
    projectsCompletedCount: stats.projectsCompletedCount,
  });
  if (publicProfile) {
    return {
      ...publicProfile,
      emailVerified: user.emailVerificationTime !== undefined,
      phoneVerified: user.phoneVerificationTime !== undefined,
    };
  }
  const summary = safeClientSummary(user);
  if (!summary) return null;
  return {
    displayName: summary.displayName,
    firstName: user.firstName?.trim() ?? summary.displayName,
    lastInitial: "",
    city: profile?.city?.trim() || null,
    joinedAt: summary.joinedAt,
    projectsPostedCount: stats.projectsPostedCount,
    projectsCompletedCount: stats.projectsCompletedCount,
    emailVerified: user.emailVerificationTime !== undefined,
    phoneVerified: user.phoneVerificationTime !== undefined,
  };
}

function isCompleteMarketplaceProject(project: Doc<"projects">) {
  return Boolean(
    project.title &&
      project.description &&
      project.city &&
      project.primaryCategory &&
      project.budgetRange &&
      project.timeline,
  );
}

async function toMarketplaceCard(ctx: QueryCtx, project: Doc<"projects">) {
  if (!isCompleteMarketplaceProject(project)) return null;
  const client = await ctx.db.get(project.clientId);
  return {
    id: project._id,
    title: project.title!,
    city: project.city!,
    primaryCategory: project.primaryCategory!,
    customCategoryText: project.customCategoryText ?? null,
    budgetRange: project.budgetRange!,
    timeline: project.timeline!,
    propertyType: project.propertyType ?? null,
    surface: project.surface ?? null,
    surfaceUnknown: project.surfaceUnknown,
    description: project.description!,
    publishedAt: project.publishedAt ?? null,
    client: safeClientSummary(client),
  };
}

function searchQuery(ctx: QueryCtx, search: string, filters: MarketplaceFilters) {
  return ctx.db.query("projects").withSearchIndex("search_marketplace", (q) => {
    let next = q
      .search("marketplaceSearchText", search)
      .eq("status", "published")
      .eq("visibility", "marketplace");
    if (filters.city) next = next.eq("city", filters.city);
    if (filters.category) next = next.eq("primaryCategory", filters.category);
    if (filters.budgetRange) next = next.eq("budgetRange", filters.budgetRange);
    if (filters.timeline) next = next.eq("timeline", filters.timeline);
    if (filters.propertyType) next = next.eq("propertyType", filters.propertyType);
    return next;
  });
}

function publishedOrder(sortBy: MarketplaceSort) {
  return sortBy === "oldest" ? ("asc" as const) : ("desc" as const);
}

function newestQuery(ctx: QueryCtx, filters: MarketplaceFilters, sortBy: MarketplaceSort) {
  const base = ctx.db.query("projects");
  const order = publishedOrder(sortBy);
  if (filters.city && filters.category && filters.budgetRange) {
    return base
      .withIndex("by_status_visibility_city_category_budget_publishedAt", (q) =>
        q
          .eq("status", "published")
          .eq("visibility", "marketplace")
          .eq("city", filters.city)
          .eq("primaryCategory", filters.category)
          .eq("budgetRange", filters.budgetRange),
      )
      .order(order);
  }
  if (filters.city && filters.category) {
    return base
      .withIndex("by_status_visibility_city_category_publishedAt", (q) =>
        q
          .eq("status", "published")
          .eq("visibility", "marketplace")
          .eq("city", filters.city)
          .eq("primaryCategory", filters.category),
      )
      .order(order);
  }
  if (filters.city && filters.budgetRange) {
    return base
      .withIndex("by_status_visibility_city_budget_publishedAt", (q) =>
        q
          .eq("status", "published")
          .eq("visibility", "marketplace")
          .eq("city", filters.city)
          .eq("budgetRange", filters.budgetRange),
      )
      .order(order);
  }
  if (filters.category && filters.budgetRange) {
    return base
      .withIndex("by_status_visibility_category_budget_publishedAt", (q) =>
        q
          .eq("status", "published")
          .eq("visibility", "marketplace")
          .eq("primaryCategory", filters.category)
          .eq("budgetRange", filters.budgetRange),
      )
      .order(order);
  }
  if (filters.city) {
    return base
      .withIndex("by_status_visibility_city_publishedAt", (q) =>
        q.eq("status", "published").eq("visibility", "marketplace").eq("city", filters.city),
      )
      .order(order);
  }
  if (filters.category) {
    return base
      .withIndex("by_status_visibility_category_publishedAt", (q) =>
        q
          .eq("status", "published")
          .eq("visibility", "marketplace")
          .eq("primaryCategory", filters.category),
      )
      .order(order);
  }
  if (filters.budgetRange) {
    return base
      .withIndex("by_status_visibility_budget_publishedAt", (q) =>
        q
          .eq("status", "published")
          .eq("visibility", "marketplace")
          .eq("budgetRange", filters.budgetRange),
      )
      .order(order);
  }
  if (filters.timeline) {
    return base
      .withIndex("by_status_visibility_timeline_publishedAt", (q) =>
        q
          .eq("status", "published")
          .eq("visibility", "marketplace")
          .eq("timeline", filters.timeline),
      )
      .order(order);
  }
  if (filters.propertyType) {
    return base
      .withIndex("by_status_visibility_propertyType_publishedAt", (q) =>
        q
          .eq("status", "published")
          .eq("visibility", "marketplace")
          .eq("propertyType", filters.propertyType),
      )
      .order(order);
  }
  return base
    .withIndex("by_status_visibility_publishedAt", (q) =>
      q.eq("status", "published").eq("visibility", "marketplace"),
    )
    .order(order);
}

function budgetSortedQuery(ctx: QueryCtx, sortBy: "budget_high" | "budget_low") {
  return ctx.db
    .query("projects")
    .withIndex("by_status_visibility_budgetRank_publishedAt", (q) =>
      q.eq("status", "published").eq("visibility", "marketplace"),
    )
    .order(sortBy === "budget_high" ? "desc" : "asc");
}

function applyMarketplaceFilters(
  // Convex filter expression builder — typed loosely to keep the helper reusable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: any,
  selections: MarketplaceSelections,
  publishedAfter: number | undefined,
) {
  const orField = (
    values: string[] | undefined,
    field: "city" | "primaryCategory" | "budgetRange" | "timeline" | "propertyType",
  ) => {
    if (values === undefined) return true;
    if (values.length === 0) return false;
    return q.or(...values.map((value) => q.eq(q.field(field), value)));
  };

  const surface =
    selections.surfaceRanges === undefined
      ? true
      : selections.surfaceRanges.length === 0
        ? false
        : q.or(
            ...selections.surfaceRanges.map((range) => {
              if (range === "unknown") return q.eq(q.field("surfaceUnknown"), true);
              if (range === "under_100") {
                return q.and(q.eq(q.field("surfaceUnknown"), false), q.lt(q.field("surface"), 100));
              }
              if (range === "100_200") {
                return q.and(
                  q.eq(q.field("surfaceUnknown"), false),
                  q.gte(q.field("surface"), 100),
                  q.lt(q.field("surface"), 200),
                );
              }
              if (range === "200_500") {
                return q.and(
                  q.eq(q.field("surfaceUnknown"), false),
                  q.gte(q.field("surface"), 200),
                  q.lt(q.field("surface"), 500),
                );
              }
              return q.and(q.eq(q.field("surfaceUnknown"), false), q.gte(q.field("surface"), 500));
            }),
          );

  return q.and(
    orField(selections.cities, "city"),
    orField(selections.categories, "primaryCategory"),
    orField(selections.budgetRanges, "budgetRange"),
    orField(selections.timelines, "timeline"),
    orField(selections.propertyTypes, "propertyType"),
    surface,
    publishedAfter === undefined ? true : q.gte(q.field("publishedAt"), publishedAfter),
  );
}

function filteredSearchQuery(
  ctx: QueryCtx,
  search: string,
  selections: MarketplaceSelections,
  publishedAfter: number | undefined,
) {
  return ctx.db
    .query("projects")
    .withSearchIndex("search_marketplace", (q) =>
      q
        .search("marketplaceSearchText", search)
        .eq("status", "published")
        .eq("visibility", "marketplace"),
    )
    .filter((q) => applyMarketplaceFilters(q, selections, publishedAfter));
}

function filteredOrderedQuery(
  ctx: QueryCtx,
  selections: MarketplaceSelections,
  sortBy: MarketplaceSort,
  publishedAfter: number | undefined,
) {
  const ordered =
    sortBy === "budget_high" || sortBy === "budget_low"
      ? budgetSortedQuery(ctx, sortBy)
      : ctx.db
          .query("projects")
          .withIndex("by_status_visibility_publishedAt", (q) =>
            q.eq("status", "published").eq("visibility", "marketplace"),
          )
          .order(publishedOrder(sortBy));
  return ordered.filter((q) => applyMarketplaceFilters(q, selections, publishedAfter));
}

/** Authenticated company feed. The DTO intentionally excludes all private client fields and files. */
export const listCompanyMarketplaceProjects = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    city: v.optional(projectCityValidator),
    category: v.optional(projectCategoryValidator),
    budgetRange: v.optional(projectBudgetRangeValidator),
    timeline: v.optional(projectTimelineValidator),
    propertyType: v.optional(projectPropertyTypeValidator),
    cities: v.optional(v.array(projectCityValidator)),
    categories: v.optional(v.array(projectCategoryValidator)),
    budgetRanges: v.optional(v.array(projectBudgetRangeValidator)),
    timelines: v.optional(v.array(projectTimelineValidator)),
    propertyTypes: v.optional(v.array(projectPropertyTypeValidator)),
    surfaceRanges: v.optional(v.array(projectSurfaceRangeValidator)),
    postedWindows: v.optional(v.array(projectPostedWindowValidator)),
    sortBy: v.optional(projectMarketplaceSortValidator),
    /** Client clock used only for posted-date windows (queries must not call Date.now()). */
    now: v.optional(v.number()),
  },
  returns: paginationResultValidator(marketplaceCardValidator),
  handler: async (ctx, args) => {
    await requireCompanyUser(ctx);
    const selections: MarketplaceSelections = {
      cities: normalizeSelection(args.cities, args.city, projectCities.length),
      categories: normalizeSelection(args.categories, args.category, projectCategories.length),
      budgetRanges: normalizeSelection(args.budgetRanges, args.budgetRange, projectBudgetRanges.length),
      timelines: normalizeSelection(args.timelines, args.timeline, projectTimelines.length),
      propertyTypes: normalizeSelection(
        args.propertyTypes,
        args.propertyType,
        projectPropertyTypes.length,
      ),
      surfaceRanges: normalizeSelection(args.surfaceRanges, undefined, projectSurfaceRanges.length),
      postedWindows: normalizeSelection(args.postedWindows, undefined, projectPostedWindows.length),
    };
    const filters: MarketplaceFilters = {
      city: singleOrUndefined(selections.cities),
      category: singleOrUndefined(selections.categories),
      budgetRange: singleOrUndefined(selections.budgetRanges),
      timeline: singleOrUndefined(selections.timelines),
      propertyType: singleOrUndefined(selections.propertyTypes),
    };
    const sortBy = args.sortBy ?? "newest";
    const postedWindow = postedSinceMs(selections.postedWindows);
    const publishedAfter =
      postedWindow === undefined ? undefined : Math.max(0, (args.now ?? 0) - postedWindow);

    if (
      selections.cities?.length === 0 ||
      selections.categories?.length === 0 ||
      selections.budgetRanges?.length === 0 ||
      selections.timelines?.length === 0 ||
      selections.propertyTypes?.length === 0 ||
      selections.surfaceRanges?.length === 0 ||
      selections.postedWindows?.length === 0
    ) {
      return emptyPage(args.paginationOpts.cursor);
    }

    if (selections.postedWindows !== undefined && (args.now === undefined || !Number.isFinite(args.now))) {
      return emptyPage(args.paginationOpts.cursor);
    }

    const search = normalizeProjectSearch(args.search);
    const hasExtraFilters =
      selections.surfaceRanges !== undefined ||
      selections.postedWindows !== undefined ||
      isMulti(selections.cities) ||
      isMulti(selections.categories) ||
      isMulti(selections.budgetRanges) ||
      isMulti(selections.timelines) ||
      isMulti(selections.propertyTypes);
    const usesBudgetSort = sortBy === "budget_high" || sortBy === "budget_low";
    // Indexed equality path only when every active dimension is a single value and sort is by date.
    const canUseIndexedPath =
      !hasExtraFilters &&
      !usesBudgetSort &&
      !(
        selections.timelines !== undefined &&
        (selections.cities !== undefined ||
          selections.categories !== undefined ||
          selections.budgetRanges !== undefined ||
          selections.propertyTypes !== undefined)
      ) &&
      !(
        selections.propertyTypes !== undefined &&
        (selections.cities !== undefined ||
          selections.categories !== undefined ||
          selections.budgetRanges !== undefined ||
          selections.timelines !== undefined)
      );

    const page = search
      ? await (canUseIndexedPath
          ? searchQuery(ctx, search, filters)
          : filteredSearchQuery(ctx, search, selections, publishedAfter)
        ).paginate(args.paginationOpts)
      : await (canUseIndexedPath
          ? newestQuery(ctx, filters, sortBy)
          : filteredOrderedQuery(ctx, selections, sortBy, publishedAfter)
        ).paginate(args.paginationOpts);

    const publicPage = (
      await Promise.all(page.page.map((project) => toMarketplaceCard(ctx, project)))
    ).filter((project): project is NonNullable<typeof project> => project !== null);

    return { ...page, page: publicPage };
  },
});

/** Safe company-facing detail. Non-published and invite-only projects are indistinguishable from missing. */
export const getCompanyMarketplaceProject = query({
  args: { projectId: v.string() },
  returns: v.union(v.null(), marketplaceDetailsValidator),
  handler: async (ctx, args) => {
    const { company } = await requireCompanyUser(ctx);
    const projectId = ctx.db.normalizeId("projects", args.projectId);
    if (!projectId) return null;
    const project = await ctx.db.get(projectId);
    if (
      !project ||
      project.status !== "published" ||
      project.visibility !== "marketplace" ||
      !isCompleteMarketplaceProject(project)
    ) {
      return null;
    }
    const card = await toMarketplaceCard(ctx, project);
    if (!card) return null;
    const client = await safeClientDetail(ctx, project.clientId);
    const recentQuotes = await ctx.db
      .query("projectQuotes")
      .withIndex("by_projectId_and_companyId", (q) =>
        q.eq("projectId", project._id).eq("companyId", company._id),
      )
      .order("desc")
      .take(20);
    const activeQuote = recentQuotes.find((quote) => isActiveQuoteStatus(quote.status)) ?? null;
    return {
      ...card,
      client,
      neighborhood: project.neighborhood ?? null,
      budgetMin: project.budgetMin ?? null,
      budgetMax: project.budgetMax ?? null,
      budgetUnknown: project.budgetUnknown,
      canSubmitQuote: company.verificationStatus === "verified" && activeQuote === null,
      myQuoteId: recentQuotes[0]?._id ?? null,
    };
  },
});

/** Bounded, repeatable migration for projects published before marketplace search / budget rank existed. */
export const backfillMarketplaceSearchText = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    processed: v.number(),
    updated: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("projects")
      .withIndex("by_status_visibility_publishedAt", (q) =>
        q.eq("status", "published").eq("visibility", "marketplace"),
      )
      .paginate({ cursor: args.cursor, numItems: MARKETPLACE_BACKFILL_BATCH_SIZE });
    let updated = 0;
    for (const project of page.page) {
      const marketplaceSearchText = buildProjectMarketplaceSearchText(project);
      const rank = marketplaceBudgetRank(project.budgetRange);
      const patch: {
        marketplaceSearchText?: string;
        marketplaceBudgetRank?: number;
      } = {};
      if (project.marketplaceSearchText !== marketplaceSearchText) {
        patch.marketplaceSearchText = marketplaceSearchText;
      }
      if (project.marketplaceBudgetRank !== rank) {
        patch.marketplaceBudgetRank = rank;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(project._id, patch);
        updated += 1;
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.projects.marketplace.backfillMarketplaceSearchText,
        { cursor: page.continueCursor },
      );
    }

    return {
      processed: page.page.length,
      updated,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
