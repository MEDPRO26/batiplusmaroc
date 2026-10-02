import { getNonVerificationStorageUrl } from "../storage/verificationPrivacy";
import {
  paginationOptsValidator,
  paginationResultValidator,
  type FilterBuilder,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import {
  companyOperationalStatusValidator,
  getCompanyOperationalStatus,
} from "../companies/operationalStatus";
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
const companyServiceValidator = v.string();
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
const MAX_COMPANY_PAGE_SIZE = 50;
const MAX_REVIEW_PAGE_SIZE = 30;

function requireBoundedPageSize(numItems: number, max: number, code: string) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > max) {
    throw new ConvexError(code);
  }
}

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
  operationalStatus: companyOperationalStatusValidator,
});

const operationalFilterValidator = companyOperationalStatusValidator;

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

function matchesOperationalStatus(
  q: FilterBuilder<DataModel["companies"]>,
  selectedStatus: typeof operationalFilterValidator.type,
) {
  const status = q.field("operationalStatus");
  return selectedStatus === "normal"
    ? q.or(q.eq(status, "normal"), q.eq(status, undefined))
    : q.eq(status, selectedStatus);
}

async function listCompaniesPage(
  ctx: QueryCtx,
  args: {
    paginationOpts: typeof paginationOptsValidator.type;
    search?: string;
    verificationStatus?: typeof verificationStatusValidator.type;
    onboardingStatus?: typeof onboardingStatusValidator.type;
    operationalStatus?: typeof operationalFilterValidator.type;
  },
) {
  const search = normalizeSearch(args.search);
  if (args.operationalStatus) {
    const operationalStatus = args.operationalStatus;
    if (search) {
      const searchQuery = ctx.db
        .query("companies")
        .withSearchIndex("search_directory_v2", (q) => {
          let filtered = q.search("directorySearchText", search);
          if (args.verificationStatus) filtered = filtered.eq("verificationStatus", args.verificationStatus);
          if (args.onboardingStatus) filtered = filtered.eq("onboardingStatus", args.onboardingStatus);
          if (operationalStatus !== "normal") filtered = filtered.eq("operationalStatus", operationalStatus);
          return filtered;
        });
      return operationalStatus === "normal"
        ? await searchQuery.filter((q) => matchesOperationalStatus(q, operationalStatus)).paginate(args.paginationOpts)
        : await searchQuery.paginate(args.paginationOpts);
    }
    if (operationalStatus !== "normal") {
      return await ctx.db.query("companies")
        .withIndex("by_operationalStatus", (q) => q.eq("operationalStatus", operationalStatus))
        .filter((q) => q.and(
          q.eq(q.field("operationalStatus"), operationalStatus),
          ...(args.onboardingStatus ? [q.eq(q.field("onboardingStatus"), args.onboardingStatus)] : []),
          ...(args.verificationStatus ? [q.eq(q.field("verificationStatus"), args.verificationStatus)] : []),
        ))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    if (args.onboardingStatus && args.verificationStatus) {
      return await ctx.db
        .query("companies")
        .withIndex("by_onboardingStatus_and_verificationStatus", (q) => q
          .eq("onboardingStatus", args.onboardingStatus!)
          .eq("verificationStatus", args.verificationStatus!))
        .filter((q) => matchesOperationalStatus(q, operationalStatus))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    if (args.onboardingStatus) {
      return await ctx.db
        .query("companies")
        .withIndex("by_onboardingStatus", (q) => q.eq("onboardingStatus", args.onboardingStatus!))
        .filter((q) => matchesOperationalStatus(q, operationalStatus))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    if (args.verificationStatus) {
      return await ctx.db
        .query("companies")
        .withIndex("by_verificationStatus", (q) => q.eq("verificationStatus", args.verificationStatus!))
        .filter((q) => matchesOperationalStatus(q, operationalStatus))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return await ctx.db
      .query("companies")
      .filter((q) => matchesOperationalStatus(q, operationalStatus))
      .order("desc")
      .paginate(args.paginationOpts);
  }
  if (search) {
    return await ctx.db
      .query("companies")
      .withSearchIndex("search_directory_v2", (q) => {
        let filtered = q.search("directorySearchText", search);
        if (args.onboardingStatus) filtered = filtered.eq("onboardingStatus", args.onboardingStatus);
        if (args.verificationStatus) filtered = filtered.eq("verificationStatus", args.verificationStatus);
        return filtered;
      })
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
    operationalStatus: v.optional(operationalFilterValidator),
  },
  returns: paginationResultValidator(companyListItemValidator),
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    requireBoundedPageSize(
      args.paginationOpts.numItems,
      MAX_COMPANY_PAGE_SIZE,
      "INVALID_ADMIN_COMPANY_PAGE_SIZE",
    );
    const result = await listCompaniesPage(ctx, args);
    const page = await Promise.all(result.page.map(async (company) => {
      const [services, members, latestMarketplaceActivity] = await Promise.all([
        ctx.db
          .query("companyServices")
          .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
          .take(200),
        ctx.db
          .query("companyMembers")
          .withIndex("by_companyId_and_status", (q) =>
            q.eq("companyId", company._id).eq("status", "active"),
          )
          .take(51),
        ctx.db.query("marketplaceActivity")
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
        latestActivityAt: Math.max(company.updatedAt, latestMarketplaceActivity?.createdAt ?? 0),
        operationalStatus: getCompanyOperationalStatus(company),
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
  return company.logoStorageId ? await getNonVerificationStorageUrl(ctx, company.logoStorageId) : null;
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
    ? await getNonVerificationStorageUrl(ctx, project.coverImageStorageId)
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
      ctx.db.query("companyServices").withIndex("by_companyId", (q) => q.eq("companyId", company._id)).take(200),
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
type LegacyProjectCursor = {
  version: 1;
  quotes: SourceCursor;
  invitations: SourceCursor;
};
type ProjectCursor = {
  version: 2;
  quotes: SourceCursor;
  invitations: SourceCursor;
  pendingInvitationIds: string[];
};
const EMPTY_SOURCE_CURSOR: SourceCursor = {
  beforeAt: null,
  beforeCreationTime: null,
  beforeId: null,
  done: false,
};
const MAX_PROJECT_PAGE_SIZE = 30;
const MIN_INVITATION_SCAN_BATCH_SIZE = 30;
const MAX_INVITATION_SCAN_ROWS = 120;

function decodeProjectCursor(value: string | null): ProjectCursor {
  if (value === null) {
    return {
      version: 2,
      quotes: { ...EMPTY_SOURCE_CURSOR },
      invitations: { ...EMPTY_SOURCE_CURSOR },
      pendingInvitationIds: [],
    };
  }
  try {
    const parsed = JSON.parse(value) as Partial<ProjectCursor | LegacyProjectCursor>;
    const valid = (cursor: SourceCursor | undefined) => Boolean(
      cursor &&
      (cursor.beforeAt === null || typeof cursor.beforeAt === "number") &&
      (cursor.beforeCreationTime === null || typeof cursor.beforeCreationTime === "number") &&
      (cursor.beforeId === null || typeof cursor.beforeId === "string") &&
      typeof cursor.done === "boolean",
    );
    if (parsed.version === 1 && valid(parsed.quotes) && valid(parsed.invitations)) {
      return {
        version: 2,
        quotes: parsed.quotes!,
        invitations: parsed.invitations!,
        pendingInvitationIds: [],
      };
    }
    if (
      parsed.version === 2 &&
      valid(parsed.quotes) &&
      valid(parsed.invitations) &&
      Array.isArray(parsed.pendingInvitationIds) &&
      parsed.pendingInvitationIds.length <= MAX_INVITATION_SCAN_ROWS &&
      parsed.pendingInvitationIds.every((id) => typeof id === "string") &&
      new Set(parsed.pendingInvitationIds).size === parsed.pendingInvitationIds.length
    ) {
      return parsed as ProjectCursor;
    }
    throw new Error("invalid cursor");
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
  const sameTimestamp = await ctx.db.query("projectQuotes")
    .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", companyId).eq("createdAt", cursor.beforeAt!).lt("_creationTime", cursor.beforeCreationTime!))
    .order("desc").take(batchSize);
  if (sameTimestamp.length >= batchSize) return sameTimestamp;
  const older = await ctx.db.query("projectQuotes")
    .withIndex("by_companyId_and_createdAt", (q) => q.eq("companyId", companyId).lt("createdAt", cursor.beforeAt!))
    .order("desc").take(batchSize - sameTimestamp.length);
  return [...sameTimestamp, ...older];
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

type InvitationWindow = {
  rows: Doc<"invitations">[];
  rawCursor: SourceCursor;
  frontierUnknown: boolean;
  frontierRow: Doc<"invitations"> | null;
};

function cursorAfterRow(
  current: SourceCursor,
  row: { _id: string; _creationTime: number; createdAt: number },
  done: boolean,
): SourceCursor {
  return {
    beforeAt: row.createdAt,
    beforeCreationTime: row._creationTime,
    beforeId: row._id,
    done: current.done || done,
  };
}

/**
 * Scan past quote-backed invitations until enough eligible rows are visible to
 * establish a page boundary, the source ends, or the bounded safety limit is
 * reached. The raw cursor advances past every scanned row, while eligible rows
 * not selected on this page are retained by ID in the bounded public cursor.
 */
async function loadInvitationWindow(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  cursor: SourceCursor,
  pendingInvitationIds: string[],
  batchSize: number,
  targetEligibleRows: number,
): Promise<InvitationWindow> {
  const normalizedPendingIds = pendingInvitationIds.map((rawId) => {
    const invitationId = ctx.db.normalizeId("invitations", rawId);
    if (invitationId === null) {
      throw new ConvexError("INVALID_ADMIN_COMPANY_PROJECT_CURSOR");
    }
    return invitationId;
  });
  const pendingRows = await Promise.all(normalizedPendingIds.map((id) => ctx.db.get(id)));
  if (pendingRows.some((row) => row !== null && row.companyId !== companyId)) {
    throw new ConvexError("INVALID_ADMIN_COMPANY_PROJECT_CURSOR");
  }
  const pendingQuoteBacked = await Promise.all(pendingRows.map(async (invitation) =>
    invitation === null
      ? true
      : await ctx.db.query("projectQuotes")
        .withIndex("by_projectId_and_companyId", (q) =>
          q.eq("projectId", invitation.projectId).eq("companyId", companyId),
        )
        .first() !== null,
  ));
  const rows = pendingRows
    .flatMap((row, index) => row !== null && !pendingQuoteBacked[index] ? [row] : [])
    .sort((left, right) => right.createdAt - left.createdAt
      || right._creationTime - left._creationTime
      || left._id.localeCompare(right._id));
  let scanCursor = cursor;
  let scannedRows = 0;
  let frontierRow: Doc<"invitations"> | null = null;

  while (scannedRows < MAX_INVITATION_SCAN_ROWS && rows.length < targetEligibleRows) {
    const requestSize = Math.min(
      Math.max(batchSize, MIN_INVITATION_SCAN_BATCH_SIZE),
      MAX_INVITATION_SCAN_ROWS - scannedRows,
    );
    const batch = await loadInvitationBatch(ctx, companyId, scanCursor, requestSize);
    if (batch.length === 0) {
      return {
        rows,
        rawCursor: { ...scanCursor, done: true },
        frontierUnknown: false,
        frontierRow: null,
      };
    }
    const batchQuoteBacked = await Promise.all(batch.map(async (invitation) =>
      await ctx.db.query("projectQuotes")
        .withIndex("by_projectId_and_companyId", (q) =>
          q.eq("projectId", invitation.projectId).eq("companyId", companyId),
        )
        .first() !== null,
    ));
    scannedRows += batch.length;
    rows.push(...batch.flatMap((row, index) => batchQuoteBacked[index] ? [] : [row]));
    frontierRow = batch.at(-1)!;
    scanCursor = cursorAfterRow(
      scanCursor,
      batch.at(-1)!,
      batch.length < requestSize,
    );

    if (batch.length < requestSize) {
      return {
        rows,
        rawCursor: scanCursor,
        frontierUnknown: false,
        frontierRow: null,
      };
    }
  }

  const frontierUnknown = !scanCursor.done && rows.length < targetEligibleRows;
  return {
    rows,
    rawCursor: scanCursor,
    frontierUnknown,
    frontierRow: frontierUnknown ? frontierRow : null,
  };
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

function nextQuoteCursor(
  current: SourceCursor,
  rows: Doc<"projectQuotes">[],
  selectedRawIndices: number[],
  batchSize: number,
): SourceCursor {
  if (current.done) return current;
  if (rows.length === 0) return { ...current, done: true };
  const consumedThrough = selectedRawIndices.length > 0
    ? Math.max(...selectedRawIndices) + 1
    : 0;
  if (consumedThrough === 0) return current;
  return cursorAfterRow(
    current,
    rows[consumedThrough - 1],
    consumedThrough === rows.length && rows.length < batchSize,
  );
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
    const [quotes, invitationWindow] = await Promise.all([
      loadQuoteBatch(ctx, args.companyId, cursor.quotes, batchSize),
      loadInvitationWindow(
        ctx,
        args.companyId,
        cursor.invitations,
        cursor.pendingInvitationIds,
        batchSize,
        pageSize,
      ),
    ]);
    const invitations = invitationWindow.rows;
    const candidates: ProjectCandidate[] = [
      ...quotes.map((row, rawIndex) => ({ kind: "quote" as const, row, rawIndex })),
      ...invitations.map((row, rawIndex) => ({
        kind: "invitation" as const,
        row,
        rawIndex,
      })),
    ];
    const invitationFrontier = invitationWindow.frontierUnknown
      ? ({
          kind: "invitation" as const,
          row: invitationWindow.frontierRow!,
          rawIndex: -1,
        })
      : null;
    // If the bounded invitation scan ends before exposing enough eligible
    // rows, only emit candidates known to be newer than its raw frontier.
    // This prevents older quotes from overtaking an unseen invitation.
    const safeCandidates = invitationFrontier === null
      ? candidates
      : candidates.filter((candidate) =>
          compareProjectCandidates(candidate, invitationFrontier) <= 0,
        );
    const selected = safeCandidates.sort(compareProjectCandidates).slice(0, pageSize);
    const selectedInvitationIds = new Set(selected.flatMap((item) =>
      item.kind === "invitation" ? [item.row._id] : [],
    ));
    const pendingInvitationIds = invitations
      .filter((invitation) => !selectedInvitationIds.has(invitation._id))
      .map((invitation) => invitation._id);
    const nextCursor: ProjectCursor = {
      version: 2,
      quotes: nextQuoteCursor(
        cursor.quotes,
        quotes,
        selected.filter((item) => item.kind === "quote").map((item) => item.rawIndex),
        batchSize,
      ),
      invitations: invitationWindow.rawCursor,
      pendingInvitationIds,
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
      isDone:
        nextCursor.quotes.done &&
        nextCursor.invitations.done &&
        nextCursor.pendingInvitationIds.length === 0,
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
    requireBoundedPageSize(
      args.paginationOpts.numItems,
      MAX_REVIEW_PAGE_SIZE,
      "INVALID_ADMIN_COMPANY_REVIEW_PAGE_SIZE",
    );
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
