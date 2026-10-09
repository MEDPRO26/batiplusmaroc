/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createOrUpdateAuthUser } from "./lib/authSecurity";
import { ensureAccountFoundation } from "./lib/accountFoundation";
import { getProvincesByRegion } from "../lib/geography/morocco";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const policyEnv = "COMPANY_HEADQUARTERS_POLICY_VERSION";
const headquarters = { regionCode: "09", provinceCode: "09.001", communeName: null };
const empty = { regionCode: null, provinceCode: null, communeName: null };
const input = {
  name: "Atlas Construction", legalName: "", phone: "0612345678", city: "Agadir",
  description: "Construction and renovation of residential buildings.", services: ["renovation"], website: "",
};
const backend = () => convexTest(schema, modules);
type Backend = ReturnType<typeof backend>;
const owner = (t: Backend, userId: Id<"users">) => t.withIdentity({ subject: `${userId}|test-session` });

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  process.env.JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
  process.env.CONVEX_SITE_URL = "https://example.convex.site";
});
beforeEach(() => vi.stubEnv(policyEnv, "structured_v1"));
afterEach(() => vi.unstubAllEnvs());

async function create(t: Backend) {
  return t.run(async ctx => {
    const userId = await ctx.db.insert("users", { accountType: "company", onboardingStatus: "pending", email: "owner@hq2.test", acceptedTerms: true, termsAcceptedAt: 100 });
    const foundation = await ensureAccountFoundation(ctx, { userId, accountType: "company", now: 100 });
    if (foundation.accountType !== "company") throw new Error("Expected Company");
    await ctx.db.insert("serviceCatalog", { slug: "renovation", nameFr: "Rénovation", nameEn: "Renovation", isActive: true, sortOrder: 1, createdAt: 100, updatedAt: 100 });
    return { userId, companyId: foundation.companyId, memberId: foundation.companyMemberId };
  });
}
async function snapshot(t: Backend) {
  return t.run(async ctx => ({
    users: await ctx.db.query("users").collect(), companies: await ctx.db.query("companies").collect(),
    services: await ctx.db.query("companyServices").collect(), members: await ctx.db.query("companyMembers").collect(),
    coverage: await ctx.db.query("companyCoverageIndex").collect(), verifications: await ctx.db.query("companyVerifications").collect(),
  }));
}

describe("HQ2 enrollment boundary and creation paths", () => {
  test("password registration assigns only the server's policy, including forged signup flags", async () => {
    const t = backend();
    await t.action(api.auth.signIn, { provider: "password", params: {
      flow: "signUp", email: "new@hq2.test", password: "secure-password", firstName: "New", lastName: "Owner",
      accountType: "company", acceptedTerms: "true", marketingOptIn: "false", headquartersPolicyVersion: "legacy",
    } });
    const state = await snapshot(t);
    expect(state.companies).toHaveLength(1);
    expect(state.companies[0]).toMatchObject({ headquartersPolicyVersion: "structured_v1", onboardingStatus: "pending" });
    expect(state.coverage).toEqual([]);
    expect(state.companies[0].coverageScopeKeys).toBeUndefined();
  });
  test.each(["oauth-finalization", "foundation-repair", "existing-auth-callback", "verified-oauth-link"] as const)("%s enrolls new foundations and replays preserve the marker", async path => {
    const t = backend();
    const userId = await t.run(ctx => ctx.db.insert("users", {
      email: "linked@hq2.test", emailVerificationTime: 100, acceptedTerms: true, termsAcceptedAt: 100,
      ...(path === "oauth-finalization" ? {} : { accountType: "company" as const }),
    }));
    const action = async () => {
      if (path === "oauth-finalization") return owner(t, userId).mutation(api.users.finalizeOAuthSignup, { accountType: "company", acceptedTerms: true, marketingOptIn: false });
      if (path === "foundation-repair") return owner(t, userId).mutation(api.users.ensureCurrentUserFoundation, {});
      return t.run(ctx => createOrUpdateAuthUser(ctx, { existingUserId: path === "verified-oauth-link" ? null : userId, type: "oauth", profile: { email: "linked@hq2.test", name: "Linked Owner" } }));
    };
    await action();
    vi.stubEnv(policyEnv, undefined);
    await action();
    const state = await snapshot(t);
    expect(state.companies).toHaveLength(1); expect(state.members).toHaveLength(1);
    expect(state.companies[0].headquartersPolicyVersion).toBe("structured_v1");
  });
  test("internal fictional seed preserves legacy rows and cannot create completed city-only Companies after activation", async () => {
    const t = backend();
    vi.stubEnv(policyEnv, undefined);
    await t.mutation(internal.dev.seedCompanies.seedDemoCompanies, { confirmDevSeed: true });
    const legacy = await snapshot(t);
    expect(legacy.companies.length).toBeGreaterThan(0);
    expect(legacy.companies.every(row => row.headquartersPolicyVersion === undefined)).toBe(true);
    vi.stubEnv(policyEnv, "structured_v1");
    await t.mutation(internal.dev.seedCompanies.seedDemoCompanies, { confirmDevSeed: true });
    expect((await snapshot(t)).companies).toEqual(legacy.companies);
    const fresh = backend();
    const before = await snapshot(fresh);
    await expect(fresh.mutation(internal.dev.seedCompanies.seedDemoCompanies, { confirmDevSeed: true })).rejects.toThrow("DEV_SEED_STRUCTURED_HEADQUARTERS_REQUIRED");
    expect(await snapshot(fresh)).toEqual(before);
  });
  test("inactive enrollment ignores forged marker fields and keeps city-only onboarding compatible", async () => {
    vi.stubEnv(policyEnv, undefined);
    const t = backend();
    const userId = await t.run(ctx => createOrUpdateAuthUser(ctx, { existingUserId: null, type: "credentials", profile: { email: "legacy@hq2.test", accountType: "company", acceptedTerms: true, headquartersPolicyVersion: "structured_v1" } }));
    expect((await snapshot(t)).companies[0].headquartersPolicyVersion).toBeUndefined();
    await t.run(ctx => ctx.db.insert("serviceCatalog", { slug: "renovation", nameFr: "Rénovation", nameEn: "Renovation", isActive: true, sortOrder: 1, createdAt: 100, updatedAt: 100 }));
    vi.stubEnv(policyEnv, "structured_v1");
    await owner(t, userId).mutation(api.users.ensureCurrentUserFoundation, {});
    await owner(t, userId).mutation(api.companies.index.completeOnboarding, input);
    expect((await snapshot(t)).companies[0]).toMatchObject({ onboardingStatus: "completed", city: "Agadir" });
    expect((await snapshot(t)).companies[0].headquartersPolicyVersion).toBeUndefined();
  });
  test("invalid activation fails closed and rolls back OAuth role/foundation writes", async () => {
    const t = backend();
    const userId = await t.run(ctx => ctx.db.insert("users", { email: "pending@hq2.test" }));
    const before = await snapshot(t);
    vi.stubEnv(policyEnv, "legacy");
    await expect(owner(t, userId).mutation(api.users.finalizeOAuthSignup, { accountType: "company", acceptedTerms: true, marketingOptIn: false })).rejects.toThrow("COMPANY_HEADQUARTERS_POLICY_UNAVAILABLE");
    expect(await snapshot(t)).toEqual(before);
  });
});

describe("HQ2 authoritative onboarding", () => {
  test.each([
    [undefined, "COMPANY_HEADQUARTERS_REGION_REQUIRED"],
    [empty, "COMPANY_HEADQUARTERS_REGION_REQUIRED"],
    [{ ...headquarters, regionCode: null }, "COMPANY_HEADQUARTERS_REGION_REQUIRED"],
    [{ ...headquarters, provinceCode: null }, "COMPANY_HEADQUARTERS_PROVINCE_REQUIRED"],
    [{ ...headquarters, regionCode: "99" }, "INVALID_COMPANY_HEADQUARTERS_REGION"],
    [{ ...headquarters, provinceCode: "09.999" }, "INVALID_COMPANY_HEADQUARTERS_PROVINCE"],
    [{ ...headquarters, provinceCode: getProvincesByRegion("06")[0].code }, "COMPANY_HEADQUARTERS_PROVINCE_REGION_MISMATCH"],
    [{ ...headquarters, communeName: "a".repeat(101) }, "INVALID_COMPANY_HEADQUARTERS_COMMUNE"],
    [{ ...headquarters, communeName: "Agadir\t" }, "INVALID_COMPANY_HEADQUARTERS_COMMUNE"],
  ] as const)("rejects %j with %s before any writes", async (hq, code) => {
    const t = backend(); const ids = await create(t); const before = await snapshot(t);
    vi.stubEnv(policyEnv, undefined); // Enrollment setting never determines existing-record enforcement.
    await expect(owner(t, ids.userId).mutation(api.companies.index.completeOnboarding, { ...input, ...(hq === undefined ? {} : { headquarters: hq }) })).rejects.toThrow(code);
    expect(await snapshot(t)).toEqual(before);
  });
  test.each(["", " ", "A", "Agadir 42", "a".repeat(81)])("invalid city %j cannot complete and rolls back", async city => {
    const t = backend(); const ids = await create(t); const before = await snapshot(t);
    await expect(owner(t, ids.userId).mutation(api.companies.index.completeOnboarding, { ...input, headquarters, city })).rejects.toThrow("INVALID_CITY");
    expect(await snapshot(t)).toEqual(before);
  });
  test.each([null, "  Agadir\u00a0 Centre  "])("valid headquarters with optional commune %j completes without coverage", async communeName => {
    const t = backend(); const ids = await create(t);
    const caller = owner(t, ids.userId);
    await caller.mutation(api.companies.index.completeOnboarding, { ...input, city: "  Agadir  ", headquarters: { ...headquarters, communeName } });
    const state = await snapshot(t);
    expect(state.companies[0]).toMatchObject({ headquartersPolicyVersion: "structured_v1", headquartersRegionCode: "09", headquartersProvinceCode: "09.001", city: "Agadir", onboardingStatus: "completed" });
    expect(state.companies[0].headquartersCommune).toBe(communeName === null ? undefined : "Agadir Centre");
    expect(state.users[0].onboardingStatus).toBe("completed");
    expect(state.services).toHaveLength(1); expect(state.coverage).toEqual([]);
    expect(state.companies[0].serviceAreas).toBeUndefined(); expect(state.companies[0].coverageScopeKeys).toBeUndefined();
    // Exact retries reuse stored valid geography; the old optional argument shape remains supported.
    await caller.mutation(api.companies.index.completeOnboarding, input);
    expect((await snapshot(t)).services).toHaveLength(1);
    const profile = await caller.query(api.companies.index.getOnboardingProfile, {});
    expect(profile?.headquartersPolicyVersion).toBe("structured_v1");
    expect(profile).not.toHaveProperty("address");
  });
  test("legacy pending Company can voluntarily add geography and clear it through the historical profile contract", async () => {
    vi.stubEnv(policyEnv, undefined); const t = backend(); const ids = await create(t);
    vi.stubEnv(policyEnv, "structured_v1"); const caller = owner(t, ids.userId);
    expect((await caller.query(api.companies.index.getOnboardingProfile, {}))?.headquartersPolicyVersion).toBeNull();
    await caller.mutation(api.companies.index.completeOnboarding, { ...input, headquarters });
    await caller.mutation(api.companies.index.updatePublicProfile, { headquarters: empty });
    await caller.mutation(api.companies.index.updatePublicProfile, { description: input.description });
    expect((await snapshot(t)).companies[0].headquartersRegionCode).toBeUndefined();
    const listing = await t.query(api.companies.directory.listPublicCompanies, { paginationOpts: { numItems: 10, cursor: null }, sort: "newest", verifiedOnly: false });
    expect(listing.page).toHaveLength(1);
  });
  test("marked Company cannot erase headquarters via profile, but old profile shapes remain valid", async () => {
    const t = backend(); const ids = await create(t); const caller = owner(t, ids.userId);
    await caller.mutation(api.companies.index.completeOnboarding, { ...input, headquarters });
    const before = await snapshot(t);
    await expect(caller.mutation(api.companies.index.updatePublicProfile, { headquarters: empty })).rejects.toThrow("COMPANY_HEADQUARTERS_REGION_REQUIRED");
    expect(await snapshot(t)).toEqual(before);
    await caller.mutation(api.companies.index.updatePublicProfile, { description: input.description });
    expect((await snapshot(t)).companies[0].headquartersPolicyVersion).toBe("structured_v1");
  });
  test.each(["headquartersPolicyVersion", "country", "countryCode"])("rejects unexpected client-owned %s input atomically", async key => {
    const t = backend(); const ids = await create(t); const caller = owner(t, ids.userId);
    await caller.mutation(api.companies.index.completeOnboarding, { ...input, headquarters });
    for (const value of [null, "legacy", "structured_v1", "FR"]) {
      const before = await snapshot(t);
      await expect(caller.mutation(api.companies.index.completeOnboarding, { ...input, headquarters, [key]: value } as never)).rejects.toThrow();
      await expect(caller.mutation(api.companies.index.updatePublicProfile, { description: input.description, [key]: value } as never)).rejects.toThrow();
      expect(await snapshot(t)).toEqual(before);
    }
  });
  test.each(["anonymous", "client", "admin", "staff", "inactive", "other-owner"])("%s cannot change Company headquarters or policy", async kind => {
    const t = backend(); const ids = await create(t); let userId = ids.userId;
    if (["client", "admin", "other-owner"].includes(kind)) {
      userId = await t.run(ctx => ctx.db.insert("users", { accountType: kind === "client" ? "client" : kind === "admin" ? "admin" : "company" }));
    }
    if (kind === "staff" || kind === "inactive") await t.run(ctx => ctx.db.patch(ids.memberId, kind === "staff" ? { role: "staff" } : { status: "inactive" }));
    const before = await snapshot(t); const caller = kind === "anonymous" ? t : owner(t, userId);
    await expect(caller.mutation(api.companies.index.completeOnboarding, { ...input, headquarters })).rejects.toThrow();
    await expect(caller.mutation(api.companies.index.updatePublicProfile, { headquarters })).rejects.toThrow();
    expect(await snapshot(t)).toEqual(before);
  });
  test("pre-existing coverage, service areas and private verification data survive onboarding unchanged", async () => {
    const t = backend(); const ids = await create(t);
    await t.run(async ctx => {
      await ctx.db.patch(ids.companyId, { serviceAreas: ["rabat"], coverageScopeKeys: ["R:04"] });
      await ctx.db.insert("companyCoverageIndex", { companyId: ids.companyId, areaKey: "R:04" });
      await ctx.db.insert("companyVerifications", { companyId: ids.companyId, legalName: "Private Legal Name", ice: "001122334455667", rcNumber: "Private RC", legalRepresentative: "Private Owner", phone: "0612345678", address: "PRIVATE-ADDRESS", submittedAt: 100, createdAt: 100, updatedAt: 100 });
    });
    const before = await snapshot(t);
    await owner(t, ids.userId).mutation(api.companies.index.completeOnboarding, { ...input, headquarters });
    const after = await snapshot(t);
    expect(after.coverage).toEqual(before.coverage); expect(after.verifications).toEqual(before.verifications);
    expect(after.companies[0].coverageScopeKeys).toEqual(before.companies[0].coverageScopeKeys);
    expect(after.companies[0].serviceAreas).toEqual(before.companies[0].serviceAreas);
    const profile = await owner(t, ids.userId).query(api.companies.index.getOnboardingProfile, {});
    expect(JSON.stringify(profile)).not.toContain("PRIVATE-ADDRESS");
  });
});
