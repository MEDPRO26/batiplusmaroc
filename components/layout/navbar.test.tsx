import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { resolveNavbarRole, userInitials } from "./navbar-role";
import { routes } from "@/lib/routes";

vi.mock("next/font/google", () => ({
  Outfit: () => ({ className: "font-outfit" }),
}));
vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <span aria-label={alt} data-src={src} />,
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
    expect(html).toContain(routes.companies);
    expect(html).toContain(routes.messages);
    expect(html).toContain(routes.clientProfile);
    expect(html).toContain("nav.searchLabel");
    expect(html).toContain("nav.notifications");
    expect(html).toContain("nav.profileMenu.client.accountSettings");
    expect(html).toContain("AB");
    expect(html).not.toContain(routes.postProject);
    expect(html).not.toContain(routes.browseProjects);
    expect(html).not.toContain(routes.companyPortfolio);
    expect(html).not.toContain(routes.companyDashboard);
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

  test("CompanyNavbar shows company links, search, notifications, and hides post-a-project", () => {
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
    expect(html).toContain(routes.companyProjects);
    expect(html).toContain(routes.companyPortfolio);
    expect(html).toContain(routes.companyDashboard);
    expect(html).toContain(routes.messages);
    expect(html).toContain(routes.companyCommissions);
    expect(html).toContain(routes.companyProfileManagement);
    expect(html).toContain("nav.companySearchLabel");
    expect(html).toContain("nav.companySearchPlaceholder");
    expect(html).toContain("nav.searchScopeProjects");
    expect(html).toContain("nav.notifications");
    expect(html).toContain("company-navbar-search");
    expect(html).not.toContain(routes.postProject);
    expect(html).not.toContain(routes.clientDashboard);
    expect(html).not.toContain(routes.clientProfile);
  });

  test("CompanyNavbar renders the stored company logo when available", () => {
    vi.mocked(useQuery).mockReturnValue({ logoUrl: "https://cdn.example.test/company-logo.webp" });
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
    expect(html).toContain("https://cdn.example.test/company-logo.webp");
    expect(html).not.toContain(">SA<");
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
