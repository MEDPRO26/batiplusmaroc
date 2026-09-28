import { describe, expect, test } from "vitest";
import { legacyProjectBudgetPatch } from "./migrations";

describe("legacy Project budget migration", () => {
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
