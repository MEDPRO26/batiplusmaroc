import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { describeAppError } from "@/lib/errors";
import { getProvincesByRegion, getRegions } from "@/lib/geography/morocco";
import { toGeneralProjectLocation } from "@/lib/geography/project-location";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

type Selection = { regionCode: string; provinceCode: string };
type Control = { onChange?: (event: { target: { value: string } }) => void; onClick?: () => void; children?: unknown };
const state = vi.hoisted(() => ({
  geography: { regionCode: "", provinceCode: "" } as Selection,
  categories: ["renovation"], search: "atlas", category: "renovation", open: false,
  arrays: 0, strings: 0, booleans: 0, queryIndex: 0,
  args: [] as Record<string, unknown>[], sizes: [] as number[], controls: new Map<string, Control>(),
  results: [] as unknown[], status: "Exhausted",
}));

// Existing component tests use server rendering. Capture the rendered native
// controls and replay their actual handlers, retaining just the parent filter
// state between renders; Convex pagination itself is exercised in backend tests.
vi.mock("react", async (importActual) => {
  const react = await importActual<typeof import("react")>();
  return { ...react, useState: (initial: unknown) => {
    const [value] = react.useState(initial);
    let field: "geography" | "categories" | "search" | "category" | "open" | null = null;
    if (initial && typeof initial === "object" && "regionCode" in initial && "provinceCode" in initial) field = "geography";
    else if (Array.isArray(initial) && state.arrays++ === 0) field = "categories";
    else if (initial === "") field = state.strings++ === 0 ? "search" : "category";
    else if (initial === false && state.booleans++ === 0) field = "open";
    return field ? [state[field], (next: unknown) => {
      const updated = typeof next === "function" ? next(state[field!]) : next;
      Object.assign(state, { [field!]: updated });
    }] : [value, () => undefined];
  } };
});
vi.mock("react/jsx-runtime", async (importActual) => {
  type Factory = (...args: unknown[]) => unknown;
  const runtime = await importActual<Record<string, Factory>>();
  const capture = (factory: Factory): Factory => (...args) => {
    const [type, props] = args;
    if (props && typeof props === "object") {
      const control = props as Control & { id?: string };
      if (type === "select" && control.id) state.controls.set(control.id, control);
      if (type === "button" && typeof control.children === "string") state.controls.set(control.children, control);
    }
    return factory(...args);
  };
  return { ...runtime, jsx: capture(runtime.jsx), jsxs: capture(runtime.jsxs) };
});
vi.mock("react/jsx-dev-runtime", async (importActual) => {
  type Factory = (...args: unknown[]) => unknown;
  const runtime = await importActual<Record<string, Factory>>();
  return { ...runtime, jsxDEV: (...args: unknown[]) => {
    const [type, props] = args;
    if (props && typeof props === "object") {
      const control = props as Control & { id?: string };
      if (type === "select" && control.id) state.controls.set(control.id, control);
      if (type === "button" && typeof control.children === "string") state.controls.set(control.children, control);
    }
    return runtime.jsxDEV(...args);
  } };
});
vi.mock("convex/react", () => ({
  useQuery: () => {
    if (state.queryIndex++ === 0) return { accountType: "company", onboardingStatus: "completed" };
    if (state.queryIndex === 2) return { name: "Atlas Build", description: "A sufficiently detailed Company description.",
      city: "HEADQUARTERS", phone: "", services: [], logoUrl: null, yearsExperience: 8, website: "", verificationStatus: "verified" };
    return [];
  },
  usePaginatedQuery: (_query: unknown, args: Record<string, unknown>, options: { initialNumItems: number }) => {
    state.args.push(args); state.sizes.push(options.initialNumItems);
    return { results: state.results, status: state.status, loadMore: vi.fn() };
  },
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ replace: vi.fn() }),
}));

import { CompanyDashboard } from "@/features/companies/components/company-dashboard";
import { CompanyProjectMarketplace } from "./components/company-project-marketplace";
import { changeProjectGeography, ProjectGeographicFilters } from "./components/project-geographic-filters";

function render(locale: "fr" | "en", child: React.ReactNode) {
  state.arrays = state.strings = state.booleans = state.queryIndex = 0;
  state.controls.clear();
  const onError = vi.fn();
  const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}
    now={new Date("2026-10-08T12:00:00Z")} timeZone="Africa/Casablanca" onError={onError}>{child}</NextIntlClientProvider>);
  expect(onError).not.toHaveBeenCalled();
  return html;
}
function change(id: string, value: string) {
  expect(state.controls.has(id)).toBe(true);
  state.controls.get(id)!.onChange!({ target: { value } });
}

beforeEach(() => {
  state.geography = { regionCode: "", provinceCode: "" };
  state.categories = ["renovation"]; state.category = "renovation"; state.search = "atlas";
  state.args = []; state.sizes = []; state.results = []; state.status = "Exhausted"; state.open = false;
});

describe.each(["fr", "en"] as const)("GEO6.1 %s administrative controls", (locale) => {
  test("all 12 regions have canonical values and a localized All Morocco default", () => {
    const html = render(locale, <ProjectGeographicFilters idPrefix="test" value={state.geography} onChange={() => undefined} />);
    expect(getRegions()).toHaveLength(12);
    for (const region of getRegions()) {
      expect(html).toContain(`value="${region.code}"`);
      expect(html).toContain(locale === "fr" ? region.nameFr : region.nameEn);
    }
    const messages = locale === "fr" ? fr : en;
    expect(html).toContain(messages.companyProjects.filters.allMorocco);
    expect(html).toContain('for="test-region"');
    expect(html).toContain('for="test-province"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-describedby="test-province-hint"');
    expect(html).toContain(messages.companyProjects.filters.provinceDisabled);
    expect(html).toContain("min-h-11");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("focus-visible:ring-3");
    expect(html).not.toContain('name="city"');
  });

  test("dependent provinces and native change handlers clear the child and retain its parent", () => {
    let selection = { regionCode: "09", provinceCode: "09.541" };
    const picker = () => <ProjectGeographicFilters idPrefix="test" value={selection} onChange={(value) => { selection = value; }} />;
    let html = render(locale, picker());
    for (const province of getProvincesByRegion("09")) expect(html).toContain(`value="${province.code}"`);
    expect(html).not.toContain('value="05.081"');
    expect(html).toContain('value="09.541" selected=""');
    change("test-region", "05");
    expect(selection).toEqual({ regionCode: "05", provinceCode: "" });
    html = render(locale, picker());
    expect(html).toContain('value="05.081"');
    expect(html).not.toContain('value="09.541"');
    change("test-province", "05.081");
    expect(selection).toEqual({ regionCode: "05", provinceCode: "05.081" });
    render(locale, picker());
    change("test-region", "");
    expect(selection).toEqual({ regionCode: "", provinceCode: "" });
    expect(render(locale, picker())).toContain('disabled=""');
  });
});

describe.each(["marketplace", "dashboard"] as const)("GEO6.1 %s filter/query integration", (surface) => {
  const view = () => surface === "marketplace" ? <CompanyProjectMarketplace initialSearch="atlas" /> : <CompanyDashboard />;
  const prefix = surface === "marketplace" ? "desktop" : "company-feed";

  test("geography changes replace pagination arguments and preserve category/search; clear returns to All Morocco", () => {
    state.open = true;
    state.geography = { regionCode: "09", provinceCode: "09.541" };
    render("en", view());
    const initial = state.args.at(-1)!;
    expect(initial).toMatchObject({ regionCode: "09", provinceCode: "09.541", search: "atlas" });
    const category = surface === "marketplace" ? { categories: ["renovation"] } : { category: "renovation" };
    expect(initial).toMatchObject(category);
    change(`${prefix}-region`, "05");
    render("en", view());
    const regionChanged = state.args.at(-1)!;
    expect(regionChanged).toMatchObject({ regionCode: "05", provinceCode: undefined, search: "atlas", ...category });
    expect(JSON.stringify(regionChanged)).not.toBe(JSON.stringify(initial));
    change(`${prefix}-province`, "05.081");
    render("en", view());
    const provinceChanged = state.args.at(-1)!;
    expect(provinceChanged).toMatchObject({ regionCode: "05", provinceCode: "05.081", search: "atlas", ...category });
    expect(JSON.stringify(provinceChanged)).not.toBe(JSON.stringify(regionChanged));
    for (const args of state.args) {
      expect(args).not.toHaveProperty("paginationOpts"); // the native hook owns/reset its cursors on argument changes
      expect(args).not.toHaveProperty("city");
      expect(args).not.toHaveProperty("cities");
    }
    state.controls.get(en.companyProjects.clearFilters)!.onClick!();
    render("en", view());
    expect(state.args.at(-1)).toMatchObject({ regionCode: undefined, provinceCode: undefined });
    expect(state.geography).toEqual({ regionCode: "", provinceCode: "" });
    expect(new Set(state.sizes)).toEqual(new Set([surface === "marketplace" ? 10 : 8]));
  });

  test.each(["fr", "en"] as const)("%s rural cards and cleared marked records use general projections without stale city or private text", (locale) => {
    const recorded = { regionCode: "09", provinceCode: "09.541", communeName: "Commune d’Aoulouz", city: "agadir",
      localityName: "PRIVATE_DOUAR", neighborhood: "PRIVATE_NEIGHBORHOOD", locationMode: "structured" as const };
    const project = { id: "rural-project", title: "Rural renovation", city: "agadir", location: toGeneralProjectLocation(recorded),
      primaryCategory: "renovation", customCategoryText: null, description: "Safe general project description.",
      propertyType: "house", surface: null, surfaceUnknown: true, timeline: "flexible", publishedAt: 1, client: null };
    state.results = [project];
    let html = render(locale, view());
    expect(html).toContain("Taroudannt");
    expect(html).toContain(recorded.communeName);
    expect(html).not.toContain("PRIVATE_");
    expect(html).not.toContain("Agadir");
    state.results = [{ ...project, location: toGeneralProjectLocation({ locationMode: "structured", city: "agadir" }) }];
    html = render(locale, view());
    expect(html).toContain((locale === "fr" ? fr : en).projectLocation.unspecified);
    expect(html).not.toContain("Agadir");
  });
});

test("mobile marketplace uses separate labeled controls and retains pagination/loading/empty states", () => {
  state.open = true;
  state.status = "CanLoadMore";
  let html = render("en", <CompanyProjectMarketplace />);
  for (const prefix of ["desktop", "mobile"]) {
    expect(html).toContain(`id="${prefix}-region"`);
    expect(html).toContain(`id="${prefix}-province"`);
    expect(html).toContain(`for="${prefix}-region"`);
  }
  expect(html).toContain('role="dialog"');
  expect(html).toContain("lg:hidden");
  expect(html).toContain("lg:block");
  expect(html).toContain("Load more");
  expect(html).not.toContain(en.companyProjects.empty.title);
  state.status = "LoadingFirstPage";
  html = render("fr", <CompanyProjectMarketplace />);
  expect(html).toContain(fr.companyProjects.loading);
  expect(html).toContain('aria-busy="true"');
  state.status = "Exhausted";
  expect(render("en", <CompanyProjectMarketplace />)).toContain(en.companyProjects.empty.title);
});

test("geographic translations and the typed mixed-filter error stay aligned in FR/EN", () => {
  expect(Object.keys(fr.companyProjects.filters).sort()).toEqual(Object.keys(en.companyProjects.filters).sort());
  expect(Object.keys(fr.ux.error.codes).sort()).toEqual(Object.keys(en.ux.error.codes).sort());
  expect(describeAppError({ data: "AMBIGUOUS_PROJECT_LOCATION_FILTER" }).messageKey).toBe("error.codes.AMBIGUOUS_PROJECT_LOCATION_FILTER");
  const initial = Object.freeze({ regionCode: "09", provinceCode: "09.541" });
  expect(changeProjectGeography(initial, "provinceCode", "")).toEqual({ regionCode: "09", provinceCode: "" });
  expect(initial).toEqual({ regionCode: "09", provinceCode: "09.541" });
});
