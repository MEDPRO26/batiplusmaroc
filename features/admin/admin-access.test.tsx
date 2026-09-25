import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Outfit: () => ({ className: "font-outfit" }),
}));
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import { AdminDashboard } from "./components/admin-dashboard";
import { AdminShell } from "./components/admin-shell";
import { adminAccessRedirect } from "./lib/access";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/admin",
  getPathname: () => "/admin",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "fr" }),
}));

function renderDashboard(locale: "fr" | "en") {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : fr}
      timeZone="Africa/Casablanca"
    >
      <AdminShell
        email="admin@example.test"
        firstName="Samira"
        lastName="El Amrani"
      >
        <AdminDashboard />
      </AdminShell>
    </NextIntlClientProvider>,
  );
}

describe("admin route access", () => {
  test("uses the same /admin and /admin/verification pathnames in French and English", () => {
    expect(routing.pathnames[routes.admin]).toBe("/admin");
    expect(routing.pathnames[routes.adminVerification]).toEqual({
      fr: "/admin/verification",
      en: "/admin/verification",
    });
  });

  test("redirects unauthenticated and public roles to safe localized-app destinations", () => {
    expect(adminAccessRedirect(null)).toBe(routes.signIn);
    expect(
      adminAccessRedirect({ accountType: null, onboardingStatus: null }),
    ).toBe(routes.signUp);
    expect(
      adminAccessRedirect({
        accountType: "client",
        onboardingStatus: "completed",
      }),
    ).toBe(routes.clientDashboard);
    expect(
      adminAccessRedirect({
        accountType: "company",
        onboardingStatus: "pending",
      }),
    ).toBe(routes.companyOnboarding);
    expect(
      adminAccessRedirect({
        accountType: "seo_team",
        onboardingStatus: "completed",
      }),
    ).toBe(routes.seoDashboard);
    expect(
      adminAccessRedirect({
        accountType: "admin",
        onboardingStatus: "completed",
      }),
    ).toBeNull();
  });

  test.each([
    ["fr", "Tableau de bord", "Dépenses pub", "Aperçu visuel", "Accueil"],
    ["en", "Dashboard", "Ad spend", "Visual preview", "Home"],
  ] as const)(
    "renders the home dashboard in %s",
    (locale, title, spend, note, activeNav) => {
      const html = renderDashboard(locale);
      expect(html).toContain(title);
      expect(html).toContain(spend);
      expect(html).toContain(note);
      expect(html).toContain(
        locale === "en" ? "Site visits" : "Visites techniques",
      );
      expect(html).toMatch(
        new RegExp(
          `aria-current="page"[^>]*>(?:(?!</span>)[\\s\\S])*${activeNav}</span>`,
        ),
      );
      expect(html).toContain("admin@example.test");
      expect(html).not.toContain("Projects dashboard");
    },
  );
});
