/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { PROJECT_SEED_CLIENT_EMAIL, SEED_PROJECTS } from "./dev/seedProjects";
import { buildProjectMarketplaceSearchText } from "./projects/marketplaceSearch";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type TestBackend = ReturnType<typeof convexTest>;

beforeEach(() => {
  process.env.ALLOW_DEV_PROJECT_SEED = "true";
});

afterEach(() => {
  delete process.env.ALLOW_DEV_PROJECT_SEED;
});

async function createUser(t: TestBackend, accountType: "client" | "company", suffix: string) {
  return await t.run((ctx) => ctx.db.insert("users", {
    email: `${suffix}@test.invalid`, firstName: "Existing", lastName: "User", accountType,
    onboardingStatus: "completed", countryCode: "MA", createdAt: 10, updatedAt: 10,
  }));
}

async function createExistingProject(t: TestBackend, clientId: Id<"users">, index: number) {
  const base = {
    clientId, primaryCategory: "renovation" as const, city: "rabat" as const,
    neighborhood: "Agdal", countryCode: "MA" as const, title: `Existing project ${index}`,
    propertyType: "apartment" as const, surface: 80 + index, surfaceUnknown: false,
    description: "A normal development project that must remain untouched by seed commands.",
    budgetRange: "100000_250000" as const, budgetMin: 100_000, budgetMax: 250_000,
    budgetUnknown: false, timeline: "one_to_three_months" as const,
    visibility: "marketplace" as const, status: "published" as const, lastCompletedStep: 6,
    createdAt: 100 + index, updatedAt: 200 + index, submittedAt: 150 + index, publishedAt: 200 + index,
  };
  return await t.run((ctx) => ctx.db.insert("projects", {
    ...base, marketplaceSearchText: buildProjectMarketplaceSearchText(base),
  }));
}

async function createCompany(t: TestBackend) {
  const userId = await createUser(t, "company", "marketplace-company");
  const companyId = await t.run((ctx) => ctx.db.insert("companies", {
    name: "Marketplace Test Company", city: "rabat", description: "Completed verified test company.",
    onboardingStatus: "completed", verificationStatus: "verified", createdAt: 10, updatedAt: 10,
  }));
  await t.run((ctx) => ctx.db.insert("companyMembers", {
    companyId, userId, role: "owner", status: "active", createdAt: 10,
  }));
  return userId;
}

function asUser(t: TestBackend, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

describe("development project seed", () => {
  test("creates exactly 20 valid projects and is idempotent", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(internal.dev.seedProjects.seedDemoProjects, { confirmDevSeed: true });

    expect(first).toMatchObject({
      createdProjects: 20, skippedProjects: 0, createdHistory: 34,
      statusDistribution: { published: 16, pending_review: 2, draft: 2 },
    });
    expect(first.cities).toEqual(["agadir", "casablanca", "fes", "marrakech", "rabat", "tangier"]);
    expect(first.categories).toEqual([
      "buildingConstruction", "electrical", "finishing", "houseConstruction", "interior",
      "painting", "plumbing", "pool", "renovation", "structural",
    ]);

    const inspection = await t.query(internal.dev.seedProjects.inspectDemoProjects, {});
    expect(inspection).toMatchObject({
      totalProjects: 20, seedProjects: 20,
      statusDistribution: { published: 16, pending_review: 2, draft: 2 },
      brokenClientReferences: 0, invalidHistoryProjects: 0, duplicateSeedTitles: 0,
    });
    const profileAndOwnership = await t.run(async (ctx) => {
      const client = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", PROJECT_SEED_CLIENT_EMAIL)).unique();
      if (!client) return null;
      const profile = await ctx.db.query("clientProfiles").withIndex("by_userId", (q) => q.eq("userId", client._id)).unique();
      const owned = await ctx.db.query("projects").withIndex("by_clientId", (q) => q.eq("clientId", client._id)).take(21);
      return { profile, owned: owned.length };
    });
    expect(profileAndOwnership?.profile?.onboardingStatus).toBe("completed");
    expect(profileAndOwnership?.owned).toBe(20);

    const second = await t.mutation(internal.dev.seedProjects.seedDemoProjects, { confirmDevSeed: true });
    expect(second).toMatchObject({ createdProjects: 0, skippedProjects: 20, createdHistory: 0 });
    expect((await t.query(internal.dev.seedProjects.inspectDemoProjects, {})).seedProjects).toBe(20);
  });

  test("shows only published projects through filters and two-page pagination", async () => {
    const t = convexTest(schema, modules);
    const companyUserId = await createCompany(t);
    await t.mutation(internal.dev.seedProjects.seedDemoProjects, { confirmDevSeed: true });
    const caller = asUser(t, companyUserId);
    const first = await caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    const second = await caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
      paginationOpts: { numItems: 10, cursor: first.continueCursor },
    });
    expect(first.page).toHaveLength(10);
    expect(first.isDone).toBe(false);
    expect(second.page).toHaveLength(6);
    expect(second.isDone).toBe(true);
    const visible = [...first.page, ...second.page];
    expect(new Set(visible.map((project) => project.id)).size).toBe(16);
    const hiddenTitles = new Set(SEED_PROJECTS.filter((project) => project.status !== "published").map((project) => project.title));
    expect(visible.some((project) => hiddenTitles.has(project.title))).toBe(false);

    const filter = async (args: { city?: "agadir"; category?: "pool"; budgetRange?: "under_50000" }) =>
      await caller.query(api.projects.marketplace.listCompanyMarketplaceProjects, {
        paginationOpts: { numItems: 20, cursor: null }, ...args,
      });
    const agadir = await filter({ city: "agadir" });
    expect(agadir.page).toHaveLength(3);
    expect(agadir.page.every((project) => project.city === "agadir")).toBe(true);
    const pool = await filter({ category: "pool" });
    expect(pool.page).toHaveLength(1);
    expect(pool.page[0]?.title).toBe("Swimming pool construction in Tangier");
    const budget = await filter({ budgetRange: "under_50000" });
    expect(budget.page).toHaveLength(1);
    expect(budget.page[0]?.budgetRange).toBe("under_50000");
  });

  test("cleanup removes only seed projects/history and preserves three existing projects", async () => {
    const t = convexTest(schema, modules);
    const clientId = await createUser(t, "client", "existing-client");
    const existingIds = await Promise.all([0, 1, 2].map((index) => createExistingProject(t, clientId, index)));
    await t.run(async (ctx) => {
      await ctx.db.insert("projectStatusHistory", {
        projectId: existingIds[0], oldStatus: "pending_review", newStatus: "published",
        changedBy: clientId, changedAt: 200, reason: "Normal project approval",
      });
    });
    const before = await t.query(internal.dev.seedProjects.inspectDemoProjects, {});
    await t.mutation(internal.dev.seedProjects.seedDemoProjects, { confirmDevSeed: true });
    const afterSeed = await t.query(internal.dev.seedProjects.inspectDemoProjects, {});
    expect(afterSeed.totalProjects).toBe(23);
    expect(afterSeed.nonSeedProjects).toEqual(before.nonSeedProjects);

    const cleared = await t.mutation(internal.dev.seedProjects.clearDemoProjects, { confirmDevSeed: true });
    expect(cleared).toEqual({ deletedProjects: 20, deletedHistory: 34, skippedProjects: 0 });
    const afterClear = await t.query(internal.dev.seedProjects.inspectDemoProjects, {});
    expect(afterClear.totalProjects).toBe(3);
    expect(afterClear.seedProjects).toBe(0);
    expect(afterClear.nonSeedProjects).toEqual(before.nonSeedProjects);
    const normalHistory = await t.run((ctx) => ctx.db.query("projectStatusHistory").withIndex("by_projectId", (q) => q.eq("projectId", existingIds[0])).take(2));
    expect(normalHistory).toHaveLength(1);
    expect(normalHistory[0]?.reason).toBe("Normal project approval");
  });

  test("requires both explicit confirmation and deployment opt-in", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(internal.dev.seedProjects.seedDemoProjects, { confirmDevSeed: false })).rejects.toThrow(/confirmDevSeed/);
    delete process.env.ALLOW_DEV_PROJECT_SEED;
    await expect(t.mutation(internal.dev.seedProjects.seedDemoProjects, { confirmDevSeed: true })).rejects.toThrow(/ALLOW_DEV_PROJECT_SEED/);
  });
});
