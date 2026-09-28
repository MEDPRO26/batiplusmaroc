import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const paginated = vi.hoisted(() => ({
  results: [] as Array<Record<string, unknown>>,
  status: "Exhausted",
  loadMore: vi.fn(),
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: () => paginated,
}));

vi.mock("next/font/google", () => ({
  Outfit: () => ({ className: "font-outfit" }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { CompanyActivityTimeline } from "./components/company-activity-timeline";
import AdminVerificationError from "@/app/[locale]/(admin)/admin/verification/error";

const companyId = "company-id" as never;

function render(locale: "en" | "fr") {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : fr}
      timeZone="Africa/Casablanca"
    >
      <CompanyActivityTimeline companyId={companyId} />
    </NextIntlClientProvider>,
  );
}

function renderError(locale: "en" | "fr") {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : fr}
      timeZone="Africa/Casablanca"
    >
      <AdminVerificationError error={new Error("PRIVATE_BACKEND_DETAIL")} reset={() => undefined} />
    </NextIntlClientProvider>,
  );
}

function timelineRow() {
  return {
    id: "activity:one",
    source: "marketplace_activity",
    eventType: "commission_paid",
    category: "deals",
    companyId,
    project: { projectId: "project-id", title: "Villa Atlas", status: "completed" },
    entity: { type: "deal", id: "deal-id" },
    actor: { type: "admin", displayName: "Ada Admin" },
    occurredAt: Date.UTC(2026, 8, 28, 12, 0),
    oldStatus: "due",
    newStatus: "paid",
    context: {
      amountMad: null,
      commissionAmountMad: 12_000,
      commissionRateBps: 500,
      currency: "MAD",
      rating: null,
      revisionNumber: null,
      proposedDate: null,
      proposedTime: null,
      timezone: null,
      scheduledEpoch: null,
    },
  };
}

describe("CompanyActivityTimeline", () => {
  beforeEach(() => {
    paginated.results = [];
    paginated.status = "Exhausted";
    paginated.loadMore.mockReset();
  });

  test.each([
    ["en", "Commission paid", "Project: Villa Atlas", "View details"],
    ["fr", "Commission payée", "Projet : Villa Atlas", "Voir les détails"],
  ] as const)("renders structured %s event copy and an existing Admin link", (locale, title, context, link) => {
    paginated.results = [timelineRow()];
    const html = render(locale);
    expect(html).toContain(title);
    expect(html).toContain(context);
    expect(html).toContain("Ada Admin");
    expect(html).toContain(link);
    expect(html).toContain('href="/admin/deals"');
  });

  test.each([
    ["en", "No activity recorded for this company yet."],
    ["fr", "Aucune activité enregistrée pour cette entreprise pour le moment."],
  ] as const)("renders the %s empty state", (locale, message) => {
    expect(render(locale)).toContain(message);
  });

  test("renders an accessible loading skeleton and responsive load-more control", () => {
    paginated.status = "LoadingFirstPage";
    let html = render("en");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading company activity");

    paginated.status = "CanLoadMore";
    paginated.results = [timelineRow()];
    html = render("en");
    expect(html).toContain("Load more activity");
    expect(html).toContain("w-full");
  });

  test.each([
    ["en", "Company verification is unavailable", "Try again"],
    ["fr", "La vérification des entreprises est indisponible", "Réessayer"],
  ] as const)("renders a safe translated %s route error", (locale, title, retry) => {
    const html = renderError(locale);
    expect(html).toContain(title);
    expect(html).toContain(retry);
    expect(html).not.toContain("PRIVATE_BACKEND_DETAIL");
  });
});
