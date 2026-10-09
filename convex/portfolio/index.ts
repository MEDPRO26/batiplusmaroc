import { resolveApprovedCoverUrl } from "../companyCovers/model";
import { resolveApprovedLogoUrl } from "../companyLogos/model";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { createUniqueCompanySlug, requireOwnerCompany } from "../companies/index";
import { getCompanyOperationalStatus } from "../companies/operationalStatus";
import { companyInvitationEligibilityError } from "../invitations/eligibility";
import { resolvedServiceNames } from "../serviceCatalog";
import { PORTFOLIO_GALLERY_LIMIT } from "../portfolioImages/constants";
import { resolveApprovedPortfolioImageUrl } from "../portfolioImages/model";
import { maskCompanyName, maskPublicCompanyText } from "../lib/companyName";

const projectTypeValidator = v.union(
  v.literal("construction"),
  v.literal("renovation"),
  v.literal("structural"),
  v.literal("finishing"),
  v.literal("interior"),
  v.literal("exterior"),
  v.literal("other"),
);
const statusValidator = v.union(v.literal("draft"), v.literal("published"), v.literal("hidden"));
const imageInputValidator = v.object({
  uploadToken: v.string(),
  caption: v.optional(v.string()),
});
const imageOutputValidator = v.object({
  url: v.string(),
  caption: v.union(v.string(), v.null()),
});
const projectOutputValidator = v.object({
  id: v.id("portfolioProjects"),
  title: v.string(),
  description: v.string(),
  city: v.string(),
  projectType: projectTypeValidator,
  surface: v.union(v.number(), v.null()),
  durationMonths: v.union(v.number(), v.null()),
  year: v.union(v.number(), v.null()),
  status: statusValidator,
  coverImageUrl: v.union(v.string(), v.null()),
  media: v.array(imageOutputValidator),
  updatedAt: v.number(),
});
const publicReviewValidator = v.object({
  rating: v.number(),
  comment: v.string(),
  createdAt: v.number(),
  reviewerFirstName: v.union(v.string(), v.null()),
  reviewerLastInitial: v.union(v.string(), v.null()),
  projectTitle: v.union(v.string(), v.null()),
});

const MAX_EXTRA_IMAGES = PORTFOLIO_GALLERY_LIMIT;

function normalizeText(value: string, min: number, max: number, code: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < min || normalized.length > max) throw new ConvexError(code);
  return normalized;
}

function normalizeCity(value: string) {
  const normalized = normalizeText(value, 2, 80, "INVALID_PORTFOLIO_CITY");
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u.test(normalized)) {
    throw new ConvexError("INVALID_PORTFOLIO_CITY");
  }
  return normalized;
}

function validateOptionalNumber(value: number | undefined, min: number, max: number, code: string, integer = false) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new ConvexError(code);
  return value;
}

async function requireOwnedProject(ctx: MutationCtx, projectId: Id<"portfolioProjects">) {
  const access = await requireOwnerCompany(ctx);
  const project = await ctx.db.get(projectId);
  if (!project || project.companyId !== access.company._id) throw new ConvexError("PORTFOLIO_PROJECT_NOT_FOUND");
  return { ...access, project };
}

async function resolveProject(ctx: QueryCtx, project: Doc<"portfolioProjects">, maskedNames: readonly unknown[] = []) {
  const [coverImageUrl, mediaRows] = await Promise.all([
    resolveApprovedPortfolioImageUrl(ctx, project),
    ctx.db.query("portfolioMedia").withIndex("by_portfolioProjectId", (q) => q.eq("portfolioProjectId", project._id)).take(MAX_EXTRA_IMAGES),
  ]);
  const media = (await Promise.all(mediaRows
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(async (item) => ({
      url: await resolveApprovedPortfolioImageUrl(ctx, project, item),
      caption: item.caption === undefined ? null : maskPublicCompanyText(item.caption, maskedNames),
    }))))
    .filter((item): item is { url: string; caption: string | null } => item.url !== null);
  return {
    id: project._id,
    title: maskPublicCompanyText(project.title, maskedNames),
    description: maskPublicCompanyText(project.description, maskedNames),
    city: project.city,
    projectType: project.projectType,
    surface: project.surface ?? null,
    durationMonths: project.durationMonths ?? null,
    year: project.year ?? null,
    status: project.status,
    coverImageUrl,
    media,
    updatedAt: project.updatedAt,
  };
}

export const getPublicCompanyProfile = query({
  args: { slug: v.string() },
  returns: v.union(v.null(), v.object({
    id: v.id("companies"),
    slug: v.string(),
    name: v.string(),
    logoUrl: v.union(v.string(), v.null()),
    coverImageUrl: v.union(v.string(), v.null()),
    isVerified: v.boolean(),
    marketplaceAvailable: v.boolean(),
    invitationEligible: v.boolean(),
    city: v.string(),
    headquarters: v.object({
      regionCode: v.union(v.string(), v.null()),
      provinceCode: v.union(v.string(), v.null()),
    }),
    description: v.string(),
    services: v.array(v.string()),
    serviceNames: v.array(v.object({ slug: v.string(), nameFr: v.string(), nameEn: v.string() })),
    serviceAreas: v.array(v.string()),
    yearsExperience: v.union(v.number(), v.null()),
    foundedYear: v.union(v.number(), v.null()),
    companySize: v.union(v.string(), v.null()),
    languages: v.array(v.string()),
    website: v.union(v.string(), v.null()),
    portfolio: v.array(projectOutputValidator),
    rating: v.union(v.number(), v.null()),
    reviewCount: v.number(),
    reviews: v.array(publicReviewValidator),
  })),
  handler: async (ctx, args) => {
    const company = await ctx.db.query("companies").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
    if (!company || company.onboardingStatus !== "completed" || !company.slug || !company.name || !company.city || !company.description) return null;
    const [services, projects, reviewRows] = await Promise.all([
      ctx.db.query("companyServices").withIndex("by_companyId", (q) => q.eq("companyId", company._id)).take(200),
      ctx.db.query("portfolioProjects").withIndex("by_companyId_and_status", (q) => q.eq("companyId", company._id).eq("status", "published")).order("desc").take(24),
      ctx.db.query("reviews")
        .withIndex("by_companyId_and_moderationStatus_and_createdAt", (q) =>
          q.eq("companyId", company._id).eq("moderationStatus", "visible"),
        )
        .order("desc")
        .take(20),
    ]);
    const serviceNames = await resolvedServiceNames(ctx, services);
    const logoUrl = await resolveApprovedLogoUrl(ctx, company);
    const coverImageUrl = await resolveApprovedCoverUrl(ctx, company);
    const names = [company.name, company.legalName];
    const portfolio = (await Promise.all(projects.map((project) => resolveProject(ctx, project, names))))
      .filter((project): project is NonNullable<typeof project> => project !== null);
    const reviews = (await Promise.all(reviewRows.map(async (review) => {
      const [client, project] = await Promise.all([
        ctx.db.get(review.clientUserId),
        ctx.db.get(review.projectId),
      ]);
      if (!client || !project || project.clientId !== review.clientUserId || project.selectedCompanyId !== company._id) return null;
      const firstName = client.firstName?.trim() || null;
      const lastInitial = client.lastName?.trim().charAt(0).toUpperCase() || null;
      return {
        rating: review.rating,
        comment: maskPublicCompanyText(review.comment, names),
        createdAt: review.createdAt,
        reviewerFirstName: firstName,
        reviewerLastInitial: lastInitial,
        projectTitle: project.title === undefined ? null : maskPublicCompanyText(project.title, names),
      };
    }))).filter((review): review is NonNullable<typeof review> => review !== null);
    return {
      id: company._id,
      slug: company.slug,
      name: maskCompanyName(company.name),
      logoUrl,
      coverImageUrl,
      isVerified: company.verificationStatus === "verified",
      marketplaceAvailable: getCompanyOperationalStatus(company) !== "suspended",
      invitationEligible: (await companyInvitationEligibilityError(ctx, company)) === null,
      city: company.city,
      // Public administrative codes only; commune and legal addresses stay private.
      headquarters: {
        regionCode: company.headquartersRegionCode ?? null,
        provinceCode: company.headquartersProvinceCode ?? null,
      },
      description: maskPublicCompanyText(company.description, names),
      services: services.map((item) => item.service),
      serviceNames,
      serviceAreas: company.serviceAreas ?? [],
      yearsExperience: company.yearsExperience ?? null,
      foundedYear: company.foundedYear ?? null,
      companySize: company.companySize ?? null,
      languages: company.languages ?? [],
      website: company.website ?? null,
      portfolio,
      rating: company.reviewCount && company.reviewRatingTotal !== undefined
        ? company.reviewRatingTotal / company.reviewCount
        : null,
      reviewCount: company.reviewCount ?? 0,
      reviews,
    };
  },
});

export const getPortfolioManager = query({
  args: {},
  returns: v.object({ companySlug: v.union(v.string(), v.null()), projects: v.array(projectOutputValidator) }),
  handler: async (ctx) => {
    const { company } = await requireOwnerCompany(ctx);
    const rows = await ctx.db.query("portfolioProjects").withIndex("by_companyId", (q) => q.eq("companyId", company._id)).order("desc").take(50);
    const projects = (await Promise.all(rows.map((project) => resolveProject(ctx, project))))
      .filter((project): project is NonNullable<typeof project> => project !== null);
    return { companySlug: company.slug ?? null, projects };
  },
});

export const ensurePublicSlug = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const { company } = await requireOwnerCompany(ctx);
    if (company.slug) return company.slug;
    if (!company.name || company.onboardingStatus !== "completed") throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
    const slug = await createUniqueCompanySlug(ctx, company.name, company._id);
    await ctx.db.patch(company._id, { slug, updatedAt: Date.now() });
    return slug;
  },
});

export const createPortfolioProject = mutation({
  args: {
    title: v.string(), description: v.string(), city: v.string(), projectType: projectTypeValidator,
    surface: v.optional(v.number()), durationMonths: v.optional(v.number()), year: v.optional(v.number()),
    coverImage: v.optional(imageInputValidator), extraImages: v.optional(v.array(imageInputValidator)),
  },
  returns: v.id("portfolioProjects"),
  handler: async (ctx, args) => {
    const { company } = await requireOwnerCompany(ctx);
    if (company.onboardingStatus !== "completed") throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
    if (args.coverImage || args.extraImages?.length) throw new ConvexError("PORTFOLIO_PRIVATE_UPLOAD_REQUIRED");
    const title = normalizeText(args.title, 2, 120, "INVALID_PORTFOLIO_TITLE");
    const description = normalizeText(args.description, 20, 1200, "INVALID_PORTFOLIO_DESCRIPTION");
    const city = normalizeCity(args.city);
    const surface = validateOptionalNumber(args.surface, 1, 1000000, "INVALID_PORTFOLIO_SURFACE");
    const durationMonths = validateOptionalNumber(args.durationMonths, 1, 600, "INVALID_PORTFOLIO_DURATION", true);
    const year = validateOptionalNumber(args.year, 1900, new Date().getFullYear(), "INVALID_PORTFOLIO_YEAR", true);
    const now = Date.now();
    const projectId = await ctx.db.insert("portfolioProjects", {
      companyId: company._id, title, description, city, projectType: args.projectType,
      surface, durationMonths, year,
      status: "draft", createdAt: now, updatedAt: now,
    });
    return projectId;
  },
});

export const updatePortfolioProject = mutation({
  args: {
    projectId: v.id("portfolioProjects"), title: v.string(), description: v.string(), city: v.string(), projectType: projectTypeValidator,
    surface: v.optional(v.number()), durationMonths: v.optional(v.number()), year: v.optional(v.number()),
    coverImage: v.optional(imageInputValidator), extraImages: v.optional(v.array(imageInputValidator)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { project } = await requireOwnedProject(ctx, args.projectId);
    if (args.coverImage || args.extraImages?.length) throw new ConvexError("PORTFOLIO_PRIVATE_UPLOAD_REQUIRED");
    const now = Date.now();
    await ctx.db.patch(project._id, {
      title: normalizeText(args.title, 2, 120, "INVALID_PORTFOLIO_TITLE"),
      description: normalizeText(args.description, 20, 1200, "INVALID_PORTFOLIO_DESCRIPTION"),
      city: normalizeCity(args.city), projectType: args.projectType,
      surface: validateOptionalNumber(args.surface, 1, 1000000, "INVALID_PORTFOLIO_SURFACE"),
      durationMonths: validateOptionalNumber(args.durationMonths, 1, 600, "INVALID_PORTFOLIO_DURATION", true),
      year: validateOptionalNumber(args.year, 1900, new Date().getFullYear(), "INVALID_PORTFOLIO_YEAR", true),
      updatedAt: now,
    });
    return null;
  },
});

export const publishPortfolioProject = mutation({
  args: { projectId: v.id("portfolioProjects") },
  returns: v.object({ status: v.literal("published") }),
  handler: async (ctx, args) => {
    const { project } = await requireOwnedProject(ctx, args.projectId);
    await ctx.db.patch(project._id, { status: "published", updatedAt: Date.now() });
    return { status: "published" as const };
  },
});

export const archivePortfolioProject = mutation({
  args: { projectId: v.id("portfolioProjects") },
  returns: v.object({ status: v.literal("hidden") }),
  handler: async (ctx, args) => {
    const { project } = await requireOwnedProject(ctx, args.projectId);
    await ctx.db.patch(project._id, { status: "hidden", updatedAt: Date.now() });
    return { status: "hidden" as const };
  },
});
