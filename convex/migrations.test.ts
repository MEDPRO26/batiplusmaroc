/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  legacyCompanyOperationalStatusPatch,
  legacyProjectBudgetPatch,
} from "./migrations";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("legacy Project budget migration", () => {
  test("the migration deploy schema accepts both legacy and clean Projects", async () => {
    const t = convexTest(schema, modules);
    const clientId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "budget-migration@example.com",
        accountType: "client",
        onboardingStatus: "completed",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const common = {
      clientId,
      countryCode: "MA" as const,
      surfaceUnknown: true,
      visibility: "marketplace" as const,
      status: "published" as const,
      lastCompletedStep: 4,
      createdAt: 1,
      updatedAt: 1,
    };

    const [legacyId, cleanId] = await t.run(async (ctx) =>
      await Promise.all([
        ctx.db.insert("projects", {
          ...common,
          budgetRange: "100000_250000",
          budgetMin: 100_000,
          budgetMax: 250_000,
          budgetUnknown: false,
          marketplaceBudgetRank: 3,
        }),
        ctx.db.insert("projects", common),
      ]),
    );

    await expect(t.run((ctx) => ctx.db.get(legacyId))).resolves.toMatchObject({
      budgetRange: "100000_250000",
      budgetMin: 100_000,
      budgetMax: 250_000,
      budgetUnknown: false,
      marketplaceBudgetRank: 3,
    });
    await expect(t.run((ctx) => ctx.db.get(cleanId))).resolves.not.toHaveProperty(
      "budgetRange",
    );
  });

  test("unsets exactly the five obsolete fields without changing other Project data", () => {
    const project = {
      title: "Rabat renovation",
      status: "published",
      budgetRange: "100000_250000",
      budgetMin: 100_000,
      budgetMax: 250_000,
      budgetUnknown: false,
      marketplaceBudgetRank: 3,
    };

    expect(legacyProjectBudgetPatch(project)).toEqual({
      budgetRange: undefined,
      budgetMin: undefined,
      budgetMax: undefined,
      budgetUnknown: undefined,
      marketplaceBudgetRank: undefined,
    });
    expect(project).toMatchObject({ title: "Rabat renovation", status: "published" });
  });

  test("is a no-op for an already-clean Project", () => {
    expect(legacyProjectBudgetPatch({ title: "Current Project", status: "draft" })).toBeUndefined();
  });
});

describe("legacy Company operational-status migration", () => {
  test("materializes missing legacy status as normal", () => {
    expect(legacyCompanyOperationalStatusPatch({ name: "Legacy Company" })).toEqual({
      operationalStatus: "normal",
      directoryListed: true,
    });
  });

  test.each([
    ["normal", true],
    ["needs_attention", true],
    ["suspended", false],
  ] as const)(
    "preserves an explicit %s status and backfills its eligibility",
    (operationalStatus, directoryListed) => {
      expect(legacyCompanyOperationalStatusPatch({ operationalStatus })).toEqual({
        directoryListed,
      });
      expect(legacyCompanyOperationalStatusPatch({
        operationalStatus,
        directoryListed,
      })).toBeUndefined();
    },
  );
});
