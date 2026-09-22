import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { createUniqueCompanySlug, requireOwnerCompany } from "../companies/index";
import { consumeVerifiedPublicMediaIntent } from "../storage/publicMediaModel";
import { getPublicMediaUrl } from "../storage/publicUrl";

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
  coverImageUrl: v.string(),
  media: v.array(imageOutputValidator),
  updatedAt: v.number(),
});

const MAX_EXTRA_IMAGES = 8;

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

async function resolveMediaUrl(
  ctx: QueryCtx,
  reference: { storageId?: Id<"_storage">; publicMediaId?: Id<"publicMedia"> },
) {
  if (reference.publicMediaId) {
    const media = await ctx.db.get(reference.publicMediaId);
    return media ? getPublicMediaUrl(media.objectKey) : null;
  }
  return reference.storageId ? await ctx.storage.getUrl(reference.storageId) : null;
}

async function resolveProject(ctx: QueryCtx, project: {
  _id: Id<"portfolioProjects">;
  title: string;
  description: string;
  city: string;
  projectType: "construction" | "renovation" | "structural" | "finishing" | "interior" | "exterior" | "other";
  surface?: number;
  durationMonths?: number;
  year?: number;
  status: "draft" | "published" | "hidden";
  coverImageStorageId?: Id<"_storage">;
  coverMediaId?: Id<"publicMedia">;
  updatedAt: number;
}) {
  const [coverImageUrl, mediaRows] = await Promise.all([
    resolveMediaUrl(ctx, {
      storageId: project.coverImageStorageId,
      publicMediaId: project.coverMediaId,
    }),
    ctx.db.query("portfolioMedia").withIndex("by_portfolioProjectId", (q) => q.eq("portfolioProjectId", project._id)).take(MAX_EXTRA_IMAGES),
  ]);
  if (!coverImageUrl) return null;
  const media = (await Promise.all(mediaRows
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(async (item) => ({
      url: await resolveMediaUrl(ctx, {
        storageId: item.storageId,
        publicMediaId: item.publicMediaId,
      }),
      caption: item.caption ?? null,
    }))))
    .filter((item): item is { url: string; caption: string | null } => item.url !== null);
  return {
    id: project._id,
    title: project.title,
    description: project.description,
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
    slug: v.string(),
    name: v.string(),
    logoUrl: v.union(v.string(), v.null()),
    coverImageUrl: v.union(v.string(), v.null()),
    isVerified: v.boolean(),
    city: v.string(),
    description: v.string(),
    services: v.array(v.string()),
    serviceAreas: v.array(v.string()),
    yearsExperience: v.union(v.number(), v.null()),
    foundedYear: v.union(v.number(), v.null()),
    companySize: v.union(v.string(), v.null()),
    languages: v.array(v.string()),
    website: v.union(v.string(), v.null()),
    phone: v.union(v.string(), v.null()),
    portfolio: v.array(projectOutputValidator),
  })),
  handler: async (ctx, args) => {
    const company = await ctx.db.query("companies").withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
    if (!company || company.onboardingStatus !== "completed" || !company.slug || !company.name || !company.city || !company.description) return null;
    const [services, projects, logoMedia, coverMedia] = await Promise.all([
      ctx.db.query("companyServices").withIndex("by_companyId", (q) => q.eq("companyId", company._id)).take(11),
      ctx.db.query("portfolioProjects").withIndex("by_companyId_and_status", (q) => q.eq("companyId", company._id).eq("status", "published")).order("desc").take(24),
      company.logoMediaId ? ctx.db.get(company.logoMediaId) : Promise.resolve(null),
      company.coverMediaId ? ctx.db.get(company.coverMediaId) : Promise.resolve(null),
    ]);
    const logoUrl = logoMedia && logoMedia.companyId === company._id && logoMedia.purpose === "companyLogo"
      ? getPublicMediaUrl(logoMedia.objectKey)
      : company.logoStorageId
        ? await ctx.storage.getUrl(company.logoStorageId)
        : null;
    const coverImageUrl = coverMedia && coverMedia.companyId === company._id && coverMedia.purpose === "companyCover"
      ? getPublicMediaUrl(coverMedia.objectKey)
      : null;
    const portfolio = (await Promise.all(projects.map((project) => resolveProject(ctx, project))))
      .filter((project): project is NonNullable<typeof project> => project !== null);
    return {
      slug: company.slug,
      name: company.name,
      logoUrl,
      coverImageUrl,
      isVerified: company.verificationStatus === "verified",
      city: company.city,
      description: company.description,
      services: services.map((item) => item.service),
      serviceAreas: company.serviceAreas ?? [],
      yearsExperience: company.yearsExperience ?? null,
      foundedYear: company.foundedYear ?? null,
      companySize: company.companySize ?? null,
      languages: company.languages ?? [],
      website: company.website ?? null,
      phone: company.phone ?? null,
      portfolio,
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
    coverImage: imageInputValidator, extraImages: v.array(imageInputValidator),
  },
  returns: v.id("portfolioProjects"),
  handler: async (ctx, args) => {
    const { company, userId } = await requireOwnerCompany(ctx);
    if (company.onboardingStatus !== "completed") throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
    if (args.extraImages.length > MAX_EXTRA_IMAGES) throw new ConvexError("INVALID_PORTFOLIO_IMAGE");
    const uploadTokens = [args.coverImage.uploadToken, ...args.extraImages.map((item) => item.uploadToken)];
    if (new Set(uploadTokens).size !== uploadTokens.length) throw new ConvexError("INVALID_PORTFOLIO_IMAGE");
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
    const coverMediaId = await consumeVerifiedPublicMediaIntent(ctx, {
      uploadToken: args.coverImage.uploadToken,
      companyId: company._id,
      userId,
      purpose: "portfolioCover",
      portfolioProjectId: projectId,
    });
    await ctx.db.patch(projectId, { coverMediaId });
    for (let index = 0; index < args.extraImages.length; index += 1) {
      const image = args.extraImages[index];
      const publicMediaId = await consumeVerifiedPublicMediaIntent(ctx, {
        uploadToken: image.uploadToken,
        companyId: company._id,
        userId,
        purpose: "portfolioMedia",
        portfolioProjectId: projectId,
      });
      await ctx.db.insert("portfolioMedia", {
        portfolioProjectId: projectId, publicMediaId, sortOrder: index,
        caption: image.caption ? normalizeText(image.caption, 1, 200, "INVALID_PORTFOLIO_CAPTION") : undefined,
        createdAt: now,
      });
    }
    return projectId;
  },
});

export const updatePortfolioProject = mutation({
  args: {
    projectId: v.id("portfolioProjects"), title: v.string(), description: v.string(), city: v.string(), projectType: projectTypeValidator,
    surface: v.optional(v.number()), durationMonths: v.optional(v.number()), year: v.optional(v.number()),
    coverImage: v.optional(imageInputValidator), extraImages: v.array(imageInputValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { company, userId, project } = await requireOwnedProject(ctx, args.projectId);
    if (args.extraImages.length > MAX_EXTRA_IMAGES) throw new ConvexError("INVALID_PORTFOLIO_IMAGE");
    const uploadTokens = [
      ...(args.coverImage ? [args.coverImage.uploadToken] : []),
      ...args.extraImages.map((item) => item.uploadToken),
    ];
    if (new Set(uploadTokens).size !== uploadTokens.length) throw new ConvexError("INVALID_PORTFOLIO_IMAGE");
    const now = Date.now();
    const existingMedia = await ctx.db.query("portfolioMedia").withIndex("by_portfolioProjectId", (q) => q.eq("portfolioProjectId", project._id)).take(MAX_EXTRA_IMAGES + 1);
    if (existingMedia.length + args.extraImages.length > MAX_EXTRA_IMAGES) throw new ConvexError("INVALID_PORTFOLIO_IMAGE");
    let nextCoverMediaId = project.coverMediaId;
    let previousR2ObjectKey: string | null = null;
    if (args.coverImage) {
      nextCoverMediaId = await consumeVerifiedPublicMediaIntent(ctx, {
        uploadToken: args.coverImage.uploadToken,
        companyId: company._id,
        userId,
        purpose: "portfolioCover",
        portfolioProjectId: project._id,
      });
      if (project.coverMediaId) {
        const oldMedia = await ctx.db.get(project.coverMediaId);
        previousR2ObjectKey = oldMedia?.objectKey ?? null;
        if (oldMedia) await ctx.db.delete(oldMedia._id);
      }
    }
    await ctx.db.patch(project._id, {
      title: normalizeText(args.title, 2, 120, "INVALID_PORTFOLIO_TITLE"),
      description: normalizeText(args.description, 20, 1200, "INVALID_PORTFOLIO_DESCRIPTION"),
      city: normalizeCity(args.city), projectType: args.projectType,
      surface: validateOptionalNumber(args.surface, 1, 1000000, "INVALID_PORTFOLIO_SURFACE"),
      durationMonths: validateOptionalNumber(args.durationMonths, 1, 600, "INVALID_PORTFOLIO_DURATION", true),
      year: validateOptionalNumber(args.year, 1900, new Date().getFullYear(), "INVALID_PORTFOLIO_YEAR", true),
      coverMediaId: nextCoverMediaId,
      updatedAt: now,
    });
    for (let index = 0; index < args.extraImages.length; index += 1) {
      const image = args.extraImages[index];
      const publicMediaId = await consumeVerifiedPublicMediaIntent(ctx, {
        uploadToken: image.uploadToken,
        companyId: company._id,
        userId,
        purpose: "portfolioMedia",
        portfolioProjectId: project._id,
      });
      await ctx.db.insert("portfolioMedia", {
        portfolioProjectId: project._id, publicMediaId,
        sortOrder: existingMedia.length + index,
        caption: image.caption ? normalizeText(image.caption, 1, 200, "INVALID_PORTFOLIO_CAPTION") : undefined,
        createdAt: now,
      });
    }
    if (previousR2ObjectKey) {
      await ctx.scheduler.runAfter(0, internal.storage.r2.deleteObjectIfUnreferenced, {
        objectKey: previousR2ObjectKey,
      });
    }
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
