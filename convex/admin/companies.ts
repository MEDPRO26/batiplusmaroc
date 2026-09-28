import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { commissionStatusValidator, dealStatusValidator } from "../deals/constants";
import { projectStatusValidator } from "../projects/constants";
import { reviewModerationStatusValidator } from "../reviews/constants";
import { getPublicMediaUrl } from "../storage/publicUrl";
import { requireAdminUser } from "./access";

const onboardingStatusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
);
const verificationStatusValidator = v.union(
  v.literal("draft"),
  v.literal("pending"),
  v.literal("verified"),
  v.literal("rejected"),
);
const companyServiceValidator = v.union(
  v.literal("houseConstruction"),
  v.literal("renovation"),
  v.literal("structural"),
  v.literal("finishing"),
  v.literal("architecture"),
  v.literal("interior"),
  v.literal("electrical"),
  v.literal("plumbing"),
  v.literal("joinery"),
  v.literal("pool"),
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
const invitationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("declined"),
);

const companyListItemValidator = v.object({
  companyId: v.id("companies"),
  name: v.string(),
  legalName: v.union(v.string(), v.null()),
  city: v.union(v.string(), v.null()),
  verificationStatus: verificationStatusValidator,
  onboardingStatus: onboardingStatusValidator,
  services: v.array(companyServiceValidator),
  activeMemberCount: v.number(),
  reviewCount: v.number(),
  rating: v.union(v.number(), v.null()),
  latestActivityAt: v.number(),
});

const memberValidator = v.object({
  userId: v.id("users"),
  displayName: v.string(),
  role: v.union(v.literal("owner"), v.literal("staff")),
  status: v.literal("active"),
});

const portfolioPreviewValidator = v.object({
  projectId: v.id("portfolioProjects"),
  title: v.string(),
  city: v.string(),
  coverImageUrl: v.union(v.string(), v.null()),
});

const companySummaryValidator = v.object({
  companyId: v.id("companies"),
  name: v.string(),
  legalName: v.union(v.string(), v.null()),
  description: v.union(v.string(), v.null()),
  city: v.union(v.string(), v.null()),
  serviceAreas: v.array(v.string()),
  services: v.array(companyServiceValidator),
  verificationStatus: verificationStatusValidator,
  onboardingStatus: onboardingStatusValidator,
  createdAt: v.number(),
  logoUrl: v.union(v.string(), v.null()),
  publicProfileSlug: v.union(v.string(), v.null()),
  activeMemberCount: v.number(),
  membersTruncated: v.boolean(),
  members: v.array(memberValidator),
  reviewSummary: v.object({
    count: v.number(),
    rating: v.union(v.number(), v.null()),
  }),
  dealSummary: v.object({
    activeCount: v.number(),
    completedCount: v.number(),
    truncated: v.boolean(),
  }),
  commissionSummary: v.object({
    dueCount: v.number(),
    dueAmountMad: v.number(),
    truncated: v.boolean(),
  }),
  portfolio: v.array(portfolioPreviewValidator),
  portfolioHasMore: v.boolean(),
});

const companyProjectDealValidator = v.object({
  id: v.string(),
  companyId: v.id("companies"),
  projectId: v.id("projects"),
  projectTitle: v.string(),
  projectStatus: projectStatusValidator,
  source: v.union(v.literal("proposal"), v.literal("invitation")),
  initialQuoteStatus: v.union(initialQuoteStatusValidator, v.null()),
  invitationStatus: v.union(invitationStatusValidator, v.null()),
  dealId: v.union(v.id("deals"), v.null()),
  dealStatus: v.union(dealStatusValidator, v.null()),
  agreedAmountMad: v.union(v.number(), v.null()),
  commissionStatus: v.union(commissionStatusValidator, v.null()),
  createdAt: v.number(),
  selectedAt: v.union(v.number(), v.null()),
  completedAt: v.union(v.number(), v.null()),
});

const companyReviewValidator = v.object({
  reviewId: v.id("reviews"),
  dealId: v.id("deals"),
  projectId: v.id("projects"),
  projectTitle: v.string(),
  companyId: v.id("companies"),
  reviewerName: v.string(),
  rating: v.number(),
  comment: v.string(),
  moderationStatus: reviewModerationStatusValidator,
  createdAt: v.number(),
  moderatedAt: v.union(v.number(), v.null()),
});

function normalizeSearch(value: string | undefined) {
  return value
    ?.trim()
    .replace(/\s+/g, " ")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .slice(0, 100) ?? "";
}

function displayName(user: Doc<"users"> | null) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || "—";
}

async function listCompaniesPage(
  ctx: QueryCtx,
  args: {
    paginationOpts: typeof paginationOptsValidator.type;
    search?: string;
    verificationStatus?: typeof verificationStatusValidator.type;
    onboardingStatus?: typeof onboardingStatusValidator.type;
  },
) {
  const search = normalizeSearch(args.search);
  if (search) {
    if (args.onboardingStatus && args.verificationStatus) {
      return await ctx.db
        .query("companies")
        .withSearchIndex("search_directory", (q) =>
          q
            .search("directorySearchText", search)
            .eq("onboardingStatus", args.onboardingStatus!)
            .eq("verificationStatus", args.verificationStatus!),
        )
        .paginate(args.paginationOpts);
    }
    if (args.onboardingStatus) {
      return await ctx.db
        .query("companies")
        .withSearchIndex("search_directory", (q) =>
          q
            .search("directorySearchText", search)
            .eq("onboardingStatus", args.onboardingStatus!),
        )
        .paginate(args.paginationOpts);
    }
    if (args.verificationStatus) {
      return await ctx.db
        .query("companies")
        .withSearchIndex("search_directory", (q) =>
          q
            .search("directorySearchText", search)
            .eq("verificationStatus", args.verificationStatus!),
        )
        .paginate(args.paginationOpts);
    }
    return await ctx.db
      .query("companies")
      .withSearchIndex("search_directory", (q) =>
        q.search("directorySearchText", search),
      )
      .paginate(args.paginationOpts);
  }

  if (args.onboardingStatus && args.verificationStatus) {
    return await ctx.db
      .query("companies")
      .withIndex("by_onboardingStatus_and_verificationStatus", (q) =>
        q
          .eq("onboardingStatus", args.onboardingStatus!)
          .eq("verificationStatus", args.verificationStatus!),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  }
  if (args.onboardingStatus) {
    return await ctx.db
      .query("companies")
      .withIndex("by_onboardingStatus", (q) =>
        q.eq("onboardingStatus", args.onboardingStatus!),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  }
  if (args.verificationStatus) {
    return await ctx.db
      .query("companies")
      .withIndex("by_verificationStatus", (q) =>
        q.eq("verificationStatus", args.verificationStatus!),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  }
  return await ctx.db
    .query("companies")
    .withIndex("by_updatedAt")
    .order("desc")
    .paginate(args.paginationOpts);
}

export const listCompanies = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    verificationStatus: v.optional(verificationStatusValidator),
    onboardingStatus: v.optional(onboardingStatusValidator),
  },
  returns: paginationResultValidator(companyListItemValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const result = await listCompaniesPage(ctx, args);
    const page = await Promise.all(result.page.map(async (company) => {
      const [services, members, latestActivity] = await Promise.all([
        ctx.db
          .query("companyServices")
          .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
          .take(11),
        ctx.db
          .query("companyMembers")
          .withIndex("by_companyId_and_status", (q) =>
            q.eq("companyId", company._id).eq("status", "active"),
          )
          .take(51),
        ctx.db
          .query("marketplaceActivity")
          .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", company._id))
          .order("desc")
          .first(),
      ]);
      const reviewCount = company.reviewCount ?? 0;
      return {
        companyId: company._id,
        name: company.name ?? company.legalName ?? "—",
        legalName: company.legalName ?? null,
        city: company.city ?? null,
        verificationStatus: company.verificationStatus,
        onboardingStatus: company.onboardingStatus,
        services: services.map((row) => row.service),
        activeMemberCount: Math.min(members.length, 50),
        reviewCount,
        rating: reviewCount > 0 && company.reviewRatingTotal !== undefined
          ? company.reviewRatingTotal / reviewCount
          : null,
        latestActivityAt: latestActivity?.createdAt ?? company.updatedAt,
      };
    }));
    return { ...result, page };
  },
});

async function logoUrl(ctx: QueryCtx, company: Doc<"companies">) {
  if (company.logoMediaId) {
    const media = await ctx.db.get(company.logoMediaId);
    if (media && media.companyId === company._id && media.purpose === "companyLogo") {
      return getPublicMediaUrl(media.objectKey);
    }
  }
  return company.logoStorageId ? await ctx.storage.getUrl(company.logoStorageId) : null;
}

async function portfolioCoverUrl(ctx: QueryCtx, project: Doc<"portfolioProjects">) {
  if (project.coverMediaId) {
    const media = await ctx.db.get(project.coverMediaId);
    if (
      media &&
      media.companyId === project.companyId &&
      media.portfolioProjectId === project._id &&
      media.purpose === "portfolioCover"
    ) {
      return getPublicMediaUrl(media.objectKey);
    }
  }
  return project.coverImageStorageId
    ? await ctx.storage.getUrl(project.coverImageStorageId)
    : null;
}

export const getCompanySummary = query({
  args: { companyId: v.id("companies") },
  returns: v.union(v.null(), companySummaryValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const company = await ctx.db.get(args.companyId);
    if (!company) return null;

    const [services, activeMembers, portfolioRows, activeDeals, completedDeals, dueDeals, resolvedLogo] = await Promise.all([
      ctx.db.query("companyServices").withIndex("by_companyId", (q) => q.eq("companyId", company._id)).take(11),
      ctx.db.query("companyMembers").withIndex("by_companyId_and_status", (q) => q.eq("companyId", company._id).eq("status", "active")).take(51),
      ctx.db.query("portfolioProjects").withIndex("by_companyId_and_status", (q) => q.eq("companyId", company._id).eq("status", "published")).order("desc").take(4),
      ctx.db.query("deals").withIndex("by_companyId_and_status", (q) => q.eq("companyId", company._id).eq("status", "active")).take(101),
      ctx.db.query("deals").withIndex("by_companyId_and_status", (q) => q.eq("companyId", company._id).eq("status", "completed")).take(101),
      ctx.db.query("deals").withIndex("by_companyId_and_commissionStatus", (q) => q.eq("companyId", company._id).eq("commissionStatus", "due")).take(101),
      logoUrl(ctx, company),
    ]);
    const members = await Promise.all(activeMembers.slice(0, 5).map(async (member) => ({
      userId: member.userId,
      displayName: displayName(await ctx.db.get(member.userId)),
      role: member.role,
      status: "active" as const,
    })));
    const portfolio = await Promise.all(portfolioRows.slice(0, 3).map(async (project) => ({
      projectId: project._id,
      title: project.title,
      city: project.city,
      coverImageUrl: await portfolioCoverUrl(ctx, project),
    })));
    const reviewCount = company.reviewCount ?? 0;
    return {
      companyId: company._id,
      name: company.name ?? company.legalName ?? "—",
      legalName: company.legalName ?? null,
      description: company.description ?? null,
      city: company.city ?? null,
      serviceAreas: company.serviceAreas ?? [],
      services: services.map((row) => row.service),
      verificationStatus: company.verificationStatus,
      onboardingStatus: company.onboardingStatus,
      createdAt: company.createdAt,
      logoUrl: resolvedLogo,
      publicProfileSlug:
        company.onboardingStatus === "completed" &&
        company.slug && company.name && company.city && company.description
          ? company.slug
          : null,
      activeMemberCount: Math.min(activeMembers.length, 50),
      membersTruncated: activeMembers.length > 50,
      members,
      reviewSummary: {
        count: reviewCount,
        rating: reviewCount > 0 && company.reviewRatingTotal !== undefined
          ? company.reviewRatingTotal / reviewCount
          : null,
      },
      dealSummary: {
        activeCount: Math.min(activeDeals.length, 100),
        completedCount: Math.min(completedDeals.length, 100),
        truncated: activeDeals.length > 100 || completedDeals.length > 100,
      },
      commissionSummary: {
        dueCount: Math.min(dueDeals.length, 100),
        dueAmountMad: dueDeals.slice(0, 100).reduce((sum, deal) => sum + deal.commissionAmountMad, 0),
        truncated: dueDeals.length > 100,
      },
      portfolio,
      portfolioHasMore: portfolioRows.length > 3,
    };
  },
});

type SourceCursor = {
  beforeAt: number | null;
  beforeCreationTime: number | null;
  beforeId: string | null;
  done: boolean;
};
type ProjectCursor = { version: 1; quotes: SourceCursor; invitations: SourceCursor };
const EMPTY_SOURCE_CURSOR: SourceCursor = {
  beforeAt: null,
  beforeCreationTime: null,
  beforeId: null,
  done: false,
};
const MAX_PROJECT_PAGE_SIZE = 30;

function decodeProjectCursor(value: string | null): ProjectCursor {
  if (value === null) {
    return {
      version: 1,
      quotes: { ...EMPTY_SOURCE_CURSOR },
      invitations: { ...EMPTY_SOURCE_CURSOR },
    };
  }
  try {
    const parsed = JSON.parse(value) as Partial<ProjectCursor>;
    const valid = (cursor: SourceCursor | undefined) => Boolean(
      cursor &&
      (cursor.beforeAt === null || typeof cursor.beforeAt === "number") &&
      (cursor.beforeCreationTime === null || typeof cursor.beforeCreationTime === "number") &&
      (cursor.beforeId === null || typeof cursor.beforeId === "string") &&
      typeof cursor.done === "boolean",
    );
    if (parsed.version !== 1 || !valid(parsed.quotes) || !valid(parsed.invitations)) {
      throw new Error("invalid cursor");
    }
    return parsed as ProjectCursor;
  } catch {
    throw new ConvexError("INVALID_ADMIN_COMPANY_PROJECT_CURSOR");
  }
}

async function loadQuoteBatch(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  cursor: SourceCursor,
  batchSize: number,
) {
  if (cursor.done) return [];
  if (cursor.beforeAt === null) {
    return await ctx.db.query("projectQuotes")
      .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", companyId))
      .order("desc").take(batchSize);
  }
  const same = await ctx.db.query("projectQuotes")
    .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", companyId).eq("createdAt", cursor.beforeAt!).lt("_creationTime", cursor.beforeCreationTime!))
    .order("desc").take(batchSize);
  if (same.length >= batchSize) return same;
  const older = await ctx.db.query("projectQuotes")
    .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", companyId).lt("createdAt", cursor.beforeAt!))
    .order("desc").take(batchSize - same.length);
  return [...same, ...older];
}

async function loadInvitationBatch(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  cursor: SourceCursor,
  batchSize: number,
) {
  if (cursor.done) return [];
  if (cursor.beforeAt === null) {
    return await ctx.db.query("invitations")
      .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", companyId))
      .order("desc").take(batchSize);
  }
  const same = await ctx.db.query("invitations")
    .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", companyId).eq("createdAt", cursor.beforeAt!).lt("_creationTime", cursor.beforeCreationTime!))
    .order("desc").take(batchSize);
  if (same.length >= batchSize) return same;
  const older = await ctx.db.query("invitations")
    .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", companyId).lt("createdAt", cursor.beforeAt!))
    .order("desc").take(batchSize - same.length);
  return [...same, ...older];
}

type ProjectCandidate =
  | { kind: "quote"; row: Doc<"projectQuotes">; rawIndex: number }
  | { kind: "invitation"; row: Doc<"invitations">; rawIndex: number };

function compareProjectCandidates(left: ProjectCandidate, right: ProjectCandidate) {
  return right.row.createdAt - left.row.createdAt ||
    right.row._creationTime - left.row._creationTime ||
    (left.kind === right.kind ? 0 : left.kind === "quote" ? -1 : 1) ||
    left.row._id.localeCompare(right.row._id);
}

function nextSourceCursor<T extends { _id: string; _creationTime: number; createdAt: number }>(
  current: SourceCursor,
  rows: T[],
  selectedRawIndices: number[],
  consumeWholeBatch: boolean,
  batchSize: number,
): SourceCursor {
  if (current.done) return current;
  if (rows.length === 0 && consumeWholeBatch) return { ...current, done: true };
  const consumedThrough = consumeWholeBatch
    ? rows.length
    : selectedRawIndices.length > 0
      ? Math.max(...selectedRawIndices) + 1
      : 0;
  if (consumedThrough === 0) return current;
  const row = rows[consumedThrough - 1];
  return {
    beforeAt: row.createdAt,
    beforeCreationTime: row._creationTime,
    beforeId: row._id,
    done: consumedThrough === rows.length && rows.length < batchSize,
  };
}

export const listCompanyProjectsDeals = query({
  args: { companyId: v.id("companies"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(companyProjectDealValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
    if (!Number.isFinite(args.paginationOpts.numItems)) {
      throw new ConvexError("INVALID_ADMIN_COMPANY_PROJECT_PAGE_SIZE");
    }
    const pageSize = Math.min(MAX_PROJECT_PAGE_SIZE, Math.max(1, Math.floor(args.paginationOpts.numItems)));
    const batchSize = pageSize * 2;
    const cursor = decodeProjectCursor(args.paginationOpts.cursor);
    const [quotes, invitations] = await Promise.all([
      loadQuoteBatch(ctx, args.companyId, cursor.quotes, batchSize),
      loadInvitationBatch(ctx, args.companyId, cursor.invitations, batchSize),
    ]);
    const invitationHasQuote = await Promise.all(invitations.map(async (invitation) =>
      await ctx.db.query("projectQuotes")
        .withIndex("by_projectId_and_companyId", (q) =>
          q.eq("projectId", invitation.projectId).eq("companyId", args.companyId),
        )
        .first() !== null,
    ));
    const candidates: ProjectCandidate[] = [
      ...quotes.map((row, rawIndex) => ({ kind: "quote" as const, row, rawIndex })),
      ...invitations.flatMap((row, rawIndex) => invitationHasQuote[rawIndex]
        ? []
        : [{ kind: "invitation" as const, row, rawIndex }]),
    ];
    const selected = candidates.sort(compareProjectCandidates).slice(0, pageSize);
    const consumeWholeBatch = selected.length < pageSize;
    const nextCursor: ProjectCursor = {
      version: 1,
      quotes: nextSourceCursor(
        cursor.quotes,
        quotes,
        selected.filter((item) => item.kind === "quote").map((item) => item.rawIndex),
        consumeWholeBatch,
        batchSize,
      ),
      invitations: nextSourceCursor(
        cursor.invitations,
        invitations,
        selected.filter((item) => item.kind === "invitation").map((item) => item.rawIndex),
        consumeWholeBatch,
        batchSize,
      ),
    };
    const hydrated = await Promise.all(selected.map(async (candidate) => {
      const [project, deal, invitation] = await Promise.all([
        ctx.db.get(candidate.row.projectId),
        ctx.db.query("deals").withIndex("by_projectId", (q) => q.eq("projectId", candidate.row.projectId)).unique(),
        candidate.kind === "quote"
          ? ctx.db.query("invitations").withIndex("by_projectId_and_companyId", (q) => q.eq("projectId", candidate.row.projectId).eq("companyId", args.companyId)).first()
          : Promise.resolve(candidate.row),
      ]);
      if (!project || (deal && deal.companyId !== args.companyId)) return null;
      return {
        id: `${candidate.kind}:${candidate.row._id}`,
        companyId: args.companyId,
        projectId: project._id,
        projectTitle: project.title ?? "—",
        projectStatus: project.status,
        source: invitation ? "invitation" as const : "proposal" as const,
        initialQuoteStatus: candidate.kind === "quote" ? candidate.row.status : null,
        invitationStatus: invitation?.status ?? null,
        dealId: deal?._id ?? null,
        dealStatus: deal?.status ?? null,
        agreedAmountMad: deal?.agreedAmountMad ?? null,
        commissionStatus: deal?.commissionStatus ?? null,
        createdAt: candidate.row.createdAt,
        selectedAt: project.selectedAt ?? null,
        completedAt: deal?.completedAt ?? null,
      };
    }));
    const page = hydrated.filter((item): item is NonNullable<typeof item> => item !== null);
    return {
      page,
      isDone: nextCursor.quotes.done && nextCursor.invitations.done,
      continueCursor: JSON.stringify(nextCursor),
    };
  },
});

export const listCompanyReviews = query({
  args: { companyId: v.id("companies"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(companyReviewValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new ConvexError("COMPANY_NOT_FOUND");
    const result = await ctx.db.query("reviews")
      .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = (await Promise.all(result.page.map(async (review) => {
      const [project, client] = await Promise.all([
        ctx.db.get(review.projectId),
        ctx.db.get(review.clientUserId),
      ]);
      if (!project || !client) return null;
      return {
        reviewId: review._id,
        dealId: review.dealId,
        projectId: review.projectId,
        projectTitle: project.title ?? "—",
        companyId: review.companyId,
        reviewerName: displayName(client),
        rating: review.rating,
        comment: review.comment,
        moderationStatus: review.moderationStatus,
        createdAt: review.createdAt,
        moderatedAt: review.moderatedAt ?? null,
      };
    }))).filter((row): row is NonNullable<typeof row> => row !== null);
    return { ...result, page };
  },
});
