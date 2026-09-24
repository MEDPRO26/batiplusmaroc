import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ReceivedQuote, ReceivedQuoteDetail } from "@/features/quotes/components/client-received-quotes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span data-image-alt={alt} /> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string | { pathname: string; params?: Record<string, string> } }) => {
    if (typeof href === "string") return <a href={href}>{children}</a>;
    const resolved = Object.entries(href.params ?? {}).reduce((pathname, [key, value]) => pathname.replace(`[${key}]`, value), href.pathname);
    return <a href={resolved}>{children}</a>;
  },
}));

import { QuoteReviewContent, ReceivedQuoteCard } from "@/features/quotes/components/client-received-quotes";

const quote: ReceivedQuote = {
  id: "quote-1" as Id<"projectQuotes">,
  projectId: "project-1" as Id<"projects">,
  companyId: "company-1" as Id<"companies">,
  message: "We will assign a dedicated project manager and skilled renovation team.",
  estimatedPrice: 185_000,
  currency: "MAD",
  estimatedDuration: 75,
  availableStartDate: "2099-01-15",
  scope: "Demolition, electrical work, plumbing, finishes, and final site cleanup.",
  quoteType: "initial",
  status: "viewed",
  createdAt: 1_790_000_000_000,
  updatedAt: 1_790_000_000_000,
  submittedAt: 1_790_000_000_000,
  withdrawnAt: null,
  company: {
    name: "Atlas Construction",
    slug: "atlas-construction",
    city: "Rabat",
    description: "A verified renovation company serving Rabat and Casablanca.",
    logoUrl: "https://cdn.example.test/atlas.webp",
    isVerified: true,
  },
};

function render(locale: "en" | "fr", node: React.ReactNode) {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">{node}</NextIntlClientProvider>);
}

describe("client received quote UI", () => {
  test("renders the real quote summary and profile action in English", () => {
    const html = render("en", <ReceivedQuoteCard onOpen={vi.fn()} quote={quote} />);
    expect(html).toContain("Atlas Construction");
    expect(html).toContain("Verified company");
    expect(html).toContain("MAD");
    expect(html).toContain("75 days");
    expect(html).toContain("Available start");
    expect(html).toContain("Review quote");
    expect(html).toContain("View company profile");
    expect(html).toContain("/entreprises/atlas-construction");
    expect(html).toContain("sm:grid-cols-3");
  });

  test("renders the localized French card", () => {
    const html = render("fr", <ReceivedQuoteCard onOpen={vi.fn()} quote={{ ...quote, status: "shortlisted" }} />);
    expect(html).toContain("Présélectionné");
    expect(html).toContain("75 jours");
    expect(html).toContain("Examiner le devis");
    expect(html).toContain("Voir le profil");
  });

  test("shows all valid review actions and the no-messaging boundary", () => {
    const detail: ReceivedQuoteDetail = { ...quote, history: [{ oldStatus: "submitted", newStatus: "viewed", changedAt: quote.updatedAt, reason: null }] };
    const html = render("en", <QuoteReviewContent confirmDecline={false} error={null} onCancelDecline={vi.fn()} onConfirmDecline={vi.fn()} onReview={vi.fn()} pendingAction={null} quote={detail} success={null} />);
    expect(html).toContain("About the company");
    expect(html).toContain(quote.company.description);
    expect(html).toContain("Shortlist");
    expect(html).toContain("Open discussion");
    expect(html).toContain("Decline");
    expect(html).toContain("creates a private project conversation");
  });

  test("requires explicit confirmation before declining", () => {
    const detail: ReceivedQuoteDetail = { ...quote, history: [] };
    const html = render("en", <QuoteReviewContent confirmDecline error={null} onCancelDecline={vi.fn()} onConfirmDecline={vi.fn()} onReview={vi.fn()} pendingAction={null} quote={detail} success={null} />);
    expect(html).toContain("Decline this quote?");
    expect(html).toContain("This decision cannot be reversed");
    expect(html).toContain("Keep quote");
  });

  test.each([
    ["en", "Continue in Messages"],
    ["fr", "Continuer dans Messages"],
  ] as const)("%s discussion state links directly to the exact conversation", (locale, label) => {
    const detail: ReceivedQuoteDetail = { ...quote, status: "discussion_open", history: [] };
    const html = render(locale, <QuoteReviewContent confirmDecline={false} conversationId={"conversation-1" as Id<"conversations">} error={null} onCancelDecline={vi.fn()} onConfirmDecline={vi.fn()} onReview={vi.fn()} pendingAction={null} quote={detail} success={null} />);
    expect(html).toContain(label);
    expect(html).toContain('/messages/conversation-1');
    expect(html).not.toContain(">Shortlist<");
    expect(html).not.toContain(">Decline<");
  });

  test("discussion state fails safely and offers retry when its conversation is missing", () => {
    const detail: ReceivedQuoteDetail = { ...quote, status: "discussion_open", history: [] };
    const html = render("en", <QuoteReviewContent confirmDecline={false} conversationId={null} conversationLookupPending={false} error={null} onCancelDecline={vi.fn()} onConfirmDecline={vi.fn()} onReview={vi.fn()} pendingAction={null} quote={detail} success={null} />);
    expect(html).toContain("The conversation could not be loaded.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("conversation-1");
    expect(html).not.toContain("ConvexError");
  });

  test("keeps received quote translation shapes aligned", () => {
    expect(Object.keys(en.receivedQuotes)).toEqual(Object.keys(fr.receivedQuotes));
    expect(Object.keys(en.receivedQuotes.status)).toEqual(Object.keys(fr.receivedQuotes.status));
    expect(en.receivedQuotes.empty.title).toBe("No quotes received yet.");
    expect(fr.receivedQuotes.empty.title).toBe("Aucun devis reçu pour le moment.");
  });
});
