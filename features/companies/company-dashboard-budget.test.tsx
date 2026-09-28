import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";

const state = vi.hoisted(() => ({ queryIndex: 0 }));

vi.mock("convex/react", () => ({
  useQuery: () => {
    state.queryIndex += 1;
    if (state.queryIndex === 1) return { accountType: "company", onboardingStatus: "completed" };
    return {
      name: "Atlas Build",
      description: "A verified construction company profile for testing.",
      city: "rabat",
      phone: "+212600000000",
      logoUrl: null,
      services: ["renovation"],
      yearsExperience: 8,
      website: "https://example.test",
      verificationStatus: "verified",
    };
  },
  usePaginatedQuery: () => ({
    results: [{
      id: "project-legacy-budget",
      title: "Legacy apartment renovation",
      city: "rabat",
      primaryCategory: "renovation",
      customCategoryText: null,
      budgetRange: "100000_250000",
      timeline: "one_to_three_months",
      propertyType: "apartment",
      surface: 95,
      surfaceUnknown: false,
      description: "A complete apartment renovation with electrical work.",
      publishedAt: 1_790_000_000_000,
      client: null,
    }],
    status: "Exhausted",
    loadMore: vi.fn(),
  }),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string | { pathname: string } }) => <a href={typeof href === "string" ? href : href.pathname}>{children}</a>,
  useRouter: () => ({ replace: vi.fn() }),
}));

import { CompanyDashboard } from "./components/company-dashboard";

describe("company dashboard Project feed", () => {
  beforeEach(() => { state.queryIndex = 0; });

  test("ignores stored legacy budget values and offers only current filters", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} now={new Date("2026-09-28T12:00:00Z")} timeZone="Africa/Casablanca">
        <CompanyDashboard />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("Legacy apartment renovation");
    expect(html).toContain("1–3 months");
    expect(html).not.toContain("100,000–250,000 MAD");
    expect(html).not.toContain('id="company-feed-budget"');
    expect(html).not.toContain(">Budget<");
  });
});
