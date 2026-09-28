import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";

const mocks = vi.hoisted(() => ({
  query: undefined as unknown,
  paginated: { results: [] as Array<Record<string, unknown>>, status: "Exhausted", loadMore: vi.fn() },
}));

vi.mock("convex/react", () => ({
  useQuery: () => mocks.query,
  usePaginatedQuery: () => mocks.paginated,
  useMutation: () => vi.fn(),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | { pathname: string; params: Record<string, string> } }) => {
    const resolved = typeof href === "string" ? href : Object.entries(href.params).reduce((path, [key, value]) => path.replace(`[${key}]`, value), href.pathname);
    return <a href={resolved} {...props}>{children}</a>;
  },
  usePathname: () => "/admin/companies",
  getPathname: () => "/admin/companies",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { AdminCompaniesPanel } from "./components/admin-companies-panel";
import { AdminCompanyDetailPanel } from "./components/admin-company-detail-panel";
import { AdminShell } from "./components/admin-shell";

const companyId = "company-atlas" as never;
const summary = {
  companyId,
  name: "Atlas Build",
  legalName: "Atlas Build SARL",
  description: "Construction and renovation.",
  city: "Rabat",
  serviceAreas: ["rabat"],
  services: ["renovation"],
  verificationStatus: "verified",
  onboardingStatus: "completed",
  createdAt: Date.UTC(2026, 8, 1),
  logoUrl: null,
  publicProfileSlug: "atlas-build",
  activeMemberCount: 1,
  membersTruncated: false,
  members: [{ userId: "user-owner", displayName: "Sara Test", role: "owner", status: "active" }],
  reviewSummary: { count: 2, rating: 4.5 },
  dealSummary: { activeCount: 1, completedCount: 3, truncated: false },
  commissionSummary: { dueCount: 1, dueAmountMad: 5000, truncated: false },
  portfolio: [],
  portfolioHasMore: false,
};

function render(locale: "en" | "fr", child: React.ReactNode) {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca"><AdminShell email="admin@example.test" firstName="Ada" lastName="Admin">{child}</AdminShell></NextIntlClientProvider>);
}

describe("Admin companies UI", () => {
  beforeEach(() => { mocks.query = undefined; mocks.paginated = { results: [], status: "Exhausted", loadMore: vi.fn() }; });

  test.each([["en", "Companies", "No companies match these filters.", "Search by name"], ["fr", "Entreprises", "Aucune entreprise ne correspond à ces filtres.", "Nom, ville"]] as const)("renders the translated %s list and bounded empty state", (locale, title, empty, search) => {
    const html = render(locale, <AdminCompaniesPanel />);
    expect(html).toContain(title);
    expect(html).toContain(empty);
    expect(html).toContain(search);
  });

  test("maps the list and dynamic detail routes in both locales", () => {
    expect(routing.pathnames[routes.adminCompanies]).toEqual({ fr: "/admin/entreprises", en: "/admin/companies" });
    expect(routing.pathnames[routes.adminCompany]).toEqual({ fr: "/admin/entreprises/[companyId]", en: "/admin/companies/[companyId]" });
  });

  test.each([["en", "Overview", "Projects &amp; Deals", "View public profile"], ["fr", "Vue d’ensemble", "Projets et Deals", "Voir le profil public"]] as const)("renders all consolidated %s detail tabs", (locale, overview, projects, publicProfile) => {
    mocks.query = summary;
    const html = render(locale, <AdminCompanyDetailPanel companyId={companyId} />);
    expect(html).toContain("Atlas Build");
    expect(html).toContain(overview);
    expect(html).toContain(projects);
    expect(html).toContain(publicProfile);
    expect(html).toContain('href="/entreprises/atlas-build"');
    expect(html).not.toContain("private message");
  });

  test.each([["en", "Company not found"], ["fr", "Entreprise introuvable"]] as const)("renders a safe translated %s not-found state", (locale, message) => {
    mocks.query = null;
    const html = render(locale, <AdminCompanyDetailPanel companyId={companyId} />);
    expect(html).toContain(message);
    expect(html).not.toContain("COMPANY_NOT_FOUND");
  });

  test("keeps FR and EN company translation shapes aligned", () => {
    expect(Object.keys(fr.adminCompanies).sort()).toEqual(Object.keys(en.adminCompanies).sort());
    expect(Object.keys(fr.adminCompanies.detail.tabs).sort()).toEqual(Object.keys(en.adminCompanies.detail.tabs).sort());
    expect(Object.keys(fr.adminCompanies.services).sort()).toEqual(Object.keys(en.adminCompanies.services).sort());
  });
});
