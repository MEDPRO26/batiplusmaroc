import { ConvexError, v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { validateAdministrativePair } from "../../lib/geography/morocco";
import {
  assessmentAdminProjection,
  assessmentProjectionMatches,
  selectedVisitForAssessment,
  visitMatchesAssessment,
} from "./adminProjection";

export const SITE_ASSESSMENT_BACKFILL_BATCH_SIZE = 10;
const MAX_PAGE_BYTES = 1_000_000;

export const assessmentProjectionPageArgs = {
  cursor: v.optional(v.union(v.string(), v.null())),
  batchSize: v.optional(v.number()),
};

export const assessmentProjectionCountsValidator = v.object({
  examined: v.number(),
  missingProjections: v.number(),
  missingOrNonfiniteAdminSortAt: v.number(),
  staleProjections: v.number(),
  invalidProjectAdministrativePairs: v.number(),
  sourceIntegrityFailures: v.number(),
  nonfiniteSourceSortAt: v.number(),
  readyForIndexedDiscovery: v.number(),
});

export const assessmentProjectionPageResultFields = {
  scope: v.literal("page"),
  counts: assessmentProjectionCountsValidator,
  wouldUpdate: v.number(),
  continueCursor: v.string(),
  isDone: v.boolean(),
};

type Counts = Infer<typeof assessmentProjectionCountsValidator>;
type ReadCtx = QueryCtx | MutationCtx;
type Projection = ReturnType<typeof assessmentAdminProjection>;
type ProjectionPatch = Partial<Projection>;

function changedProjectionFields(assessment: Doc<"siteAssessments">, projection: Projection) {
  const patch: ProjectionPatch = {};
  if (assessment.adminRegionCode !== projection.adminRegionCode) patch.adminRegionCode = projection.adminRegionCode;
  if (assessment.adminProvinceCode !== projection.adminProvinceCode) patch.adminProvinceCode = projection.adminProvinceCode;
  if (assessment.adminSortAt !== projection.adminSortAt) patch.adminSortAt = projection.adminSortAt;
  return patch;
}

/** One creation-index page only. Counts deliberately describe this page, not global coverage. */
export async function inspectAssessmentProjectionPage(
  ctx: ReadCtx,
  args: { cursor?: string | null; batchSize?: number },
) {
  const batchSize = args.batchSize ?? SITE_ASSESSMENT_BACKFILL_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > SITE_ASSESSMENT_BACKFILL_BATCH_SIZE) {
    throw new ConvexError("INVALID_SITE_ASSESSMENT_BACKFILL_BATCH_SIZE");
  }
  const result = await ctx.db.query("siteAssessments").order("asc").paginate({
    cursor: args.cursor ?? null,
    numItems: batchSize,
    maximumRowsRead: batchSize,
    maximumBytesRead: MAX_PAGE_BYTES,
  });
  const counts: Counts = {
    examined: result.page.length,
    missingProjections: 0,
    missingOrNonfiniteAdminSortAt: 0,
    staleProjections: 0,
    invalidProjectAdministrativePairs: 0,
    sourceIntegrityFailures: 0,
    nonfiniteSourceSortAt: 0,
    readyForIndexedDiscovery: 0,
  };
  const patches: { id: Doc<"siteAssessments">["_id"]; patch: ProjectionPatch }[] = [];
  for (const assessment of result.page) {
    const [project, client, company, quote, conversation, visit] = await Promise.all([
      ctx.db.get(assessment.projectId),
      ctx.db.get(assessment.clientId),
      ctx.db.get(assessment.companyId),
      ctx.db.get(assessment.initialQuoteId),
      ctx.db.get(assessment.conversationId),
      selectedVisitForAssessment(ctx, assessment._id),
    ]);
    const hasRecordedCodes = project && (project.regionCode !== undefined || project.provinceCode !== undefined);
    if (hasRecordedCodes && !validateAdministrativePair(project.regionCode, project.provinceCode).valid) {
      counts.invalidProjectAdministrativePairs += 1;
    }
    // Historical identity checks only: completed/inactive records do not need
    // an active conversation, current quote status or current Company membership.
    const sourcesMatch = project && client && company && quote && conversation &&
      project.clientId === assessment.clientId &&
      quote.projectId === assessment.projectId && quote.companyId === assessment.companyId &&
      conversation.projectId === assessment.projectId && conversation.clientId === assessment.clientId &&
      conversation.companyId === assessment.companyId && conversation.quoteId === assessment.initialQuoteId &&
      visitMatchesAssessment(visit, assessment);
    const projection = sourcesMatch ? assessmentAdminProjection(project, assessment, visit) : null;
    const missingProjection = assessment.adminSortAt === undefined || (projection !== null && (
      (projection.adminRegionCode !== undefined && assessment.adminRegionCode === undefined) ||
      (projection.adminProvinceCode !== undefined && assessment.adminProvinceCode === undefined)
    ));
    if (missingProjection) counts.missingProjections += 1;
    if (!Number.isFinite(assessment.adminSortAt)) counts.missingOrNonfiniteAdminSortAt += 1;
    if (!sourcesMatch) {
      counts.sourceIntegrityFailures += 1;
      continue;
    }
    if (!projection) continue;
    if (!Number.isFinite(projection.adminSortAt)) counts.nonfiniteSourceSortAt += 1;
    const matches = assessmentProjectionMatches(assessment, projection);
    if (!missingProjection && !matches) counts.staleProjections += 1;
    if (Number.isFinite(projection.adminSortAt) && matches) counts.readyForIndexedDiscovery += 1;
    if (Number.isFinite(projection.adminSortAt) && !matches) {
      patches.push({ id: assessment._id, patch: changedProjectionFields(assessment, projection) });
    }
  }
  return {
    summary: {
      scope: "page" as const,
      counts,
      wouldUpdate: patches.length,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    },
    patches,
  };
}
