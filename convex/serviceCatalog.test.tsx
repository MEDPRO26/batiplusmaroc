/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, test } from "vitest";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import { isLegacyServiceKey } from "../features/companies/lib/service-label";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { defaultServiceCatalog } from "../lib/service-catalog-defaults";

const modules = import.meta.glob("./**/*.ts");
type Backend = ReturnType<typeof convexTest>;
beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});
async function user(t: Backend, accountType: "admin" | "client" | "company") {
  return await t.run(ctx => ctx.db.insert("users", { email: `${accountType}-${crypto.randomUUID()}@example.test`, accountType, onboardingStatus: "pending", createdAt: 1, updatedAt: 1 }));
}
function as(t: Backend, id: Id<"users">) { return t.withIdentity({ subject: `${id}|test-session` }); }
async function company(t: Backend, ownerId: Id<"users">) {
  return await t.run(async ctx => {
    const companyId = await ctx.db.insert("companies", { name: "Atlas", city: "Rabat", description: "Construction company with a complete profile.", onboardingStatus: "pending", verificationStatus: "draft", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("companyMembers", { companyId, userId: ownerId, role: "owner", status: "active", createdAt: 1 });
    return companyId;
  });
}
const onboarding = { name: "Atlas Construction", legalName: "Atlas Construction SARL", phone: "0612345678", city: "Rabat", description: "Residential construction and renovation services.", website: "" };

// Preserve the serviceOptions.map access and legacy labels used by the old UI.
function LegacyServiceConsumer({ profile, namespace }: {
  profile: { services: string[]; serviceOptions: string[] };
  namespace: "auth.companyOnboarding" | "companyProfileManager";
}) {
  const tOnboarding = useTranslations("auth.companyOnboarding");
  const tProfile = useTranslations("companyProfileManager");
  return <fieldset>{profile.serviceOptions.map(service => {
    if (!isLegacyServiceKey(service)) throw new Error("Unknown legacy service option");
    return <label key={service}>
      <input name="services" type="checkbox" value={service} defaultChecked={profile.services.includes(service)} />
      {namespace === "auth.companyOnboarding" ? tOnboarding(`services.${service}`) : tProfile(`serviceOptions.${service}`)}
    </label>;
  })}</fieldset>;
}

describe("service catalog", () => {
  test.each([["fr", fr], ["en", en]] as const)("legacy %s consumers render before and after seeding while catalog data remains available", async (locale, messages) => {
    const t = convexTest(schema, modules);
    const ownerId = await user(t, "company");
    await company(t, ownerId);
    const owner = as(t, ownerId);
    const legacyKeys = defaultServiceCatalog.map(row => row.slug);
    const renderLegacy = (profile: { services: string[]; serviceOptions: string[] }, namespace: "auth.companyOnboarding" | "companyProfileManager") =>
      renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages}><LegacyServiceConsumer profile={profile} namespace={namespace} /></NextIntlClientProvider>);

    const beforeSeed = (await owner.query(api.companies.index.getOnboardingProfile, {}))!;
    expect(beforeSeed.serviceOptions).toEqual(legacyKeys);
    expect(beforeSeed.catalogServices).toEqual([]);
    expect(beforeSeed.fallbackServices).toHaveLength(10);
    expect(renderLegacy(beforeSeed, "auth.companyOnboarding").match(/type="checkbox"/g)).toHaveLength(10);
    // The previous UI's mutation payload remains accepted during the fallback.
    await owner.mutation(api.companies.index.completeOnboarding, { ...onboarding, services: ["structural"] });
    const managerBeforeSeed = await owner.query(api.companies.index.getProfileManager, {});
    expect(managerBeforeSeed.serviceOptions).toEqual(legacyKeys);
    expect(renderLegacy(managerBeforeSeed, "companyProfileManager")).toContain(messages.companyProfileManager.serviceOptions.structural);

    const admin = as(t, await user(t, "admin"));
    await admin.mutation(api.serviceCatalog.seedDefaults, {});
    const customId = await admin.mutation(api.serviceCatalog.create, { slug: "roofing", nameFr: "Toiture", nameEn: "Roofing", sortOrder: 100 });
    const afterSeed = (await owner.query(api.companies.index.getOnboardingProfile, {}))!;
    expect(afterSeed.serviceOptions).toEqual(legacyKeys);
    expect(afterSeed.serviceOptions).not.toContain("roofing");
    expect(afterSeed.fallbackServices).toEqual([]);
    expect(afterSeed.catalogServices).toHaveLength(11);
    expect(afterSeed.catalogServices.find(row => row._id === customId)).toMatchObject({ nameFr: "Toiture", nameEn: "Roofing" });
    expect(afterSeed.selectedServiceIds).toHaveLength(1);
    const legacyHtml = renderLegacy(afterSeed, "auth.companyOnboarding");
    expect(legacyHtml.match(/type="checkbox"/g)).toHaveLength(10);
    for (const key of legacyKeys) expect(legacyHtml).toContain(messages.auth.companyOnboarding.services[key]);

    const managerAfterSeed = await owner.query(api.companies.index.getProfileManager, {});
    expect(managerAfterSeed.serviceOptions).toEqual(legacyKeys);
    expect(managerAfterSeed.catalogServices).toHaveLength(11);
    expect(managerAfterSeed.selectedServiceIds).toEqual(afterSeed.selectedServiceIds);
    expect(renderLegacy(managerAfterSeed, "companyProfileManager").match(/type="checkbox"/g)).toHaveLength(10);
    await owner.mutation(api.companies.index.updatePublicProfile, { services: ["structural", "plumbing"] });
    const updated = await owner.query(api.companies.index.getProfileManager, {});
    expect(updated.services).toEqual(["structural", "plumbing"]);
    expect(updated.selectedServiceIds).toHaveLength(2);
  });

  test("empty onboarding catalog returns ten bilingual defaults without writing any rows", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await user(t, "company");
    await company(t, ownerId);
    for (let attempt = 0; attempt < 2; attempt++) {
      const profile = await as(t, ownerId).query(api.companies.index.getOnboardingProfile, {});
      expect(profile?.catalogServices).toEqual([]);
      expect(profile?.fallbackServices).toEqual(defaultServiceCatalog);
      expect(profile?.selectedServiceIds).toEqual([]);
    }
    expect(await t.run(ctx => ctx.db.query("serviceCatalog").take(20))).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("serviceCatalogHistory").take(20))).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("companyServices").take(20))).toEqual([]);
  });

  test("empty-catalog onboarding saves legacy selections without seeding or cross-company writes", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await user(t, "company");
    const owner = as(t, ownerId);
    const companyId = await company(t, ownerId);
    const otherCompany = await company(t, await user(t, "company"));
    const args = { ...onboarding, services: ["structural", "plumbing"] };
    await expect(t.mutation(api.companies.index.completeOnboarding, args)).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(as(t, await user(t, "client")).mutation(api.companies.index.completeOnboarding, args)).rejects.toThrow();
    await expect(owner.mutation(api.companies.index.completeOnboarding, { ...onboarding, services: ["roofing"] })).rejects.toThrow("INVALID_SERVICES");
    await expect(owner.mutation(api.companies.index.completeOnboarding, { ...onboarding, services: ["structural", "structural"] })).rejects.toThrow("INVALID_SERVICES");
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(owner.mutation(api.companies.index.completeOnboarding, args)).resolves.toEqual({ onboardingStatus: "completed" });
    }
    const rows = await t.run(ctx => ctx.db.query("companyServices").withIndex("by_companyId", q => q.eq("companyId", companyId)).take(20));
    expect(rows.map(row => row.service).sort()).toEqual(["plumbing", "structural"]);
    expect(rows.every(row => row.serviceId === undefined)).toBe(true);
    expect(await t.run(ctx => ctx.db.query("companyServices").withIndex("by_companyId", q => q.eq("companyId", otherCompany)).take(20))).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("serviceCatalog").take(20))).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("serviceCatalogHistory").take(20))).toEqual([]);
  });

  test("Admin seeding replaces fallback, exposes custom services, and maps saved legacy keys idempotently", async () => {
    const t = convexTest(schema, modules);
    const admin = as(t, await user(t, "admin"));
    const ownerId = await user(t, "company");
    const owner = as(t, ownerId);
    const companyId = await company(t, ownerId);
    await owner.mutation(api.companies.index.completeOnboarding, { ...onboarding, services: ["structural"] });
    expect(await admin.mutation(api.serviceCatalog.seedDefaults, {})).toEqual({ created: 10 });
    expect(await admin.mutation(api.serviceCatalog.seedDefaults, {})).toEqual({ created: 0 });
    const customId = await admin.mutation(api.serviceCatalog.create, { slug: "roofing", nameFr: "Toiture", nameEn: "Roofing", sortOrder: 100 });
    const profile = await owner.query(api.companies.index.getOnboardingProfile, {});
    expect(profile?.fallbackServices).toEqual([]);
    expect(profile?.catalogServices).toHaveLength(11);
    expect(new Set(profile?.catalogServices.map(row => row.slug)).size).toBe(11);
    expect(profile?.catalogServices.find(row => row._id === customId)).toMatchObject({ nameFr: "Toiture", nameEn: "Roofing" });
    const structural = profile!.catalogServices.find(row => row.slug === "structural")!;
    expect(profile?.selectedServiceIds).toEqual([structural._id]);
    expect(await admin.mutation(api.serviceCatalog.migrateLegacySelections, { paginationOpts: { numItems: 50, cursor: null } })).toMatchObject({ migrated: 1 });
    expect(await admin.mutation(api.serviceCatalog.migrateLegacySelections, { paginationOpts: { numItems: 50, cursor: null } })).toMatchObject({ migrated: 0 });
    const rows = await t.run(ctx => ctx.db.query("companyServices").withIndex("by_companyId", q => q.eq("companyId", companyId)).take(20));
    expect(rows).toMatchObject([{ service: "structural", serviceId: structural._id }]);
  });

  test("a fallback form submitted after seeding resolves its keys to real catalog IDs", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await user(t, "company");
    const owner = as(t, ownerId);
    const companyId = await company(t, ownerId);
    expect((await owner.query(api.companies.index.getOnboardingProfile, {}))?.fallbackServices).toHaveLength(10);
    const admin = as(t, await user(t, "admin"));
    await admin.mutation(api.serviceCatalog.seedDefaults, {});
    await owner.mutation(api.companies.index.completeOnboarding, { ...onboarding, services: ["structural"] });
    const rows = await t.run(ctx => ctx.db.query("companyServices").withIndex("by_companyId", q => q.eq("companyId", companyId)).take(20));
    expect(rows).toHaveLength(1);
    expect(rows[0].serviceId).toBeDefined();
    expect(await t.run(ctx => ctx.db.query("serviceCatalog").take(20))).toHaveLength(10);
  });

  test("a nonempty catalog remains authoritative even when every service is inactive", async () => {
    const t = convexTest(schema, modules);
    const admin = as(t, await user(t, "admin"));
    const id = await admin.mutation(api.serviceCatalog.create, { slug: "structural", nameFr: "Gros œuvre", nameEn: "Structural work", sortOrder: 0 });
    await admin.mutation(api.serviceCatalog.edit, { id, slug: "structural", nameFr: "Gros œuvre", nameEn: "Structural work", sortOrder: 0, isActive: false });
    const ownerId = await user(t, "company");
    const owner = as(t, ownerId);
    await company(t, ownerId);
    const profile = await owner.query(api.companies.index.getOnboardingProfile, {});
    expect(profile?.catalogServices).toEqual([]);
    expect(profile?.fallbackServices).toEqual([]);
    await expect(owner.mutation(api.companies.index.completeOnboarding, { ...onboarding, services: ["structural"] })).rejects.toThrow("INVALID_SERVICES");
    await expect(owner.mutation(api.companies.index.completeOnboarding, { ...onboarding, services: ["plumbing"] })).rejects.toThrow("INVALID_SERVICES");
  });

  test("Admin creates, edits, deactivates and reactivates; other roles cannot manage", async () => {
    const t = convexTest(schema, modules);
    const admin = as(t, await user(t, "admin"));
    const client = as(t, await user(t, "client"));
    const companyCaller = as(t, await user(t, "company"));
    await expect(t.mutation(api.serviceCatalog.create, { slug: "tiling", nameFr: "Carrelage", nameEn: "Tiling", sortOrder: 20 })).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(client.mutation(api.serviceCatalog.create, { slug: "tiling", nameFr: "Carrelage", nameEn: "Tiling", sortOrder: 20 })).rejects.toThrow("ADMIN_REQUIRED");
    await expect(client.query(api.serviceCatalog.listAdmin, {})).rejects.toThrow("ADMIN_REQUIRED");
    await expect(companyCaller.mutation(api.serviceCatalog.seedDefaults, {})).rejects.toThrow("ADMIN_REQUIRED");
    const id = await admin.mutation(api.serviceCatalog.create, { slug: "tiling", nameFr: "Carrelage", nameEn: "Tiling", sortOrder: 20 });
    await expect(client.mutation(api.serviceCatalog.edit, { id, slug: "tiling", nameFr: "Carrelage", nameEn: "Tiles", sortOrder: 2, isActive: false })).rejects.toThrow("ADMIN_REQUIRED");
    await admin.mutation(api.serviceCatalog.edit, { id, slug: "tile-work", nameFr: "Pose de carrelage", nameEn: "Tile work", sortOrder: 2, isActive: false });
    expect(await t.query(api.serviceCatalog.listActive, {})).toEqual([]);
    expect((await admin.query(api.serviceCatalog.listAdmin, {}))[0]).toMatchObject({ _id: id, slug: "tile-work", nameFr: "Pose de carrelage", nameEn: "Tile work", sortOrder: 2, isActive: false });
    await admin.mutation(api.serviceCatalog.edit, { id, slug: "tile-work", nameFr: "Pose de carrelage", nameEn: "Tile work", sortOrder: 2, isActive: true });
    expect((await t.query(api.serviceCatalog.listActive, {})).map(item => item._id)).toEqual([id]);
    const history = await t.run(ctx => ctx.db.query("serviceCatalogHistory").take(10));
    expect(history.map(item => item.action)).toEqual(["created", "updated", "updated"]);
  });

  test("public active list follows sort order and never exposes inactive services", async () => {
    const t = convexTest(schema, modules);
    const admin = as(t, await user(t, "admin"));
    const second = await admin.mutation(api.serviceCatalog.create, { slug: "second", nameFr: "Deuxième", nameEn: "Second", sortOrder: 20 });
    const first = await admin.mutation(api.serviceCatalog.create, { slug: "first", nameFr: "Premier", nameEn: "First", sortOrder: 10 });
    const hidden = await admin.mutation(api.serviceCatalog.create, { slug: "hidden", nameFr: "Caché", nameEn: "Hidden", sortOrder: 0 });
    await admin.mutation(api.serviceCatalog.edit, { id: hidden, slug: "hidden", nameFr: "Caché", nameEn: "Hidden", sortOrder: 0, isActive: false });
    expect((await t.query(api.serviceCatalog.listActive, {})).map(item => item._id)).toEqual([first, second]);
  });

  test("custom catalog names reach directory cards and the public profile", async () => {
    const t = convexTest(schema, modules);
    const admin = as(t, await user(t, "admin"));
    const ownerId = await user(t, "company");
    await company(t, ownerId);
    const custom = await admin.mutation(api.serviceCatalog.create, { slug: "roofing", nameFr: "Toiture", nameEn: "Roofing", sortOrder: 0 });
    await as(t, ownerId).mutation(api.companies.index.completeOnboarding, { ...onboarding, serviceIds: [custom] });
    const directory = await t.query(api.companies.directory.listPublicCompanies, {
      paginationOpts: { numItems: 12, cursor: null }, verifiedOnly: false, sort: "newest",
    });
    expect(directory.page[0]?.serviceNames).toEqual([{ slug: "roofing", nameFr: "Toiture", nameEn: "Roofing" }]);
    const profile = await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: directory.page[0].slug });
    expect(profile?.serviceNames).toEqual([{ slug: "roofing", nameFr: "Toiture", nameEn: "Roofing" }]);
  });

  test("directory filters Roofing by its catalog slug and saved company selection", async () => {
    const t = convexTest(schema, modules);
    const admin = as(t, await user(t, "admin"));
    const roofing = await admin.mutation(api.serviceCatalog.create, { slug: "roofing", nameFr: "Toiture", nameEn: "Roofing", sortOrder: 0 });
    const painting = await admin.mutation(api.serviceCatalog.create, { slug: "painting", nameFr: "Peinture", nameEn: "Painting", sortOrder: 10 });
    const rooferId = await user(t, "company");
    const painterId = await user(t, "company");
    const rooferCompany = await company(t, rooferId);
    await company(t, painterId);
    await as(t, rooferId).mutation(api.companies.index.completeOnboarding, { ...onboarding, name: "Atlas Build", serviceIds: [roofing] });
    // The name is searchable but does not establish a Roofing service selection.
    await as(t, painterId).mutation(api.companies.index.completeOnboarding, { ...onboarding, name: "Roofing Paint Company", serviceIds: [painting] });
    const result = await t.query(api.companies.directory.listPublicCompanies, {
      paginationOpts: { numItems: 12, cursor: null }, service: "roofing", verifiedOnly: false, sort: "relevance",
    });
    expect(result.page.map(row => row.id)).toEqual([rooferCompany]);
    const selected = await t.run(ctx => ctx.db.query("companyServices").withIndex("by_companyId", q => q.eq("companyId", rooferCompany)).take(10));
    expect(selected).toMatchObject([{ service: "roofing", serviceId: roofing }]);
    const savedCompany = await t.run(ctx => ctx.db.get(rooferCompany));
    expect(savedCompany?.directorySearchText).toContain("roofing");
    expect(savedCompany?.directorySearchText).not.toContain("serviceroofing");
  });

  test("onboarding saves IDs, rejects new inactive IDs, and preserves an existing inactive selection", async () => {
    const t = convexTest(schema, modules);
    const admin = as(t, await user(t, "admin"));
    const ownerId = await user(t, "company");
    const owner = as(t, ownerId);
    const companyId = await company(t, ownerId);
    const active = await admin.mutation(api.serviceCatalog.create, { slug: "masonry", nameFr: "Maçonnerie", nameEn: "Masonry", sortOrder: 0 });
    const inactive = await admin.mutation(api.serviceCatalog.create, { slug: "roofing", nameFr: "Toiture", nameEn: "Roofing", sortOrder: 10 });
    await admin.mutation(api.serviceCatalog.edit, { id: inactive, slug: "roofing", nameFr: "Toiture", nameEn: "Roofing", sortOrder: 10, isActive: false });
    expect((await owner.query(api.companies.index.getOnboardingProfile, {}))?.catalogServices.map(item => item._id)).toEqual([active]);
    await expect(owner.mutation(api.companies.index.completeOnboarding, { ...onboarding, serviceIds: [inactive] })).rejects.toThrow("INVALID_SERVICES");
    await owner.mutation(api.companies.index.completeOnboarding, { ...onboarding, serviceIds: [active] });
    const rows = await t.run(ctx => ctx.db.query("companyServices").withIndex("by_companyId", q => q.eq("companyId", companyId)).take(10));
    expect(rows).toMatchObject([{ service: "masonry", serviceId: active }]);
    await admin.mutation(api.serviceCatalog.edit, { id: active, slug: "masonry", nameFr: "Maçonnerie", nameEn: "Masonry", sortOrder: 0, isActive: false });
    expect((await owner.query(api.companies.index.getProfileManager, {})).selectedServiceIds).toEqual([active]);
    const replacement = await admin.mutation(api.serviceCatalog.create, { slug: "painting", nameFr: "Peinture", nameEn: "Painting", sortOrder: 20 });
    await owner.mutation(api.companies.index.updatePublicProfile, { serviceIds: [active, replacement] });
    const preserved = await t.run(ctx => ctx.db.query("companyServices").withIndex("by_companyId", q => q.eq("companyId", companyId)).take(10));
    expect(preserved.map(row => row.serviceId).sort()).toEqual([active, replacement].sort());
    await expect(admin.mutation(api.serviceCatalog.edit, { id: active, slug: "new-masonry", nameFr: "Maçonnerie", nameEn: "Masonry", sortOrder: 0, isActive: false })).rejects.toThrow("SERVICE_SLUG_IN_USE");
    await expect(owner.mutation(api.companies.index.updatePublicProfile, { serviceIds: [active, inactive, replacement] })).rejects.toThrow("INVALID_SERVICES");
    await owner.mutation(api.companies.index.updatePublicProfile, { serviceIds: [replacement] });
    const removed = await t.run(ctx => ctx.db.query("companyServices").withIndex("by_companyId", q => q.eq("companyId", companyId)).take(10));
    expect(removed.map(row => row.serviceId)).toEqual([replacement]);
    await expect(owner.mutation(api.companies.index.updatePublicProfile, { serviceIds: [active, replacement] })).rejects.toThrow("INVALID_SERVICES");
  });

  test("each company can change only its own service relationship rows", async () => {
    const t = convexTest(schema, modules);
    const admin = as(t, await user(t, "admin"));
    const firstUser = await user(t, "company");
    const secondUser = await user(t, "company");
    const firstCompany = await company(t, firstUser);
    const secondCompany = await company(t, secondUser);
    const service = await admin.mutation(api.serviceCatalog.create, { slug: "electrical-work", nameFr: "Électricité", nameEn: "Electrical work", sortOrder: 0 });
    const otherService = await admin.mutation(api.serviceCatalog.create, { slug: "plastering", nameFr: "Plâtrerie", nameEn: "Plastering", sortOrder: 10 });
    await as(t, firstUser).mutation(api.companies.index.completeOnboarding, { ...onboarding, serviceIds: [service] });
    await as(t, secondUser).mutation(api.companies.index.completeOnboarding, { ...onboarding, serviceIds: [otherService] });
    await as(t, firstUser).mutation(api.companies.index.updatePublicProfile, { serviceIds: [service, otherService] });
    const firstRows = await t.run(ctx => ctx.db.query("companyServices").withIndex("by_companyId", q => q.eq("companyId", firstCompany)).take(10));
    const secondRows = await t.run(ctx => ctx.db.query("companyServices").withIndex("by_companyId", q => q.eq("companyId", secondCompany)).take(10));
    expect(firstRows.map(row => row.serviceId).sort()).toEqual([service, otherService].sort());
    expect(secondRows.map(row => row.serviceId)).toEqual([otherService]);
  });

  test("seed and legacy backfill are repeatable and preserve unknown values", async () => {
    const t = convexTest(schema, modules);
    const admin = as(t, await user(t, "admin"));
    const ownerId = await user(t, "company");
    const companyId = await company(t, ownerId);
    await t.run(ctx => ctx.db.insert("companyServices", { companyId, service: "structural", createdAt: 1, updatedAt: 1 }));
    await t.run(ctx => ctx.db.insert("companyServices", { companyId, service: "unknown-legacy", createdAt: 1, updatedAt: 1 }));
    expect(await admin.mutation(api.serviceCatalog.seedDefaults, {})).toEqual({ created: 10 });
    expect(await admin.mutation(api.serviceCatalog.seedDefaults, {})).toEqual({ created: 0 });
    expect(await t.run(ctx => ctx.db.query("serviceCatalogHistory").take(20))).toHaveLength(10);
    const structuralId = (await admin.query(api.serviceCatalog.listAdmin, {})).find(item => item.slug === "structural")!._id;
    const beforeMigration = await as(t, ownerId).query(api.companies.index.getOnboardingProfile, {});
    expect(beforeMigration?.selectedServiceIds).toEqual([structuralId]);
    expect(beforeMigration?.services).toContain("unknown-legacy");
    const first = await admin.mutation(api.serviceCatalog.migrateLegacySelections, { paginationOpts: { numItems: 50, cursor: null } });
    expect(first).toMatchObject({ migrated: 1, unresolved: ["unknown-legacy"], isDone: true });
    const second = await admin.mutation(api.serviceCatalog.migrateLegacySelections, { paginationOpts: { numItems: 50, cursor: null } });
    expect(second).toMatchObject({ migrated: 0, unresolved: ["unknown-legacy"], isDone: true });
    const rows = await t.run(ctx => ctx.db.query("companyServices").withIndex("by_companyId", q => q.eq("companyId", companyId)).take(10));
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.service === "structural")?.serviceId).toBeDefined();
    expect(rows.find(row => row.service === "unknown-legacy")?.serviceId).toBeUndefined();
    await as(t, ownerId).mutation(api.companies.index.completeOnboarding, { ...onboarding, serviceIds: [structuralId] });
    const afterOnboarding = await t.run(ctx => ctx.db.query("companyServices").withIndex("by_companyId", q => q.eq("companyId", companyId)).take(10));
    expect(afterOnboarding.map(row => row.service).sort()).toEqual(["structural", "unknown-legacy"]);
  });
});
