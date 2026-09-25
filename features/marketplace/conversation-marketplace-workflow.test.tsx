import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useQuery: () => undefined }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | { pathname: string } }) => (
    <a href={typeof href === "string" ? href : href.pathname} {...props}>{children}</a>
  ),
}));

import { MarketplaceWorkflowCard } from "./components/conversation-marketplace-workflow";

const conversationId = "conversation-1" as Id<"conversations">;

function render(locale: "en" | "fr", node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">
      {node}
    </NextIntlClientProvider>,
  );
}

function quoteRecord(status: "draft" | "submitted" | "changes_requested" | "accepted", extras: {
  canSubmit?: boolean;
  canReview?: boolean;
  revisionNumber?: number;
  price?: number;
  reason?: string | null;
} = {}) {
  return {
    id: "fq-1" as Id<"finalQuotes">,
    projectId: "project-1" as Id<"projects">,
    companyId: "company-1" as Id<"companies">,
    companyName: "Constr Aga",
    conversationId,
    status,
    requestTrigger: "client_request" as const,
    requestedAt: Date.UTC(2026, 8, 24),
    changesRequestReason: extras.reason ?? null,
    acceptedAt: status === "accepted" ? Date.UTC(2026, 8, 25) : null,
    declinedAt: null,
    withdrawnAt: null,
    currentRevisionId: "rev-1" as Id<"finalQuoteRevisions">,
    revisions: [{
      id: "rev-1" as Id<"finalQuoteRevisions">,
      revisionNumber: extras.revisionNumber ?? 1,
      price: extras.price ?? 280000,
      currency: "MAD" as const,
      duration: 85,
      plannedStartDate: "2026-10-01",
      validUntil: "2026-09-30",
      scope: "Full villa renovation",
      inclusions: "Materials",
      exclusions: "Permits",
      paymentTerms: "40% start",
      companyNote: null,
      hasPdf: false,
      pdfFileName: null,
      pdfSize: null,
      submittedAt: Date.UTC(2026, 8, 24, 12),
    }],
    canRequest: false,
    canSubmit: extras.canSubmit ?? false,
    canReview: extras.canReview ?? status === "submitted",
    canWithdraw: status === "submitted",
  };
}

const invitedAssessment = {
  id: "assessment-1" as Id<"siteAssessments">,
  projectId: "project-1" as Id<"projects">,
  companyId: "company-1" as Id<"companies">,
  companyName: "Constr Aga",
  initialQuoteId: "quote-1" as Id<"projectQuotes">,
  conversationId,
  status: "invited" as const,
  invitedAt: Date.UTC(2026, 8, 24, 10),
  acceptedAt: null,
  clientNote: null,
  companyNote: null,
  updatedAt: Date.UTC(2026, 8, 24, 10),
  visit: null,
};

describe("marketplace workflow card", () => {
  test("discussion open shows site visit and request final quote", () => {
    const html = render("en", (
      <MarketplaceWorkflowCard
        conversationId={conversationId}
        assessment={{ viewerType: "client", canInvite: true, assessment: null }}
        quote={{ viewerType: "client", canRequest: true, canPrepare: false, finalQuote: null }}
      />
    ));
    expect(html).toContain("Next step");
    expect(html).toContain("Schedule a site visit");
    expect(html).toContain("Request final quote");
    expect(html).toContain("Choose how you want to continue with this company.");
    expect(html).not.toContain("Ask this company for its final scope");
    expect(html).not.toContain("Site assessment");
  });

  test("company sees waiting copy, not client-oriented request copy", () => {
    const html = render("en", (
      <MarketplaceWorkflowCard
        conversationId={conversationId}
        assessment={{ viewerType: "company", canInvite: false, assessment: null }}
        quote={{ viewerType: "company", canRequest: false, canPrepare: false, finalQuote: null }}
      />
    ));
    expect(html).toContain("Waiting for the client");
    expect(html).toContain("The client will either schedule a site visit or request your final quote.");
    expect(html).toContain("No action required.");
    expect(html).not.toContain("Ask this company");
    expect(html).not.toContain("Request final quote");
    expect(html).not.toContain("Schedule a site visit");
  });

  test("site visit selected hides the final quote CTA", () => {
    const html = render("en", (
      <MarketplaceWorkflowCard
        conversationId={conversationId}
        assessment={{ viewerType: "client", canInvite: false, assessment: invitedAssessment }}
        quote={{ viewerType: "client", canRequest: false, canPrepare: false, finalQuote: null }}
      />
    ));
    expect(html).toContain("Waiting for the company to accept your invitation.");
    expect(html).toContain("Site visit");
    expect(html).not.toContain("Request final quote");
    expect(html).not.toContain("Next step");
  });

  test("site visit completed shows request final quote", () => {
    const html = render("en", (
      <MarketplaceWorkflowCard
        conversationId={conversationId}
        assessment={{
          viewerType: "client",
          canInvite: false,
          assessment: {
            ...invitedAssessment,
            status: "accepted",
            acceptedAt: Date.UTC(2026, 8, 25),
            visit: {
              id: "visit-1" as Id<"siteVisits">,
              assessmentId: invitedAssessment.id,
              projectId: invitedAssessment.projectId,
              clientId: "client-1" as Id<"users">,
              companyId: invitedAssessment.companyId,
              conversationId,
              initialQuoteId: invitedAssessment.initialQuoteId,
              proposedByUserId: "client-1" as Id<"users">,
              proposedDate: "2026-09-28",
              proposedTime: "10:00",
              timezone: "Africa/Casablanca",
              scheduledEpoch: Date.UTC(2026, 8, 28, 9),
              siteAddress: "18 Avenue Mohammed V, Rabat",
              note: null,
              status: "completed",
              proposedAt: Date.UTC(2026, 8, 24),
              confirmedByUserId: null,
              confirmedAt: null,
              declinedByUserId: null,
              declinedAt: null,
              cancelledByUserId: null,
              cancelledAt: null,
              cancellationReason: null,
              completedByUserId: "client-1" as Id<"users">,
              completedAt: Date.UTC(2026, 8, 28, 12),
              createdAt: Date.UTC(2026, 8, 24),
              updatedAt: Date.UTC(2026, 8, 28),
              proposals: [],
              canPropose: false,
              canConfirm: false,
              canDecline: false,
              canCancel: false,
              canComplete: false,
            },
          },
        }}
        quote={{ viewerType: "client", canRequest: true, canPrepare: false, finalQuote: null }}
      />
    ));
    expect(html).toContain("Site visit completed");
    expect(html).toContain("Request final quote");
    expect(html).not.toContain("Schedule a site visit");
  });

  test("final quote requested hides the site visit CTA and uses company-ready copy", () => {
    const clientHtml = render("en", (
      <MarketplaceWorkflowCard
        conversationId={conversationId}
        assessment={{ viewerType: "client", canInvite: true, assessment: null }}
        quote={{ viewerType: "client", canRequest: false, canPrepare: false, finalQuote: quoteRecord("draft", { revisionNumber: 0, canReview: false }) }}
      />
    ));
    expect(clientHtml).toContain("Requested from Constr Aga");
    expect(clientHtml).toContain("Waiting for the company to send its final offer.");
    expect(clientHtml).not.toContain("Schedule a site visit");

    const companyHtml = render("en", (
      <MarketplaceWorkflowCard
        conversationId={conversationId}
        assessment={{ viewerType: "company", canInvite: false, assessment: null }}
        quote={{ viewerType: "company", canRequest: false, canPrepare: false, finalQuote: quoteRecord("draft", { canSubmit: true, canReview: false }) }}
      />
    ));
    expect(companyHtml).toContain("The client is ready to receive your final offer.");
    expect(companyHtml).toContain("Prepare final quote");
    expect(companyHtml).not.toContain("Ask this company");
  });

  test("final quote submitted shows a commercial review card", () => {
    const html = render("en", (
      <MarketplaceWorkflowCard
        conversationId={conversationId}
        assessment={{ viewerType: "client", canInvite: false, assessment: null }}
        quote={{ viewerType: "client", canRequest: false, canPrepare: false, finalQuote: quoteRecord("submitted") }}
      />
    ));
    expect(html).toContain("Constr Aga");
    expect(html).toContain("280,000");
    expect(html).toContain("85 days");
    expect(html).toContain("Review quote");
    expect(html).toContain("Revision 1");
    expect(html).not.toContain("Full villa renovation");
    expect(html).not.toContain("Schedule a site visit");
  });

  test("changes requested and accepted states render the simplified copy", () => {
    const changes = render("en", (
      <MarketplaceWorkflowCard
        conversationId={conversationId}
        assessment={{ viewerType: "company", canInvite: false, assessment: null }}
        quote={{
          viewerType: "company",
          canRequest: false,
          canPrepare: false,
          finalQuote: quoteRecord("changes_requested", { canSubmit: true, reason: "Please update the duration." }),
        }}
      />
    ));
    expect(changes).toContain("Changes requested");
    expect(changes).toContain("Please update the duration.");
    expect(changes).toContain("Review request and revise quote");

    const accepted = render("en", (
      <MarketplaceWorkflowCard
        conversationId={conversationId}
        assessment={{ viewerType: "client", canInvite: true, assessment: invitedAssessment }}
        quote={{ viewerType: "client", canRequest: true, canPrepare: false, finalQuote: quoteRecord("accepted", { price: 395000, revisionNumber: 2 }) }}
      />
    ));
    expect(accepted).toContain("Company selected");
    expect(accepted).toContain("Constr Aga");
    expect(accepted).toContain("The project is ready for the next step.");
    expect(accepted).toContain("395,000");
    expect(accepted).toContain("View final quote");
    expect(accepted).not.toContain("Request final quote");
    expect(accepted).not.toContain("Schedule a site visit");
    expect(accepted).not.toContain("Request changes");
  });

  test("keeps EN and FR workflow copy aligned", () => {
    const html = render("fr", (
      <MarketplaceWorkflowCard
        conversationId={conversationId}
        assessment={{ viewerType: "client", canInvite: true, assessment: null }}
        quote={{ viewerType: "client", canRequest: true, canPrepare: false, finalQuote: null }}
      />
    ));
    expect(html).toContain("Prochaine étape");
    expect(html).toContain("Planifier une visite technique");
    expect(html).toContain("Demander le devis final");
    expect(Object.keys(en.marketplaceWorkflow).sort()).toEqual(Object.keys(fr.marketplaceWorkflow).sort());
    expect(Object.keys(en.clientProjects.currentStep).sort()).toEqual(Object.keys(fr.clientProjects.currentStep).sort());
  });
});
