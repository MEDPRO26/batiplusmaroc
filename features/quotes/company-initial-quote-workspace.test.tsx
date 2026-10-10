import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toGeneralProjectLocation } from "@/lib/geography/project-location";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const state = vi.hoisted(() => ({ queryResults: [] as unknown[], queryIndex: 0 }));
vi.mock("convex/react", () => ({
  useQuery: () => state.queryResults[state.queryIndex++],
  useMutation: () => vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string | { pathname: string; params?: Record<string, string> } }) => {
    if (typeof href === "string") return <a href={href}>{children}</a>;
    const resolved = Object.entries(href.params ?? {}).reduce((pathname, [key, value]) => pathname.replace(`[${key}]`, value), href.pathname);
    return <a href={resolved}>{children}</a>;
  },
  useRouter: () => ({ replace: vi.fn() }),
}));

import { CompanyConversationPanel, CompanyInitialQuoteWorkspace } from "@/features/quotes/components/company-initial-quote-workspace";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";

const projectId = "project-1" as Id<"projects">;
const quoteId = "quote-1" as Id<"projectQuotes">;
const companyId = "company-1" as Id<"companies">;
const companyUser = { accountType: "company", onboardingStatus: "completed" };
const project = {
  id: projectId,
  title: "Renovation of a family apartment",
  city: "rabat" as const,
  location: toGeneralProjectLocation({ city: "rabat" }),
  primaryCategory: "renovation" as const,
  timeline: "one_to_three_months" as const,
} satisfies NonNullable<FunctionReturnType<typeof api.quotes.index.getSubmissionContext>>["project"];

function render(locale: "en" | "fr", context: unknown, quote?: unknown, threads?: unknown) {
  state.queryResults = [companyUser, context, quote, threads];
  state.queryIndex = 0;
  const onError = vi.fn();
  const html = renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : fr}
      timeZone="Africa/Casablanca"
      onError={onError}
    >
      <CompanyInitialQuoteWorkspace projectId={projectId} />
    </NextIntlClientProvider>,
  );
  expect(onError).not.toHaveBeenCalled();
  return html;
}

function renderNode(locale: "en" | "fr", node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">
      {node}
    </NextIntlClientProvider>,
  );
}

describe("company initial quote workspace", () => {
  beforeEach(() => {
    state.queryIndex = 0;
  });

  test("maps the exact localized EN and FR quote routes", () => {
    expect(routing.pathnames[routes.companyInitialQuote]).toEqual({
      en: "/company/projects/[projectId]/quote",
      fr: "/espace-entreprise/projets/[projectId]/devis",
    });
  });

  test.each([
    ["en", "Submit a proposal", "Proposal message", "Scope of work"],
    ["fr", "Envoyer une proposition", "Message de proposition", "Périmètre des travaux"],
  ] as const)("renders the localized %s submission form", (locale, title, message, scope) => {
    const html = render(locale, {
      project,
      verificationStatus: "verified",
      marketplaceWriteAllowed: true,
      activeQuoteId: null,
      latestQuoteId: null,
    });
    expect(html).toContain(title);
    expect(html).toContain(message);
    expect(html).toContain(scope);
    expect(html).toContain('type="date"');
    expect(html).toContain(locale === "en" ? "Your estimate" : "Votre estimation");
    expect(html).toContain("Renovation of a family apartment");
  });

  test("ignores a legacy Client budget while preserving Company estimate inputs", () => {
    const html = render("en", {
      project,
      verificationStatus: "verified",
      marketplaceWriteAllowed: true,
      activeQuoteId: null,
      latestQuoteId: null,
    });
    expect(html).toContain("Submit a proposal");
    expect(html).toContain("Renovation of a family apartment");
    expect(html).toContain("Initial estimate");
    expect(html).not.toContain("100,000–250,000 MAD");
    expect(html).not.toContain(">Budget<");
  });

  describe.each(["fr", "en"] as const)("GEO4.2 %s general location summary", (locale) => {
    const recorded = {
      regionCode: "05", provinceCode: "05.081", communeName: "Aït Tamlil — آيت تامليل",
      localityName: "PRIVATE_DOUAR_QUOTE_RENDER", neighborhood: "PRIVATE_NEIGHBORHOOD_QUOTE_RENDER",
    };
    test.each([
      { name: "structured-only", city: null, location: toGeneralProjectLocation(recorded), label: "Azilal" },
      { name: "optional commune", city: null, location: toGeneralProjectLocation({ ...recorded, communeName: null }), label: "Azilal" },
      { name: "mixed historical/new", city: "rabat", location: toGeneralProjectLocation({ ...recorded, city: "rabat" }), label: "Azilal" },
      { name: "legacy-only", city: "rabat", location: project.location, label: "Rabat" },
      { name: "unspecified historical", city: null, location: toGeneralProjectLocation({}), label: (locale === "fr" ? fr : en).projectLocation.unspecified },
    ])("renders $name in the form and saved quote without private fields or invalid city translation keys", ({ city, location, label }) => {
      const summary = { ...project, city, location };
      for (const hasQuote of [false, true]) {
        const html = render(locale, {
          project: { ...summary, ...{ neighborhood: recorded.neighborhood, localityName: recorded.localityName } },
          verificationStatus: "verified", marketplaceWriteAllowed: true,
          activeQuoteId: hasQuote ? quoteId : null, latestQuoteId: hasQuote ? quoteId : null,
        }, hasQuote ? {
          id: quoteId, projectId, companyId, project: summary,
          message: "We can deliver this renovation with a dedicated site team.",
          estimatedPrice: 185000, currency: "MAD", estimatedDuration: 75, availableStartDate: "2099-01-15",
          scope: "Demolition, plumbing, electrical work, finishes, and site cleanup.", quoteType: "initial",
          status: "submitted", createdAt: 100, updatedAt: 100, submittedAt: 100, withdrawnAt: null,
          history: [{ oldStatus: "draft", newStatus: "submitted", changedAt: 100, reason: null }],
        } : undefined);
        expect(html).toContain(label);
        if (location.communeName) expect(html).toContain(location.communeName);
        expect(html).not.toContain("PRIVATE_");
        expect(html).not.toContain("cityOptions.null");
        expect(html).not.toContain("cityOptions.undefined");
        expect(html).toContain(hasQuote ? (locale === "fr" ? "Votre proposition" : "Your proposal")
          : (locale === "fr" ? "Votre estimation" : "Your estimate"));
      }
    });
  });

  test("disables submission behind company verification", () => {
    const html = render("en", {
      project,
      verificationStatus: "pending",
      marketplaceWriteAllowed: true,
      activeQuoteId: null,
      latestQuoteId: null,
    });
    expect(html).toContain("Company verification required");
    expect(html).toContain("Verify your company before submitting a proposal.");
    expect(html).not.toContain("quote-message");
  });

  test("replaces the direct-route form when marketplace access is suspended", () => {
    const html = render("en", {
      project,
      verificationStatus: "verified",
      marketplaceWriteAllowed: false,
      activeQuoteId: null,
      latestQuoteId: null,
    });
    expect(html).toContain("Proposal submission unavailable");
    expect(html).toContain("temporarily suspended");
    expect(html).not.toContain("quote-message");
  });

  test("renders the submitted quote, withdrawal action, and locked messaging notice", () => {
    const html = render(
      "en",
      {
        project,
        verificationStatus: "verified",
        marketplaceWriteAllowed: true,
        activeQuoteId: quoteId,
        latestQuoteId: quoteId,
      },
      {
        id: quoteId,
        projectId,
        companyId,
        message: "We can deliver this renovation with a dedicated site team.",
        estimatedPrice: 185000,
        currency: "MAD",
        estimatedDuration: 75,
        availableStartDate: "2099-01-15",
        scope: "Demolition, plumbing, electrical work, finishes, and site cleanup.",
        quoteType: "initial",
        status: "submitted",
        createdAt: 100,
        updatedAt: 100,
        submittedAt: 100,
        withdrawnAt: null,
        project,
        history: [{ oldStatus: "draft", newStatus: "submitted", changedAt: 100, reason: null }],
      },
    );
    expect(html).toContain("Your proposal");
    expect(html).toContain("185,000");
    expect(html).toContain("75 days");
    expect(html).toContain("Messaging is still locked");
    expect(html).toContain("Withdraw proposal");
  });

  test.each([
    ["en", "The client opened a discussion about this project.", "Continue in Messages"],
    ["fr", "Le client a ouvert une discussion concernant ce projet.", "Continuer dans Messages"],
  ] as const)("renders the realtime %s conversation CTA with the exact route", (locale, notice, label) => {
    state.queryResults = [];
    const html = render(
      locale,
      { project, verificationStatus: "verified", marketplaceWriteAllowed: true, activeQuoteId: quoteId, latestQuoteId: quoteId },
      {
        id: quoteId, projectId, companyId, message: "We can deliver this renovation with a dedicated site team.",
        estimatedPrice: 185000, currency: "MAD", estimatedDuration: 75, availableStartDate: "2099-01-15",
        scope: "Demolition, plumbing, electrical work, finishes, and site cleanup.", quoteType: "initial",
        status: "discussion_open", createdAt: 100, updatedAt: 200, submittedAt: 100, withdrawnAt: null,
        project, history: [{ oldStatus: "viewed", newStatus: "discussion_open", changedAt: 200, reason: null }],
      },
      [{ id: "conversation-1", quoteId }],
    );
    expect(html).toContain(notice);
    expect(html).toContain(label);
    expect(html).toContain('/messages/conversation-1');
  });

  test("shows a translated retry fallback when an open discussion has no conversation", () => {
    const html = renderNode("en", <CompanyConversationPanel conversationId={null} lookupPending={false} onRetry={vi.fn()} recoveryPending={false} />);
    expect(html).toContain("The conversation could not be loaded.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("ConvexError");
  });
});
