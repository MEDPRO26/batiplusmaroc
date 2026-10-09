import { resolveApprovedCoverUrl } from "../companyCovers/model";
import { resolveApprovedLogoUrl } from "../companyLogos/model";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { buildCompanyDirectorySearchText } from "./directory";
import { getCompanyOperationalStatus } from "./operationalStatus";
import { existingServiceIds, listCatalog, validateNewServiceIds } from "../serviceCatalog";
import { defaultServiceCatalog } from "../../lib/service-catalog-defaults";
import { MAX_COMPANY_COVERAGE_SCOPES, validateCompanyCoverageScopes } from "../../lib/geography/company-coverage";
import { companyHeadquartersSnapshot, normalizeCompanyHeadquarters, type CompanyHeadquartersInput } from "../../lib/geography/company-headquarters";

// Keep the original translation keys for browser sessions opened before rollout.
// New clients use catalogServices; remove this compatibility field only later.
const legacyServiceOptions = defaultServiceCatalog.map(service => service.slug);
const companyServiceValidator = v.string();

type CompanyService = string;

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
  v.literal("tax_compliance"),
  v.literal("rc"),
  v.literal("ice"),
  v.literal("insurance"),
  v.literal("other"),
);

type CompanyServiceArea = (typeof companyServiceAreas)[number];
type CompanyLanguage = (typeof companyLanguages)[number];

const headquartersSnapshotValidator = v.object({
  regionCode: v.union(v.string(), v.null()),
  provinceCode: v.union(v.string(), v.null()),
  communeName: v.union(v.string(), v.null()),
});

const onboardingProfileValidator = v.union(
  v.null(),
  v.object({
    ownerFirstName: v.string(),
    ownerLastName: v.string(),
    name: v.string(),
    legalName: v.string(),
    phone: v.string(),
    city: v.string(),
    headquarters: headquartersSnapshotValidator,
    headquartersPolicyVersion: v.union(v.literal("structured_v1"), v.null()),
    description: v.string(),
    yearsExperience: v.union(v.number(), v.null()),
    website: v.string(),
    logoUrl: v.union(v.string(), v.null()),
    /** Public profile slug, null until the Company's public page has been provisioned. */
    publicSlug: v.union(v.string(), v.null()),
    services: v.array(companyServiceValidator),
    serviceOptions: v.array(companyServiceValidator),
    catalogServices: v.array(v.object({ _id: v.id("serviceCatalog"), slug: v.string(), nameFr: v.string(), nameEn: v.string(), isActive: v.boolean(), sortOrder: v.number() })),
    fallbackServices: v.array(v.object({ slug: v.string(), nameFr: v.string(), nameEn: v.string(), sortOrder: v.number() })),
    selectedServiceIds: v.array(v.id("serviceCatalog")),
    onboardingStatus: v.union(v.literal("pending"), v.literal("completed")),
    verificationStatus: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("verified"),
      v.literal("rejected"),
    ),
    accountRestricted: v.boolean(),
  }),
);

const profileManagerValidator = v.object({
  slug: v.union(v.string(), v.null()),
  name: v.string(),
  description: v.string(),
  city: v.string(),
  headquarters: headquartersSnapshotValidator,
  phone: v.string(),
  website: v.string(),
  yearsExperience: v.union(v.number(), v.null()),
  foundedYear: v.union(v.number(), v.null()),
  companySize: v.union(companySizeValidator, v.null()),
  languages: v.array(companyLanguageValidator),
  serviceAreas: v.array(companyServiceAreaValidator),
  services: v.array(companyServiceValidator),
  serviceOptions: v.array(companyServiceValidator),
  catalogServices: v.array(v.object({ _id: v.id("serviceCatalog"), slug: v.string(), nameFr: v.string(), nameEn: v.string(), isActive: v.boolean(), sortOrder: v.number() })),
  selectedServiceIds: v.array(v.id("serviceCatalog")),
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

function validatedHeadquartersFields(input: CompanyHeadquartersInput | undefined, required = false) {
  const headquarters = normalizeCompanyHeadquarters(input, required);
  if (!headquarters.ok) throw new ConvexError(headquarters.error);
  return headquarters.fields;
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
  if (services.length < 1 || services.length > 200) {
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
      .take(201);
    if (selectedServices.length > 200) {
      throw new ConvexError("INVALID_SERVICES");
    }
    if (new Set(selectedServices.map((item) => item.service)).size !== selectedServices.length) {
      throw new ConvexError("DUPLICATE_COMPANY_SERVICE");
    }
    const catalog = await listCatalog(ctx, false);
    const bySlug = new Map(catalog.map(item => [item.slug, item]));
    const selectedServiceIds = selectedServices.map(row => row.serviceId ?? bySlug.get(row.service)?._id).filter((id): id is Id<"serviceCatalog"> => id !== undefined);

    return {
      ownerFirstName: user.firstName ?? "",
      ownerLastName: user.lastName ?? "",
      name: company.name ?? "",
      legalName: company.legalName ?? "",
      phone: company.phone ?? user.phone ?? "",
      city: company.city ?? "",
      headquarters: companyHeadquartersSnapshot(company),
      headquartersPolicyVersion: company.headquartersPolicyVersion ?? null,
      description: company.description ?? "",
      yearsExperience: company.yearsExperience ?? null,
      website: company.website ?? "",
      logoUrl: await resolveApprovedLogoUrl(ctx, company),
      publicSlug: company.slug ?? null,
      services: selectedServices.map((item) => item.service),
      serviceOptions: [...legacyServiceOptions],
      catalogServices: catalog.filter(item => item.isActive).map(({ _id, slug, nameFr, nameEn, isActive, sortOrder }) => ({ _id, slug, nameFr, nameEn, isActive, sortOrder })),
      fallbackServices: catalog.length === 0 ? [...defaultServiceCatalog] : [],
      selectedServiceIds,
      onboardingStatus: company.onboardingStatus,
      verificationStatus: company.verificationStatus,
      accountRestricted: getCompanyOperationalStatus(company) === "suspended",
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
        .take(201),
      ctx.db
        .query("companyVerifications")
        .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
        .unique(),
      ctx.db
        .query("companyVerificationDocuments")
        .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
        .take(5),
      resolveApprovedLogoUrl(ctx, company),
      resolveApprovedCoverUrl(ctx, company),
    ]);

    if (selectedServices.length > 200) {
      throw new ConvexError("DUPLICATE_COMPANY_SERVICE");
    }

    const services = selectedServices.map((item) => item.service);
    const catalog = await listCatalog(ctx, false);
    const bySlug = new Map(catalog.map(item => [item.slug, item]));
    const selectedServiceIds = selectedServices.map(row => row.serviceId ?? bySlug.get(row.service)?._id).filter((id): id is Id<"serviceCatalog"> => id !== undefined);
    if (new Set(services).size !== services.length) {
      throw new ConvexError("DUPLICATE_COMPANY_SERVICE");
    }

    return {
      slug: company.slug ?? null,
      name: company.name ?? "",
      description: company.description ?? "",
      city: company.city ?? "",
      headquarters: companyHeadquartersSnapshot(company),
      phone: company.phone ?? "",
      website: company.website ?? "",
      yearsExperience: company.yearsExperience ?? null,
      foundedYear: company.foundedYear ?? null,
      companySize: company.companySize ?? null,
      languages: company.languages ?? [],
      serviceAreas: company.serviceAreas ?? [],
      services,
      serviceOptions: [...legacyServiceOptions],
      catalogServices: catalog.map(({ _id, slug, nameFr, nameEn, isActive, sortOrder }) => ({ _id, slug, nameFr, nameEn, isActive, sortOrder })),
      selectedServiceIds,
      serviceAreaOptions: [...companyServiceAreas],
      languageOptions: [...companyLanguages],
      companySizeOptions: [...companySizes],
      logoUrl,
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

/** Private owner profile context, with the same onboarding rules as getProfileManager. */
export const getMyGeographicCoverage = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const { company } = await requireOwnerCompany(ctx);
    if (company.onboardingStatus !== "completed") throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
    const selected = validateCompanyCoverageScopes(company.coverageScopeKeys ?? []);
    if (!selected.valid) throw new ConvexError("INVALID_COMPANY_COVERAGE_STATE");
    return selected.coverageScopeKeys;
  },
});

/** Explicit profile maintenance, independent of marketplace verification/suspension gates. */
export const updateMyGeographicCoverage = mutation({
  args: { coverageScopeKeys: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { company } = await requireOwnerCompany(ctx);
    if (company.onboardingStatus !== "completed") throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
    const selected = validateCompanyCoverageScopes(args.coverageScopeKeys);
    if (!selected.valid) throw new ConvexError(selected.error);

    // The extra row detects corruption rather than silently reconciling a capped prefix.
    const rows = await ctx.db.query("companyCoverageIndex")
      .withIndex("by_companyId_and_areaKey", (q) => q.eq("companyId", company._id))
      .take(MAX_COMPANY_COVERAGE_SCOPES + 1);
    if (rows.length > MAX_COMPANY_COVERAGE_SCOPES) throw new ConvexError("COMPANY_COVERAGE_INDEX_CORRUPTED");

    const requested = new Set<string>(selected.coverageScopeKeys);
    const retained = new Set<string>();
    for (const row of rows) {
      if (!requested.has(row.areaKey) || retained.has(row.areaKey)) {
        await ctx.db.delete(row._id);
      } else retained.add(row.areaKey);
    }
    for (const areaKey of requested) {
      if (!retained.has(areaKey)) await ctx.db.insert("companyCoverageIndex", { companyId: company._id, areaKey });
    }
    const unchanged = company.coverageScopeKeys?.length === selected.coverageScopeKeys.length &&
      company.coverageScopeKeys.every((key, index) => key === selected.coverageScopeKeys[index]);
    if (!unchanged) {
      await ctx.db.patch(company._id, { coverageScopeKeys: selected.coverageScopeKeys, updatedAt: Date.now() });
    }
    return null;
  },
});

export const updatePublicProfile = mutation({
  args: {
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    city: v.optional(v.string()),
    headquarters: v.optional(headquartersSnapshotValidator),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    yearsExperience: v.optional(v.union(v.number(), v.null())),
    foundedYear: v.optional(v.union(v.number(), v.null())),
    companySize: v.optional(companySizeValidator),
    languages: v.optional(v.array(companyLanguageValidator)),
    services: v.optional(v.array(companyServiceValidator)),
    serviceIds: v.optional(v.array(v.id("serviceCatalog"))),
    serviceAreas: v.optional(v.array(companyServiceAreaValidator)),
  },
  returns: v.object({ slug: v.string() }),
  handler: async (ctx, args) => {
    const { company } = await requireOwnerCompany(ctx);
    if (company.onboardingStatus !== "completed") {
      throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
    }
    if (Object.values(args).every((value) => value === undefined)) {
      throw new ConvexError("PROFILE_UPDATE_REQUIRED");
    }

    const name = args.name === undefined
      ? company.name
      : normalizeText(args.name, 2, 120, "INVALID_COMPANY_NAME");
    if (!name) throw new ConvexError("INVALID_COMPANY_NAME");
    const description = args.description === undefined
      ? company.description
      : normalizeText(args.description, 20, 1000, "INVALID_DESCRIPTION");
    const city = args.city === undefined ? company.city : normalizeCity(args.city);
    const headquarters = validatedHeadquartersFields(
      args.headquarters,
      args.headquarters !== undefined && company.headquartersPolicyVersion === "structured_v1",
    );
    const phone = args.phone === undefined ? company.phone : normalizeMoroccanPhone(args.phone);
    const website = args.website === undefined ? company.website : normalizeWebsite(args.website);
    const yearsExperience = args.yearsExperience === undefined
      ? company.yearsExperience
      : validateYearsExperience(args.yearsExperience ?? undefined);
    const foundedYear = args.foundedYear === undefined
      ? company.foundedYear
      : validateFoundedYear(args.foundedYear ?? undefined);
    const serviceAreas = args.serviceAreas === undefined
      ? company.serviceAreas ?? []
      : validateServiceAreas(args.serviceAreas);
    const languages = args.languages === undefined
      ? company.languages ?? []
      : validateLanguages(args.languages);
    const slug = company.slug ?? await createUniqueCompanySlug(ctx, name, company._id);
    const now = Date.now();

    const currentServices = await ctx.db
      .query("companyServices")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .take(401);
    if (currentServices.length > 400) {
      throw new ConvexError("DUPLICATE_COMPANY_SERVICE");
    }

    if (args.services !== undefined && args.serviceIds !== undefined) throw new ConvexError("INVALID_SERVICES");
    const requestedIds = args.serviceIds ?? (args.services === undefined ? undefined : await Promise.all(validateServices(args.services).map(async slug => {
      const item = await ctx.db.query("serviceCatalog").withIndex("by_slug", q => q.eq("slug", slug)).unique();
      if (!item) throw new ConvexError("INVALID_SERVICES");
      return item._id;
    })));
    const selectedCatalog = requestedIds === undefined ? null : await validateNewServiceIds(ctx, requestedIds, await existingServiceIds(ctx, currentServices));
    const services = selectedCatalog ? selectedCatalog.map(item => item.slug) : currentServices.map(item => item.service);
    if (selectedCatalog) {
      const selected = new Set(selectedCatalog.map(item => item._id));
      for (const row of currentServices) {
        const currentCatalog = row.serviceId ? await ctx.db.get(row.serviceId) : await ctx.db.query("serviceCatalog").withIndex("by_slug", q => q.eq("slug", row.service)).unique();
        if (currentCatalog && selected.has(currentCatalog._id)) {
          if (!row.serviceId) await ctx.db.patch(row._id, { serviceId: currentCatalog._id, updatedAt: now });
        } else if (currentCatalog) {
          await ctx.db.delete(row._id);
        }
      }
      for (const item of selectedCatalog) {
        if (!currentServices.some(row => row.serviceId === item._id || row.service === item.slug)) {
          await ctx.db.insert("companyServices", { companyId: company._id, service: item.slug, serviceId: item._id, createdAt: now, updatedAt: now });
        }
      }
    }

    const patch: Partial<Omit<Doc<"companies">, "_id" | "_creationTime">> = {
      updatedAt: now,
      ...headquarters,
      ...(company.slug ? {} : { slug }),
      ...(args.name === undefined ? {} : { name }),
      ...(args.description === undefined ? {} : { description }),
      ...(args.city === undefined ? {} : { city }),
      ...(args.phone === undefined ? {} : { phone }),
      ...(args.website === undefined ? {} : { website }),
      ...(args.yearsExperience === undefined ? {} : { yearsExperience }),
      ...(args.foundedYear === undefined ? {} : { foundedYear }),
      ...(args.companySize === undefined ? {} : { companySize: args.companySize }),
      ...(args.languages === undefined ? {} : { languages: [...languages] }),
      ...(args.serviceAreas === undefined ? {} : { serviceAreas: [...serviceAreas] }),
    };
    if (
      args.name !== undefined ||
      args.city !== undefined ||
      args.services !== undefined ||
      args.serviceIds !== undefined ||
      args.serviceAreas !== undefined
    ) {
      patch.directorySearchText = buildCompanyDirectorySearchText({
        name,
        city: city ?? "",
        services,
        serviceAreas,
      });
    }
    await ctx.db.patch(company._id, patch);

    return { slug };
  },
});

export const completeOnboarding = mutation({
  args: {
    name: v.string(),
    legalName: v.string(),
    phone: v.string(),
    city: v.string(),
    headquarters: v.optional(headquartersSnapshotValidator),
    description: v.string(),
    services: v.optional(v.array(companyServiceValidator)),
    serviceIds: v.optional(v.array(v.id("serviceCatalog"))),
    yearsExperience: v.optional(v.number()),
    website: v.string(),
    logoUploadToken: v.optional(v.string()),
  },
  returns: v.object({ onboardingStatus: v.literal("completed") }),
  handler: async (ctx, args) => {
    const { userId, company } = await requireOwnerCompany(ctx);
    if (args.logoUploadToken) throw new ConvexError("COMPANY_LOGO_PRIVATE_UPLOAD_REQUIRED");
    const name = normalizeText(args.name, 2, 120, "INVALID_COMPANY_NAME");
    const legalName = normalizeOptionalText(args.legalName, 2, 160, "INVALID_LEGAL_NAME");
    const phone = normalizeMoroccanPhone(args.phone);
    const city = normalizeCity(args.city);
    // The immutable record marker, rather than the current rollout setting, is authoritative.
    const structuredRequired = company.headquartersPolicyVersion === "structured_v1";
    const headquarters = validatedHeadquartersFields(
      args.headquarters ?? (structuredRequired ? companyHeadquartersSnapshot(company) : undefined),
      structuredRequired,
    );
    const description = normalizeText(args.description, 20, 1000, "INVALID_DESCRIPTION");
    const yearsExperience = validateYearsExperience(args.yearsExperience);
    const website = normalizeWebsite(args.website);
    if ((args.services === undefined) === (args.serviceIds === undefined)) throw new ConvexError("INVALID_SERVICES");
    // Read the entire catalog's emptiness, not just the active list. Admin
    // deactivation must never re-enable default choices through the fallback.
    const catalogEmpty = await ctx.db.query("serviceCatalog").withIndex("by_slug").first() === null;
    const fallbackServices = catalogEmpty && args.services !== undefined ? validateServices(args.services) : null;
    if (fallbackServices?.some(slug => !defaultServiceCatalog.some(item => item.slug === slug))) throw new ConvexError("INVALID_SERVICES");
    const requestedIds = fallbackServices !== null ? null : args.serviceIds ?? await Promise.all(validateServices(args.services ?? []).map(async slug => {
      const row = await ctx.db.query("serviceCatalog").withIndex("by_slug", q => q.eq("slug", slug)).unique();
      if (!row) throw new ConvexError("INVALID_SERVICES");
      return row._id;
    }));
    const now = Date.now();
    const slug = company.slug ?? await createUniqueCompanySlug(ctx, name, company._id);

    if (company.verificationStatus !== "draft") {
      throw new ConvexError("INVALID_VERIFICATION_STATUS");
    }

    const currentServices = await ctx.db
      .query("companyServices")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .take(201);
    if (currentServices.length > 200) {
      throw new ConvexError("INVALID_SERVICES");
    }
    if (new Set(currentServices.map((item) => item.service)).size !== currentServices.length) {
      throw new ConvexError("DUPLICATE_COMPANY_SERVICE");
    }
    const catalogRows = requestedIds === null ? [] : await validateNewServiceIds(ctx, requestedIds, await existingServiceIds(ctx, currentServices));
    const services = fallbackServices ?? catalogRows.map(row => row.slug);
    if (fallbackServices !== null) {
      const selectedSlugs = new Set(fallbackServices);
      for (const row of currentServices) {
        if (!row.serviceId && defaultServiceCatalog.some(item => item.slug === row.service) && !selectedSlugs.has(row.service)) {
          await ctx.db.delete(row._id);
        }
      }
      for (const service of fallbackServices) {
        if (!currentServices.some(row => row.service === service)) {
          await ctx.db.insert("companyServices", { companyId: company._id, service, createdAt: now, updatedAt: now });
        }
      }
    } else {
      const selected = new Set(catalogRows.map(row => row._id));
      const existingById = new Map(currentServices.map(row => [row.serviceId, row]));
      for (const item of currentServices) {
        const catalogRow = item.serviceId ? await ctx.db.get(item.serviceId) : await ctx.db.query("serviceCatalog").withIndex("by_slug", q => q.eq("slug", item.service)).unique();
        const mapped = catalogRow?._id;
        if (mapped && selected.has(mapped)) {
          if (!item.serviceId) await ctx.db.patch(item._id, { serviceId: mapped, updatedAt: now });
        } else if (catalogRow?.isActive === true) {
          await ctx.db.delete(item._id);
        }
      }
      for (const row of catalogRows) {
        if (!existingById.has(row._id) && !currentServices.some(item => item.service === row.slug)) {
          await ctx.db.insert("companyServices", {
            companyId: company._id, service: row.slug, serviceId: row._id,
            createdAt: now, updatedAt: now,
          });
        }
      }
    }

    await ctx.db.patch(company._id, {
      name,
      slug,
      legalName,
      phone,
      city,
      ...(args.headquarters === undefined ? {} : headquarters),
      description,
      yearsExperience,
      website,
      directorySearchText: buildCompanyDirectorySearchText({ name, city, services }),
      onboardingStatus: "completed",
      updatedAt: now,
    });
    await ctx.db.patch(userId, { onboardingStatus: "completed", updatedAt: now });

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
    const { company } = await requireOwnerCompany(ctx);
    if (args.kind === "logo") throw new ConvexError("COMPANY_LOGO_PRIVATE_UPLOAD_REQUIRED");
    if (company.onboardingStatus !== "completed") {
      throw new ConvexError("COMPANY_ONBOARDING_REQUIRED");
    }
    throw new ConvexError("COMPANY_COVER_PRIVATE_UPLOAD_REQUIRED");
  },
});
