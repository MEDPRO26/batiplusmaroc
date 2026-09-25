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

export type SiteVisitStatus = "proposed" | "confirmed" | "completed" | "declined" | "cancelled";

const visitTransitions: Record<SiteVisitStatus, readonly SiteVisitStatus[]> = {
  proposed: ["confirmed", "declined"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  declined: [],
  cancelled: [],
};

export function assertSiteVisitTransition(current: SiteVisitStatus, next: SiteVisitStatus) {
  if (!visitTransitions[current].includes(next)) {
    throw new ConvexError("INVALID_SITE_VISIT_TRANSITION");
  }
}
