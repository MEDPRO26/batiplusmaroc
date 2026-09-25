import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useQuery: () => undefined }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | { pathname: string } }) => <a href={typeof href === "string" ? href : href.pathname} {...props}>{children}</a>,
}));

import { SiteAssessmentPanel } from "./components/site-assessment-panel";

const assessment = {
  id: "assessment-1" as Id<"siteAssessments">,
  projectId: "project-1" as Id<"projects">,
  companyId: "company-1" as Id<"companies">,
  companyName: "Atlas Construction",
  initialQuoteId: "quote-1" as Id<"projectQuotes">,
  conversationId: "conversation-1" as Id<"conversations">,
  status: "invited" as const,
  invitedAt: Date.UTC(2026, 8, 24, 10),
  acceptedAt: null,
  clientNote: "Please inspect the roof.",
  companyNote: null,
  updatedAt: Date.UTC(2026, 8, 24, 10),
  visit: null,
};

const proposedVisit = {
  id: "visit-1" as Id<"siteVisits">,
  assessmentId: assessment.id,
  projectId: assessment.projectId,
  clientId: "client-1" as Id<"users">,
  companyId: assessment.companyId,
  conversationId: assessment.conversationId,
  initialQuoteId: assessment.initialQuoteId,
  proposedByUserId: "client-1" as Id<"users">,
  proposedDate: "2026-09-30",
  proposedTime: "10:00",
  timezone: "Africa/Casablanca" as const,
  scheduledEpoch: Date.UTC(2026, 8, 30, 9),
  siteAddress: "18 Avenue Mohammed V, Rabat",
  note: "Ring at reception",
  status: "proposed" as const,
  proposedAt: Date.UTC(2026, 8, 24, 10),
  confirmedByUserId: null,
  confirmedAt: null,
  declinedByUserId: null,
  declinedAt: null,
  cancelledByUserId: null,
  cancelledAt: null,
  cancellationReason: null,
  completedByUserId: null,
  completedAt: null,
  createdAt: Date.UTC(2026, 8, 24, 10),
  updatedAt: Date.UTC(2026, 8, 24, 10),
  proposals: [{ id: "proposal-1" as Id<"siteVisitProposals">, sequence: 1, proposedByUserId: "client-1" as Id<"users">, proposedDate: "2026-09-30", proposedTime: "10:00", timezone: "Africa/Casablanca" as const, siteAddress: "18 Avenue Mohammed V, Rabat", note: "Ring at reception", proposedAt: Date.UTC(2026, 8, 24, 10) }],
  canPropose: true,
  canConfirm: true,
  canDecline: true,
  canCancel: false,
  canComplete: false,
};

function render(locale: "en" | "fr", node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">
      {node}
    </NextIntlClientProvider>,
  );
}

describe("site assessment panel", () => {
  test("renders the client invite CTA in English without exposing contact information", () => {
    const html = render("en", <SiteAssessmentPanel conversationId={assessment.conversationId} result={{ viewerType: "client", canInvite: true, assessment: null }} />);
    expect(html).toContain("Schedule a site visit");
    expect(html).toContain("Only one company can have an active site visit");
    expect(html).not.toContain("phone");
    expect(html).not.toContain("email");
  });

  test("renders the company acceptance acknowledgement and actions in French", () => {
    const html = render("fr", <SiteAssessmentPanel result={{ viewerType: "company", canInvite: false, assessment }} />);
    expect(html).toContain("Atlas Construction");
    expect(html).toContain("Accepter l’invitation");
    expect(html).toContain("conditions commerciales");
    expect(html).toContain("Refuser");
    expect(html).not.toContain("Adresse du chantier");
  });

  test("lets either participant start scheduling only after acceptance", () => {
    const accepted = { ...assessment, status: "accepted" as const, acceptedAt: assessment.updatedAt };
    const clientHtml = render("en", <SiteAssessmentPanel result={{ viewerType: "client", canInvite: false, assessment: accepted }} />);
    const companyHtml = render("en", <SiteAssessmentPanel result={{ viewerType: "company", canInvite: false, assessment: accepted }} />);
    expect(clientHtml).toContain("Schedule site visit");
    expect(companyHtml).toContain("Schedule site visit");
    expect(companyHtml).toContain("Open scheduling conversation");
  });

  test("renders structured proposal details and response actions responsively", () => {
    const proposed = { ...assessment, status: "accepted" as const, acceptedAt: assessment.updatedAt, visit: proposedVisit };
    const html = render("en", <SiteAssessmentPanel result={{ viewerType: "company", canInvite: false, assessment: proposed }} />);
    expect(html).toContain("18 Avenue Mohammed V, Rabat");
    expect(html).toContain("Visit proposed");
    expect(html).toContain("Ring at reception");
    expect(html).toContain("Confirm");
    expect(html).toContain("Suggest another time");
    expect(html).toContain("Decline");
    expect(html).not.toContain("Note (optional)");
    expect(html).toContain("px-4");
    expect(html).toContain("sm:px-7");
    expect(html).toContain("sm:p-5");
    expect(html).toContain("min-h-11");
  });

  test("renders a clean scheduled summary once the visit is confirmed", () => {
    const confirmedVisit = {
      ...proposedVisit,
      status: "confirmed" as const,
      confirmedAt: Date.UTC(2026, 8, 24, 12),
      confirmedByUserId: "company-user-1" as Id<"users">,
      canConfirm: false,
      canDecline: false,
      canCancel: true,
      canComplete: true,
    };
    const confirmed = {
      ...assessment,
      status: "accepted" as const,
      acceptedAt: assessment.updatedAt,
      visit: confirmedVisit,
    };
    const html = render("en", <SiteAssessmentPanel result={{ viewerType: "client", canInvite: false, assessment: confirmed }} />);
    expect(html).toContain("Visit scheduled");
    expect(html).toContain("18 Avenue Mohammed V, Rabat");
    expect(html).toContain("10:00");
    expect(html).toContain("Morocco time");
    expect(html).toContain("Cancel visit");
    expect(html).not.toContain("Date</dt>");
    expect(html).not.toContain("Time</dt>");
    expect(html).not.toContain("Note (optional)");
  });

  test("keeps all site-assessment translation keys aligned", () => {
    expect(Object.keys(en.siteAssessment).sort()).toEqual(Object.keys(fr.siteAssessment).sort());
    expect(Object.keys(en.siteAssessment.status).sort()).toEqual(Object.keys(fr.siteAssessment.status).sort());
    expect(Object.keys(en.siteAssessment.schedule).sort()).toEqual(Object.keys(fr.siteAssessment.schedule).sort());
    expect(Object.keys(en.siteAssessment.visit).sort()).toEqual(Object.keys(fr.siteAssessment.visit).sort());
  });
});
