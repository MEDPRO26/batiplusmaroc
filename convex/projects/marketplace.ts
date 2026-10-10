import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationResult,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { getProvince, isValidRegion, isProvinceInRegion } from "../../lib/geography/morocco";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internalMutation, query } from "../_generated/server";
import { requireCompanyUser } from "../companies/access";
import { isCompanyMarketplaceWriteAllowed } from "../companies/operationalStatus";
import { isActiveQuoteStatus } from "../quotes/state";
import { invitationForPair } from "../invitations/index";
import { toPublicClientProfile } from "../lib/clientPublicShape";
import {
  postedWindowMs,
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
import {
  canAccessDetailedProjectLocation,
  companyProjectLocationValidator,
  generalProjectLocationValidator,
  toDetailedProjectLocation,
  toGeneralProjectLocation,
} from "./location";

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
  city: v.union(projectCityValidator, v.null()),
  location: generalProjectLocationValidator,
  primaryCategory: projectCategoryValidator,
  customCategoryText: nullableString,
  timeline: projectTimelineValidator,
  propertyType: v.union(projectPropertyTypeValidator, v.null()),
  surface: nullableNumber,
  surfaceUnknown: v.boolean(),
  description: v.string(),
  publishedAt: nullableNumber,
  client: v.union(safeClientSummaryValidator, v.null()),
});

const marketplaceDetailsValidator = marketplaceCardValidator.omit("client", "location").extend({
  location: companyProjectLocationValidator,
  neighborhood: v.optional(nullableString),
  canSubmitQuote: v.boolean(),
  myQuoteId: v.union(v.id("projectQuotes"), v.null()),
  client: v.union(safeClientDetailValidator, v.null()),
});

type MarketplaceSort = (typeof projectMarketplaceSortOptions)[number];

type MarketplaceFilters = {
  regionCode?: string;
  provinceCode?: string;
  city?: Doc<"projects">["city"];
  category?: Doc<"projects">["primaryCategory"];
  timeline?: Doc<"projects">["timeline"];
  propertyType?: Doc<"projects">["propertyType"];
};

type MarketplaceSelections = {
  cities?: NonNullable<Doc<"projects">["city"]>[];
  categories?: NonNullable<Doc<"projects">["primaryCategory"]>[];
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

function validateGeographicFilters(args: {
  regionCode?: string;
  provinceCode?: string;
  city?: Doc<"projects">["city"];
  cities?: NonNullable<Doc<"projects">["city"]>[];
}) {
  if ((args.regionCode !== undefined || args.provinceCode !== undefined) &&
    (args.city !== undefined || args.cities !== undefined)) {
    throw new ConvexError("AMBIGUOUS_PROJECT_LOCATION_FILTER");
  }
  if (args.regionCode !== undefined && !isValidRegion(args.regionCode)) {
    throw new ConvexError("INVALID_PROJECT_REGION");
  }
  if (args.provinceCode !== undefined) {
    if (!getProvince(args.provinceCode)) throw new ConvexError("INVALID_PROJECT_PROVINCE");
    if (args.regionCode === undefined) throw new ConvexError("PROJECT_REGION_REQUIRED");
    if (!isProvinceInRegion(args.provinceCode, args.regionCode)) {
      throw new ConvexError("PROJECT_PROVINCE_REGION_MISMATCH");
    }
  }
}

function postedSinceMs(windows: (typeof projectPostedWindows)[number][] | undefined) {
  if (!windows?.length) return undefined;
  return Math.max(...windows.map((window) => postedWindowMs[window]));
}

function emptyPage(cursor: string | null): PaginationResult<never> {
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
      project.primaryCategory &&
      project.timeline,
  );
}

async function toMarketplaceCard(ctx: QueryCtx, project: Doc<"projects">) {
  if (!isCompleteMarketplaceProject(project)) return null;
  const client = await ctx.db.get(project.clientId);
  return {
    id: project._id,
    title: project.title!,
    city: project.city ?? null,
    location: toGeneralProjectLocation(project),
    primaryCategory: project.primaryCategory!,
    customCategoryText: project.customCategoryText ?? null,
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
    if (filters.timeline) next = next.eq("timeline", filters.timeline);
    if (filters.propertyType) next = next.eq("propertyType", filters.propertyType);
    return next;
  });
}

function publishedOrder(sortBy: MarketplaceSort) {
  return sortBy === "oldest" ? ("asc" as const) : ("desc" as const);
}

function newestQuery(ctx: QueryCtx, filters: MarketplaceFilters, sortBy: MarketplaceSort, publishedAfter?: number) {
  const base = ctx.db.query("projects");
  const order = publishedOrder(sortBy);
  if (filters.provinceCode) {
    return base.withIndex("by_status_visibility_province_publishedAt", (q) => {
      const scoped = q.eq("status", "published").eq("visibility", "marketplace").eq("provinceCode", filters.provinceCode!);
      return publishedAfter === undefined ? scoped : scoped.gte("publishedAt", publishedAfter);
    }).order(order);
  }
  if (filters.regionCode) {
    return base.withIndex("by_status_visibility_region_publishedAt", (q) => {
      const scoped = q.eq("status", "published").eq("visibility", "marketplace").eq("regionCode", filters.regionCode!);
      return publishedAfter === undefined ? scoped : scoped.gte("publishedAt", publishedAfter);
    }).order(order);
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

function applyMarketplaceFilters(
  // Convex filter expression builder — typed loosely to keep the helper reusable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  q: any,
  selections: MarketplaceSelections,
  publishedAfter: number | undefined,
  geography: Pick<MarketplaceFilters, "regionCode" | "provinceCode">,
) {
  const orField = (
    values: string[] | undefined,
    field: "city" | "primaryCategory" | "timeline" | "propertyType",
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
    geography.regionCode === undefined ? true : q.eq(q.field("regionCode"), geography.regionCode),
    geography.provinceCode === undefined ? true : q.eq(q.field("provinceCode"), geography.provinceCode),
    // Apply card eligibility before pagination so incomplete historical rows cannot consume a page.
    q.neq(q.field("title"), undefined), q.neq(q.field("title"), ""),
    q.neq(q.field("description"), undefined), q.neq(q.field("description"), ""),
    q.neq(q.field("primaryCategory"), undefined), q.neq(q.field("timeline"), undefined),
    orField(selections.cities, "city"),
    orField(selections.categories, "primaryCategory"),
    orField(selections.timelines, "timeline"),
    orField(selections.propertyTypes, "propertyType"),
    surface,
    publishedAfter === undefined ? true : q.gte(q.field("publishedAt"), publishedAfter),
  );
}

function filteredSearchQuery(
  ctx: QueryCtx,
  search: string,
  filters: MarketplaceFilters,
  selections: MarketplaceSelections,
  publishedAfter: number | undefined,
) {
  // Keep using the compatibility index until search_marketplace_geography is
  // backfilled and enabled. Geographic residuals still cost candidate reads.
  return searchQuery(ctx, search, filters)
    .filter((q) => applyMarketplaceFilters(q, selections, publishedAfter, filters));
}

/** Authenticated company feed. The DTO intentionally excludes all private client fields and files. */
export const listCompanyMarketplaceProjects = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    regionCode: v.optional(v.string()),
    provinceCode: v.optional(v.string()),
    city: v.optional(projectCityValidator),
    category: v.optional(projectCategoryValidator),
    timeline: v.optional(projectTimelineValidator),
    propertyType: v.optional(projectPropertyTypeValidator),
    cities: v.optional(v.array(projectCityValidator)),
    categories: v.optional(v.array(projectCategoryValidator)),
    timelines: v.optional(v.array(projectTimelineValidator)),
    propertyTypes: v.optional(v.array(projectPropertyTypeValidator)),
    surfaceRanges: v.optional(v.array(projectSurfaceRangeValidator)),
    postedWindows: v.optional(v.array(projectPostedWindowValidator)),
    /** Chronological browse order; nonblank text search always uses native relevance. */
    sortBy: v.optional(projectMarketplaceSortValidator),
    /** Client clock used only for posted-date windows (queries must not call Date.now()). */
    now: v.optional(v.number()),
  },
  returns: paginationResultValidator(marketplaceCardValidator),
  handler: async (ctx, args) => {
    await requireCompanyUser(ctx);
    validateGeographicFilters(args);
    const selections: MarketplaceSelections = {
      cities: normalizeSelection(args.cities, args.city, projectCities.length),
      categories: normalizeSelection(args.categories, args.category, projectCategories.length),
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
      regionCode: args.regionCode,
      provinceCode: args.provinceCode,
      city: singleOrUndefined(selections.cities),
      category: singleOrUndefined(selections.categories),
      timeline: singleOrUndefined(selections.timelines),
      propertyType: singleOrUndefined(selections.propertyTypes),
    };
    const sortBy: MarketplaceSort = args.sortBy ?? "newest";
    const postedWindow = postedSinceMs(selections.postedWindows);
    const publishedAfter =
      postedWindow === undefined ? undefined : Math.max(0, (args.now ?? 0) - postedWindow);

    if (
      selections.cities?.length === 0 ||
      selections.categories?.length === 0 ||
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
    // Product HQ: relevance takes precedence over sortBy during text search.
    // Paginate the search itself; never materialize all matches or re-sort a page.
    const selectedQuery = search
      ? filteredSearchQuery(ctx, search, filters, selections, publishedAfter)
      : newestQuery(ctx, filters, sortBy, publishedAfter)
        .filter((q) => applyMarketplaceFilters(q, selections, publishedAfter, filters));
    const page = await selectedQuery.paginate(args.paginationOpts);

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
    if (!project || !isCompleteMarketplaceProject(project)) return null;
    const invitation = await invitationForPair(ctx, projectId, company._id);
    const directInvitation = invitation?.status === "accepted" && invitation.clientUserId === project.clientId ? invitation : null;
    const canUseMarketplacePath =
      invitation === null &&
      project.status === "published" &&
      project.visibility === "marketplace";
    const canUseInvitationPath =
      directInvitation !== null &&
      (project.status === "published" || project.status === "in_discussion");
    if (!canUseMarketplacePath && !canUseInvitationPath) return null;
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
    const canReadDetailedLocation = await canAccessDetailedProjectLocation(ctx, project, company._id);
    return {
      ...card,
      client,
      location: canReadDetailedLocation ? toDetailedProjectLocation(project) : toGeneralProjectLocation(project),
      ...(canReadDetailedLocation ? { neighborhood: project.neighborhood ?? null } : {}),
      canSubmitQuote:
        company.verificationStatus === "verified"
        && isCompanyMarketplaceWriteAllowed(company)
        && activeQuote === null,
      myQuoteId: recentQuotes.at(0)?._id ?? null,
    };
  },
});

/** Bounded, repeatable migration for projects published before marketplace search existed. */
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
      const patch: { marketplaceSearchText?: string } = {};
      if (project.marketplaceSearchText !== marketplaceSearchText) {
        patch.marketplaceSearchText = marketplaceSearchText;
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
