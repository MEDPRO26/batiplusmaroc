import { ConvexError } from "convex/values";
import type { ProjectStatus } from "./constants";

const transitions: Record<ProjectStatus, readonly ProjectStatus[]> = {
  draft: ["pending_review"],
  pending_review: ["published", "needs_changes", "cancelled"], needs_changes: ["pending_review"],
  published: ["in_discussion", "company_selected"], in_discussion: ["company_selected"], company_selected: [],
  in_progress: [], completed: [], cancelled: [], archived: [],
};

export function isProjectEditable(status: ProjectStatus) {
  return status === "draft" || status === "needs_changes";
}

export function assertProjectTransition(from: ProjectStatus, to: ProjectStatus) {
  if (!transitions[from].includes(to)) throw new ConvexError("INVALID_PROJECT_STATUS_TRANSITION");
}
