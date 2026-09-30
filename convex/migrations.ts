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

export function legacyCompanyOperationalStatusPatch(company: Record<string, unknown>) {
  const operationalStatus = company.operationalStatus ?? "normal";
  const directoryListed = operationalStatus !== "suspended";
  const patch = {
    ...(company.operationalStatus === undefined
      ? { operationalStatus: "normal" as const }
      : {}),
    ...(company.directoryListed !== directoryListed
      ? { directoryListed }
      : {}),
  };
  return Object.keys(patch).length > 0 ? patch : undefined;
}

/**
 * Removes only the obsolete Client Project budget fields.
 *
 * The migration component provides bounded batches, resumability, dry runs,
 * and idempotent reruns. Deploy this only while the five legacy schema fields
 * remain optional; narrowing the schema is a separate post-verification deploy.
 * Production execution requires separate approval.
 */
export const clearLegacyProjectBudgetFields = migrations.define({
  table: "projects",
  migrateOne: (_ctx, project) => legacyProjectBudgetPatch(project),
});

/**
 * Materializes the implicit `normal` status and directory eligibility used by
 * legacy Company rows, and repairs eligibility drift on explicit statuses.
 *
 * The migration-ready directory query keeps legacy rows visible, then switches
 * automatically to exact indexed eligibility after this reaches completion.
 * Production execution requires separate approval.
 */
export const backfillCompanyOperationalStatus = migrations.define({
  table: "companies",
  migrateOne: (_ctx, company) => legacyCompanyOperationalStatusPatch(company),
});
