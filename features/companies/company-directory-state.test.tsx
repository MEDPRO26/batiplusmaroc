import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";

const queryState = vi.hoisted(() => ({
  results: [] as unknown[],
  status: "Exhausted",
  initialNumItems: 0,
}));

vi.mock("convex/react", () => ({
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
  logoUrl: null,
  coverImageUrl: null,
  portfolio: [],
  rating: null,
  reviewCount: 0,
};

function renderDirectory() {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      <CompanyDirectory />
    </NextIntlClientProvider>,
  );
}

describe("company directory states", () => {
  beforeEach(() => {
    queryState.results = [];
    queryState.status = "Exhausted";
    queryState.initialNumItems = 0;
  });

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
});
