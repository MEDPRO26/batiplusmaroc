import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const queryState = vi.hoisted(() => ({
  results: [] as unknown[],
  status: "Exhausted",
  initialNumItems: 0,
  catalog: [] as { _id: string; slug: string; nameFr: string; nameEn: string; isActive: boolean; sortOrder: number }[],
}));

vi.mock("convex/react", () => ({
  useQuery: (reference: unknown) => getFunctionName(reference as never) === "serviceCatalog:listActive" ? queryState.catalog : undefined,
  usePaginatedQuery: (
    _query: unknown,
    _args: unknown,
    options: { initialNumItems: number },
  ) => {
    queryState.initialNumItems = options.initialNumItems;
    return {
      results: queryState.results,
      status: queryState.status,
      loadMore: vi.fn(),
    };
  },
}));

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  getPathname: () => "/companies/atlas",
}));

import { VerifiedBadge } from "./components/verified-badge";
import { CompanyDirectory } from "./components/company-directory";

const company = {
  id: "company-1",
  slug: "atlas-build",
  name: "Atlas Build",
  description: "A public company description.",
  city: "Casablanca",
  isVerified: true,
  yearsExperience: 8,
  services: ["houseConstruction"],
  serviceNames: [{ slug: "houseConstruction", nameFr: "Construction maison / villa", nameEn: "House / villa construction" }],
  logoUrl: null,
  coverImageUrl: null,
  portfolio: [],
  rating: null,
  reviewCount: 0,
};

function renderDirectory(locale: "en" | "fr" = "en") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}>
      <CompanyDirectory />
    </NextIntlClientProvider>,
  );
}

describe("company directory states", () => {
  beforeEach(() => {
    queryState.results = [];
    queryState.status = "Exhausted";
    queryState.initialNumItems = 0;
    queryState.catalog = [];
  });

  for (const locale of ["en", "fr"] as const) {
    test.each(["verified", "draft", "pending", "rejected"])(`directory badges are verified-only in ${locale}: %s`, (status) => {
      const isVerified = status === "verified";
      queryState.results = [{ ...company, isVerified }];
      const html = renderDirectory(locale);
      expect(html.match(/data-verification="verified"/g) ?? []).toHaveLength(isVerified ? 1 : 0);
      expect(html).not.toContain('data-verification="unverified"');
      expect(html).not.toMatch(/Unverified company|Entreprise non vérifiée/);
      if (isVerified) {
        const label = (locale === "en" ? en : fr).companyDirectory.verified;
        expect(html).toContain(renderToStaticMarkup(<VerifiedBadge isVerified label={label} />));
      }
    });
  }

  test("renders the translated empty state and clear-filters action", () => {
    const html = renderDirectory();
    expect(html).toContain("No companies match your search.");
    expect(html).toContain("Clear filters");
    expect(html).not.toContain("ConvexError");
  });

  test("renders company-card skeletons for the first page", () => {
    queryState.status = "LoadingFirstPage";
    const html = renderDirectory();
    expect(html).toContain("Loading companies…");
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/skeleton-block/g)?.length).toBeGreaterThan(10);
  });

  test("renders the mobile filter trigger in the interactive shell", () => {
    const html = renderDirectory();
    expect(html).toContain("Filters");
    expect(html).toContain("Verified companies only");
    expect(html).toContain("All services");
  });

  test("requests a bounded first page and offers load more only when another page exists", () => {
    queryState.results = [company];
    queryState.status = "CanLoadMore";

    const html = renderDirectory();
    expect(queryState.initialNumItems).toBe(12);
    expect(html).toContain("Load more");

    queryState.status = "Exhausted";
    expect(renderDirectory()).not.toContain("Load more");
  });

  test("shows a loading-more state and removes duplicate companies by id", () => {
    queryState.results = [company, { ...company }];
    queryState.status = "LoadingMore";

    const html = renderDirectory();
    expect(html).toContain("Loading more companies…");
    expect(html.match(/Atlas Build/g)).toHaveLength(1);
    expect(html).not.toContain("Load more");
  });

  test.each([
    ["en", "Roofing", "House / villa construction"],
    ["fr", "Toiture", "Construction maison / villa"],
  ] as const)("renders Admin-created and seeded service names in %s", (locale, customName, originalName) => {
    queryState.catalog = [
      { _id: "catalog-1", slug: "houseConstruction", nameFr: "Construction maison / villa", nameEn: "House / villa construction", isActive: true, sortOrder: 0 },
      { _id: "catalog-2", slug: "roofing", nameFr: "Toiture", nameEn: "Roofing", isActive: true, sortOrder: 10 },
    ];
    queryState.results = [{ ...company, services: ["houseConstruction", "roofing"], serviceNames: queryState.catalog }];
    const html = renderDirectory(locale);
    expect(html).toContain(customName);
    expect(html).toContain(originalName);
    expect(html).toContain(`id="desktop-service-roofing"`);
    expect(html).not.toContain("service.options.roofing");
  });

  test("all ten legacy selections still render while catalog migration is pending", () => {
    const keys = ["houseConstruction", "renovation", "structural", "finishing", "architecture", "interior", "electrical", "plumbing", "joinery", "pool"] as const;
    queryState.results = keys.map((key, index) => ({
      ...company, id: `company-${index}`, name: `Company ${index}`, services: [key], serviceNames: [],
    }));
    const html = renderDirectory();
    for (const key of keys) expect(html).toContain(en.companyDirectory.service.options[key]);
  });
});
