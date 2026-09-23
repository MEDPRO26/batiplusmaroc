import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { ReceivedQuote, ReceivedQuoteDetail } from "@/features/quotes/components/client-received-quotes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span data-image-alt={alt} /> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: { pathname: string; params: { slug: string } } }) => <a href={href.pathname.replace("[slug]", href.params.slug)}>{children}</a>,
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
    expect(html).toContain("messaging remains locked");
  });

  test("requires explicit confirmation before declining", () => {
    const detail: ReceivedQuoteDetail = { ...quote, history: [] };
    const html = render("en", <QuoteReviewContent confirmDecline error={null} onCancelDecline={vi.fn()} onConfirmDecline={vi.fn()} onReview={vi.fn()} pendingAction={null} quote={detail} success={null} />);
    expect(html).toContain("Decline this quote?");
    expect(html).toContain("This decision cannot be reversed");
    expect(html).toContain("Keep quote");
  });

  test("terminal discussion state exposes no further review actions", () => {
    const detail: ReceivedQuoteDetail = { ...quote, status: "discussion_open", history: [] };
    const html = render("en", <QuoteReviewContent confirmDecline={false} error={null} onCancelDecline={vi.fn()} onConfirmDecline={vi.fn()} onReview={vi.fn()} pendingAction={null} quote={detail} success={null} />);
    expect(html).toContain("Discussion opened");
    expect(html).toContain("No conversation or message thread has been created yet");
    expect(html).not.toContain(">Shortlist<");
    expect(html).not.toContain(">Decline<");
  });

  test("keeps received quote translation shapes aligned", () => {
    expect(Object.keys(en.receivedQuotes)).toEqual(Object.keys(fr.receivedQuotes));
    expect(Object.keys(en.receivedQuotes.status)).toEqual(Object.keys(fr.receivedQuotes.status));
    expect(en.receivedQuotes.empty.title).toBe("No quotes received yet.");
    expect(fr.receivedQuotes.empty.title).toBe("Aucun devis reçu pour le moment.");
  });
});
