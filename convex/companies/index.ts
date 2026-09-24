import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { consumeVerifiedPublicMediaIntent } from "../storage/publicMediaModel";
import { getPublicMediaUrl } from "../storage/publicUrl";
import { buildCompanyDirectorySearchText } from "./directory";

const companyServices = [
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

type CompanyService = (typeof companyServices)[number];

const companyServiceAreas = [
  "agadir",
  "casablanca",
  "fes",
  "marrakech",
  "meknes",
  "oujda",
  "rabat",
  "sale",
  "tangier",
  "tetouan",
] as const;

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

const companyLanguages = ["arabic", "french", "english", "amazigh", "spanish"] as const;

const companyLanguageValidator = v.union(
  v.literal("arabic"),
  v.literal("french"),
  v.literal("english"),
  v.literal("amazigh"),
  v.literal("spanish"),
);

const companySizes = ["solo", "2to10", "11to50", "51to200", "201plus"] as const;

const companySizeValidator = v.union(
  v.literal("solo"),
  v.literal("2to10"),
  v.literal("11to50"),
  v.literal("51to200"),
  v.literal("201plus"),
);

const verificationDocumentTypeValidator = v.union(
  v.literal("rc"),
  v.literal("ice"),
  v.literal("insurance"),
  v.literal("other"),
);

type CompanyServiceArea = (typeof companyServiceAreas)[number];
type CompanyLanguage = (typeof companyLanguages)[number];

const onboardingProfileValidator = v.union(
  v.null(),
  v.object({
    ownerFirstName: v.string(),
    ownerLastName: v.string(),
    name: v.string(),
    legalName: v.string(),
    phone: v.string(),
    city: v.string(),
    description: v.string(),
    yearsExperience: v.union(v.number(), v.null()),
    website: v.string(),
    logoUrl: v.union(v.string(), v.null()),
    services: v.array(companyServiceValidator),
    serviceOptions: v.array(companyServiceValidator),
    onboardingStatus: v.union(v.literal("pending"), v.literal("completed")),
    verificationStatus: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected"),
    ),
  }),
);

const profileManagerValidator = v.object({
  slug: v.union(v.string(), v.null()),
  name: v.string(),
  description: v.string(),
  city: v.string(),
  phone: v.string(),
  website: v.string(),
  yearsExperience: v.union(v.number(), v.null()),
  foundedYear: v.union(v.number(), v.null()),
  companySize: v.union(companySizeValidator, v.null()),
  languages: v.array(companyLanguageValidator),
  serviceAreas: v.array(companyServiceAreaValidator),
  services: v.array(companyServiceValidator),
  serviceOptions: v.array(companyServiceValidator),
  serviceAreaOptions: v.array(companyServiceAreaValidator),
  languageOptions: v.array(companyLanguageValidator),
  companySizeOptions: v.array(companySizeValidator),
  logoUrl: v.union(v.string(), v.null()),
  coverImageUrl: v.union(v.string(), v.null()),
  legal: v.object({
    verificationStatus: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected"),
    ),
    legalName: v.string(),
    ice: v.string(),
    rcNumber: v.string(),
    legalRepresentative: v.string(),
    phone: v.string(),
    address: v.string(),
    documents: v.array(v.object({
      documentType: verificationDocumentTypeValidator,
      fileName: v.string(),
    })),
  }),
});

function normalizeText(value: string, min: number, max: number, errorCode: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < min || normalized.length > max) {
    throw new ConvexError(errorCode);
  }
  return normalized;
}

function normalizeCity(value: string) {
  const normalized = normalizeText(value, 2, 80, "INVALID_CITY");
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u.test(normalized)) {
    throw new ConvexError("INVALID_CITY");
  }
  return normalized;
}

function normalizeMoroccanPhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const normalized = compact.startsWith("00212") ? `+212${compact.slice(5)}` : compact;
  if (!/^(?:\+212[5-7]\d{8}|0[5-7]\d{8})$/.test(normalized)) {
    throw new ConvexError("INVALID_PHONE");
  }
  return normalized;
}

function normalizeOptionalText(value: string, min: number, max: number, errorCode: string) {
  if (value.trim() === "") return undefined;
  return normalizeText(value, min, max, errorCode);
}

function normalizeWebsite(value: string) {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (trimmed.length > 2048) throw new ConvexError("INVALID_WEBSITE");

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new ConvexError("INVALID_WEBSITE");
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    !parsed.hostname.includes(".")
  ) {
    throw new ConvexError("INVALID_WEBSITE");
  }
  parsed.hash = "";
  return parsed.toString();
}

function validateYearsExperience(value: number | undefined) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new ConvexError("INVALID_YEARS_EXPERIENCE");
  }
  return value;
}

function validateFoundedYear(value: number | undefined) {
  if (value === undefined) return undefined;
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(value) || value < 1800 || value > currentYear) {
    throw new ConvexError("INVALID_FOUNDED_YEAR");
  }
  return value;
}

function validateServices(services: readonly CompanyService[]) {
  if (services.length < 1 || services.length > companyServices.length) {
    throw new ConvexError("INVALID_SERVICES");
  }
  if (new Set(services).size !== services.length) {
    throw new ConvexError("INVALID_SERVICES");
  }
  return services;
}

function validateServiceAreas(serviceAreas: readonly CompanyServiceArea[]) {
  if (serviceAreas.length < 1 || serviceAreas.length > companyServiceAreas.length) {
    throw new ConvexError("INVALID_SERVICE_AREAS");
  }
  if (new Set(serviceAreas).size !== serviceAreas.length) {
    throw new ConvexError("INVALID_SERVICE_AREAS");
  }
  return serviceAreas;
}

function validateLanguages(languages: readonly CompanyLanguage[]) {
  if (languages.length < 1 || languages.length > companyLanguages.length) {
    throw new ConvexError("INVALID_LANGUAGES");
  }
  if (new Set(languages).size !== languages.length) {
    throw new ConvexError("INVALID_LANGUAGES");
  }
  return languages;
}

async function resolveManagedImageUrl(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  mediaId: Id<"publicMedia"> | undefined,
  purpose: "companyLogo" | "companyCover",
) {
  if (!mediaId) return null;
  const media = await ctx.db.get(mediaId);
  if (!media || media.companyId !== companyId || media.purpose !== purpose) return null;
  return getPublicMediaUrl(media.objectKey);
}

function slugifyCompanyName(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");
  return slug || "entreprise";
}

export async function createUniqueCompanySlug(
  ctx: QueryCtx | MutationCtx,
  name: string,
  currentCompanyId?: Id<"companies">,
) {
  const base = slugifyCompanyName(name);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const existing = await ctx.db
      .query("companies")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique();
    if (!existing || existing._id === currentCompanyId) return candidate;
  }
  throw new ConvexError("COMPANY_SLUG_UNAVAILABLE");
}

export async function requireOwnerCompany(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("NOT_AUTHENTICATED");

  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("USER_NOT_FOUND");
  if (user.accountType !== "company") throw new ConvexError("COMPANY_ACCOUNT_REQUIRED");

  const memberships = await ctx.db
    .query("companyMembers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(2);
  if (memberships.length !== 1) {
    throw new ConvexError(
      memberships.length === 0 ? "COMPANY_MEMBERSHIP_REQUIRED" : "DUPLICATE_ACCOUNT_FOUNDATION",
    );
  }

  const membership = memberships[0];
  if (membership.role !== "owner" || membership.status !== "active") {
    throw new ConvexError("COMPANY_OWNER_REQUIRED");
  }
  const company = await ctx.db.get(membership.companyId);
  if (!company) throw new ConvexError("COMPANY_NOT_FOUND");

  return { user, userId, membership, company };
}

export const getOnboardingProfile = query({
  args: {},
  returns: onboardingProfileValidator,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const { user, company } = await requireOwnerCompany(ctx);
    const selectedServices = await ctx.db
      .query("companyServices")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .take(companyServices.length + 1);
    if (selectedServices.length > companyServices.length) {
      throw new ConvexError("INVALID_SERVICES");
    }
    if (new Set(selectedServices.map((item) => item.service)).size !== selectedServices.length) {
      throw new ConvexError("DUPLICATE_COMPANY_SERVICE");
    }
    const logoMedia = company.logoMediaId ? await ctx.db.get(company.logoMediaId) : null;

    return {
      ownerFirstName: user.firstName ?? "",
      ownerLastName: user.lastName ?? "",
      name: company.name ?? "",
      legalName: company.legalName ?? "",
      phone: company.phone ?? user.phone ?? "",
      city: company.city ?? "",
      description: company.description ?? "",
      yearsExperience: company.yearsExperience ?? null,
      website: company.website ?? "",
      logoUrl: logoMedia
        ? getPublicMediaUrl(logoMedia.objectKey)
        : company.logoStorageId
          ? await ctx.storage.getUrl(company.logoStorageId)
          : null,
      services: selectedServices.map((item) => item.service),
      serviceOptions: [...companyServices],
      onboardingStatus: company.onboardingStatus,
      verificationStatus: company.verificationStatus,
    };
  },
});

export const getProfileManager = query({
  args: {},
  returns: profileManagerValidator,
  handler: async (ctx) => {
    const { company } = await requireOwnerCompany(ctx);
    if (company.onboardingStatus !== "completed") {
      throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
    }

    const [selectedServices, verification, documents, logoUrl, coverImageUrl] = await Promise.all([
      ctx.db
        .query("companyServices")
        .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
        .take(companyServices.length + 1),
      ctx.db
        .query("companyVerifications")
        .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
        .unique(),
      ctx.db
        .query("companyVerificationDocuments")
        .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
        .take(5),
      resolveManagedImageUrl(ctx, company._id, company.logoMediaId, "companyLogo"),
      resolveManagedImageUrl(ctx, company._id, company.coverMediaId, "companyCover"),
    ]);

    if (selectedServices.length > companyServices.length) {
      throw new ConvexError("DUPLICATE_COMPANY_SERVICE");
    }

    const services = selectedServices.map((item) => item.service);
    if (new Set(services).size !== services.length) {
      throw new ConvexError("DUPLICATE_COMPANY_SERVICE");
    }

    const legacyLogoUrl = !logoUrl && company.logoStorageId
      ? await ctx.storage.getUrl(company.logoStorageId)
      : null;

    return {
      slug: company.slug ?? null,
      name: company.name ?? "",
      description: company.description ?? "",
      city: company.city ?? "",
      phone: company.phone ?? "",
      website: company.website ?? "",
      yearsExperience: company.yearsExperience ?? null,
      foundedYear: company.foundedYear ?? null,
      companySize: company.companySize ?? null,
      languages: company.languages ?? [],
      serviceAreas: company.serviceAreas ?? [],
      services,
      serviceOptions: [...companyServices],
      serviceAreaOptions: [...companyServiceAreas],
      languageOptions: [...companyLanguages],
      companySizeOptions: [...companySizes],
      logoUrl: logoUrl ?? legacyLogoUrl,
      coverImageUrl,
      legal: {
        verificationStatus: company.verificationStatus,
        legalName: verification?.legalName ?? company.legalName ?? "",
        ice: verification?.ice ?? "",
        rcNumber: verification?.rcNumber ?? "",
        legalRepresentative: verification?.legalRepresentative ?? "",
        phone: verification?.phone ?? "",
        address: verification?.address ?? "",
        documents: documents.map(({ documentType, fileName }) => ({ documentType, fileName })),
      },
    };
  },
});

export const updatePublicProfile = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    city: v.string(),
    phone: v.string(),
    website: v.string(),
    yearsExperience: v.optional(v.number()),
    foundedYear: v.optional(v.number()),
    companySize: companySizeValidator,
    languages: v.array(companyLanguageValidator),
    services: v.array(companyServiceValidator),
    serviceAreas: v.array(companyServiceAreaValidator),
    logoUploadToken: v.optional(v.string()),
    coverUploadToken: v.optional(v.string()),
  },
  returns: v.object({ slug: v.string() }),
  handler: async (ctx, args) => {
    const { company, userId } = await requireOwnerCompany(ctx);
    if (company.onboardingStatus !== "completed") {
      throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
    }
    if (
      args.logoUploadToken &&
      args.coverUploadToken &&
      args.logoUploadToken === args.coverUploadToken
    ) {
      throw new ConvexError("INVALID_PUBLIC_MEDIA_UPLOAD");
    }

    const name = normalizeText(args.name, 2, 120, "INVALID_COMPANY_NAME");
    const description = normalizeText(args.description, 20, 1000, "INVALID_DESCRIPTION");
    const city = normalizeCity(args.city);
    const phone = normalizeMoroccanPhone(args.phone);
    const website = normalizeWebsite(args.website);
    const yearsExperience = validateYearsExperience(args.yearsExperience);
    const foundedYear = validateFoundedYear(args.foundedYear);
    const services = validateServices(args.services);
    const serviceAreas = validateServiceAreas(args.serviceAreas);
    const languages = validateLanguages(args.languages);
    const slug = company.slug ?? await createUniqueCompanySlug(ctx, name, company._id);
    const now = Date.now();

    const currentServices = await ctx.db
      .query("companyServices")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .take(companyServices.length * 2 + 1);
    if (currentServices.length > companyServices.length * 2) {
      throw new ConvexError("DUPLICATE_COMPANY_SERVICE");
    }

    const existingByService = new Map<CompanyService, (typeof currentServices)[number]>();
    for (const row of currentServices) {
      if (existingByService.has(row.service)) {
        await ctx.db.delete(row._id);
      } else {
        existingByService.set(row.service, row);
      }
    }

    const selectedServices = new Set<CompanyService>(services);
    for (const [service, row] of existingByService) {
      if (!selectedServices.has(service)) await ctx.db.delete(row._id);
    }
    for (const service of services) {
      if (!existingByService.has(service)) {
        await ctx.db.insert("companyServices", {
          companyId: company._id,
          service,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const [previousLogo, previousCover] = await Promise.all([
      company.logoMediaId ? ctx.db.get(company.logoMediaId) : Promise.resolve(null),
      company.coverMediaId ? ctx.db.get(company.coverMediaId) : Promise.resolve(null),
    ]);
    const logoMediaId = args.logoUploadToken
      ? await consumeVerifiedPublicMediaIntent(ctx, {
          uploadToken: args.logoUploadToken,
          companyId: company._id,
          userId,
          purpose: "companyLogo",
        })
      : undefined;
    const coverMediaId = args.coverUploadToken
      ? await consumeVerifiedPublicMediaIntent(ctx, {
          uploadToken: args.coverUploadToken,
          companyId: company._id,
          userId,
          purpose: "companyCover",
        })
      : undefined;

    await ctx.db.patch(company._id, {
      name,
      slug,
      description,
      city,
      phone,
      website,
      yearsExperience,
      foundedYear,
      companySize: args.companySize,
      languages: [...languages],
      serviceAreas: [...serviceAreas],
      directorySearchText: buildCompanyDirectorySearchText({
        name,
        city,
        services,
        serviceAreas,
      }),
      ...(logoMediaId ? { logoMediaId } : {}),
      ...(coverMediaId ? { coverMediaId } : {}),
      updatedAt: now,
    });

    for (const previous of [
      logoMediaId ? previousLogo : null,
      coverMediaId ? previousCover : null,
    ]) {
      if (!previous) continue;
      await ctx.db.delete(previous._id);
      await ctx.scheduler.runAfter(0, internal.storage.r2.deleteObjectIfUnreferenced, {
        objectKey: previous.objectKey,
      });
    }

    return { slug };
  },
});

export const completeOnboarding = mutation({
  args: {
    name: v.string(),
    legalName: v.string(),
    phone: v.string(),
    city: v.string(),
    description: v.string(),
    services: v.array(companyServiceValidator),
    yearsExperience: v.optional(v.number()),
    website: v.string(),
    logoUploadToken: v.optional(v.string()),
  },
  returns: v.object({ onboardingStatus: v.literal("completed") }),
  handler: async (ctx, args) => {
    const { userId, company } = await requireOwnerCompany(ctx);
    const name = normalizeText(args.name, 2, 120, "INVALID_COMPANY_NAME");
    const legalName = normalizeOptionalText(args.legalName, 2, 160, "INVALID_LEGAL_NAME");
    const phone = normalizeMoroccanPhone(args.phone);
    const city = normalizeCity(args.city);
    const description = normalizeText(args.description, 20, 1000, "INVALID_DESCRIPTION");
    const yearsExperience = validateYearsExperience(args.yearsExperience);
    const website = normalizeWebsite(args.website);
    const services = validateServices(args.services);
    const now = Date.now();
    const slug = company.slug ?? await createUniqueCompanySlug(ctx, name, company._id);

    if (company.verificationStatus !== "draft") {
      throw new ConvexError("INVALID_VERIFICATION_STATUS");
    }

    const currentServices = await ctx.db
      .query("companyServices")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .take(companyServices.length + 1);
    if (currentServices.length > companyServices.length) {
      throw new ConvexError("INVALID_SERVICES");
    }
    if (new Set(currentServices.map((item) => item.service)).size !== currentServices.length) {
      throw new ConvexError("DUPLICATE_COMPANY_SERVICE");
    }
    const selected = new Set<CompanyService>(services);
    const existing = new Map(currentServices.map((item) => [item.service, item]));

    for (const item of currentServices) {
      if (!selected.has(item.service)) await ctx.db.delete(item._id);
    }
    for (const service of services) {
      if (!existing.has(service)) {
        await ctx.db.insert("companyServices", {
          companyId: company._id,
          service,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const oldLogoMedia = company.logoMediaId ? await ctx.db.get(company.logoMediaId) : null;
    const logoMediaId = args.logoUploadToken
      ? await consumeVerifiedPublicMediaIntent(ctx, {
          uploadToken: args.logoUploadToken,
          companyId: company._id,
          userId,
          purpose: "companyLogo",
        })
      : undefined;
    await ctx.db.patch(company._id, {
      name,
      slug,
      legalName,
      phone,
      city,
      description,
      yearsExperience,
      website,
      directorySearchText: buildCompanyDirectorySearchText({ name, city, services }),
      ...(logoMediaId ? { logoMediaId } : {}),
      onboardingStatus: "completed",
      updatedAt: now,
    });
    await ctx.db.patch(userId, { onboardingStatus: "completed", updatedAt: now });

    if (logoMediaId && oldLogoMedia) {
      await ctx.db.delete(oldLogoMedia._id);
      await ctx.scheduler.runAfter(0, internal.storage.r2.deleteObjectIfUnreferenced, {
        objectKey: oldLogoMedia.objectKey,
      });
    }

    return { onboardingStatus: "completed" as const };
  },
});

export const setCompanyPublicImage = mutation({
  args: {
    kind: v.union(v.literal("logo"), v.literal("cover")),
    uploadToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { company, userId } = await requireOwnerCompany(ctx);
    if (company.onboardingStatus !== "completed") {
      throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
    }
    const field = args.kind === "logo" ? "logoMediaId" : "coverMediaId";
    const previousId = company[field];
    const previous = previousId ? await ctx.db.get(previousId) : null;
    const mediaId = await consumeVerifiedPublicMediaIntent(ctx, {
      uploadToken: args.uploadToken,
      companyId: company._id,
      userId,
      purpose: args.kind === "logo" ? "companyLogo" : "companyCover",
    });
    await ctx.db.patch(company._id, { [field]: mediaId, updatedAt: Date.now() });
    if (previous) {
      await ctx.db.delete(previous._id);
      await ctx.scheduler.runAfter(0, internal.storage.r2.deleteObjectIfUnreferenced, {
        objectKey: previous.objectKey,
      });
    }
    return null;
  },
});
