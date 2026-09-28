import { describe, expect, test } from "vitest";
import type { WorkflowAssessment, WorkflowQuote } from "./conversation-workflow";
import { resolveProjectProgress } from "./project-progress";

const quote = (status: NonNullable<WorkflowQuote>["status"]): WorkflowQuote => ({
  status,
  companyName: "Atlas Build",
  changesRequestReason: null,
  revisions: [],
  canSubmit: false,
  canReview: false,
});

const assessment = (
  status: NonNullable<WorkflowAssessment>["status"],
  visit: "proposed" | "confirmed" | "completed" | null = null,
): WorkflowAssessment => ({
  status,
  companyName: "Atlas Build",
  visit: visit ? { status: visit, proposedDate: "2026-10-02", proposedTime: "10:00" } : null,
});

function states(input: Parameters<typeof resolveProjectProgress>[0]) {
  return Object.fromEntries(resolveProjectProgress(input).map((stage) => [stage.key, `${stage.state}:${stage.detail}`]));
}

describe("resolveProjectProgress", () => {
  test("a fresh discussion leaves the visit optional and later stages upcoming", () => {
    expect(states({ assessment: null, finalQuote: null, deal: null })).toEqual({
      proposal: "done:null",
      discussion: "done:null",
      siteVisit: "upcoming:optional",
      finalQuote: "upcoming:null",
      selection: "upcoming:null",
      deal: "upcoming:null",
    });
  });

  test("a scheduled visit is the current stage", () => {
    expect(states({ assessment: assessment("scheduled", "confirmed"), finalQuote: null, deal: null }).siteVisit).toBe(
      "current:scheduled",
    );
    expect(states({ assessment: assessment("accepted", "proposed"), finalQuote: null, deal: null }).siteVisit).toBe(
      "current:dateProposed",
    );
  });

  test("a final quote requested without a visit marks the visit as not required", () => {
    const result = states({ assessment: null, finalQuote: quote("submitted"), deal: null });
    expect(result.siteVisit).toBe("skipped:notRequired");
    expect(result.finalQuote).toBe("current:submitted");
  });

  test("an accepted quote selects the company and an active deal is in progress", () => {
    const result = states({
      assessment: assessment("completed", "completed"),
      finalQuote: quote("accepted"),
      deal: { status: "active" },
    });
    expect(result).toMatchObject({
      siteVisit: "done:completed",
      finalQuote: "done:accepted",
      selection: "done:selected",
      deal: "current:inProgress",
    });
  });

  test("a declined quote stops the quote stage without selecting the company", () => {
    const result = states({ assessment: null, finalQuote: quote("declined"), deal: null });
    expect(result.finalQuote).toBe("stopped:declined");
    expect(result.selection).toBe("upcoming:null");
  });
});
