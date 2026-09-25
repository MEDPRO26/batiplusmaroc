import { describe, expect, test } from "vitest";
import {
  hasCompetingWorkflowActions,
  resolveConversationWorkflow,
  type ConversationWorkflowInput,
  type WorkflowAssessment,
  type WorkflowQuote,
} from "./lib/conversation-workflow";

function input(partial: Partial<ConversationWorkflowInput>): ConversationWorkflowInput {
  return {
    viewerType: "client",
    canInvite: false,
    canRequest: false,
    canPrepare: false,
    assessment: null,
    finalQuote: null,
    ...partial,
  };
}

const invited: WorkflowAssessment = {
  status: "invited",
  companyName: "Constr Aga",
  visit: null,
};

const completed: WorkflowAssessment = {
  status: "accepted",
  companyName: "Constr Aga",
  visit: { status: "completed", proposedDate: "2026-09-28", proposedTime: "10:00" },
};

function quote(status: NonNullable<WorkflowQuote>["status"], extras: Partial<NonNullable<WorkflowQuote>> = {}): WorkflowQuote {
  return {
    status,
    companyName: "Constr Aga",
    changesRequestReason: null,
    revisions: [{ revisionNumber: 1, price: 280000, duration: 85, validUntil: "2026-09-30" }],
    canSubmit: false,
    canReview: status === "submitted",
    ...extras,
  };
}

describe("resolveConversationWorkflow", () => {
  test("discussion open shows site visit and request final quote for the client", () => {
    const state = resolveConversationWorkflow(input({ canInvite: true, canRequest: true }));
    expect(state.kind).toBe("choice");
    expect(state.actions).toEqual(["schedule_visit", "request_quote"]);
    expect(hasCompetingWorkflowActions(state.actions)).toBe(true);
  });

  test("company sees a waiting state before the client chooses", () => {
    const state = resolveConversationWorkflow(input({ viewerType: "company" }));
    expect(state.kind).toBe("company_wait");
    expect(state.actions).toEqual([]);
  });

  test("site visit selected hides the final quote CTA", () => {
    const state = resolveConversationWorkflow(input({
      canInvite: false,
      canRequest: false,
      assessment: invited,
    }));
    expect(state.kind).toBe("site_visit");
    expect(state.actions).not.toContain("request_quote");
    expect(state.actions).not.toContain("schedule_visit");
    expect(hasCompetingWorkflowActions(state.actions)).toBe(false);
  });

  test("site visit completed shows request final quote", () => {
    const state = resolveConversationWorkflow(input({
      canRequest: true,
      assessment: completed,
    }));
    expect(state.kind).toBe("request_after_visit");
    expect(state.actions).toEqual(["request_quote"]);
    expect(hasCompetingWorkflowActions(state.actions)).toBe(false);
  });

  test("final quote requested hides the site visit CTA", () => {
    const state = resolveConversationWorkflow(input({
      canInvite: true,
      canRequest: false,
      assessment: invited,
      finalQuote: quote("draft"),
    }));
    expect(state.kind).toBe("quote_requested");
    expect(state.actions).not.toContain("schedule_visit");
    expect(hasCompetingWorkflowActions(state.actions)).toBe(false);
  });

  test("final quote submitted shows review for the client", () => {
    const state = resolveConversationWorkflow(input({
      finalQuote: quote("submitted"),
    }));
    expect(state.kind).toBe("quote_submitted");
    expect(state.actions).toEqual(["review_quote"]);
  });

  test("final quote submitted hides site visit even when canInvite is still true", () => {
    const state = resolveConversationWorkflow(input({
      canInvite: true,
      canRequest: true,
      finalQuote: quote("submitted"),
    }));
    expect(state.kind).toBe("quote_submitted");
    expect(state.actions).not.toContain("schedule_visit");
    expect(hasCompetingWorkflowActions(state.actions)).toBe(false);
  });

  test("final quote accepted hides site visit even when canInvite is still true", () => {
    const state = resolveConversationWorkflow(input({
      canInvite: true,
      canRequest: true,
      finalQuote: quote("accepted"),
    }));
    expect(state.kind).toBe("quote_accepted");
    expect(state.actions).not.toContain("schedule_visit");
  });

  test("changes requested shows the company revise action", () => {
    const state = resolveConversationWorkflow(input({
      viewerType: "company",
      finalQuote: quote("changes_requested", { canSubmit: true, revisions: [{ revisionNumber: 1, price: 280000, duration: 85, validUntil: "2026-09-30" }] }),
    }));
    expect(state.kind).toBe("quote_changes");
    expect(state.actions).toEqual(["revise_quote"]);
  });

  test("accepted quote becomes the company selected state", () => {
    const state = resolveConversationWorkflow(input({
      canInvite: true,
      canRequest: true,
      assessment: invited,
      finalQuote: quote("accepted"),
    }));
    expect(state.kind).toBe("quote_accepted");
    expect(state.actions).toEqual(["view_quote"]);
    expect(state.actions).not.toContain("request_quote");
    expect(state.actions).not.toContain("schedule_visit");
    expect(hasCompetingWorkflowActions(state.actions)).toBe(false);
  });

  test("company prepare after visit does not include a site visit CTA", () => {
    const state = resolveConversationWorkflow(input({
      viewerType: "company",
      canPrepare: true,
      assessment: completed,
    }));
    expect(state.kind).toBe("company_prepare");
    expect(state.actions).toEqual(["prepare_quote"]);
    expect(hasCompetingWorkflowActions(state.actions)).toBe(false);
  });
});
