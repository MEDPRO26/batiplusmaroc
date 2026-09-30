import type { WorkflowAssessment, WorkflowQuote } from "./conversation-workflow";

/**
 * Read-only projection of the Batiplus project lifecycle for one conversation:
 * proposal → discussion → site visit → final quote → company selection → deal.
 * Every stage is derived from backend state; nothing here advances the workflow.
 */

export type ProgressStageKey = "proposal" | "discussion" | "siteVisit" | "finalQuote" | "selection" | "deal";
export type ProgressState = "done" | "current" | "upcoming" | "skipped" | "stopped";

export type ProgressStage = {
  key: ProgressStageKey;
  state: ProgressState;
  /** Translation key suffix describing the stage status, or null when the label says enough. */
  detail: string | null;
};

export type ProgressDeal = { status: "active" | "completed" | "cancelled" } | null;

export function resolveProjectProgress(input: {
  assessment: WorkflowAssessment;
  finalQuote: WorkflowQuote;
  deal: ProgressDeal;
}): ProgressStage[] {
  // A conversation only exists once a proposal was sent and the discussion unlocked.
  return [
    { key: "proposal", state: "done", detail: null },
    { key: "discussion", state: "done", detail: null },
    siteVisitStage(input.assessment, input.finalQuote),
    finalQuoteStage(input.finalQuote),
    selectionStage(input.finalQuote),
    dealStage(input.deal),
  ];
}

function siteVisitStage(assessment: WorkflowAssessment, quote: WorkflowQuote): ProgressStage {
  const key = "siteVisit" as const;
  if (!assessment) {
    // Batiplus lets the client request a final quote without a visit.
    return quote ? { key, state: "skipped", detail: "notRequired" } : { key, state: "upcoming", detail: "optional" };
  }
  if (assessment.status === "completed" || assessment.visit?.status === "completed") {
    return { key, state: "done", detail: "completed" };
  }
  if (assessment.status === "declined") return { key, state: "skipped", detail: "declined" };
  if (assessment.status === "cancelled") return { key, state: "skipped", detail: "cancelled" };
  if (assessment.visit?.status === "confirmed") return { key, state: "current", detail: "scheduled" };
  if (assessment.visit?.status === "proposed") return { key, state: "current", detail: "dateProposed" };
  return { key, state: "current", detail: assessment.status === "invited" ? "invited" : "accepted" };
}

function finalQuoteStage(quote: WorkflowQuote): ProgressStage {
  const key = "finalQuote" as const;
  if (!quote) return { key, state: "upcoming", detail: null };
  switch (quote.status) {
    case "draft":
      return { key, state: "current", detail: "requested" };
    case "submitted":
      return { key, state: "current", detail: "submitted" };
    case "changes_requested":
      return { key, state: "current", detail: "changesRequested" };
    case "accepted":
      return { key, state: "done", detail: "accepted" };
    case "declined":
      return { key, state: "stopped", detail: "declined" };
    case "withdrawn":
      return { key, state: "stopped", detail: "withdrawn" };
  }
}

function selectionStage(quote: WorkflowQuote): ProgressStage {
  // Accepting the final quote is what selects the Company for the project.
  if (quote?.status === "accepted") return { key: "selection", state: "done", detail: "selected" };
  return { key: "selection", state: "upcoming", detail: null };
}

function dealStage(deal: ProgressDeal): ProgressStage {
  const key = "deal" as const;
  if (!deal) return { key, state: "upcoming", detail: null };
  if (deal.status === "active") return { key, state: "current", detail: "inProgress" };
  if (deal.status === "completed") return { key, state: "done", detail: "completed" };
  return { key, state: "stopped", detail: "cancelled" };
}
