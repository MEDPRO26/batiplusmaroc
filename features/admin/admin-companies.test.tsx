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
  Link: ({ children, href, ...props }: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | { pathname: string; params?: Record<string, string>; query?: Record<string, string> } }) => {
    if (typeof href === "string") return <a href={href} {...props}>{children}</a>;
    const path = Object.entries(href.params ?? {}).reduce((value, [key, param]) => value.replace(`[${key}]`, param), href.pathname);
    const query = new URLSearchParams(href.query ?? {}).toString();
    return <a href={query ? `${path}?${query}` : path} {...props}>{children}</a>;
  },
  usePathname: () => "/admin/companies",
  getPathname: () => "/admin/companies",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { AdminCompaniesPanel } from "./components/admin-companies-panel";
import { AdminCompanyDetailPanel } from "./components/admin-company-detail-panel";
import { AdminShell } from "./components/admin-shell";
import { parseCompanyFilters, toQuery } from "./lib/company-filters";

const companyId = "company-atlas" as never;
const noFilters = { search: "", verification: null, onboarding: null, operational: null };
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

  test.each(["en", "fr"] as const)("%s authorized Admin Company detail retains full identity", locale => {
    mocks.query = { ...summary, name: "S2MBOU SARL", legalName: "S2MBOU SARL" };
    const html = render(locale, <AdminCompanyDetailPanel companyId={companyId} />);
    expect(html).toContain("S2MBOU SARL");
    expect(html).not.toContain("S2**** SA**");
  });

  test.each([["en", "Companies", "No companies match these filters.", "Search by name"], ["fr", "Entreprises", "Aucune entreprise ne correspond à ces filtres.", "Nom, ville"]] as const)("renders the translated %s list and bounded empty state", (locale, title, empty, search) => {
    const html = render(locale, <AdminCompaniesPanel initialFilters={noFilters} />);
    expect(html).toContain(title);
    expect(html).toContain(empty);
    expect(html).toContain(search);
  });

  test("offers and preserves the normal operational filter in the URL", () => {
    const html = render("en", <AdminCompaniesPanel initialFilters={{ ...noFilters, operational: "normal" }} />);
    expect(html).toContain('<option value="normal" selected="">Normal</option>');
    const parsed = parseCompanyFilters({ operational: "normal" });
    expect(parsed.operational).toBe("normal");
    expect(toQuery(parsed)).toMatchObject({ operational: "normal" });
  });

  test("Verification is no longer a sidebar destination; Companies is", () => {
    const html = render("en", <AdminCompaniesPanel initialFilters={noFilters} />);
    expect(html).toMatch(/aria-current="page"[^>]*>(?:<svg.*?<\/svg>)?Companies</);
    expect(html).not.toContain('href="/admin/verification"');
    expect(html).not.toContain(`>${en.adminDashboard.navVerification}</span>`);
  });

  test("pending companies open straight on the Verification tab and rows show operational status", () => {
    mocks.paginated = {
      status: "Exhausted",
      loadMore: vi.fn(),
      results: [
        { companyId: "pending-co", name: "Pending Co", legalName: null, city: "Agadir", verificationStatus: "pending", onboardingStatus: "completed", services: ["renovation", "plumbing", "pool"], activeMemberCount: 1, reviewCount: 0, rating: null, latestActivityAt: Date.UTC(2026, 8, 20), operationalStatus: "needs_attention" },
        { companyId: "verified-co", name: "Verified Co", legalName: null, city: "Rabat", verificationStatus: "verified", onboardingStatus: "completed", services: [], activeMemberCount: 2, reviewCount: 3, rating: 4.7, latestActivityAt: Date.UTC(2026, 8, 21), operationalStatus: "normal" },
      ],
    };
    const html = render("en", <AdminCompaniesPanel initialFilters={{ ...noFilters, verification: "pending" }} />);
    expect(html).toContain('href="/admin/companies/pending-co?tab=verification"');
    expect(html).toContain('href="/admin/companies/verified-co"');
    expect(html).toContain("Needs attention");
    expect(html).toContain("★ 4.7 (3)");
    // Long service lists no longer crowd each row.
    expect(html).not.toContain("Pools");
    expect(html).toContain('aria-pressed="true"');
  });

  test("a row without an operational status (older backend or legacy data) shows Normal, never a raw key", () => {
    mocks.paginated = {
      status: "Exhausted",
      loadMore: vi.fn(),
      results: [{ companyId: "legacy-co", name: "Legacy Co", legalName: null, city: "Rabat", verificationStatus: "verified", onboardingStatus: "completed", services: [], activeMemberCount: 0, reviewCount: 0, rating: null, latestActivityAt: Date.UTC(2026, 8, 1) }],
    };
    const html = render("en", <AdminCompaniesPanel initialFilters={noFilters} />);
    expect(html).toContain(">Normal<");
    expect(html).not.toContain("operationalStatus.status");
  });

  test("the company page links back to Companies from the breadcrumb and header", () => {
    mocks.query = summary;
    const html = render("en", <AdminCompanyDetailPanel companyId={companyId} />);
    expect(html.match(/href="\/admin\/companies"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Back to companies");
    expect(html).toContain('aria-label="More actions"');
  });

  test("maps the list and dynamic detail routes in both locales", () => {
    expect(routing.pathnames[routes.adminCompanies]).toEqual({ fr: "/admin/entreprises", en: "/admin/companies" });
    expect(routing.pathnames[routes.adminCompany]).toEqual({ fr: "/admin/entreprises/[companyId]", en: "/admin/companies/[companyId]" });
  });

  test.each([["en", "Overview", "Projects &amp; Deals", "Messages", "Internal Notes", "View public profile"], ["fr", "Vue d’ensemble", "Projets et Deals", "Messages", "Notes internes", "Voir le profil public"]] as const)("renders all consolidated %s detail tabs", (locale, overview, projects, messages, notes, publicProfile) => {
    mocks.query = summary;
    const html = render(locale, <AdminCompanyDetailPanel companyId={companyId} />);
    expect(html).toContain("Atlas Build");
    expect(html).toContain(overview);
    expect(html).toContain(projects);
    expect(html).toContain(messages);
    expect(html).toContain(notes);
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
    expect(Object.keys(fr.adminNotes).sort()).toEqual(Object.keys(en.adminNotes).sort());
  });
});
