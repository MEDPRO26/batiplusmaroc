import { Migrations } from "@convex-dev/migrations";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { env, internalMutation, internalQuery } from "./_generated/server";
import {
  assessmentProjectionPageArgs,
  assessmentProjectionPageResultFields,
  inspectAssessmentProjectionPage,
} from "./siteVisits/adminMigration";

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

/**
 * Private, aggregate-only preview/verification. Start with cursor null and sum
 * every page until isDone; the last page alone is not a coverage certificate.
 */
export const verifySiteAssessmentAdminProjections = internalQuery({
  args: assessmentProjectionPageArgs,
  returns: v.object(assessmentProjectionPageResultFields),
  handler: async (ctx, args) => (await inspectAssessmentProjectionPage(ctx, args)).summary,
});

/**
 * Explicit one-batch historical repair; defaults to a write-free preview.
 * Native component dry runs log whole private documents, so this migration
 * uses aggregate-only output and caller-held native creation-index cursors.
 * No scheduler/import/deployment hook invokes it. Deployment and execution
 * both require separate approval; keep indexed discovery disabled throughout.
 */
export const backfillSiteAssessmentAdminProjections = internalMutation({
  args: { ...assessmentProjectionPageArgs, dryRun: v.optional(v.boolean()) },
  returns: v.object({
    ...assessmentProjectionPageResultFields,
    dryRun: v.boolean(),
    updated: v.number(),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    if (!dryRun && env.ADMIN_SITE_VISIT_GEOGRAPHY_POLICY_VERSION === "indexed_v1") {
      throw new ConvexError("SITE_ASSESSMENT_BACKFILL_REQUIRES_DISABLED_READER");
    }
    const { summary, patches } = await inspectAssessmentProjectionPage(ctx, args);
    if (!dryRun) {
      if (summary.counts.sourceIntegrityFailures > 0 || summary.counts.nonfiniteSourceSortAt > 0) {
        // No private document/id in errors and no checkpoint advancement on failure.
        throw new ConvexError({ code: "SITE_ASSESSMENT_BACKFILL_INTEGRITY_ERROR", counts: summary.counts });
      }
      for (const { id, patch } of patches) await ctx.db.patch(id, patch);
    }
    return { ...summary, dryRun, updated: dryRun ? 0 : patches.length };
  },
});
