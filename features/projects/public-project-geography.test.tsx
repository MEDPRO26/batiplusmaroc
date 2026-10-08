import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getProvincesByRegion, getRegions } from "@/lib/geography/morocco";
import { toGeneralProjectLocation } from "@/lib/geography/project-location";
import { routes } from "@/lib/routes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

type Control = { onChange?: (event: { target: { value: string } }) => void; onClick?: () => void;
  children?: unknown; disabled?: boolean; id?: string; type?: string; name?: string; label?: string;
  "aria-label"?: string; "aria-controls"?: string };
const state = vi.hoisted(() => ({
  geography: { regionCode: "", provinceCode: "" }, search: "", category: "all", sortBy: "newest",
  open: false, selectedId: null as string | null, strings: 0, booleans: 0, nulls: 0,
  args: [] as Record<string, unknown>[], names: [] as string[], sizes: [] as number[], controls: new Map<string, Control>(),
  results: [] as unknown[], status: "Exhausted", loadMore: vi.fn(), error: null as Error | null,
  user: null as Record<string, unknown> | null | undefined,
}));

// Match the existing server-rendered UI test pattern. Retain parent state and
// replay rendered handlers; real backend tests exercise pagination and privacy.
vi.mock("react", async (importActual) => {
  const react = await importActual<typeof import("react")>();
  return { ...react, useState: (initial: unknown) => {
    const [value] = react.useState(initial);
    let field: "geography" | "search" | "category" | "sortBy" | "open" | "selectedId" | null = null;
    if (initial && typeof initial === "object" && "regionCode" in initial && "provinceCode" in initial) field = "geography";
    else if (typeof initial === "string") {
      const index = state.strings++;
      if (index === 0) field = "search";
      else if (index === 1) field = "category";
      else if (initial === "newest") field = "sortBy";
    } else if (initial === false && state.booleans++ === 0) field = "open";
    else if (initial === null && state.nulls++ === 0) field = "selectedId";
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
      const control = props as Control;
      if (type === "select" && control.id) state.controls.set(control.id, control);
      if (type === "input" && control.type === "search") state.controls.set("search", control);
      if (typeof type === "function" && type.name === "FilterOption") state.controls.set(`radio:${control.name}:${control.label}`, control);
      if (type === "button") {
        if (typeof control.children === "string") state.controls.set(control.children, control);
        if (control["aria-label"]) state.controls.set(`aria:${control["aria-label"]}`, control);
        if (control["aria-controls"]) state.controls.set("mobile-toggle", control);
      }
    }
    return factory(...args);
  };
  return { ...runtime, jsx: capture(runtime.jsx), jsxs: capture(runtime.jsxs) };
});
vi.mock("react/jsx-dev-runtime", async (importActual) => {
  const runtime = await importActual<typeof import("react/jsx-dev-runtime")>();
  return { ...runtime, jsxDEV: (...args: Parameters<typeof runtime.jsxDEV>) => {
    const [type, props] = args;
    if (props && typeof props === "object") {
      const control = props as Control;
      if (type === "select" && control.id) state.controls.set(control.id, control);
      if (type === "input" && control.type === "search") state.controls.set("search", control);
      if (typeof type === "function" && type.name === "FilterOption") state.controls.set(`radio:${control.name}:${control.label}`, control);
      if (type === "button") {
        if (typeof control.children === "string") state.controls.set(control.children, control);
        if (control["aria-label"]) state.controls.set(`aria:${control["aria-label"]}`, control);
        if (control["aria-controls"]) state.controls.set("mobile-toggle", control);
      }
    }
    return runtime.jsxDEV(...args);
  } };
});
vi.mock("convex/react", () => ({
  useQuery: () => state.user,
  usePaginatedQuery: (query: Parameters<typeof getFunctionName>[0], args: Record<string, unknown>, options: { initialNumItems: number }) => {
    if (state.error) throw state.error;
    state.args.push(args); state.names.push(getFunctionName(query)); state.sizes.push(options.initialNumItems);
    return { results: state.results, status: state.status, loadMore: state.loadMore };
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string | { pathname: string } }) =>
    <a href={typeof href === "string" ? href : href.pathname}>{children}</a>,
}));

import PublicProjectError from "@/app/[locale]/(public)/projets/error";
import { PublicProjectBrowse } from "./components/public-project-browse";

const recorded = { locationMode: "structured" as const, regionCode: "09", provinceCode: "09.541",
  communeName: "Commune d’Aoulouz", city: "agadir", localityName: "PRIVATE_DOUAR", neighborhood: "PRIVATE_NEIGHBORHOOD" };
const ruralProject = { id: "rural-project", title: "Rural renovation", description: "Safe public description.",
  city: null, location: toGeneralProjectLocation(recorded), primaryCategory: "renovation", timeline: null,
  publishedAt: 1, thumbnailUrl: null };
function render(locale: "fr" | "en", child: React.ReactNode = <PublicProjectBrowse />) {
  state.strings = state.booleans = state.nulls = 0;
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
function click(id: string) {
  expect(state.controls.has(id)).toBe(true);
  state.controls.get(id)!.onClick!();
}
beforeEach(() => {
  state.geography = { regionCode: "", provinceCode: "" }; state.search = ""; state.category = "all"; state.sortBy = "newest";
  state.open = false; state.selectedId = null; state.results = []; state.status = "Exhausted";
  state.args = []; state.names = []; state.sizes = []; state.error = null; state.user = null; state.loadMore.mockClear();
});

describe.each(["fr", "en"] as const)("GEO6.2B %s public filters and states", (locale) => {
  const messages = locale === "fr" ? fr : en;
  test("all 12 canonical regions, All Morocco and dependent province labels are accessible", () => {
    state.open = true;
    let html = render(locale);
    expect(getRegions()).toHaveLength(12);
    for (const region of getRegions()) {
      expect(html).toContain(`value="${region.code}"`);
      expect(html).toContain(locale === "fr" ? region.nameFr : region.nameEn);
    }
    expect(html).toContain(messages.companyProjects.filters.allMorocco);
    for (const prefix of ["browse-projects-desktop", "browse-projects-mobile"]) {
      expect(html).toContain(`for="${prefix}-region"`);
      expect(html).toContain(`id="${prefix}-region"`);
      expect(html).toContain(`for="${prefix}-province"`);
      expect(html).toContain(`aria-describedby="${prefix}-province-hint"`);
      expect(html).toContain(`name="${prefix}-category"`);
    }
    expect(html).toContain('disabled=""');
    expect(html).toContain(messages.companyProjects.filters.provinceDisabled);
    expect(html).toContain('aria-controls="public-project-mobile-filters"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("lg:hidden"); expect(html).toContain("lg:block");
    expect(html).toContain("min-h-11"); expect(html).toContain("focus-visible:ring-3");
    expect(html).not.toContain('name="city"'); expect(html).not.toContain(messages.browseProjectsPage.cityFilter);
    change("browse-projects-mobile-region", "09");
    html = render(locale);
    for (const province of getProvincesByRegion("09")) expect(html).toContain(`value="${province.code}"`);
    expect(html).not.toContain('value="05.081"');
    expect(state.args.at(-1)).toMatchObject({ regionCode: "09", provinceCode: undefined });
    click(`aria:${messages.browseProjectsPage.closeFilters}`);
    expect(render(locale)).not.toContain('id="public-project-mobile-filters"');
    click("mobile-toggle");
    expect(render(locale)).toContain('id="public-project-mobile-filters"');
  });

  test("native handlers change query arguments, clear dependent provinces and retain search/category", () => {
    state.search = "atlas"; state.category = "renovation"; state.geography = { regionCode: "09", provinceCode: "09.541" };
    render(locale);
    const initial = state.args.at(-1)!;
    change("browse-projects-desktop-region", "05");
    render(locale);
    expect(state.geography).toEqual({ regionCode: "05", provinceCode: "" });
    expect(state.args.at(-1)).toMatchObject({ regionCode: "05", provinceCode: undefined, search: "atlas", category: "renovation" });
    expect(JSON.stringify(state.args.at(-1))).not.toBe(JSON.stringify(initial));
    change("browse-projects-desktop-province", "05.081");
    render(locale);
    expect(state.args.at(-1)).toMatchObject({ regionCode: "05", provinceCode: "05.081", search: "atlas", category: "renovation" });
    state.controls.get(`radio:browse-projects-desktop-category:${messages.projectWizard.categoryOptions.painting}`)!.onChange!({ target: { value: "" } });
    render(locale);
    expect(state.args.at(-1)).toMatchObject({ category: "painting", regionCode: "05", provinceCode: "05.081", search: "atlas" });
    click(messages.browseProjectsPage.clearFilters);
    render(locale);
    expect(state.args.at(-1)).toEqual({ regionCode: undefined, provinceCode: undefined, category: undefined, search: undefined, sortBy: "newest" });
    expect(new Set(state.names)).toEqual(new Set(["projects/index:listPublicProjectsPaginated"]));
    expect(new Set(state.sizes)).toEqual(new Set([12]));
    for (const args of state.args) {
      expect(args).not.toHaveProperty("paginationOpts"); // native hook owns cursors and resets on argument changes
      expect(args).not.toHaveProperty("city"); expect(args).not.toHaveProperty("cities");
    }
  });

  test("text search displays relevance and clearing it restores remembered chronological sorting", () => {
    state.geography = { regionCode: "09", provinceCode: "09.541" }; state.category = "renovation";
    render(locale);
    change("browse-projects-sort", "oldest");
    render(locale);
    expect(state.args.at(-1)).toMatchObject({ sortBy: "oldest", search: undefined });
    change("search", "  atlas  ");
    let html = render(locale); // a fresh SSR render represents the settled debounce, not browser timer behavior
    expect(html).toContain(messages.browseProjectsPage.relevance);
    expect(html).not.toContain('id="browse-projects-sort"');
    expect(state.args.at(-1)).toMatchObject({ sortBy: "oldest", search: "atlas", category: "renovation", regionCode: "09", provinceCode: "09.541" });
    click(`aria:${messages.browseProjectsPage.clearSearch}`);
    html = render(locale);
    expect(html).not.toContain(messages.browseProjectsPage.relevance);
    expect(html).toContain('value="oldest" selected=""');
    expect(state.args.at(-1)).toMatchObject({ sortBy: "oldest", search: undefined, category: "renovation", regionCode: "09", provinceCode: "09.541" });
    change("search", " \t\n ");
    expect(render(locale)).not.toContain(messages.browseProjectsPage.relevance);
    expect(state.args.at(-1)!.search).toBeUndefined();
  });

  test("first-page, sparse continuation, loading-more and exhausted states preserve native Load More", () => {
    state.status = "LoadingFirstPage";
    let html = render(locale);
    expect(html).toContain(messages.browseProjectsPage.loading);
    expect(html).toContain('aria-busy="true"'); expect(html).toContain('role="status"');
    expect(html).not.toContain(messages.browseProjectsPage.emptyTitle);
    state.status = "CanLoadMore";
    html = render(locale);
    expect(html).toContain(messages.browseProjectsPage.scanning);
    expect(html).not.toContain(messages.browseProjectsPage.emptyTitle);
    click(messages.browseProjectsPage.loadMore);
    expect(state.loadMore).toHaveBeenCalledExactlyOnceWith(12);
    state.results = [ruralProject]; state.status = "LoadingMore";
    html = render(locale);
    expect(html).toContain(ruralProject.title); expect(html).toContain('aria-busy="true"');
    expect(state.controls.get(messages.browseProjectsPage.loadingMore)?.disabled).toBe(true);
    state.status = "Exhausted";
    html = render(locale);
    expect(html).toContain(messages.browseProjectsPage.exhausted);
    expect(state.controls.has(messages.browseProjectsPage.loadMore)).toBe(false);
    expect(html).not.toContain(messages.browseProjectsPage.emptyTitle);
    state.results = [];
    html = render(locale);
    expect(html).toContain(messages.browseProjectsPage.emptyTitle);
    expect(html).toContain(messages.browseProjectsPage.emptyLead);
  });

  test("rural cards and preview use the general projection, including cleared structured mode", () => {
    state.results = [ruralProject];
    let html = render(locale);
    expect(html).toContain("Taroudannt"); expect(html).toContain(recorded.communeName);
    expect(html).not.toContain("Agadir"); expect(html).not.toContain("PRIVATE_");
    click(`aria:${messages.browseProjectsPage.openAria.replace("{title}", ruralProject.title)}`);
    html = render(locale);
    expect(html).toContain('aria-labelledby="browse-project-preview-title"');
    expect(html).toContain(messages.browseProjectsPage.previewTitle);
    expect(html).toContain(routes.signUpCompany); expect(html).toContain(routes.signIn);
    expect(html).not.toContain("PRIVATE_");
    click(`aria:${messages.browseProjectsPage.closePreview}`);
    render(locale);
    state.results = [{ ...ruralProject, city: "agadir", location: toGeneralProjectLocation({ locationMode: "structured", city: "agadir" }) }];
    html = render(locale);
    expect(html).toContain(messages.projectLocation.unspecified); expect(html).not.toContain("Agadir");
    state.results = [{ ...ruralProject, city: "agadir", location: toGeneralProjectLocation({ city: "agadir" }) }];
    expect(render(locale)).toContain("Agadir");
    state.results = [{ ...ruralProject, city: "agadir", location: toGeneralProjectLocation({ ...recorded, locationMode: undefined }) }];
    expect(render(locale)).not.toContain("Agadir");
  });

  test("query errors reach the existing public route fallback with localized retry and no private error content", () => {
    const error = new Error("PRIVATE_BACKEND_FAILURE");
    state.error = error;
    expect(() => render(locale)).toThrow(error);
    const reset = vi.fn();
    const html = render(locale, <PublicProjectError error={error} reset={reset} />);
    expect(html).toContain(messages.ux.error.generic); expect(html).toContain(messages.ux.retry);
    expect(html).not.toContain(error.message); expect(html).toContain(routes.home);
    click(messages.ux.retry); expect(reset).toHaveBeenCalledOnce();
  });
});

test.each([
  [null, routes.signUpCompany],
  [{ accountType: "client", onboardingStatus: "completed" }, routes.signUpCompany],
  [{ accountType: "company", onboardingStatus: "completed" }, routes.companyProjects],
  [{ accountType: "company", onboardingStatus: "pending" }, routes.companyOnboarding],
] as const)("proposal CTA keeps account/onboarding routing for %j", (user, href) => {
  state.user = user; state.results = [ruralProject]; state.selectedId = ruralProject.id;
  const html = render("en");
  expect(html).toContain(href);
  expect(html).toContain('role="dialog"');
  expect(html).not.toContain("PRIVATE_");
});
