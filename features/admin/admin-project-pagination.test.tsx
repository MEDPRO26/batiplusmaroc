import { usePaginatedQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getRegions } from "@/lib/geography/morocco";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("convex/react", () => ({ usePaginatedQuery: vi.fn(), useQuery: vi.fn(), useMutation: () => vi.fn() }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
  usePathname: () => "/admin/projects",
  getPathname: () => "/admin/projects",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));

import { AdminProjectsPanel } from "./components/admin-projects-panel";
import { AdminShell } from "./components/admin-shell";

function render(locale: "fr" | "en") {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}
    timeZone="Africa/Casablanca"><AdminShell email="admin@example.test" firstName="Ada" lastName="Admin">
      <AdminProjectsPanel />
    </AdminShell></NextIntlClientProvider>);
}
function page(status: "CanLoadMore" | "LoadingMore" | "LoadingFirstPage" | "Exhausted", results: unknown[] = []) {
  vi.mocked(usePaginatedQuery).mockReturnValue({ results, status, loadMore: vi.fn() } as never);
}
beforeEach(() => { vi.clearAllMocks(); page("Exhausted"); });

describe.each(["fr", "en"] as const)("GEO9.1B %s project queue", (locale) => {
  const messages = locale === "fr" ? fr : en;
  test("uses the new native pager and renders localized catalogue filters with dependent province disabled", () => {
    const html = render(locale);
    const [query, args, options] = vi.mocked(usePaginatedQuery).mock.calls[0];
    expect(getFunctionName(query)).toBe("admin/projects:listProjectsPage");
    expect(args).toEqual({ status: "pending_review", search: undefined,
      regionCode: undefined, provinceCode: undefined });
    expect(options).toEqual({ initialNumItems: 25 });
    expect(html).toContain(messages.adminProjects.regionLabel);
    expect(html).toContain(messages.adminProjects.allRegions);
    expect(html).not.toContain(messages.adminProjects.allCities);
    expect(html).toContain(messages.adminProjects.provinceLabel);
    expect(html).toContain(messages.adminProjects.provinceDisabled);
    expect(html).toMatch(/<select[^>]*aria-describedby[^>]*disabled/);
    expect(html).toContain(messages.adminProjects.clearFilters);
    for (const region of getRegions()) expect(html).toContain(locale === "fr" ? region.nameFr : region.nameEn);
  });
  test("keeps an empty partial page searchable instead of reporting exhausted results", () => {
    page("CanLoadMore");
    const html = render(locale);
    expect(html).toContain(messages.adminProjects.pagination.moreMatches);
    expect(html).toContain(messages.adminProjects.pagination.loadMore);
    expect(html).not.toContain(messages.adminProjects.empty);
  });
  test("keeps existing matches visible while loading more and disables duplicate requests", () => {
    page("LoadingMore", [{ projectId: "project-1", title: "Older matching project", clientName: "Client Tester",
      city: "rabat", category: null, customCategoryText: null, submittedAt: null, status: "draft" }]);
    const html = render(locale);
    expect(html).toContain("Older matching project");
    expect(html).toContain(messages.adminProjects.pagination.loadingMore);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*<\/button>/);
    expect(html).not.toContain(messages.adminProjects.empty);
  });
  test("shows the real empty state only after exhaustion and first-page loading separately", () => {
    expect(render(locale)).toContain(messages.adminProjects.empty);
    expect(render(locale)).not.toContain(messages.adminProjects.pagination.loadMore);
    page("LoadingFirstPage");
    const html = render(locale);
    expect(html).not.toContain(messages.adminProjects.empty);
    expect(html).not.toContain(messages.adminProjects.pagination.moreMatches);
  });
});
