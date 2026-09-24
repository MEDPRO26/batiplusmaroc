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
  scheduledAt: null,
  clientNote: "Please inspect the roof.",
  companyNote: null,
  siteAddress: null,
  updatedAt: Date.UTC(2026, 8, 24, 10),
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
    expect(html).toContain("Invite to site assessment");
    expect(html).toContain("Only one company can have an active assessment");
    expect(html).not.toContain("phone");
    expect(html).not.toContain("email");
  });

  test("renders the company acceptance acknowledgement and actions in French", () => {
    const html = render("fr", <SiteAssessmentPanel result={{ viewerType: "company", canInvite: false, assessment }} />);
    expect(html).toContain("Atlas Construction");
    expect(html).toContain("Accepter l’évaluation");
    expect(html).toContain("conditions commerciales");
    expect(html).toContain("Refuser");
    expect(html).not.toContain("Adresse du chantier");
  });

  test("shows the scheduling form only to the client after acceptance", () => {
    const accepted = { ...assessment, status: "accepted" as const, acceptedAt: assessment.updatedAt };
    const clientHtml = render("en", <SiteAssessmentPanel result={{ viewerType: "client", canInvite: false, assessment: accepted }} />);
    const companyHtml = render("en", <SiteAssessmentPanel result={{ viewerType: "company", canInvite: false, assessment: accepted }} />);
    expect(clientHtml).toContain('type="datetime-local"');
    expect(clientHtml).toContain("Site address");
    expect(clientHtml).toContain("Schedule site visit");
    expect(companyHtml).not.toContain('type="datetime-local"');
    expect(companyHtml).toContain("securely share the site address");
    expect(companyHtml).toContain("Open scheduling conversation");
  });

  test("renders scheduled details responsively for both mobile and desktop layouts", () => {
    const scheduled = { ...assessment, status: "scheduled" as const, acceptedAt: assessment.updatedAt, scheduledAt: Date.UTC(2026, 8, 30, 9), siteAddress: "18 Avenue Mohammed V, Rabat" };
    const html = render("en", <SiteAssessmentPanel result={{ viewerType: "company", canInvite: false, assessment: scheduled }} />);
    expect(html).toContain("18 Avenue Mohammed V, Rabat");
    expect(html).toContain("Visit scheduled");
    expect(html).toContain("px-4");
    expect(html).toContain("sm:px-7");
    expect(html).toContain("sm:p-5");
    expect(html).toContain("min-h-11");
  });

  test("keeps all site-assessment translation keys aligned", () => {
    expect(Object.keys(en.siteAssessment).sort()).toEqual(Object.keys(fr.siteAssessment).sort());
    expect(Object.keys(en.siteAssessment.status).sort()).toEqual(Object.keys(fr.siteAssessment.status).sort());
    expect(Object.keys(en.siteAssessment.schedule).sort()).toEqual(Object.keys(fr.siteAssessment.schedule).sort());
  });
});
