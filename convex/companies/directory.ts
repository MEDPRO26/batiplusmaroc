import { resolveApprovedCoverUrl } from "../companyCovers/model";
import { resolveApprovedPortfolioImageUrl } from "../portfolioImages/model";
import { resolveApprovedLogoUrl } from "../companyLogos/model";
import {
  paginationOptsValidator,
  paginationResultValidator,
  type FilterBuilder,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internalMutation, query } from "../_generated/server";
import { resolvedServiceNames } from "../serviceCatalog";
import { getCompanyOperationalStatus } from "./operationalStatus";
import { maskCompanyName, maskPublicCompanyText } from "../lib/companyName";

export const companyServices = [
  "houseConstruction",
  "renovation",
  "structural",
  "finishing",
  "architecture",
  "interior",
  "electrical",
  "plumbing",
  "joinery",
  "pool",
] as const;

const companyServiceValidator = v.string();

const companyServiceAreaValidator = v.union(
  v.literal("agadir"),
  v.literal("casablanca"),
  v.literal("fes"),
  v.literal("marrakech"),
  v.literal("meknes"),
  v.literal("oujda"),
  v.literal("rabat"),
  v.literal("sale"),
  v.literal("tangier"),
  v.literal("tetouan"),
);

type CompanyService = string;

const serviceSearchTerms = new Map<string, string>(Object.entries({
  houseConstruction: "servicehouseconstruction house construction construction maison",
  renovation: "servicerenovation renovation rénovation",
  structural: "servicestructural structural work gros oeuvre gros œuvre",
  finishing: "servicefinishing finishing work second oeuvre second œuvre",
  architecture: "servicearchitecture architecture architecte",
  interior: "serviceinterior interior design aménagement intérieur amenagement interieur",
  electrical: "serviceelectrical electrical electricité électricité electricite",
  plumbing: "serviceplumbing plumbing plomberie",
  joinery: "servicejoinery joinery menuiserie",
  pool: "servicepool pool pools piscine piscines",
}));

const portfolioPreviewValidator = v.object({
  title: v.string(),
  url: v.string(),
});

const publicCompanyResultValidator = v.object({
  id: v.id("companies"),
  slug: v.string(),
  name: v.string(),
  description: v.string(),
  city: v.string(),
  isVerified: v.boolean(),
  yearsExperience: v.union(v.number(), v.null()),
  services: v.array(companyServiceValidator),
  serviceNames: v.array(v.object({ slug: v.string(), nameFr: v.string(), nameEn: v.string() })),
  serviceAreas: v.array(companyServiceAreaValidator),
  logoUrl: v.union(v.string(), v.null()),
  coverImageUrl: v.union(v.string(), v.null()),
  portfolio: v.array(portfolioPreviewValidator),
  rating: v.union(v.number(), v.null()),
  reviewCount: v.number(),
});

export function buildCompanyDirectorySearchText(args: {
  name: string;
  city: string;
  services: readonly CompanyService[];
  serviceAreas?: readonly string[];
}) {
  return [
    args.name,
    args.city,
    ...(args.serviceAreas ?? []),
    ...args.services.map((service) => serviceSearchTerms.get(service) ?? service),
  ]
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();
}

function normalizedSearch(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").normalize("NFKC").toLowerCase().slice(0, 100) ?? "";
}

function serviceFilterSearchTerm(slug: CompanyService | undefined) {
  if (!slug) return "";
  // Retain the tokens already indexed for the ten legacy services. Dynamic
  // catalog services are indexed by their actual slug, without a prefix.
  return serviceSearchTerms.get(slug)?.split(" ")[0] ?? normalizedSearch(slug);
}

type ServiceFilter = { slug: string; id?: Id<"serviceCatalog"> };

type DirectoryCursorMode = "legacy" | "exact" | "previous";
const DIRECTORY_CURSOR_PREFIX = "directory-v2:";

function decodeDirectoryCursor(cursor: string | null): {
  mode: DirectoryCursorMode | null;
  nativeCursor: string | null;
  wrapped: boolean;
} {
  if (cursor === null) return { mode: null, nativeCursor: null, wrapped: false };
  if (!cursor.startsWith(DIRECTORY_CURSOR_PREFIX)) {
    return { mode: "previous", nativeCursor: cursor, wrapped: false };
  }
  try {
    const parsed = JSON.parse(cursor.slice(DIRECTORY_CURSOR_PREFIX.length)) as {
      mode?: DirectoryCursorMode;
      cursor?: unknown;
    };
    if (
      (parsed.mode === "legacy" || parsed.mode === "exact" || parsed.mode === "previous")
      && typeof parsed.cursor === "string"
    ) {
      return { mode: parsed.mode, nativeCursor: parsed.cursor, wrapped: true };
    }
  } catch {
    // Keep the public error independent of Convex's opaque cursor format.
  }
  throw new ConvexError("INVALID_COMPANY_DIRECTORY_CURSOR");
}

function encodeDirectoryCursor(mode: DirectoryCursorMode, nativeCursor: string) {
  return `${DIRECTORY_CURSOR_PREFIX}${JSON.stringify({ mode, cursor: nativeCursor })}`;
}

function matchesPublicDirectoryEligibility(q: FilterBuilder<DataModel["companies"]>) {
  return q.and(
    q.neq(q.field("operationalStatus"), "suspended"),
    q.neq(q.field("directoryListed"), false),
    q.neq(q.field("slug"), undefined),
    q.neq(q.field("slug"), ""),
    q.neq(q.field("name"), undefined),
    q.neq(q.field("name"), ""),
    q.neq(q.field("city"), undefined),
    q.neq(q.field("city"), ""),
    q.neq(q.field("description"), undefined),
    q.neq(q.field("description"), ""),
  );
}

async function toPublicCompanyResult(ctx: QueryCtx, company: Doc<"companies">, serviceFilter?: ServiceFilter) {
  const names = [company.name, company.legalName];
  if (
    getCompanyOperationalStatus(company) === "suspended" ||
    company.onboardingStatus !== "completed" ||
    !company.slug ||
    !company.name ||
    !company.city ||
    !company.description
  ) {
    return null;
  }

  const [serviceRows, projects, logoUrl, companyCoverUrl] = await Promise.all([
    ctx.db
      .query("companyServices")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .take(200),
    ctx.db
      .query("portfolioProjects")
      .withIndex("by_companyId_and_status", (q) =>
        q.eq("companyId", company._id).eq("status", "published"),
      )
      .order("desc")
      .take(3),
    resolveApprovedLogoUrl(ctx, company),
    resolveApprovedCoverUrl(ctx, company),
  ]);
  if (serviceFilter && !serviceRows.some(row => row.serviceId
    ? row.serviceId === serviceFilter.id
    : row.service === serviceFilter.slug)) {
    return null;
  }
  const serviceNames = await resolvedServiceNames(ctx, serviceRows);

  const portfolio = (
    await Promise.all(
      projects.map(async (project) => {
        const url = await resolveApprovedPortfolioImageUrl(ctx, project);
        return url ? { title: maskPublicCompanyText(project.title, names), url } : null;
      }),
    )
  ).filter((item): item is { title: string; url: string } => item !== null);

  return {
    id: company._id,
    slug: company.slug,
    name: maskCompanyName(company.name),
    description: maskPublicCompanyText(company.description, names),
    city: company.city,
    isVerified: company.verificationStatus === "verified",
    yearsExperience: company.yearsExperience ?? null,
    services: serviceRows.map((row) => row.service),
    serviceNames,
    serviceAreas: company.serviceAreas ?? [],
    logoUrl,
    coverImageUrl: companyCoverUrl,
    portfolio,
    rating: company.reviewCount && company.reviewRatingTotal !== undefined
      ? company.reviewRatingTotal / company.reviewCount
      : null,
    reviewCount: company.reviewCount ?? 0,
  };
}

export const listPublicCompanies = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    city: v.optional(v.string()),
    service: v.optional(companyServiceValidator),
    verifiedOnly: v.boolean(),
    sort: v.union(v.literal("relevance"), v.literal("newest"), v.literal("oldest")),
  },
  returns: paginationResultValidator(publicCompanyResultValidator),
  handler: async (ctx, args) => {
    const decodedCursor = decodeDirectoryCursor(args.paginationOpts.cursor);
    const decodedEndCursor = args.paginationOpts.endCursor === undefined
      ? null
      : decodeDirectoryCursor(args.paginationOpts.endCursor);
    if (
      decodedCursor.wrapped && decodedEndCursor?.wrapped &&
      decodedCursor.mode !== decodedEndCursor.mode
    ) {
      throw new ConvexError("INVALID_COMPANY_DIRECTORY_CURSOR");
    }
    // A raw cursor with a wrapped companion can be an in-flight split from the
    // earlier response format. Otherwise raw cursors belong to Phase 1.
    let mode: DirectoryCursorMode | null = decodedCursor.wrapped
      ? decodedCursor.mode
      : decodedEndCursor?.wrapped
        ? decodedEndCursor.mode
        : decodedCursor.nativeCursor !== null || (decodedEndCursor !== null && decodedEndCursor.nativeCursor !== null)
          ? "previous"
          : null;
    // Legacy Companies can have no materialized eligibility. Keep them in the
    // ordered source until the operational-status backfill has covered all rows.
    if (mode === null) {
      const hasLegacyEligibility = await ctx.db.query("companies")
        .withIndex("by_directoryListed", (q) => q.eq("directoryListed", undefined))
        .first() !== null;
      mode = hasLegacyEligibility ? "legacy" : "exact";
    }
    // Preserve every native pagination option while unwrapping both boundaries.
    const paginationOpts = decodedEndCursor === null
      ? { ...args.paginationOpts, cursor: decodedCursor.nativeCursor }
      : {
          ...args.paginationOpts,
          cursor: decodedCursor.nativeCursor,
          endCursor: decodedEndCursor.nativeCursor!,
        };
    const serviceSlug = args.service || undefined;
    const serviceFilter = serviceSlug === undefined ? undefined : {
      slug: serviceSlug,
      id: (await ctx.db.query("serviceCatalog").withIndex("by_slug", q => q.eq("slug", serviceSlug)).unique())?._id,
    };
    const terms = [
      normalizedSearch(args.search),
      normalizedSearch(args.city),
      serviceFilterSearchTerm(serviceSlug),
    ].filter(Boolean);

    const page = terms.length > 0
      ? mode === "previous"
        ? await ctx.db
          .query("companies")
          .withSearchIndex("search_directory", (q) => {
            let search = q.search("directorySearchText", terms.join(" ")).eq("onboardingStatus", "completed");
            if (args.verifiedOnly) search = search.eq("verificationStatus", "verified");
            return search;
          })
          .filter(matchesPublicDirectoryEligibility)
          .paginate(paginationOpts)
        : await ctx.db
          .query("companies")
          .withSearchIndex("search_directory_v2", (q) => {
            let search = q
              .search("directorySearchText", terms.join(" "))
              .eq("onboardingStatus", "completed");
            if (args.verifiedOnly) search = search.eq("verificationStatus", "verified");
            if (mode === "exact") search = search.eq("directoryListed", true);
            return search;
          })
          .filter(matchesPublicDirectoryEligibility)
          .paginate(paginationOpts)
      : args.verifiedOnly
        ? mode !== "exact"
          ? await ctx.db.query("companies")
              .withIndex("by_onboardingStatus_and_verificationStatus", (q) =>
                q.eq("onboardingStatus", "completed").eq("verificationStatus", "verified"))
              .filter(matchesPublicDirectoryEligibility)
              .order(args.sort === "oldest" ? "asc" : "desc")
              .paginate(paginationOpts)
          : await ctx.db.query("companies")
              .withIndex("by_onboardingStatus_and_verificationStatus_and_directoryListed", (q) =>
                q.eq("onboardingStatus", "completed").eq("verificationStatus", "verified").eq("directoryListed", true))
              .filter(matchesPublicDirectoryEligibility)
              .order(args.sort === "oldest" ? "asc" : "desc")
              .paginate(paginationOpts)
        : mode !== "exact"
          ? await ctx.db.query("companies")
              .withIndex("by_onboardingStatus", (q) => q.eq("onboardingStatus", "completed"))
              .filter(matchesPublicDirectoryEligibility)
              .order(args.sort === "oldest" ? "asc" : "desc")
              .paginate(paginationOpts)
          : await ctx.db.query("companies")
              .withIndex("by_onboardingStatus_and_directoryListed", (q) =>
                q.eq("onboardingStatus", "completed").eq("directoryListed", true))
              .filter(matchesPublicDirectoryEligibility)
              .order(args.sort === "oldest" ? "asc" : "desc")
              .paginate(paginationOpts);

    const publicPage = (
      await Promise.all(page.page.map((company) => toPublicCompanyResult(ctx, company, serviceFilter)))
    ).filter((company): company is NonNullable<typeof company> => company !== null);

    return {
      ...page,
      page: publicPage,
      continueCursor: encodeDirectoryCursor(mode, page.continueCursor),
      splitCursor: page.splitCursor === null || page.splitCursor === undefined
        ? page.splitCursor
        : encodeDirectoryCursor(mode, page.splitCursor),
    };
  },
});

/**
 * One-time, deployment-scoped migration for companies completed before the
 * directory search field existed. Invoke repeatedly with the returned cursor
 * until `isDone` is true.
 */
export const backfillDirectorySearchText = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    updated: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("companies")
      .withIndex("by_onboardingStatus", (q) => q.eq("onboardingStatus", "completed"))
      .paginate(args.paginationOpts);
    let updated = 0;

    for (const company of page.page) {
      if (!company.name || !company.city) continue;
      const serviceRows = await ctx.db
        .query("companyServices")
        .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
        .take(200);
      const directorySearchText = buildCompanyDirectorySearchText({
        name: company.name,
        city: company.city,
        services: serviceRows.map((row) => row.service),
      });
      if (company.directorySearchText !== directorySearchText) {
        await ctx.db.patch(company._id, { directorySearchText });
        updated += 1;
      }
    }

    return {
      updated,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
