import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { getProvincesByRegion, getRegions } from "@/lib/geography/morocco";

const queryState = vi.hoisted(() => ({
  results: [] as Array<Record<string, unknown>>,
  status: "Exhausted" as "LoadingFirstPage" | "LoadingMore" | "CanLoadMore" | "Exhausted" | "Error",
  args: null as Record<string, unknown> | null,
}));

vi.mock("convex/react", () => ({
  useQuery: (reference: unknown) => getFunctionName(reference as never) === "serviceCatalog:listActive" ? [] : undefined,
  usePaginatedQuery: (_query: unknown, args: Record<string, unknown>) => {
    queryState.args = args;
    return { results: queryState.results, status: queryState.status, loadMore: vi.fn() };
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
  serviceNames: [],
  logoUrl: null,
  coverImageUrl: null,
  portfolio: [],
  rating: null,
  reviewCount: 0,
  coverageScopeKeys: [] as string[],
};

function renderDirectory(locale: "en" | "fr" = "en", initialFiltersOpen = false) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}>
      <CompanyDirectory initialFiltersOpen={initialFiltersOpen} />
    </NextIntlClientProvider>,
  );
}

describe("company directory geographic filters", () => {
  beforeEach(() => {
    queryState.results = [];
    queryState.status = "Exhausted";
    queryState.args = null;
  });

  test("defaults to All Morocco without sending geographic arguments", () => {
    const html = renderDirectory();
    expect(html).toContain("All Morocco");
    expect(html).toContain('id="desktop-region"');
    expect(html).toContain('id="desktop-province"');
    expect(html).toContain("disabled");
    expect(html).toContain("Choose a region to see its provinces and prefectures.");
    expect(html).toContain("Headquarters city");
    expect(queryState.args).not.toHaveProperty("regionCode");
    expect(queryState.args).not.toHaveProperty("provinceCode");
    for (const region of getRegions()) expect(html).toContain(region.nameEn);
  });

  test("renders French region names and keeps the province control keyboard accessible", () => {
    const html = renderDirectory("fr");
    expect(html).toContain("Tout le Maroc");
    expect(html).toContain("Ville du siège");
    expect(html).toContain("<select");
    expect(html).toContain('id="desktop-region"');
    for (const region of getRegions()) expect(html).toContain(region.nameFr);
  });

  test("puts the same geographic controls in the mobile filter sheet", () => {
    const html = renderDirectory("en", true);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('id="mobile-region"');
    expect(html).toContain('id="mobile-province"');
    expect(html).toContain("focus:ring-2");
    expect(html).toContain("Verified companies only");
    expect(html).toContain("Headquarters city");
  });

  test("lists the selected region's provinces only through the catalogue helper", () => {
    const souss = getProvincesByRegion("09");
    expect(souss.map((province) => province.nameEn)).toContain("Taroudannt");
    expect(souss.some((province) => province.regionCode !== "09")).toBe(false);
  });

  test("does not show the exhausted empty state while an empty page can continue", () => {
    queryState.status = "CanLoadMore";
    const html = renderDirectory();
    expect(html).toContain("Looking for more companies…");
    expect(html).toContain("Load more");
    expect(html).not.toContain("No companies match your search.");
  });

  test("keeps the geographic filters visible when loading fails", () => {
    queryState.status = "Error";
    const html = renderDirectory();
    expect(html).toContain("Companies could not be loaded. Your filters are still applied.");
    expect(html).toContain('id="desktop-region"');
    expect(html).not.toContain("No companies match your search.");
  });

  test("shows the exhausted empty state only when the directory is finished", () => {
    queryState.status = "Exhausted";
    expect(renderDirectory()).toContain("No companies match your search.");
  });

  test.each([
    ["en", ["MA"], "Coverage:", "Coverage not declared"],
    ["en", ["R:09"], "Entire Souss-Massa region", "Taroudannt Province"],
    ["en", ["P:09.541"], "Taroudannt Province", "Entire Souss-Massa region"],
    ["fr", ["P:09.541"], "Province de Taroudannt", "Région Souss-Massa entière"],
    ["fr", ["P:09.001"], "Préfecture d’Agadir-Ida-Ou-Tanane", "P:09.001"],
  ] as const)("renders %s coverage %j as %s", (locale, keys, included, excluded) => {
    queryState.results = [{ ...company, coverageScopeKeys: [...keys] }];
    queryState.status = "Exhausted";
    const html = renderDirectory(locale);
    expect(html).toContain(included);
    expect(html).not.toContain(excluded);
  });

  test("shows every explicit overlap and an accessible remainder", () => {
    queryState.results = [{
      ...company,
      coverageScopeKeys: ["MA", "R:09", "P:09.541", "not-a-scope"],
    }];
    const html = renderDirectory();
    expect(html).toContain("<details");
    expect(html).toContain("All Morocco");
    expect(html).toContain("Entire Souss-Massa region");
    expect(html).toContain("Taroudannt Province");
    expect(html).toContain("1 more area");
    expect(html).not.toContain("not-a-scope");
    expect(html).not.toContain("P:09.541");
  });

  test("labels a company with no coverage as undeclared", () => {
    queryState.results = [{ ...company, coverageScopeKeys: [] }];
    const html = renderDirectory();
    expect(html).toContain("Coverage not declared");
    expect(html).not.toContain("Entire Souss-Massa region");
  });
});
