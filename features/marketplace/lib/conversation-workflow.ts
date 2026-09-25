export type WorkflowViewer = "client" | "company" | "admin";

export type WorkflowVisit = {
  status: "proposed" | "confirmed" | "completed" | "declined" | "cancelled";
  proposedDate: string;
  proposedTime: string;
};

export type WorkflowAssessment = {
  status: "invited" | "accepted" | "scheduled" | "completed" | "declined" | "cancelled";
  companyName: string;
  visit: WorkflowVisit | null;
} | null;

export type WorkflowRevision = {
  revisionNumber: number;
  price: number;
  duration: number;
  validUntil: string;
};

export type WorkflowQuote = {
  status: "draft" | "submitted" | "changes_requested" | "accepted" | "declined" | "withdrawn";
  companyName: string;
  changesRequestReason: string | null;
  revisions: WorkflowRevision[];
  canSubmit: boolean;
  canReview: boolean;
} | null;

export type ConversationWorkflowInput = {
  viewerType: WorkflowViewer;
  canInvite: boolean;
  canRequest: boolean;
  canPrepare: boolean;
  assessment: WorkflowAssessment;
  finalQuote: WorkflowQuote;
};

export type ConversationWorkflowKind =
  | "choice"
  | "request_only"
  | "company_wait"
  | "site_visit"
  | "request_after_visit"
  | "company_prepare"
  | "quote_requested"
  | "quote_submitted"
  | "quote_changes"
  | "quote_accepted"
  | "quote_declined"
  | "quote_withdrawn"
  | "hidden";

export type ConversationWorkflowAction =
  | "schedule_visit"
  | "request_quote"
  | "prepare_quote"
  | "revise_quote"
  | "review_quote"
  | "view_quote";

export type ConversationWorkflowState = {
  kind: ConversationWorkflowKind;
  actions: ConversationWorkflowAction[];
};

const ACTIVE_ASSESSMENT = new Set(["invited", "accepted", "scheduled"]);

export function isActiveSiteVisitPath(assessment: WorkflowAssessment): boolean {
  if (!assessment) return false;
  if (assessment.status === "declined" || assessment.status === "cancelled") return false;
  if (assessment.status === "completed") return false;
  if (assessment.visit?.status === "completed") return false;
  if (ACTIVE_ASSESSMENT.has(assessment.status)) return true;
  return assessment.visit?.status === "proposed" || assessment.visit?.status === "confirmed";
}

export function isSiteVisitCompleted(assessment: WorkflowAssessment): boolean {
  if (!assessment) return false;
  return assessment.status === "completed" || assessment.visit?.status === "completed";
}

export function latestRevision<T extends WorkflowRevision>(
  quote: { revisions: T[] } | null | undefined,
): T | null {
  if (!quote || quote.revisions.length === 0) return null;
  return quote.revisions[quote.revisions.length - 1] ?? null;
}

export function resolveConversationWorkflow(input: ConversationWorkflowInput): ConversationWorkflowState {
  const quote = input.finalQuote;
  if (quote) {
    return quoteState(input.viewerType, quote);
  }

  if (isActiveSiteVisitPath(input.assessment)) {
    return { kind: "site_visit", actions: [] };
  }

  if (isSiteVisitCompleted(input.assessment)) {
    if (input.viewerType === "client" && input.canRequest) {
      return { kind: "request_after_visit", actions: ["request_quote"] };
    }
    if (input.viewerType === "company" && input.canPrepare) {
      return { kind: "company_prepare", actions: ["prepare_quote"] };
    }
    if (input.viewerType === "company") {
      return { kind: "company_wait", actions: [] };
    }
    return { kind: "hidden", actions: [] };
  }

  if (input.viewerType === "client") {
    if (input.canInvite && input.canRequest) {
      return { kind: "choice", actions: ["schedule_visit", "request_quote"] };
    }
    if (input.canRequest) {
      return { kind: "request_only", actions: ["request_quote"] };
    }
    return { kind: "hidden", actions: [] };
  }

  if (input.viewerType === "company") {
    return { kind: "company_wait", actions: [] };
  }

  return { kind: "hidden", actions: [] };
}

function quoteState(viewerType: WorkflowViewer, quote: NonNullable<WorkflowQuote>): ConversationWorkflowState {
  switch (quote.status) {
    case "draft":
      return {
        kind: "quote_requested",
        actions: viewerType === "company" && quote.canSubmit ? ["prepare_quote"] : [],
      };
    case "submitted":
      return {
        kind: "quote_submitted",
        actions:
          viewerType === "client"
            ? ["review_quote"]
            : ["view_quote"],
      };
    case "changes_requested":
      return {
        kind: "quote_changes",
        actions: viewerType === "company" && quote.canSubmit ? ["revise_quote"] : ["view_quote"],
      };
    case "accepted":
      return { kind: "quote_accepted", actions: ["view_quote"] };
    case "declined":
      return { kind: "quote_declined", actions: ["view_quote"] };
    case "withdrawn":
      return { kind: "quote_withdrawn", actions: ["view_quote"] };
  }
}

export function hasCompetingWorkflowActions(actions: ConversationWorkflowAction[]): boolean {
  const hasVisit = actions.includes("schedule_visit");
  const hasQuoteDecision = actions.some((action) =>
    action === "request_quote" ||
    action === "prepare_quote" ||
    action === "revise_quote" ||
    action === "review_quote",
  );
  return hasVisit && hasQuoteDecision;
}
