import { usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getRegions } from "@/lib/geography/morocco";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const state = vi.hoisted(() => ({ rollout: { enabled: false, reason: "disabled" } as unknown, legacy: [] as unknown[] }));
vi.mock("convex/react", () => ({
  usePaginatedQuery: vi.fn(), useMutation: () => vi.fn(),
  useQuery: vi.fn((query: Parameters<typeof getFunctionName>[0]) => {
    const path = getFunctionName(query);
    if (path === "admin/siteVisits:getSiteVisitPaginationRollout") return state.rollout;
    if (path === "admin/siteVisits:listSiteVisits") return state.legacy;
    return undefined;
  }),
}));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
  usePathname: () => "/admin/site-visits", getPathname: () => "/admin/site-visits",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));

import { AdminSiteVisitsPanel } from "./components/admin-site-visits-panel";
import { AdminShell } from "./components/admin-shell";

function render(locale: "fr" | "en") {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}
    timeZone="Africa/Casablanca"><AdminShell email="admin@example.test" firstName="Ada" lastName="Admin">
      <AdminSiteVisitsPanel />
    </AdminShell></NextIntlClientProvider>);
}
function page(status: "CanLoadMore" | "LoadingMore" | "LoadingFirstPage" | "Exhausted", results: unknown[] = []) {
  vi.mocked(usePaginatedQuery).mockReturnValue({ results, status, loadMore: vi.fn() } as never);
}
const row = { assessmentId: "assessment-1", projectId: "project-1", projectTitle: "Older rural visit",
  clientName: "Client Tester", companyName: "Atlas Build", city: "rabat", assessmentStatus: "accepted",
  visitDate: null, visitTime: null, proposedBy: null, status: "accepted", finalQuoteStatus: "not_available", riskSignal: null, sortAt: 1 };
beforeEach(() => { vi.clearAllMocks(); state.rollout = { enabled: true, reason: null }; state.legacy = [row]; page("Exhausted"); });

describe.each(["fr", "en"] as const)("GEO9.1C %s Site Visit queue", (locale) => {
  const messages = locale === "fr" ? fr : en;
  const t = messages.adminSiteVisits;
  test("authorized rollout selects the native reader and twelve translated regions, with province disabled", () => {
    const html = render(locale);
    const calls = vi.mocked(usePaginatedQuery).mock.calls.filter(([query]) => getFunctionName(query) === "admin/siteVisits:listSiteVisitsPage");
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toEqual({ initialNumItems: 25 });
    const legacyCalls = vi.mocked(useQuery).mock.calls.filter(([query]) => getFunctionName(query) === "admin/siteVisits:listSiteVisits");
    expect(legacyCalls[0][1]).toBe("skip");
    expect(html).toContain(t.filters.allMorocco);
    expect(html).not.toContain(t.filters.allCities);
    expect(html).toContain(t.filters.provinceDisabled);
    expect(html).toMatch(/<select[^>]*aria-describedby[^>]*disabled/);
    expect(html).toContain(t.filters.clearGeography);
    for (const region of getRegions()) expect(html).toContain(locale === "fr" ? region.nameFr : region.nameEn);
    expect(html).not.toContain(t.pagination.legacyLimited);
  });
  test.each([undefined, { enabled: false, reason: "disabled" }, { enabled: false, reason: "historical_projection_missing" }])("inactive/unknown coverage %j preserves legacy display and skips the new reader", (rollout) => {
    state.rollout = rollout;
    const html = render(locale);
    expect(html).toContain("Older rural visit");
    expect(html).toContain(t.pagination.legacyLimited);
    expect(html).not.toContain(t.filters.allMorocco);
    expect(html).toContain(t.filters.allCities);
    expect(html).not.toContain(t.pagination.loadMore);
    const call = vi.mocked(usePaginatedQuery).mock.calls.find(([query]) => getFunctionName(query) === "admin/siteVisits:listSiteVisitsPage");
    expect(call?.[1]).toBe("skip");
  });
  test("empty intermediate pages retain continuation and only exhausted pages show no matches", () => {
    page("CanLoadMore");
    let html = render(locale);
    expect(html).toContain(t.pagination.moreMatches); expect(html).toContain(t.pagination.loadMore);
    expect(html).not.toContain(t.empty);
    page("Exhausted"); html = render(locale);
    expect(html).toContain(t.empty); expect(html).not.toContain(t.pagination.loadMore);
  });
  test("loading more keeps existing records visible and disables additional requests", () => {
    page("LoadingMore", [row]);
    const html = render(locale);
    expect(html).toContain("Older rural visit"); expect(html).toContain(t.pagination.loadingMore);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*<\/button>/);
    expect(html).not.toContain(t.empty);
    expect(html).not.toContain("PRIVATE_ADDRESS");
  });
  test("first-page loading remains separate from empty continuation", () => {
    page("LoadingFirstPage");
    const html = render(locale);
    expect(html).not.toContain(t.empty); expect(html).not.toContain(t.pagination.moreMatches);
    expect(html).not.toContain(t.pagination.loadMore);
  });
});
