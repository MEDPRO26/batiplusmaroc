/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import {
  DEMO_COMPANIES,
  SEED_SLUG_PREFIX,
} from "./dev/seedCompanies";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("dev company seed", () => {
  test("seeds 20 companies with verification mix and is idempotent", async () => {
    const t = convexTest(schema, modules);

    const first = await t.mutation(internal.dev.seedCompanies.seedDemoCompanies, {
      confirmDevSeed: true,
    });

    expect(first.createdCompanies).toBe(20);
    expect(first.skippedCompanies).toBe(0);
    expect(first.verification).toEqual({ verified: 12, pending: 5, draft: 3 });
    expect(first.cities).toEqual([
      "Agadir",
      "Casablanca",
      "Marrakech",
      "Rabat",
      "Tangier",
    ]);
    expect(first.createdPortfolio).toBe(
      DEMO_COMPANIES.reduce((sum, company) => sum + company.portfolio.length, 0),
    );
    expect(first.companySlugs.every((slug) => slug.startsWith(SEED_SLUG_PREFIX))).toBe(true);

    const second = await t.mutation(internal.dev.seedCompanies.seedDemoCompanies, {
      confirmDevSeed: true,
    });
    expect(second.createdCompanies).toBe(0);
    expect(second.skippedCompanies).toBe(20);
    expect(second.createdServices).toBe(0);
    expect(second.createdPortfolio).toBe(0);

    const companyCount = await t.run(async (ctx) => {
      let count = 0;
      for (const company of DEMO_COMPANIES) {
        const row = await ctx.db
          .query("companies")
          .withIndex("by_slug", (q) => q.eq("slug", company.slug))
          .unique();
        if (row) count += 1;
      }
      return count;
    });
    expect(companyCount).toBe(20);
  });

  test("clear removes only seed-demo companies", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("companies", {
        name: "Real User Company",
        slug: "real-user-company",
        city: "Casablanca",
        description: "Should not be deleted by seed cleanup.",
        onboardingStatus: "completed",
        verificationStatus: "verified",
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.mutation(internal.dev.seedCompanies.seedDemoCompanies, {
      confirmDevSeed: true,
    });

    const cleared = await t.mutation(internal.dev.seedCompanies.clearDemoCompanies, {
      confirmDevSeed: true,
    });
    expect(cleared.deletedCompanies).toBe(20);

    const remaining = await t.run(async (ctx) => {
      const real = await ctx.db
        .query("companies")
        .withIndex("by_slug", (q) => q.eq("slug", "real-user-company"))
        .unique();
      let seedLeft = 0;
      for (const company of DEMO_COMPANIES) {
        const row = await ctx.db
          .query("companies")
          .withIndex("by_slug", (q) => q.eq("slug", company.slug))
          .unique();
        if (row) seedLeft += 1;
      }
      return { realExists: Boolean(real), seedLeft };
    });

    expect(remaining.realExists).toBe(true);
    expect(remaining.seedLeft).toBe(0);
  });

  test("refuses without confirmDevSeed", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.dev.seedCompanies.seedDemoCompanies, {
        confirmDevSeed: false,
      }),
    ).rejects.toThrow(/confirmDevSeed/);
  });
});
