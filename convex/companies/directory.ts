import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internalMutation, query } from "../_generated/server";
import { getPublicMediaUrl } from "../storage/publicUrl";

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

type CompanyService = (typeof companyServices)[number];

const serviceSearchTerms: Record<CompanyService, string> = {
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
};

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
    ...args.services.map((service) => serviceSearchTerms[service]),
  ]
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();
}

function normalizedSearch(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").normalize("NFKC").toLowerCase().slice(0, 100) ?? "";
}

function serviceMarker(service: CompanyService | undefined) {
  return service ? `service${service.toLowerCase()}` : "";
}

async function resolvePublicMediaUrl(
  ctx: QueryCtx,
  reference: {
    storageId?: Id<"_storage">;
    publicMediaId?: Id<"publicMedia">;
  },
) {
  if (reference.publicMediaId) {
    const media = await ctx.db.get(reference.publicMediaId);
    return media ? getPublicMediaUrl(media.objectKey) : null;
  }
  return reference.storageId ? await ctx.storage.getUrl(reference.storageId) : null;
}

async function toPublicCompanyResult(ctx: QueryCtx, company: Doc<"companies">) {
  if (
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
      .take(companyServices.length),
    ctx.db
      .query("portfolioProjects")
      .withIndex("by_companyId_and_status", (q) =>
        q.eq("companyId", company._id).eq("status", "published"),
      )
      .order("desc")
      .take(3),
    resolvePublicMediaUrl(ctx, {
      storageId: company.logoStorageId,
      publicMediaId: company.logoMediaId,
    }),
    resolvePublicMediaUrl(ctx, { publicMediaId: company.coverMediaId }),
  ]);

  const portfolio = (
    await Promise.all(
      projects.map(async (project) => {
        const url = await resolvePublicMediaUrl(ctx, {
          storageId: project.coverImageStorageId,
          publicMediaId: project.coverMediaId,
        });
        return url ? { title: project.title, url } : null;
      }),
    )
  ).filter((item): item is { title: string; url: string } => item !== null);

  return {
    id: company._id,
    slug: company.slug,
    name: company.name,
    description: company.description,
    city: company.city,
    isVerified: company.verificationStatus === "verified",
    yearsExperience: company.yearsExperience ?? null,
    services: serviceRows.map((row) => row.service),
    serviceAreas: company.serviceAreas ?? [],
    logoUrl,
    coverImageUrl: companyCoverUrl ?? portfolio[0]?.url ?? null,
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
    const terms = [
      normalizedSearch(args.search),
      normalizedSearch(args.city),
      serviceMarker(args.service),
    ].filter(Boolean);

    const page = terms.length > 0
      ? await ctx.db
          .query("companies")
          .withSearchIndex("search_directory", (q) => {
            const search = q
              .search("directorySearchText", terms.join(" "))
              .eq("onboardingStatus", "completed");
            return args.verifiedOnly
              ? search.eq("verificationStatus", "verified")
              : search;
          })
          .paginate(args.paginationOpts)
      : args.verifiedOnly
        ? await ctx.db
            .query("companies")
            .withIndex("by_onboardingStatus_and_verificationStatus", (q) =>
              q.eq("onboardingStatus", "completed").eq("verificationStatus", "verified"),
            )
            .order(args.sort === "oldest" ? "asc" : "desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("companies")
            .withIndex("by_onboardingStatus", (q) => q.eq("onboardingStatus", "completed"))
            .order(args.sort === "oldest" ? "asc" : "desc")
            .paginate(args.paginationOpts);

    const publicPage = (
      await Promise.all(page.page.map((company) => toPublicCompanyResult(ctx, company)))
    ).filter((company): company is NonNullable<typeof company> => company !== null);

    return { ...page, page: publicPage };
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
        .take(companyServices.length);
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
