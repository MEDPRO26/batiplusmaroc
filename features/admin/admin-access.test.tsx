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
import { adminAccessRedirect } from "./lib/access";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
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
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">
      <AdminDashboard email="admin@example.test" firstName="Samira" lastName="El Amrani" />
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
    expect(adminAccessRedirect({ accountType: null, onboardingStatus: null })).toBe(routes.signUp);
    expect(adminAccessRedirect({ accountType: "client", onboardingStatus: "completed" })).toBe(
      routes.clientDashboard,
    );
    expect(adminAccessRedirect({ accountType: "company", onboardingStatus: "pending" })).toBe(
      routes.companyOnboarding,
    );
    expect(adminAccessRedirect({ accountType: "admin", onboardingStatus: "completed" })).toBeNull();
  });

  test.each([
    ["fr", "Tableau de bord", "Dépenses pub", "Aperçu visuel"],
    ["en", "Dashboard", "Ad spend", "Visual preview"],
  ] as const)("renders the home dashboard in %s", (locale, title, spend, note) => {
    const html = renderDashboard(locale);
    expect(html).toContain(title);
    expect(html).toContain(spend);
    expect(html).toContain(note);
    expect(html).toContain("admin@example.test");
    expect(html).not.toContain("Projects dashboard");
  });
});
