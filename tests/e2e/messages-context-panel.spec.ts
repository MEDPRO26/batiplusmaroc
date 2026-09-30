import { expect, test } from "@playwright/test";
import {
  buildHarness,
  hasHorizontalOverflow,
  mountHarness,
} from "./support/component-harness";

let bundle = "";

test.beforeAll(async () => {
  bundle = await buildHarness(
    `import { MessagesInbox } from "./features/messages/components/messages-inbox";`,
    `<MessagesInbox initialConversationId="conversation-1" />`,
  );
});

const thread = {
  id: "conversation-1",
  projectId: "project-1",
  quoteId: "quote-1",
  projectTitle: "Villa Anfa",
  otherPartyName: "Hamza Idrissi",
  companySlug: "atlas-build",
  otherPartyAvatarUrl: null,
  status: "active",
  preview: "The revised quote is attached.",
  lastMessageAt: Date.UTC(2026, 8, 27, 10),
  unread: false,
};

function state(locale: "en" | "fr") {
  return {
    __locale: locale,
    __pathname: "/messages/[conversationId]",
    __queries: {
      "users.currentUser": { accountType: "company", onboardingStatus: "completed" },
      "messages.index.listMyThreads": [
        thread,
        { ...thread, id: "conversation-2", projectTitle: "Riad renovation", preview: "Can we visit on Monday?", unread: true },
      ],
      "messages.index.getConversation": { ...thread, viewerType: "company" },
      "siteVisits.index.getForConversation": {
        viewerType: "company",
        canInvite: false,
        assessment: {
          id: "assessment-1",
          projectId: "project-1",
          companyId: "company-1",
          companyName: "Atlas Build",
          initialQuoteId: "quote-1",
          conversationId: "conversation-1",
          status: "completed",
          invitedAt: 1,
          acceptedAt: 2,
          clientNote: null,
          companyNote: null,
          updatedAt: 3,
          visit: null,
        },
      },
      "finalQuotes.index.getForConversation": {
        viewerType: "company",
        canRequest: false,
        canPrepare: false,
        finalQuote: {
          id: "final-1",
          projectId: "project-1",
          companyId: "company-1",
          companyName: "Atlas Build",
          conversationId: "conversation-1",
          status: "submitted",
          requestTrigger: "completed_site_visit",
          requestedAt: 4,
          changesRequestReason: null,
          acceptedAt: null,
          declinedAt: null,
          withdrawnAt: null,
          currentRevisionId: "revision-1",
          revisions: [{
            id: "revision-1",
            revisionNumber: 1,
            price: 395_000,
            currency: "MAD",
            duration: 90,
            plannedStartDate: "2026-11-01",
            validUntil: "2026-10-30",
            scope: "Structural work",
            inclusions: "Materials",
            exclusions: "Furniture",
            paymentTerms: "30/40/30",
            companyNote: null,
            hasPdf: false,
            pdfFileName: null,
            pdfSize: null,
            submittedAt: 5,
          }],
          canRequest: false,
          canSubmit: false,
          canReview: false,
          canWithdraw: true,
        },
      },
      "deals.index.getByProject": "DEAL MUST NOT BE READ BEFORE SELECTION",
    },
    __paginatedQueries: {
      "messages.index.listMessages": {
        status: "Exhausted",
        results: [
          { id: "m2", senderType: "company", body: "The revised quote is attached.", createdAt: Date.UTC(2026, 8, 27, 10), isMine: true, attachment: null },
          { id: "m1", senderType: "client", body: "Could you send the final quote?", createdAt: Date.UTC(2026, 8, 27, 9), isMine: false, attachment: null },
        ],
      },
    },
  };
}

test("wide screens show the project context column with the Batiplus lifecycle", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mountHarness(page, bundle, state("en"));
  const context = page.getByRole("complementary", { name: "Project details" });
  await expect(context).toBeVisible();
  await expect(context.getByText("Hamza Idrissi")).toBeVisible();
  await expect(context.getByText("Client", { exact: true })).toBeVisible();

  const progress = context.getByRole("list");
  await expect(progress.getByRole("listitem")).toHaveCount(6);
  await expect(progress.getByRole("listitem").filter({ hasText: "Site visit" })).toContainText("Completed");
  const current = progress.locator('[aria-current="step"]');
  await expect(current).toHaveCount(1);
  await expect(current).toContainText("Final quote");
  await expect(current).toContainText("Submitted — awaiting client");
  // The Deal is only readable by the selected Company, so it is never queried before selection.
  await expect(page.getByText("DEAL MUST NOT BE READ BEFORE SELECTION")).toHaveCount(0);

  // The thread list leads with the project so parallel conversations stay distinguishable.
  await expect(page.getByRole("complementary", { name: "Conversations" }).getByText("Riad renovation")).toBeVisible();

  const toggle = page.locator('button[aria-controls="conversation-context"]');
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toHaveAccessibleName("Hide project details");
  await toggle.click();
  await expect(context).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAccessibleName("Show project details");
});

test("narrower screens open project context as a dismissible slide-over (fr)", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await mountHarness(page, bundle, state("fr"));
  const context = page.getByRole("complementary", { name: "Détails du projet" });
  await expect(context).toBeHidden();

  const toggle = page.getByRole("button", { name: "Afficher les détails du projet" });
  await toggle.click();
  await expect(context).toBeVisible();
  await expect(context.getByRole("button", { name: "Masquer les détails du projet" })).toBeFocused();
  await expect(context.locator('[aria-current="step"]')).toContainText("Devis final");
  expect(await hasHorizontalOverflow(page)).toBe(false);

  await page.keyboard.press("Escape");
  await expect(context).toBeHidden();
  await expect(toggle).toBeFocused();
});
