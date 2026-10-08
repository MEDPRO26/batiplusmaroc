/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import type { FunctionArgs, WithoutSystemFields } from "convex/server";
import { v } from "convex/values";
import { describe, expect, test, vi } from "vitest";
import { MAX_COMPANY_COVERAGE_SCOPES } from "../lib/geography/company-coverage";
import { getProvincesByRegion, getRegions } from "../lib/geography/morocco";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { buildCompanyDirectorySearchText } from "./companies/directory";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Backend = TestConvex<typeof schema>;
type CompanyInput = WithoutSystemFields<Doc<"companies">>;
type UserInput = WithoutSystemFields<Doc<"users">>;
type UpdateArgs = FunctionArgs<typeof api.companies.index.updateMyGeographicCoverage>;
const coverageApi = api.companies.index;
const allScopes = ["MA", ...getRegions().map((region) => `R:${region.code}`),
  ...getRegions().flatMap((region) => getProvincesByRegion(region.code).map((province) => `P:${province.code}`))];

async function seedCompany(t: Backend, label = "atlas", options: {
  company?: Partial<CompanyInput>;
  user?: Partial<UserInput>;
  role?: "owner" | "staff";
  status?: "active" | "inactive";
  withMembership?: boolean;
} = {}) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: `${label}@coverage.test`, accountType: "company", onboardingStatus: "completed",
      firstName: "Owner", lastName: "Private", countryCode: "MA", createdAt: 100, updatedAt: 100,
      ...options.user,
    });
    const companyId = await ctx.db.insert("companies", {
      name: `${label} Construction`, slug: `${label}-construction`, city: "Agadir", serviceAreas: ["agadir"],
      legalName: "PRIVATE-LEGAL-NAME", phone: "0612345678",
      description: "Construction and renovation services with an established Company profile.",
      onboardingStatus: "completed", verificationStatus: "verified", operationalStatus: "normal", directoryListed: true,
      directorySearchText: buildCompanyDirectorySearchText({ name: `${label} Construction`, city: "Agadir", services: ["renovation"], serviceAreas: ["agadir"] }),
      createdAt: 100, updatedAt: 100, ...options.company,
    });
    const membershipId = options.withMembership === false ? null : await ctx.db.insert("companyMembers", {
      companyId, userId, role: options.role ?? "owner", status: options.status ?? "active", createdAt: 100,
    });
    await ctx.db.insert("companyServices", { companyId, service: "renovation", createdAt: 100, updatedAt: 100 });
    const verificationId = await ctx.db.insert("companyVerifications", {
      companyId, legalName: "PRIVATE-LEGAL-NAME", ice: "001122334455667", rcNumber: "PRIVATE-RC",
      legalRepresentative: "PRIVATE-REPRESENTATIVE", phone: "0600000000", address: "PRIVATE-ADDRESS",
      submittedAt: 100, createdAt: 100, updatedAt: 100,
    });
    return { userId, companyId, membershipId, verificationId };
  });
}

function asUser(t: Backend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

async function snapshot(t: Backend) {
  return await t.run(async (ctx) => ({
    companies: await ctx.db.query("companies").take(20),
    rows: await ctx.db.query("companyCoverageIndex").take(250),
    users: await ctx.db.query("users").take(20),
    memberships: await ctx.db.query("companyMembers").take(30),
    verifications: await ctx.db.query("companyVerifications").take(20),
  }));
}

async function companyState(t: Backend, companyId: Id<"companies">) {
  return await t.run(async (ctx) => ({
    company: await ctx.db.get(companyId),
    rows: await ctx.db.query("companyCoverageIndex")
      .withIndex("by_companyId_and_areaKey", (q) => q.eq("companyId", companyId)).take(100),
  }));
}

async function expectSynchronized(t: Backend, companyId: Id<"companies">, expected: string[]) {
  const state = await companyState(t, companyId);
  expect(state.company?.coverageScopeKeys).toEqual(expected);
  expect(state.rows.map((row) => row.areaKey).sort()).toEqual([...expected].sort());
  expect(new Set(state.rows.map((row) => row.areaKey)).size).toBe(state.rows.length);
  expect(state.rows.every((row) => row.companyId === companyId)).toBe(true);
  return state;
}

async function expectDenied(t: Backend, caller: Pick<Backend, "query" | "mutation">, error: string) {
  const before = await snapshot(t);
  await expect(caller.query(coverageApi.getMyGeographicCoverage, {})).rejects.toThrow(error);
  await expect(caller.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["MA"] })).rejects.toThrow(error);
  expect(await snapshot(t)).toEqual(before);
}

describe("GEO7 authoritative selections and derived rows", () => {
  test("legacy headquarters and serviceAreas stay unconfigured and reads perform no backfill", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const before = await snapshot(t);
    await expect(asUser(t, company.userId).query(coverageApi.getMyGeographicCoverage, {})).resolves.toEqual([]);
    expect(await snapshot(t)).toEqual(before);
    expect((await companyState(t, company.companyId)).company).not.toHaveProperty("coverageScopeKeys");
  });

  test.each([
    { label: "national without inferred regions", keys: ["MA"] },
    { label: "one complete region without inferred provinces", keys: ["R:09"] },
    { label: "multiple regions", keys: ["R:09", "R:01"] },
    { label: "one province", keys: ["P:09.541"] },
    { label: "multiple provinces", keys: ["P:09.541", "P:01.511"] },
    { label: "mixed explicit overlaps", keys: ["P:09.541", "R:09", "MA", "R:01"] },
    { label: "explicit empty coverage", keys: [] },
  ])("first save stores $label and preserves legacy/private fields", async ({ keys }) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const before = (await companyState(t, company.companyId)).company!;
    const owner = asUser(t, company.userId);
    await expect(owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: keys })).resolves.toBeNull();
    const stored = await expectSynchronized(t, company.companyId, keys);
    expect(stored.company).toEqual({ ...before, coverageScopeKeys: keys, updatedAt: expect.any(Number) });
    await expect(owner.query(coverageApi.getMyGeographicCoverage, {})).resolves.toEqual(keys);
  });

  test("replacement removes stale rows, retains unchanged rows and isolates other Companies", async () => {
    const t = convexTest(schema, modules);
    const first = await seedCompany(t, "first");
    const other = await seedCompany(t, "other");
    const owner = asUser(t, first.userId);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["MA", "R:09", "P:01.511"] });
    await asUser(t, other.userId).mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["MA"] });
    const before = await companyState(t, first.companyId);
    const otherBefore = await companyState(t, other.companyId);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["R:09", "P:09.541"] });
    const after = await expectSynchronized(t, first.companyId, ["R:09", "P:09.541"]);
    expect(after.rows.find((row) => row.areaKey === "R:09")?._id).toBe(before.rows.find((row) => row.areaKey === "R:09")?._id);
    expect(await companyState(t, other.companyId)).toEqual(otherBefore);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: [] });
    await expectSynchronized(t, first.companyId, []);
    expect(await companyState(t, other.companyId)).toEqual(otherBefore);
  });

  test("identical updates keep row identities and the Company timestamp unchanged", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const owner = asUser(t, company.userId);
    const keys = ["MA", "R:09", "P:09.541"];
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: keys });
    const before = await snapshot(t);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
    try {
      for (let retry = 0; retry < 3; retry++) await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: keys });
      expect(await snapshot(t)).toEqual(before);
    } finally { clock.mockRestore(); }
  });

  test("a reordered selection preserves its explicit order and reuses the same derived rows", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const owner = asUser(t, company.userId);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["R:09", "P:09.541"] });
    const before = await companyState(t, company.companyId);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["P:09.541", "R:09"] });
    expect((await expectSynchronized(t, company.companyId, ["P:09.541", "R:09"])).rows).toEqual(before.rows);
  });

  test("accepts the catalogue maximum, indexes exactly that selection and clears all rows", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const owner = asUser(t, company.userId);
    expect(allScopes).toHaveLength(MAX_COMPANY_COVERAGE_SCOPES);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: allScopes });
    await expectSynchronized(t, company.companyId, allScopes);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: [] });
    await expectSynchronized(t, company.companyId, []);
  });

  test("older updatePublicProfile callers cannot overwrite structured declarations", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const owner = asUser(t, company.userId);
    await owner.mutation(coverageApi.updatePublicProfile, { city: "Rabat", serviceAreas: ["rabat", "agadir"] });
    await expect(owner.query(coverageApi.getMyGeographicCoverage, {})).resolves.toEqual([]);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["P:09.541", "R:01"] });
    const before = await companyState(t, company.companyId);
    await owner.mutation(coverageApi.updatePublicProfile, { name: "Updated Profile", city: "Casablanca", serviceAreas: ["casablanca"] });
    const after = await expectSynchronized(t, company.companyId, ["P:09.541", "R:01"]);
    expect(after.company).toMatchObject({ city: "Casablanca", serviceAreas: ["casablanca"] });
    expect(after.rows).toEqual(before.rows);
  });

  test("simultaneous replacements and exact retries leave one complete synchronized selection", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const owner = asUser(t, company.userId);
    const selections = [["MA"], ["R:01", "P:09.541"], ["P:01.511"], [], ["R:09", "P:09.541"]];
    await Promise.all([...selections, ...selections].map((keys) => owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: keys })));
    const selected = await owner.query(coverageApi.getMyGeographicCoverage, {});
    expect(selections).toContainEqual(selected);
    await expectSynchronized(t, company.companyId, selected);
    const before = await snapshot(t);
    await Promise.all([1, 2, 3].map(() => owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: selected })));
    expect(await snapshot(t)).toEqual(before);
  });

  test("simultaneous updates for separate owners cannot cross Company boundaries", async () => {
    const t = convexTest(schema, modules);
    const first = await seedCompany(t, "first");
    const second = await seedCompany(t, "second");
    await Promise.all([
      asUser(t, first.userId).mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["R:01"] }),
      asUser(t, second.userId).mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["MA", "P:09.541"] }),
    ]);
    await expectSynchronized(t, first.companyId, ["R:01"]);
    await expectSynchronized(t, second.companyId, ["MA", "P:09.541"]);
  });
});

describe("GEO7 private owner authorization", () => {
  test("rejects anonymous reads and writes", async () => {
    const t = convexTest(schema, modules);
    await seedCompany(t);
    await expectDenied(t, t, "NOT_AUTHENTICATED");
  });

  test.each(["client", "admin", "seo_team"] as const)("rejects a %s even with an owner membership", async (accountType) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "wrong-role", { user: { accountType } });
    await expectDenied(t, asUser(t, company.userId), "COMPANY_ACCOUNT_REQUIRED");
  });

  test.each([
    { label: "staff", options: { role: "staff" as const }, error: "COMPANY_OWNER_REQUIRED" },
    { label: "inactive owner", options: { status: "inactive" as const }, error: "COMPANY_OWNER_REQUIRED" },
    { label: "no membership", options: { withMembership: false }, error: "COMPANY_MEMBERSHIP_REQUIRED" },
    { label: "incomplete Company", options: { company: { onboardingStatus: "pending" as const } }, error: "COMPANY_ONBOARDING_REQUIRED" },
    { label: "unset account type", options: { user: { accountType: undefined } }, error: "COMPANY_ACCOUNT_REQUIRED" },
  ])("rejects $label using existing profile guards", async ({ options, error }) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "denied", options);
    await expectDenied(t, asUser(t, company.userId), error);
  });

  test("keeps the existing profile guard for a pending User with a completed Company", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "existing-rule", { user: { onboardingStatus: "pending" } });
    const owner = asUser(t, company.userId);
    await expect(owner.query(coverageApi.getProfileManager, {})).resolves.toMatchObject({ city: "Agadir" });
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["R:09"] });
    await expect(owner.query(coverageApi.getMyGeographicCoverage, {})).resolves.toEqual(["R:09"]);
  });

  test.each(["same Company", "different Company"])("fails closed for duplicate membership foundations: %s", async (target) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "owner");
    const other = await seedCompany(t, "other");
    await t.run((ctx) => ctx.db.insert("companyMembers", {
      userId: company.userId, companyId: target === "same Company" ? company.companyId : other.companyId,
      role: "owner", status: "active", createdAt: 100,
    }));
    await expectDenied(t, asUser(t, company.userId), "DUPLICATE_ACCOUNT_FOUNDATION");
  });

  test.each(["user", "Company"])("denies a deleted %s without changing orphaned history", async (entity) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const owner = asUser(t, company.userId);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["MA"] });
    await t.run((ctx) => ctx.db.delete(entity === "user" ? company.userId : company.companyId));
    await expectDenied(t, owner, entity === "user" ? "USER_NOT_FOUND" : "COMPANY_NOT_FOUND");
  });

  test("rechecks revoked membership and changed role on every retry", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const owner = asUser(t, company.userId);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["MA"] });
    await t.run((ctx) => ctx.db.patch(company.membershipId!, { status: "inactive" }));
    await expectDenied(t, owner, "COMPANY_OWNER_REQUIRED");
    await t.run(async (ctx) => {
      await ctx.db.patch(company.membershipId!, { status: "active" });
      await ctx.db.patch(company.userId, { accountType: "client" });
    });
    await expectDenied(t, owner, "COMPANY_ACCOUNT_REQUIRED");
  });

  test("a different Company sees and edits only its own selections; forged Company IDs are rejected", async () => {
    const t = convexTest(schema, modules);
    const first = await seedCompany(t, "first");
    const other = await seedCompany(t, "other");
    await asUser(t, first.userId).mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["MA"] });
    const caller = asUser(t, other.userId);
    await expect(caller.query(coverageApi.getMyGeographicCoverage, {})).resolves.toEqual([]);
    const before = await snapshot(t);
    await expect(caller.query(coverageApi.getMyGeographicCoverage, { companyId: first.companyId } as unknown as Record<string, never>)).rejects.toThrow();
    await expect(caller.mutation(coverageApi.updateMyGeographicCoverage, {
      companyId: first.companyId, coverageScopeKeys: ["R:09"],
    } as UpdateArgs)).rejects.toThrow();
    expect(await snapshot(t)).toEqual(before);
    await caller.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["P:09.541"] });
    await expectSynchronized(t, first.companyId, ["MA"]);
    await expectSynchronized(t, other.companyId, ["P:09.541"]);
  });
});

describe("GEO7 validation, repair and atomic failures", () => {
  test.each([
    { keys: ["MA", "R:9"], error: "INVALID_COMPANY_COVERAGE_SCOPE" },
    { keys: ["MA", "R:99"], error: "INVALID_COMPANY_COVERAGE_SCOPE" },
    { keys: ["R:09", "P:09.000"], error: "INVALID_COMPANY_COVERAGE_SCOPE" },
    { keys: ["MA", "MA"], error: "DUPLICATE_COMPANY_COVERAGE_SCOPE" },
    { keys: ["R:09", "R:09"], error: "DUPLICATE_COMPANY_COVERAGE_SCOPE" },
    { keys: ["P:09.541", "P:09.541"], error: "DUPLICATE_COMPANY_COVERAGE_SCOPE" },
    { keys: [...allScopes, "MA"], error: "COMPANY_COVERAGE_LIMIT_EXCEEDED" },
  ])("rejects $error before any writes: $keys", async ({ keys, error }) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const owner = asUser(t, company.userId);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["P:09.541"] });
    const before = await snapshot(t);
    await expect(owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: keys })).rejects.toThrow(error);
    expect(await snapshot(t)).toEqual(before);
  });

  test.each([{}, { coverageScopeKeys: null }, { coverageScopeKeys: [9] }, { coverageScopeKeys: "MA" }])("validates the API argument shape %j", async (args) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const before = await snapshot(t);
    await expect(asUser(t, company.userId).mutation(coverageApi.updateMyGeographicCoverage, args as unknown as UpdateArgs)).rejects.toThrow();
    expect(await snapshot(t)).toEqual(before);
  });

  test.each([
    { label: "unknown code", keys: ["R:99"] },
    { label: "duplicate selection", keys: ["MA", "MA"] },
    { label: "oversized selection", keys: Array<string>(MAX_COMPANY_COVERAGE_SCOPES + 1).fill("MA") },
  ])("fails closed on a stored $label and allows an explicit valid repair", async ({ keys }) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "corrupt", { company: { coverageScopeKeys: keys } });
    const owner = asUser(t, company.userId);
    const before = await snapshot(t);
    await expect(owner.query(coverageApi.getMyGeographicCoverage, {})).rejects.toThrow("INVALID_COMPANY_COVERAGE_STATE");
    expect(await snapshot(t)).toEqual(before);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["P:09.541"] });
    await expectSynchronized(t, company.companyId, ["P:09.541"]);
  });

  test("repairs bounded duplicates, malformed/stale rows and missing rows even for an unchanged selection", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "repair", { company: { coverageScopeKeys: ["R:09", "P:09.541"] } });
    const other = await seedCompany(t, "other");
    await asUser(t, other.userId).mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["MA"] });
    await t.run(async (ctx) => {
      for (const areaKey of ["R:09", "R:09", "MA", "garbage", "R:99"]) await ctx.db.insert("companyCoverageIndex", { companyId: company.companyId, areaKey });
    });
    const otherBefore = await companyState(t, other.companyId);
    const owner = asUser(t, company.userId);
    await expect(owner.query(coverageApi.getMyGeographicCoverage, {})).resolves.toEqual(["R:09", "P:09.541"]);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["R:09", "P:09.541"] });
    const after = await expectSynchronized(t, company.companyId, ["R:09", "P:09.541"]);
    expect(after.company?.updatedAt).toBe(100);
    expect(await companyState(t, other.companyId)).toEqual(otherBefore);
  });

  test("stale derived national coverage cannot turn an old Company into nationwide coverage", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    await t.run((ctx) => ctx.db.insert("companyCoverageIndex", { companyId: company.companyId, areaKey: "MA" }));
    const owner = asUser(t, company.userId);
    await expect(owner.query(coverageApi.getMyGeographicCoverage, {})).resolves.toEqual([]);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: [] });
    await expectSynchronized(t, company.companyId, []);
  });

  test("detects excess derived rows instead of reconciling only a bounded prefix", async () => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "excess", { company: { coverageScopeKeys: ["R:09"] } });
    await t.run(async (ctx) => {
      for (let index = 0; index <= MAX_COMPANY_COVERAGE_SCOPES; index++) await ctx.db.insert("companyCoverageIndex", { companyId: company.companyId, areaKey: "R:09" });
    });
    const owner = asUser(t, company.userId);
    const before = await snapshot(t);
    await expect(owner.query(coverageApi.getMyGeographicCoverage, {})).resolves.toEqual(["R:09"]);
    await expect(owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["MA"] })).rejects.toThrow("COMPANY_COVERAGE_INDEX_CORRUPTED");
    expect(await snapshot(t)).toEqual(before);
  });

  test.each(["insert", "patch"] as const)("rolls back deletions and insertions when %s fails inside the real mutation", async (failurePoint) => {
    let failing = false;
    let inserts = 0;
    const t = convexTest(schema, { ...modules, "./companies/index.ts": async () => {
      const original = await modules["./companies/index.ts"]() as typeof import("./companies/index");
      const update = original.updateMyGeographicCoverage as typeof original.updateMyGeographicCoverage & {
        _handler: (ctx: MutationCtx, args: UpdateArgs) => Promise<null>;
      };
      return { ...original, updateMyGeographicCoverage: mutation({
        args: { coverageScopeKeys: v.array(v.string()) }, returns: v.null(),
        // Fault injection wraps the actual handler and native writer inside its transaction.
        handler: async (ctx, args) => await update._handler({ ...ctx, db: new Proxy(ctx.db, {
          get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if ((property === "insert" || property === "patch") && typeof value === "function") {
              return new Proxy(value, { apply(write, thisArg, parameters) {
                if (failing && property === failurePoint && (property === "patch" || ++inserts === 2)) {
                  throw new Error("Injected coverage write failure");
                }
                return Reflect.apply(write, thisArg, parameters);
              } });
            }
            return value;
          },
        }) }, args),
      }) };
    } });
    const company = await seedCompany(t);
    const owner = asUser(t, company.userId);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["MA"] });
    const before = await snapshot(t);
    failing = true;
    await expect(owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["R:01", "P:09.541"] })).rejects.toThrow("Injected coverage write failure");
    expect(await snapshot(t)).toEqual(before);
    failing = false;
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["R:01", "P:09.541"] });
    await expectSynchronized(t, company.companyId, ["R:01", "P:09.541"]);
  });
});

async function seedRuralProject(t: Backend) {
  return await t.run(async (ctx) => {
    const clientId = await ctx.db.insert("users", { accountType: "client", onboardingStatus: "completed", createdAt: 100, updatedAt: 100 });
    return await ctx.db.insert("projects", {
      clientId, countryCode: "MA", regionCode: "09", provinceCode: "09.541", locationMode: "structured",
      localityName: "PRIVATE-DOUAR", communeName: "PRIVATE-COMMUNE", neighborhood: "PRIVATE-NEIGHBORHOOD",
      title: "Renovation of a rural family house", primaryCategory: "renovation", propertyType: "house",
      surfaceUnknown: true, description: "Complete house renovation including plumbing and electrical work.",
      timeline: "flexible", status: "published", visibility: "marketplace", lastCompletedStep: 6,
      createdAt: 100, updatedAt: 100, submittedAt: 100, publishedAt: 100,
    });
  });
}

const quoteInput = {
  message: "We can deliver this renovation with a dedicated site team.", estimatedPrice: 185_000,
  estimatedDuration: 75, availableStartDate: "2099-01-15",
  scope: "Demolition, plumbing, electrical work, finishes, and site cleanup.",
} satisfies Omit<FunctionArgs<typeof api.quotes.index.submitInitialQuote>, "projectId">;

describe("GEO7 compatibility and single-scope index foundation", () => {
  test.each(["draft", "pending", "verified", "rejected"] as const)("preserves profile maintenance and proposal verification rules for %s", async (verificationStatus) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t, "verification", { company: { verificationStatus } });
    const owner = asUser(t, company.userId);
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["MA"] });
    expect((await expectSynchronized(t, company.companyId, ["MA"])).company?.verificationStatus).toBe(verificationStatus);
    const projectId = await seedRuralProject(t);
    const submit = owner.mutation(api.quotes.index.submitInitialQuote, { projectId, ...quoteInput });
    if (verificationStatus === "verified") await expect(submit).resolves.toMatchObject({ status: "submitted" });
    else await expect(submit).rejects.toThrow("COMPANY_VERIFICATION_REQUIRED");
  });

  test.each([undefined, "normal", "needs_attention", "suspended"] as const)("preserves operational profile, directory and proposal behavior for %s", async (operationalStatus) => {
    const t = convexTest(schema, modules);
    const suspended = operationalStatus === "suspended";
    const company = await seedCompany(t, "operational", { company: { operationalStatus, directoryListed: !suspended } });
    const owner = asUser(t, company.userId);
    const publicBefore = await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "operational-construction" });
    await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["MA", "P:09.541"] });
    await expect(owner.query(coverageApi.getMyGeographicCoverage, {})).resolves.toEqual(["MA", "P:09.541"]);
    const state = await expectSynchronized(t, company.companyId, ["MA", "P:09.541"]);
    expect(state.company?.operationalStatus).toBe(operationalStatus);
    expect(state.company?.directoryListed).toBe(!suspended);
    const page = await t.query(api.companies.directory.listPublicCompanies, {
      paginationOpts: { numItems: 10, cursor: null }, verifiedOnly: false, sort: "newest",
    });
    expect(page.page.map((row) => row.id)).toEqual(suspended ? [] : [company.companyId]);
    const publicAfter = await t.query(api.portfolio.index.getPublicCompanyProfile, { slug: "operational-construction" });
    expect(publicAfter).toEqual(publicBefore);
    expect(publicAfter?.marketplaceAvailable).toBe(!suspended);
    for (const dto of [publicAfter, page]) {
      expect(JSON.stringify(dto)).not.toMatch(/coverageScopeKeys|PRIVATE-LEGAL-NAME|PRIVATE-RC|PRIVATE-ADDRESS|PRIVATE-REPRESENTATIVE/);
    }
    const projectId = await seedRuralProject(t);
    const submit = owner.mutation(api.quotes.index.submitInitialQuote, { projectId, ...quoteInput });
    if (suspended) await expect(submit).rejects.toThrow("COMPANY_MARKETPLACE_SUSPENDED");
    else await expect(submit).resolves.toMatchObject({ status: "submitted" });
  });

  test.each([
    { label: "missing", keys: undefined }, { label: "empty", keys: [] },
    { label: "different region", keys: ["R:01"] }, { label: "different province", keys: ["P:01.511"] },
  ])("$label coverage never adds a proposal authorization gate for another area", async ({ keys }) => {
    const t = convexTest(schema, modules);
    const company = await seedCompany(t);
    const owner = asUser(t, company.userId);
    if (keys !== undefined) await owner.mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: keys });
    const projectId = await seedRuralProject(t);
    await expect(owner.mutation(api.quotes.index.submitInitialQuote, { projectId, ...quoteInput })).resolves.toMatchObject({ status: "submitted" });
  });

  test("one-scope prefix lookup returns explicit rows only, without national or regional expansion", async () => {
    const t = convexTest(schema, modules);
    const national = await seedCompany(t, "national");
    const region = await seedCompany(t, "region");
    const province = await seedCompany(t, "province");
    await asUser(t, national.userId).mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["MA"] });
    await asUser(t, region.userId).mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["R:09"] });
    await asUser(t, province.userId).mutation(coverageApi.updateMyGeographicCoverage, { coverageScopeKeys: ["P:09.541"] });
    for (const [areaKey, companyId] of [["MA", national.companyId], ["R:09", region.companyId], ["P:09.541", province.companyId]] as const) {
      const rows = await t.query((ctx) => ctx.db.query("companyCoverageIndex")
        .withIndex("by_areaKey_and_companyId", (q) => q.eq("areaKey", areaKey)).take(10));
      expect(rows.map((row) => ({ areaKey: row.areaKey, companyId: row.companyId }))).toEqual([{ areaKey, companyId }]);
    }
  });
});
