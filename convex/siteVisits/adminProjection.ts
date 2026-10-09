import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getProvince, getRegion } from "../../lib/geography/morocco";
import { adminVisitEpoch } from "../../lib/dates/admin-site-visit";
export { adminVisitEpoch } from "../../lib/dates/admin-site-visit";

type ReadCtx = QueryCtx | MutationCtx;
type Projection = Pick<Doc<"siteAssessments">, "adminRegionCode" | "adminProvinceCode"> & { adminSortAt: number };

/** Preserve the existing selection: active visits first, then newest creation. */
export async function selectedVisitForAssessment(ctx: ReadCtx, assessmentId: Id<"siteAssessments">) {
  return await ctx.db.query("siteVisits")
    .withIndex("by_assessmentId_and_active", (q) => q.eq("assessmentId", assessmentId))
    .order("desc").first();
}

export function assessmentAdminProjection(
  project: Pick<Doc<"projects">, "regionCode" | "provinceCode">,
  assessment: Pick<Doc<"siteAssessments">, "invitedAt">,
  visit: Doc<"siteVisits"> | null,
): Projection {
  const region = getRegion(project.regionCode);
  const province = getProvince(project.provinceCode);
  return {
    adminRegionCode: region?.code,
    adminProvinceCode: region && province?.regionCode === region.code ? province.code : undefined,
    adminSortAt: visit ? adminVisitEpoch(visit) ?? visit.proposedAt : assessment.invitedAt,
  };
}

export function assessmentProjectionMatches(assessment: Doc<"siteAssessments">, projection: Projection) {
  return assessment.adminRegionCode === projection.adminRegionCode &&
    assessment.adminProvinceCode === projection.adminProvinceCode &&
    assessment.adminSortAt === projection.adminSortAt;
}

export function visitMatchesAssessment(visit: Doc<"siteVisits"> | null, assessment: Doc<"siteAssessments">) {
  return !visit || (visit.assessmentId === assessment._id && visit.projectId === assessment.projectId &&
    visit.clientId === assessment.clientId && visit.companyId === assessment.companyId &&
    visit.initialQuoteId === assessment.initialQuoteId && visit.conversationId === assessment.conversationId);
}

/** Source mutation helper only; never called by readers or a historical sweep. */
export async function syncAssessmentAdminProjection(ctx: MutationCtx, assessmentId: Id<"siteAssessments">) {
  const assessment = await ctx.db.get(assessmentId);
  if (!assessment) throw new ConvexError("SITE_ASSESSMENT_NOT_FOUND");
  const [project, visit] = await Promise.all([
    ctx.db.get(assessment.projectId), selectedVisitForAssessment(ctx, assessmentId),
  ]);
  if (!project || project.clientId !== assessment.clientId || !visitMatchesAssessment(visit, assessment)) {
    throw new ConvexError("SITE_VISIT_INTEGRITY_ERROR");
  }
  const projection = assessmentAdminProjection(project, assessment, visit);
  if (!assessmentProjectionMatches(assessment, projection)) await ctx.db.patch(assessmentId, projection);
}

// Editable Projects normally have no assessments. Bound this exceptional per-Project
// fan-out and abort the whole source transaction on overflow instead of leaving stale rows.
export const MAX_PROJECT_ASSESSMENT_SYNC = 256;
export async function syncProjectAssessmentGeography(ctx: MutationCtx, projectId: Id<"projects">) {
  const assessments = await ctx.db.query("siteAssessments")
    .withIndex("by_projectId_and_active", (q) => q.eq("projectId", projectId))
    .take(MAX_PROJECT_ASSESSMENT_SYNC + 1);
  if (assessments.length > MAX_PROJECT_ASSESSMENT_SYNC) {
    throw new ConvexError("SITE_ASSESSMENT_PROJECTION_UPDATE_LIMIT");
  }
  for (const assessment of assessments) await syncAssessmentAdminProjection(ctx, assessment._id);
}
