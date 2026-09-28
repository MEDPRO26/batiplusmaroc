import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";

const migrations = new Migrations(components.migrations, {
  defaultBatchSize: 10,
});

const legacyProjectBudgetFields = [
  "budgetRange",
  "budgetMin",
  "budgetMax",
  "budgetUnknown",
  "marketplaceBudgetRank",
] as const;

export function legacyProjectBudgetPatch(project: Record<string, unknown>) {
  if (!legacyProjectBudgetFields.some((field) => Object.prototype.hasOwnProperty.call(project, field))) {
    return;
  }
  return {
    budgetRange: undefined,
    budgetMin: undefined,
    budgetMax: undefined,
    budgetUnknown: undefined,
    marketplaceBudgetRank: undefined,
  };
}

/**
 * Removes only the obsolete Client Project budget fields.
 *
 * The migration component provides bounded batches, resumability, dry runs,
 * and idempotent reruns. Production execution requires separate approval.
 */
export const clearLegacyProjectBudgetFields = migrations.define({
  table: "projects",
  migrateOne: (_ctx, project) => legacyProjectBudgetPatch(project),
});
