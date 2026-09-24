import { describe, expect, test } from "vitest";
import { routing } from "@/i18n/routing";
import { PROTECTED_ROUTE_PATTERNS } from "@/lib/auth/protected-routes";
import { routes } from "@/lib/routes";
import { seoAccessRedirect } from "./lib/access";

describe("SEO workspace route access", () => {
  test("registers locale-aware protected SEO routes", () => {
    expect(routing.pathnames[routes.seoRoot]).toBe("/seo");
    expect(routing.pathnames[routes.seoDashboard]).toBe("/seo/dashboard");
    expect(PROTECTED_ROUTE_PATTERNS).toContain("/:locale/seo(.*)");
  });

  test("allows only seo_team and sends every other role to its own workspace", () => {
    expect(seoAccessRedirect(null)).toBe(routes.signIn);
    expect(seoAccessRedirect({ accountType: null, onboardingStatus: null })).toBe(routes.signUp);
    expect(seoAccessRedirect({ accountType: "client", onboardingStatus: "completed" })).toBe(
      routes.clientDashboard,
    );
    expect(seoAccessRedirect({ accountType: "company", onboardingStatus: "pending" })).toBe(
      routes.companyOnboarding,
    );
    expect(seoAccessRedirect({ accountType: "admin", onboardingStatus: "completed" })).toBe(
      routes.admin,
    );
    expect(seoAccessRedirect({ accountType: "seo_team", onboardingStatus: "completed" })).toBeNull();
  });
});
