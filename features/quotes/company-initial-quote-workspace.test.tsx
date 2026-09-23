import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const state = vi.hoisted(() => ({ queryResults: [] as unknown[], queryIndex: 0 }));
vi.mock("convex/react", () => ({
  useQuery: () => state.queryResults[state.queryIndex++],
  useMutation: () => vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string | { pathname: string } }) => (
    <a href={typeof href === "string" ? href : href.pathname}>{children}</a>
  ),
  useRouter: () => ({ replace: vi.fn() }),
}));

import { CompanyInitialQuoteWorkspace } from "@/features/quotes/components/company-initial-quote-workspace";
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
  primaryCategory: "renovation" as const,
  budgetRange: "100000_250000" as const,
  timeline: "one_to_three_months" as const,
};

function render(locale: "en" | "fr", context: unknown, quote?: unknown) {
  state.queryResults = [companyUser, context, quote];
  state.queryIndex = 0;
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : fr}
      timeZone="Africa/Casablanca"
    >
      <CompanyInitialQuoteWorkspace projectId={projectId} />
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
    ["en", "Send an initial quote", "Message to client", "Scope of work"],
    ["fr", "Envoyer un devis estimatif", "Message au client", "Périmètre des travaux"],
  ] as const)("renders the localized %s submission form", (locale, title, message, scope) => {
    const html = render(locale, {
      project,
      verificationStatus: "verified",
      activeQuoteId: null,
      latestQuoteId: null,
    });
    expect(html).toContain(title);
    expect(html).toContain(message);
    expect(html).toContain(scope);
    expect(html).toContain('type="date"');
    expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_320px]");
    expect(html).toContain("Renovation of a family apartment");
  });

  test("disables submission behind company verification", () => {
    const html = render("en", {
      project,
      verificationStatus: "pending",
      activeQuoteId: null,
      latestQuoteId: null,
    });
    expect(html).toContain("Company verification required");
    expect(html).toContain("Verify your company before sending a quote.");
    expect(html).not.toContain("quote-message");
  });

  test("renders the submitted quote, withdrawal action, and locked messaging notice", () => {
    const html = render(
      "en",
      {
        project,
        verificationStatus: "verified",
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
    expect(html).toContain("Your initial quote");
    expect(html).toContain("185,000");
    expect(html).toContain("75 days");
    expect(html).toContain("Messaging is still locked");
    expect(html).toContain("Withdraw quote");
  });
});
