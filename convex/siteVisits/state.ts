import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";

export type SiteAssessmentStatus = Doc<"siteAssessments">["status"];

const transitions: Record<SiteAssessmentStatus, readonly SiteAssessmentStatus[]> = {
  invited: ["accepted", "declined"],
  accepted: ["scheduled", "cancelled"],
  scheduled: ["completed", "cancelled"],
  completed: [],
  declined: [],
  cancelled: [],
};

export function isActiveSiteAssessmentStatus(status: SiteAssessmentStatus) {
  return status === "invited" || status === "accepted" || status === "scheduled";
}

export function assertSiteAssessmentTransition(current: SiteAssessmentStatus, next: SiteAssessmentStatus) {
  if (!transitions[current].includes(next)) {
    throw new ConvexError("INVALID_SITE_ASSESSMENT_TRANSITION");
  }
}
