/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import type { FunctionArgs, WithoutSystemFields } from "convex/server";
import { describe, expect, test } from "vitest";
import { COMPANY_HEADQUARTERS_COMMUNE_MAX_LENGTH, type CompanyHeadquartersInput } from "../lib/geography/company-headquarters";
import { getProvincesByRegion, getRegions } from "../lib/geography/morocco";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { buildCompanyDirectorySearchText } from "./companies/directory";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = TestConvex<typeof schema>;
type Caller = Pick<Backend, "mutation" | "query">;
type CompanyInput = WithoutSystemFields<Doc<"companies">>;
type UserInput = WithoutSystemFields<Doc<"users">>;
type ProfileArgs = FunctionArgs<typeof api.companies.index.updatePublicProfile>;
type OnboardingArgs = FunctionArgs<typeof api.companies.index.completeOnboarding>;
type SharedExtras = Pick<ProfileArgs, "name" | "description" | "city" | "phone" | "services">;
type Mode = "onboarding" | "profile";
const modes: Mode[] = ["onboarding", "profile"];
const headquarters: CompanyHeadquartersInput = { regionCode: "09", provinceCode: "09.001", communeName: "Agadir" };
const clearHeadquarters: CompanyHeadquartersInput = { regionCode: null, provinceCode: null, communeName: null };
const storedHeadquarters = { headquartersRegionCode: "09", headquartersProvinceCode: "09.001", headquartersCommune: "Agadir" };
const fields = ["headquartersRegionCode", "headquartersProvinceCode", "headquartersCommune"] as const;

const onboardingInput = {
  name: "Atlas Construction", legalName: "Atlas Construction SARL", phone: "+212 6 12 34 56 78", city: "Agadir",
  description: "Construction and renovation services for residential projects.",
  services: ["renovation"], yearsExperience: 12, website: "atlas-construction.ma",
} satisfies OnboardingArgs;

async function seedCompany(t: Backend, label = "atlas", options: {
  company?: Partial<CompanyInput>;
  user?: Partial<UserInput>;
  role?: "owner" | "staff";
  status?: "active" | "inactive";
  withMembership?: boolean;
  indexKeys?: string[];
} = {}) {
  return await t.run(async (ctx) => {
    for (const [sortOrder, slug] of ["renovation", "structural"].entries()) {
      if (await ctx.db.query("serviceCatalog").withIndex("by_slug", (q) => q.eq("slug", slug)).unique() === null) {
        await ctx.db.insert("serviceCatalog", { slug, nameFr: slug, nameEn: slug, isActive: true, sortOrder, createdAt: 100, updatedAt: 100 });
      }
    }
    const userId = await ctx.db.insert("users", {
      email: `${label}@headquarters.test`, accountType: "company", onboardingStatus: "completed",
      firstName: "Owner", lastName: "Private", countryCode: "MA", createdAt: 100, updatedAt: 100, ...options.user,
    });
    const companyId = await ctx.db.insert("companies", {
      name: "Atlas Construction", legalName: "PRIVATE-LEGAL-NAME", slug: `${label}-construction`, phone: "0612345678", city: "Agadir",
      description: "Construction and renovation services for residential projects.",
      serviceAreas: ["agadir"], onboardingStatus: "completed", verificationStatus: "draft", operationalStatus: "normal", directoryListed: true,
      directorySearchText: buildCompanyDirectorySearchText({ name: "Atlas Construction", city: "Agadir", services: ["structural"], serviceAreas: ["agadir"] }),
      createdAt: 100, updatedAt: 100, ...options.company,
    });
    const membershipId = options.withMembership === false ? null : await ctx.db.insert("companyMembers", {
      companyId, userId, role: options.role ?? "owner", status: options.status ?? "active", createdAt: 100,
    });
    await ctx.db.insert("companyServices", { companyId, service: "structural", createdAt: 100, updatedAt: 100 });
    const verificationId = await ctx.db.insert("companyVerifications", {
      companyId, legalName: "PRIVATE-LEGAL-NAME", ice: "001122334455667", rcNumber: "PRIVATE-RC",
      legalRepresentative: "PRIVATE-REPRESENTATIVE", phone: "0600000000", address: "PRIVATE-LEGAL-ADDRESS",
      submittedAt: 100, createdAt: 100, updatedAt: 100,
    });
    await ctx.db.insert("portfolioProjects", {
      companyId, title: "Existing portfolio", description: "Existing portfolio description.", city: "Marrakech",
      projectType: "renovation", status: "draft", createdAt: 100, updatedAt: 100,
    });
    for (const areaKey of options.indexKeys ?? options.company?.coverageScopeKeys ?? []) {
      await ctx.db.insert("companyCoverageIndex", { companyId, areaKey });
    }
    return { userId, companyId, membershipId, verificationId };
  });
}

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

async function snapshot(t: Backend) {
  return await t.run(async (ctx) => ({
    companies: await ctx.db.query("companies").take(10),
    users: await ctx.db.query("users").take(10),
    members: await ctx.db.query("companyMembers").take(20),
    services: await ctx.db.query("companyServices").take(20),
    coverage: await ctx.db.query("companyCoverageIndex").take(100),
    verifications: await ctx.db.query("companyVerifications").take(10),
    portfolio: await ctx.db.query("portfolioProjects").take(10),
  }));
}

async function save(caller: Caller, mode: Mode, input: CompanyHeadquartersInput | undefined, extras: SharedExtras = {}) {
  return mode === "onboarding"
    ? await caller.mutation(api.companies.index.completeOnboarding, { ...onboardingInput, ...extras, ...(input === undefined ? {} : { headquarters: input }) })
    : await caller.mutation(api.companies.index.updatePublicProfile, { ...extras, ...(input === undefined ? {} : { headquarters: input }) });
}

function list(t: Backend, geography: { regionCode?: string; provinceCode?: string } = {}) {
  return t.query(api.companies.directory.listPublicCompanies, {
    paginationOpts: { numItems: 10, cursor: null }, sort: "newest", verifiedOnly: false, ...geography,
  });
}

describe.each(modes)("HQ1 %s snapshots", (mode) => {
  test("stores validated headquarters atomically and preloads both owner-private DTOs", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const owner = asUser(t, company.userId);
    await save(owner, mode, headquarters);
    const stored = await t.run((ctx) => ctx.db.get(company.companyId));
    expect(stored).toMatchObject({ ...storedHeadquarters, city: "Agadir", serviceAreas: ["agadir"], verificationStatus: "draft" });
    for (const dto of [await owner.query(api.companies.index.getOnboardingProfile, {}), await owner.query(api.companies.index.getProfileManager, {})]) {
      expect(dto?.headquarters).toEqual(headquarters);
      expect(Object.keys(dto!.headquarters).sort()).toEqual(["communeName", "provinceCode", "regionCode"]);
      expect(JSON.stringify(dto?.headquarters)).not.toContain("PRIVATE-LEGAL-ADDRESS");
    }
  });

  test.each([
    { label: "null commune", value: null, expected: undefined },
    { label: "blank commune", value: "  \u00a0 ", expected: undefined },
    { label: "Unicode commune", value: "  Aït\u00a0\u202f  Baha — آيت  باها ⴰⵢⵜ ⴱⴰⵀⴰ  ", expected: "Aït Baha — آيت باها ⴰⵢⵜ ⴱⴰⵀⴰ" },
    { label: "free-text name with punctuation", value: "Oulad Aïssa (Centre 2) / جماعة", expected: "Oulad Aïssa (Centre 2) / جماعة" },
    { label: "maximum length", value: "ⴰ".repeat(COMPANY_HEADQUARTERS_COMMUNE_MAX_LENGTH), expected: "ⴰ".repeat(COMPANY_HEADQUARTERS_COMMUNE_MAX_LENGTH) },
  ])("accepts $label without a commune database", async ({ value, expected }) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "commune", { company: storedHeadquarters });
    const owner = asUser(t, company.userId);
    await save(owner, mode, { ...headquarters, communeName: value });
    const stored = await t.run((ctx) => ctx.db.get(company.companyId));
    expect(stored?.headquartersCommune).toBe(expected);
    expect((await owner.query(api.companies.index.getProfileManager, {})).headquarters.communeName).toBe(expected ?? null);
    if (expected === undefined) expect(stored).not.toHaveProperty("headquartersCommune");
  });

  test("omitting the snapshot preserves saved fields for older callers", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "preserved", { company: storedHeadquarters });
    await save(asUser(t, company.userId), mode, undefined, { phone: "0611111111" });
    expect(await t.run((ctx) => ctx.db.get(company.companyId))).toMatchObject(storedHeadquarters);
  });

  test("all-null removes optional storage, preserves city, and never falls back to the legal address", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "clear", { company: { ...storedHeadquarters, coverageScopeKeys: ["R:01"] } });
    const before = await snapshot(t);
    const owner = asUser(t, company.userId);
    await save(owner, mode, clearHeadquarters);
    const stored = await t.run((ctx) => ctx.db.get(company.companyId));
    for (const field of fields) expect(stored).not.toHaveProperty(field);
    expect(stored).toMatchObject({ city: "Agadir", serviceAreas: ["agadir"], coverageScopeKeys: ["R:01"] });
    expect((await owner.query(api.companies.index.getOnboardingProfile, {}))?.headquarters).toEqual(clearHeadquarters);
    expect((await owner.query(api.companies.index.getProfileManager, {})).headquarters).toEqual(clearHeadquarters);
    const after = await snapshot(t);
    expect(after.coverage).toEqual(before.coverage);
    expect(after.verifications).toEqual(before.verifications);
    expect(after.portfolio).toEqual(before.portfolio);
  });

  test.each([
    { input: { ...headquarters, regionCode: "9" }, error: "INVALID_COMPANY_HEADQUARTERS_REGION" },
    { input: { ...headquarters, regionCode: "99" }, error: "INVALID_COMPANY_HEADQUARTERS_REGION" },
    { input: { ...headquarters, regionCode: " 09" }, error: "INVALID_COMPANY_HEADQUARTERS_REGION" },
    { input: { ...headquarters, regionCode: "Souss-Massa" }, error: "INVALID_COMPANY_HEADQUARTERS_REGION" },
    { input: { ...headquarters, provinceCode: "9.001" }, error: "INVALID_COMPANY_HEADQUARTERS_PROVINCE" },
    { input: { ...headquarters, provinceCode: "09.000" }, error: "INVALID_COMPANY_HEADQUARTERS_PROVINCE" },
    { input: { ...headquarters, provinceCode: "09-001" }, error: "INVALID_COMPANY_HEADQUARTERS_PROVINCE" },
    { input: { ...headquarters, provinceCode: "09.001 " }, error: "INVALID_COMPANY_HEADQUARTERS_PROVINCE" },
    { input: { ...headquarters, provinceCode: "Agadir" }, error: "INVALID_COMPANY_HEADQUARTERS_PROVINCE" },
    { input: { ...headquarters, provinceCode: "01.511" }, error: "COMPANY_HEADQUARTERS_PROVINCE_REGION_MISMATCH" },
    { input: { ...headquarters, regionCode: null }, error: "COMPANY_HEADQUARTERS_REGION_REQUIRED" },
    { input: { ...headquarters, provinceCode: null }, error: "COMPANY_HEADQUARTERS_PROVINCE_REQUIRED" },
    { input: { regionCode: null, provinceCode: null, communeName: "Commune only" }, error: "COMPANY_HEADQUARTERS_REGION_REQUIRED" },
    { input: { regionCode: null, provinceCode: null, communeName: "" }, error: "COMPANY_HEADQUARTERS_REGION_REQUIRED" },
    { input: { ...headquarters, communeName: "A".repeat(COMPANY_HEADQUARTERS_COMMUNE_MAX_LENGTH + 1) }, error: "INVALID_COMPANY_HEADQUARTERS_COMMUNE" },
    ...["\u0000", "\u0007", "\u007f", "\u0085", "\t", "\n", "\r", "\u202e", "\u2067"].map((control) => ({
      input: { ...headquarters, communeName: `Agadir${control}Centre` }, error: "INVALID_COMPANY_HEADQUARTERS_COMMUNE",
    })),
  ])("rejects $error without partial profile, service, User or coverage changes", async ({ input, error }) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "invalid", { company: { ...storedHeadquarters, coverageScopeKeys: ["MA"] } });
    const before = await snapshot(t);
    await expect(save(asUser(t, company.userId), mode, input, { name: "Attempted Profile Change", services: ["renovation"] })).rejects.toThrow(error);
    expect(await snapshot(t)).toEqual(before);
  });

  test.each([
    { label: "outer null", input: null },
    { label: "missing commune", input: { regionCode: "09", provinceCode: "09.001" } },
    { label: "partial object", input: { regionCode: "09" } },
    { label: "numeric codes", input: { regionCode: 9, provinceCode: 9.001, communeName: null } },
    { label: "legal-address claim", input: { ...headquarters, address: "PRIVATE-LEGAL-ADDRESS" } },
    { label: "country claim", input: { ...headquarters, countryCode: "MA" } },
  ])("validates the complete API snapshot: $label", async ({ input }) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const before = await snapshot(t);
    await expect(save(asUser(t, company.userId), mode, input as unknown as CompanyHeadquartersInput)).rejects.toThrow();
    expect(await snapshot(t)).toEqual(before);
  });

  test("other invalid profile fields cannot partially save valid headquarters", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const before = await snapshot(t);
    await expect(save(asUser(t, company.userId), mode, headquarters, { services: [] })).rejects.toThrow("INVALID_SERVICES");
    expect(await snapshot(t)).toEqual(before);
  });

  test("rolls back service changes and a written Company patch after an injected failure", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "rollback", { company: { ...storedHeadquarters, coverageScopeKeys: ["R:01"] } });
    const before = await snapshot(t);
    const original = await modules["./companies/index.ts"]() as typeof import("./companies/index");
    const registered = mode === "onboarding" ? original.completeOnboarding : original.updatePublicProfile;
    // Convex omits _handler from public types. Validated API behavior is tested above;
    // this fault-injection transaction invokes the same real handler and native writer.
    const handler = registered as unknown as { _handler: (ctx: MutationCtx, args: ProfileArgs | OnboardingArgs) => Promise<unknown> };
    const args = { ...(mode === "onboarding" ? onboardingInput : {}), services: ["renovation"], headquarters: { regionCode: "01", provinceCode: "01.511", communeName: "New Commune" } };
    await expect(asUser(t, company.userId).mutation(async (ctx) => await handler._handler({ ...ctx, db: new Proxy(ctx.db, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (property === "patch" && typeof value === "function") return new Proxy(value, {
          async apply(write, thisArg, parameters) {
            const result = await Reflect.apply(write, thisArg, parameters);
            if (parameters[0] === company.companyId) throw new Error("Injected headquarters patch failure");
            return result;
          },
        });
        return value;
      },
    }) }, args))).rejects.toThrow("Injected headquarters patch failure");
    expect(await snapshot(t)).toEqual(before);
  });
});

describe("HQ1 legacy compatibility and coverage independence", () => {
  test("city-only Companies remain valid, listed and unconfigured in both private headquarters DTOs", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const before = await snapshot(t);
    const owner = asUser(t, company.userId);
    expect((await owner.query(api.companies.index.getOnboardingProfile, {}))?.headquarters).toEqual(clearHeadquarters);
    expect((await owner.query(api.companies.index.getProfileManager, {})).headquarters).toEqual(clearHeadquarters);
    expect((await list(t)).page.map((row) => row.id)).toEqual([company.companyId]);
    expect((await list(t, { regionCode: "09" })).page).toEqual([]);
    expect(await snapshot(t)).toEqual(before);
  });

  test("older onboarding clients need no administrative pair and retain city normalization", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "old-onboarding", { company: { onboardingStatus: "pending" }, user: { onboardingStatus: "pending" } });
    const owner = asUser(t, company.userId);
    await expect(owner.mutation(api.companies.index.completeOnboarding, { ...onboardingInput, city: "  Aït   Baha  " })).resolves.toEqual({ onboardingStatus: "completed" });
    const state = await snapshot(t);
    expect(state.companies[0]).toMatchObject({ city: "Aït Baha", onboardingStatus: "completed", verificationStatus: "draft" });
    for (const field of fields) expect(state.companies[0]).not.toHaveProperty(field);
    expect(state.users[0].onboardingStatus).toBe("completed");
    expect(state.coverage).toEqual([]);
    expect((await owner.query(api.companies.index.getOnboardingProfile, {}))?.headquarters).toEqual(clearHeadquarters);
    expect((await list(t)).page.map((row) => row.id)).toEqual([company.companyId]);
  });

  test("initial structured onboarding preserves pending-account rules and Company relationships", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "new-onboarding", { company: { onboardingStatus: "pending" }, user: { onboardingStatus: "pending" } });
    await save(asUser(t, company.userId), "onboarding", headquarters);
    const state = await snapshot(t);
    expect(state.companies).toHaveLength(1);
    expect(state.members).toHaveLength(1);
    expect(state.companies[0]).toMatchObject({ ...storedHeadquarters, onboardingStatus: "completed", verificationStatus: "draft" });
    expect(state.users[0].onboardingStatus).toBe("completed");
    expect(state.services.map((row) => row.service)).toEqual(["renovation"]);
  });

  test("older profile patches preserve saved headquarters and explicit city patches keep existing normalization", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "old-profile", { company: storedHeadquarters });
    const owner = asUser(t, company.userId);
    await owner.mutation(api.companies.index.updatePublicProfile, { description: "An updated public profile description for construction services." });
    expect(await t.run((ctx) => ctx.db.get(company.companyId))).toMatchObject({ ...storedHeadquarters, city: "Agadir" });
    await owner.mutation(api.companies.index.updatePublicProfile, { city: "  Rabat  " });
    expect(await t.run((ctx) => ctx.db.get(company.companyId))).toMatchObject({ ...storedHeadquarters, city: "Rabat" });
  });

  test.each([
    { label: "missing coverage", keys: undefined }, { label: "empty coverage", keys: [] },
    { label: "national coverage", keys: ["MA"] }, { label: "other-area coverage", keys: ["R:01", "P:01.511"] },
  ])("headquarters saves and clearing preserve $label, legacy areas and index rows", async ({ keys }) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "independent", { company: { coverageScopeKeys: keys } });
    const before = await snapshot(t);
    const owner = asUser(t, company.userId);
    for (const mode of modes) for (const input of [headquarters, clearHeadquarters]) {
      await save(owner, mode, input);
      const after = await snapshot(t);
      expect(after.companies[0].coverageScopeKeys).toEqual(keys);
      if (keys === undefined) expect(after.companies[0]).not.toHaveProperty("coverageScopeKeys");
      expect(after.companies[0].serviceAreas).toEqual(before.companies[0].serviceAreas);
      expect(after.coverage).toEqual(before.coverage);
      expect(after.verifications).toEqual(before.verifications);
      expect(after.portfolio).toEqual(before.portfolio);
    }
  });

  test("a headquarters-only save cannot repair or manufacture coverage-index rows", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "stale-coverage", { company: { coverageScopeKeys: [] }, indexKeys: ["MA", "invalid", "MA"] });
    const before = await snapshot(t);
    await save(asUser(t, company.userId), "profile", headquarters);
    expect((await snapshot(t)).coverage).toEqual(before.coverage);
    expect((await list(t, { regionCode: "09" })).page).toEqual([]);
  });

  test("Agadir headquarters with no declared coverage still has zero Souss-Massa results", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "agadir", { company: { coverageScopeKeys: [] } });
    const publicBefore = await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "agadir-construction" });
    const directoryBefore = await list(t);
    await save(asUser(t, company.userId), "profile", { ...headquarters, communeName: "PRIVATE-HEADQUARTERS-COMMUNE" });
    expect(await list(t)).toEqual(directoryBefore);
    expect(await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "agadir-construction" })).toEqual(publicBefore);
    expect((await list(t, { regionCode: "09" })).page).toEqual([]);
    expect((await list(t, { regionCode: "09", provinceCode: "09.001" })).page).toEqual([]);
    expect((await snapshot(t)).coverage).toEqual([]);
    for (const dto of [directoryBefore, publicBefore]) expect(JSON.stringify(dto)).not.toMatch(/headquarters|PRIVATE-LEGAL-ADDRESS|PRIVATE-HEADQUARTERS-COMMUNE/);
  });

  test("existing coverage drives geographic discovery independently of headquarters", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "covered", { company: { coverageScopeKeys: ["P:01.511"] } });
    await save(asUser(t, company.userId), "profile", headquarters);
    expect((await list(t, { regionCode: "01" })).page.map((row) => row.id)).toEqual([company.companyId]);
    expect((await list(t, { regionCode: "09" })).page).toEqual([]);
  });

  test("every GEO1 administrative pair can be saved with its exact HCP string codes", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const owner = asUser(t, company.userId);
    for (const region of getRegions()) for (const province of getProvincesByRegion(region.code)) {
      await save(owner, "profile", { regionCode: region.code, provinceCode: province.code, communeName: null });
      expect((await owner.query(api.companies.index.getProfileManager, {})).headquarters).toEqual({ regionCode: region.code, provinceCode: province.code, communeName: null });
    }
    expect((await snapshot(t)).coverage).toEqual([]);
  });

  test("concurrent headquarters replacements save one complete snapshot and preserve explicit coverage", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "concurrent", { company: { coverageScopeKeys: ["R:01"] } });
    const owner = asUser(t, company.userId);
    const before = await snapshot(t);
    const selections = [headquarters, clearHeadquarters, { regionCode: "01", provinceCode: "01.511", communeName: "Tanger" }];
    await Promise.all(selections.map((input) => save(owner, "profile", input)));
    const selected = (await owner.query(api.companies.index.getProfileManager, {})).headquarters;
    expect(selections).toContainEqual(selected);
    expect((await snapshot(t)).coverage).toEqual(before.coverage);
    await Promise.all([
      save(owner, "profile", headquarters),
      owner.mutation(api.companies.index.updateMyGeographicCoverage, { coverageScopeKeys: ["P:09.541"] }),
    ]);
    expect(await t.run((ctx) => ctx.db.get(company.companyId))).toMatchObject({ ...storedHeadquarters, coverageScopeKeys: ["P:09.541"] });
  });
});

describe("HQ1 existing authorization and operational rules", () => {
  test("anonymous mutations and profile reads are denied; anonymous onboarding preload stays null", async () => {
    const t = convexTest(schema, modules);
    await seedCompany(t);
    const before = await snapshot(t);
    for (const mode of modes) await expect(save(t, mode, headquarters)).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(t.query(api.companies.index.getProfileManager, {})).rejects.toThrow("NOT_AUTHENTICATED");
    await expect(t.query(api.companies.index.getOnboardingProfile, {})).resolves.toBeNull();
    expect(await snapshot(t)).toEqual(before);
  });

  test.each([
    { label: "Client", user: { accountType: "client" as const }, error: "COMPANY_ACCOUNT_REQUIRED" },
    { label: "admin", user: { accountType: "admin" as const }, error: "COMPANY_ACCOUNT_REQUIRED" },
    { label: "SEO", user: { accountType: "seo_team" as const }, error: "COMPANY_ACCOUNT_REQUIRED" },
    { label: "staff", role: "staff" as const, error: "COMPANY_OWNER_REQUIRED" },
    { label: "inactive owner", status: "inactive" as const, error: "COMPANY_OWNER_REQUIRED" },
    { label: "missing membership", withMembership: false, error: "COMPANY_MEMBERSHIP_REQUIRED" },
  ])("rejects $label reads and writes without changing any records", async ({ label, error, ...options }) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, label, options);
    const owner = asUser(t, company.userId);
    const before = await snapshot(t);
    for (const mode of modes) await expect(save(owner, mode, headquarters)).rejects.toThrow(error);
    for (const query of [api.companies.index.getOnboardingProfile, api.companies.index.getProfileManager]) await expect(owner.query(query, {})).rejects.toThrow(error);
    expect(await snapshot(t)).toEqual(before);
  });

  test("requires completed Company onboarding for profile writes and preserves pending User profile access", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "pending-company", { company: { onboardingStatus: "pending" } });
    const owner = asUser(t, company.userId);
    const before = await snapshot(t);
    await expect(save(owner, "profile", headquarters)).rejects.toThrow("COMPANY_ONBOARDING_REQUIRED");
    expect(await snapshot(t)).toEqual(before);
    await t.run(async (ctx) => { await ctx.db.patch(company.companyId, { onboardingStatus: "completed" }); await ctx.db.patch(company.userId, { onboardingStatus: "pending" }); });
    await save(owner, "profile", headquarters);
    expect((await owner.query(api.companies.index.getProfileManager, {})).headquarters).toEqual(headquarters);
  });

  test.each(["duplicate membership", "deleted Company", "deleted User", "revoked owner"])("fails closed on $label", async (condition) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    if (condition === "duplicate membership") await t.run((ctx) => ctx.db.insert("companyMembers", { companyId: company.companyId, userId: company.userId, role: "owner", status: "active", createdAt: 101 }));
    if (condition === "deleted Company") await t.run((ctx) => ctx.db.delete(company.companyId));
    if (condition === "deleted User") await t.run((ctx) => ctx.db.delete(company.userId));
    if (condition === "revoked owner") await t.run((ctx) => ctx.db.patch(company.membershipId!, { status: "inactive" }));
    const errors: Record<string, string> = { "duplicate membership": "DUPLICATE_ACCOUNT_FOUNDATION", "deleted Company": "COMPANY_NOT_FOUND", "deleted User": "USER_NOT_FOUND", "revoked owner": "COMPANY_OWNER_REQUIRED" };
    const before = await snapshot(t);
    for (const mode of modes) await expect(save(asUser(t, company.userId), mode, headquarters)).rejects.toThrow(errors[condition]);
    expect(await snapshot(t)).toEqual(before);
  });

  test("Company identity is membership-derived; foreign IDs and coverage claims are rejected", async () => {
    const t = convexTest(schema, modules);
    const first = await seedCompany(t, "first");
    const second = await seedCompany(t, "second", { company: storedHeadquarters });
    const owner = asUser(t, first.userId);
    const before = await snapshot(t);
    for (const mode of modes) for (const extras of [{ companyId: second.companyId }, { coverageScopeKeys: ["MA"] }]) {
      await expect(save(owner, mode, headquarters, extras as unknown as SharedExtras)).rejects.toThrow();
    }
    expect(await snapshot(t)).toEqual(before);
    await save(owner, "profile", { regionCode: "01", provinceCode: "01.511", communeName: null });
    const after = await snapshot(t);
    expect(after.companies.find((row) => row._id === second.companyId)).toEqual(before.companies.find((row) => row._id === second.companyId));
    expect((await owner.query(api.companies.index.getProfileManager, {})).headquarters.regionCode).toBe("01");
  });

  test.each(["draft", "pending", "verified", "rejected"] as const)("headquarters profile maintenance preserves %s verification and onboarding resubmission guards", async (verificationStatus) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "verification", { company: { verificationStatus } });
    const owner = asUser(t, company.userId);
    await save(owner, "profile", headquarters);
    expect(await t.run((ctx) => ctx.db.get(company.companyId))).toMatchObject({ ...storedHeadquarters, verificationStatus });
    if (verificationStatus !== "draft") {
      const before = await snapshot(t);
      await expect(save(owner, "onboarding", headquarters)).rejects.toThrow("INVALID_VERIFICATION_STATUS");
      expect(await snapshot(t)).toEqual(before);
    }
  });

  test.each([undefined, "normal", "needs_attention", "suspended"] as const)("headquarters edits preserve operational and directory behavior for %s", async (operationalStatus) => {
    const t = convexTest(schema, modules);
    const suspended = operationalStatus === "suspended";
    const company = await seedCompany(t, "operational", { company: { operationalStatus, directoryListed: !suspended, coverageScopeKeys: ["MA"] } });
    const owner = asUser(t, company.userId);
    const before = await list(t);
    const beforeCoverage = (await snapshot(t)).coverage;
    await save(owner, "profile", headquarters);
    expect(await list(t)).toEqual(before);
    expect((await list(t, { regionCode: "09" })).page.map((row) => row.id)).toEqual(suspended ? [] : [company.companyId]);
    expect(await t.run((ctx) => ctx.db.get(company.companyId))).toMatchObject({ directoryListed: !suspended, verificationStatus: "draft" });
    expect((await t.run((ctx) => ctx.db.get(company.companyId)))?.operationalStatus).toBe(operationalStatus);
    expect((await snapshot(t)).coverage).toEqual(beforeCoverage);
    expect((await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "operational-construction" }))?.marketplaceAvailable).toBe(!suspended);
  });
});
