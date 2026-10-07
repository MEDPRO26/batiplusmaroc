import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { resolveNavbarRole, userInitials } from "./navbar-role";
import { buildClientNav } from "./client-nav";
import { buildCompanyNav } from "./company-nav";
import { isGroupActive, isLinkActive } from "./signed-in-navbar-chrome";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site"));
afterEach(() => vi.unstubAllEnvs());

vi.mock("next/font/google", () => ({
  Outfit: () => ({ className: "font-outfit" }),
}));
vi.mock("next/image", () => ({
  default: ({ alt, src, unoptimized }: { alt: string; src: string; unoptimized?: boolean }) => <span aria-label={alt} data-src={src} data-unoptimized={unoptimized || undefined} />,
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => (ns ? `${ns}.${key}` : key),
  useLocale: () => "en",
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: unknown }) => (
    <a data-href={typeof href === "string" ? href : JSON.stringify(href)}>{children}</a>
  ),
  usePathname: () => "/a-propos",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  getPathname: () => "/",
}));
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signOut: vi.fn(async () => undefined) }),
}));
vi.mock("convex/react", () => ({
  useQuery: vi.fn(() => null),
  useMutation: vi.fn(() => vi.fn()),
  usePaginatedQuery: vi.fn(() => ({ results: [], status: "Exhausted", loadMore: vi.fn() })),
  useConvexAuth: vi.fn(() => ({ isAuthenticated: false, isLoading: false })),
}));

import { useConvexAuth, useQuery } from "convex/react";
import { ClientNavbar } from "./client-navbar";
import { CompanyNavbar } from "./company-navbar";
import { PublicNavbar } from "./public-navbar";
import { SiteHeader } from "./site-header";

function objectShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(objectShape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, objectShape(child)]),
    );
  }
  return typeof value;
}

describe("navbar role selection", () => {
  test("avoids public flash while auth or user account type is loading", () => {
    expect(
      resolveNavbarRole({
        isLoading: true,
        isAuthenticated: false,
        accountType: null,
        userPending: false,
      }),
    ).toBe("loading");
    expect(
      resolveNavbarRole({
        isLoading: false,
        isAuthenticated: true,
        accountType: null,
        userPending: true,
      }),
    ).toBe("loading");
  });

  test("maps logged-out and marketplace roles while internal roles stay out of marketplace navigation", () => {
    expect(
      resolveNavbarRole({
        isLoading: false,
        isAuthenticated: false,
        accountType: null,
        userPending: false,
      }),
    ).toBe("public");
    expect(
      resolveNavbarRole({
        isLoading: false,
        isAuthenticated: true,
        accountType: "client",
        userPending: false,
      }),
    ).toBe("client");
    expect(
      resolveNavbarRole({
        isLoading: false,
        isAuthenticated: true,
        accountType: "company",
        userPending: false,
      }),
    ).toBe("company");
    for (const accountType of ["admin", "seo_team"] as const) {
      expect(
        resolveNavbarRole({
          isLoading: false,
          isAuthenticated: true,
          accountType,
          userPending: false,
        }),
      ).toBe("public");
    }
  });

  test("builds initials for avatar fallback", () => {
    expect(userInitials("Amine", "Benali")).toBe("AB");
    expect(userInitials("", "")).toBe("?");
  });
});

describe("role navbar content", () => {
  test("FR and EN expose matching profile-menu translation shapes", () => {
    expect(objectShape(fr.nav.profileMenu)).toEqual(objectShape(en.nav.profileMenu));
    expect(en.nav.myProjects).toBe("My projects");
    expect(fr.nav.myProjects).toBe("Mes projets");
    expect(en.nav.companySearchLabel).toBe("Search projects");
    expect(fr.nav.companySearchLabel).toBe("Rechercher des projets");
    expect(en.nav.searchScopeProjects).toBe("Projects");
    expect(fr.nav.searchScopeProjects).toBe("Projets");
    expect(en.nav.profileMenu.client.myProfile).toBe("My profile");
    expect(fr.nav.profileMenu.client.myProfile).toBe("Mon profil");
    expect(en.nav.profileMenu.company.companyProfile).toBe("Company profile");
    expect(fr.nav.profileMenu.company.companyProfile).toBe("Profil entreprise");
  });

  test("PublicNavbar keeps marketplace links, auth entry, and post CTA", () => {
    const html = renderToStaticMarkup(<PublicNavbar />);
    expect(html).toContain('data-navbar="public"');
    expect(html).toContain(routes.companies);
    expect(html).toContain(routes.browseProjects);
    expect(html).toContain(routes.postProject);
    expect(html).not.toContain(routes.clientProfile);
    expect(html).not.toContain(routes.companyPortfolio);
  });

  test("ClientNavbar shows client links and hides find-projects and company portfolio", () => {
    const html = renderToStaticMarkup(
      <ClientNavbar
        user={{
          firstName: "Amine",
          lastName: "Benali",
          email: "a@example.test",
          onboardingStatus: "completed",
        }}
      />,
    );
    expect(html).toContain('data-navbar="client"');
    expect(html).toContain(routes.clientDashboard);
    // Projects and companies are grouped menus; their links render when a menu opens.
    expect(html).toContain("nav.client.projects");
    expect(html).toContain("nav.client.manageWork");
    expect(html).toContain(routes.messages);
    expect(html).toContain(routes.clientProfile);
    expect(html).toContain("nav.searchLabel");
    expect(html).toContain("notifications.bell");
    expect(html).toContain("nav.profileMenu.client.accountSettings");
    expect(html).toContain("AB");
    expect(html).not.toContain(routes.postProject);
    expect(html).not.toContain(routes.browseProjects);
    expect(html).not.toContain(routes.companyPortfolio);
    expect(html).not.toContain(routes.companyDashboard);
  });

  test("client navigation groups only existing routes and funnels to onboarding until it completes", () => {
    const t = ((key: string) => key) as Parameters<typeof buildClientNav>[0];
    const hrefs = (onboarded: boolean) =>
      buildClientNav(t, onboarded).flatMap((item) =>
        "kind" in item ? item.sections.flatMap((section) => section.items.map((link) => link.href)) : [item.href],
      );
    expect(hrefs(true)).toEqual([routes.clientDashboard, routes.clientWork, routes.postProjectWizard, routes.companies, routes.clientWork, routes.messages]);
    expect(hrefs(false)).toEqual([routes.clientOnboarding, routes.clientOnboarding, routes.clientOnboarding, routes.companies, routes.clientOnboarding, routes.messages]);
    expect(hrefs(true)).not.toContain(routes.companyDashboard);
    expect(hrefs(true)).not.toContain(routes.browseProjects);
  });

  test("Your contracts opens the contracts tab of the localized work page", () => {
    const t = ((key: string) => key) as Parameters<typeof buildClientNav>[0];
    const work = buildClientNav(t, true).find((item) => "kind" in item && item.id === "manage-work");
    expect(work && "kind" in work ? work.sections[0].items : []).toEqual([
      { href: routes.clientWork, label: "client.contracts", query: { tab: "contracts" }, match: [routes.clientWork] },
    ]);
    expect(routing.pathnames[routes.clientWork]).toEqual({ fr: "/espace-client/travaux", en: "/client/work" });
  });

  test("client navigation marks the group that owns the current page", () => {
    const t = ((key: string) => key) as Parameters<typeof buildClientNav>[0];
    const nav = buildClientNav(t, true);
    const activeIds = (pathname: string) =>
      nav
        .filter((item) => ("kind" in item ? isGroupActive(pathname, item) : isLinkActive(pathname, item)))
        .map((item) => ("kind" in item ? item.id : item.href));
    expect(activeIds(routes.clientDashboard)).toEqual(["projects"]);
    expect(activeIds(routes.clientProject)).toEqual(["projects"]);
    expect(activeIds(routes.clientProjectSupport)).toEqual(["projects"]);
    expect(activeIds(routes.postProjectWizard)).toEqual(["projects"]);
    expect(activeIds(routes.companies)).toEqual(["projects"]);
    expect(activeIds(routes.companyProfile)).toEqual(["projects"]);
    // The work page is shared by two menu entries; only Manage work lights up.
    expect(activeIds(routes.clientWork)).toEqual(["manage-work"]);
    expect(activeIds(routes.messages)).toEqual([routes.messages]);
    expect(activeIds(routes.clientProfile)).toEqual([]);
  });

  test("ClientNavbar renders the stored client avatar when available", () => {
    vi.mocked(useQuery).mockReturnValue({ profilePhotoUrl: "https://cdn.example.test/avatar.webp" });
    const html = renderToStaticMarkup(
      <ClientNavbar
        user={{
          firstName: "Amine",
          lastName: "Benali",
          email: "a@example.test",
          onboardingStatus: "completed",
        }}
      />,
    );
    expect(html).toContain("https://cdn.example.test/avatar.webp");
    expect(html).not.toContain(">AB<");
  });

  test("CompanyNavbar renders grouped triggers, search, notifications, and hides post-a-project", () => {
    const html = renderToStaticMarkup(
      <CompanyNavbar
        user={{
          firstName: "Sara",
          lastName: "Alaoui",
          email: "s@example.test",
          onboardingStatus: "completed",
        }}
      />,
    );
    expect(html).toContain('data-navbar="company"');
    expect(html).toContain("nav.company.findWork");
    expect(html).toContain("nav.company.manageWork");
    expect(html).toContain("nav.company.finances");
    expect(html).toContain(routes.messages);
    expect(html).toContain(routes.companyBatiplus);
    expect(html).not.toContain("nav.myWorkspace");
    expect(html).toContain("nav.companySearchLabel");
    expect(html).toContain("nav.companySearchPlaceholder");
    expect(html).toContain("nav.searchScopeProjects");
    expect(html).toContain("notifications.bell");
    expect(html).toContain("company-navbar-search");
    expect(html).not.toContain(routes.postProject);
    expect(html).not.toContain(routes.clientDashboard);
    expect(html).not.toContain(routes.clientProfile);
  });

  test("company navigation groups every existing destination and gates it behind onboarding", () => {
    const t = ((key: string) => key) as Parameters<typeof buildCompanyNav>[0];
    const hrefs = (onboarded: boolean) =>
      buildCompanyNav(t, onboarded).flatMap((item) =>
        "kind" in item ? item.sections.flatMap((section) => section.items.map((link) => link.href)) : [item.href],
      );
    expect(hrefs(true)).toEqual(
      expect.arrayContaining([
        routes.companyProjects,
        routes.companyProposals,
        routes.companyInvitations,
        routes.companyProfileManagement,
        routes.companyPortfolio,
        routes.companyWork,
        routes.companyCommissions,
        routes.messages,
        routes.companyBatiplus,
      ]),
    );
    expect(hrefs(false)).not.toContain(routes.companyPortfolio);
    expect(hrefs(false)).not.toContain(routes.companyWork);
    expect(hrefs(false)).toContain(routes.companyOnboarding);
    expect(hrefs(false)).toContain(routes.companyBatiplus);
  });

  test("the active group follows the current route, including the company home feed", () => {
    const t = ((key: string) => key) as Parameters<typeof buildCompanyNav>[0];
    const nav = buildCompanyNav(t, true);
    const activeIds = (pathname: string) =>
      nav
        .filter((item) => ("kind" in item ? isGroupActive(pathname, item) : isLinkActive(pathname, item)))
        .map((item) => ("kind" in item ? item.id : item.href));
    expect(activeIds(routes.companyCommissions)).toEqual(["finances"]);
    expect(activeIds(routes.companyPortfolio)).toEqual(["find-work"]);
    expect(activeIds(routes.companyDashboard)).toEqual(["find-work"]);
    expect(activeIds(routes.companyProject)).toEqual(["find-work"]);
    expect(activeIds(routes.companyWork)).toEqual(["manage-work"]);
    expect(activeIds(routes.messagesConversation)).toEqual([routes.messages]);
    expect(activeIds(routes.companyBatiplus)).toEqual([routes.companyBatiplus]);
    expect(activeIds(routes.companyVerification)).toEqual([]);
  });

  test("CompanyNavbar renders the approved company logo without optimization", () => {
    vi.mocked(useQuery).mockImplementation(((ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      const path = getFunctionName(ref as never);
      if (path === "companyVerification/index:getVerificationStatus") return { status: "draft", canManageDocuments: true };
      if (path === "companies/index:getOnboardingProfile") return { logoUrl: "https://example.convex.site/company-logos/public/approved" };
      return null;
    }) as never);
    const html = renderToStaticMarkup(
      <CompanyNavbar
        user={{
          firstName: "Sara",
          lastName: "Alaoui",
          email: "s@example.test",
          onboardingStatus: "completed",
        }}
      />,
    );
    expect(html).toContain("https://example.convex.site/company-logos/public/approved");
    expect(html).toContain('data-unoptimized="true"');
    expect(html).not.toContain(">SA<");
  });

  test("CompanyNavbar shows only the safe suspension banner and support path", () => {
    vi.mocked(useQuery).mockReturnValue({
      accountRestricted: true,
      name: "Atlas Build",
      publicSlug: "atlas-build",
      verificationStatus: "verified",
      logoUrl: null,
      canManageDocuments: true,
    });
    const html = renderToStaticMarkup(
      <CompanyNavbar user={{ firstName: "Sara", lastName: "Alaoui", email: "s@example.test", onboardingStatus: "completed" }} />,
    );
    expect(html).toContain("nav.companySuspended.message");
    expect(html).toContain("nav.companySuspended.support");
    expect(html).toContain(routes.companyBatiplus);
    expect(html).not.toContain("needs_attention");
  });

  test("Company staff skip owner-only navbar queries and use a generic avatar", () => {
    const queried: string[] = [];
    vi.mocked(useQuery).mockImplementation(((ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      const path = getFunctionName(ref as never); queried.push(path);
      if (path === "companyVerification/index:getVerificationStatus") return { status: "rejected", canManageDocuments: false };
      return null;
    }) as never);
    const html = renderToStaticMarkup(<CompanyNavbar user={{ firstName: "Sara", lastName: "Alaoui", email: "s@example.test", onboardingStatus: "completed" }} />);
    expect(queried).not.toContain("companies/index:getOnboardingProfile");
    expect(queried).not.toContain("companyLogos/index:getMyLogos");
    expect(html).toContain("companyLogo.genericAlt"); expect(html).not.toContain("company-logos/");
  });
});

describe("SiteHeader selection", () => {
  beforeEach(() => {
    vi.mocked(useConvexAuth).mockReset();
    vi.mocked(useQuery).mockReset();
  });

  test("renders loading shell while authenticated user is pending", () => {
    vi.mocked(useConvexAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    } as never);
    vi.mocked(useQuery).mockReturnValue(undefined);
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('data-navbar="public"');
  });

  test("renders ClientNavbar for authenticated clients", () => {
    vi.mocked(useConvexAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    } as never);
    vi.mocked(useQuery).mockReturnValue({
      firstName: "Amine",
      lastName: "Benali",
      email: "a@example.test",
      accountType: "client",
      onboardingStatus: "completed",
    });
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('data-navbar="client"');
  });

  test("renders CompanyNavbar for authenticated companies", () => {
    vi.mocked(useConvexAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    } as never);
    vi.mocked(useQuery).mockReturnValue({
      firstName: "Sara",
      lastName: "Alaoui",
      email: "s@example.test",
      accountType: "company",
      onboardingStatus: "completed",
    });
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('data-navbar="company"');
  });

  test("renders PublicNavbar when logged out", () => {
    vi.mocked(useConvexAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    } as never);
    vi.mocked(useQuery).mockReturnValue(null);
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('data-navbar="public"');
  });
});
