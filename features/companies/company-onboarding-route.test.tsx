import { getFunctionName } from "convex/server";
import { beforeEach, expect, test, vi } from "vitest";
import { routing } from "@/i18n/routing";
import { routes, type AppRoute } from "@/lib/routes";
import type { WorkspaceUser } from "@/lib/auth/workspace-route";

const state = vi.hoisted(() => ({
  token: "authenticated-session" as string | undefined,
  user: { accountType: "company", onboardingStatus: "pending" } as WorkspaceUser | null,
  profile: { onboardingStatus: "pending" } as { onboardingStatus: "pending" | "completed" },
  backendError: false,
}));
function getPathname({ href, locale }: { href: AppRoute; locale: "en" | "fr" }) {
  const configured = routing.pathnames[href as keyof typeof routing.pathnames];
  return `/${locale}${typeof configured === "string" ? configured : configured[locale]}`;
}
vi.mock("@convex-dev/auth/nextjs/server", () => ({ convexAuthNextjsToken: vi.fn(async () => state.token) }));
vi.mock("convex/nextjs", () => ({ fetchQuery: vi.fn(async (reference: unknown) => {
  if (state.backendError) throw new Error("Backend unavailable");
  return getFunctionName(reference as never) === "users:currentUser" ? state.user : state.profile;
}) }));
vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));
vi.mock("@/lib/page-meta", () => ({ resolveLocale: async (params: Promise<{ locale: string }>) => (await params).locale, localizedPageMetadata: vi.fn() }));
vi.mock("@/features/companies/components/company-onboarding-form", () => ({ CompanyOnboardingForm: vi.fn(() => null) }));
vi.mock("@/i18n/navigation", () => ({ redirect: vi.fn(({ href, locale }: { href: AppRoute; locale: "en" | "fr" }) => {
  throw new Error(`Redirect: ${getPathname({ href, locale })}`);
}) }));

import CompanyOnboardingPage from "@/app/[locale]/(account)/espace-entreprise/onboarding/page";
import { CompanyOnboardingForm } from "./components/company-onboarding-form";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "@/i18n/navigation";
import { api } from "@/convex/_generated/api";

beforeEach(() => {
  vi.clearAllMocks(); state.token = "authenticated-session";
  state.user = { accountType: "company", onboardingStatus: "pending" };
  state.profile = { onboardingStatus: "pending" }; state.backendError = false;
});
const openDirectRoute = (locale: "en" | "fr") => CompanyOnboardingPage({ params: Promise.resolve({ locale }) });
for (const locale of ["en", "fr"] as const) {
  test(`${locale}: a direct onboarding URL renders only for an incomplete Company`, async () => {
    const result = await openDirectRoute(locale);
    expect(result?.type).toBe(CompanyOnboardingForm); expect(redirect).not.toHaveBeenCalled();
    expect(fetchQuery).toHaveBeenCalledWith(api.users.currentUser, {}, { token: "authenticated-session" });
    expect(fetchQuery).toHaveBeenCalledWith(api.companies.index.getOnboardingProfile, {}, { token: "authenticated-session" });
    expect(getPathname({ href: routes.companyOnboarding, locale })).toBe(locale === "en" ? "/en/company/onboarding" : "/fr/espace-entreprise/onboarding");
  });
  test(`${locale}: completed Company direct URL redirects before the wizard is returned`, async () => {
    state.user!.onboardingStatus = "completed";
    await expect(openDirectRoute(locale)).rejects.toThrow(`Redirect: ${locale === "en" ? "/en/company" : "/fr/espace-entreprise"}`);
    expect(redirect).toHaveBeenCalledWith({ href: routes.companyDashboard, locale });
    expect(fetchQuery).toHaveBeenCalledTimes(1);
  });
  test(`${locale}: Company source-of-truth completion also blocks a stale pending user`, async () => {
    state.profile.onboardingStatus = "completed";
    await expect(openDirectRoute(locale)).rejects.toThrow(`Redirect: ${getPathname({ href: routes.companyDashboard, locale })}`);
    expect(fetchQuery).toHaveBeenCalledTimes(2);
  });
  for (const [accountType, onboardingStatus, destination] of [
    ["client", "pending", routes.clientOnboarding], ["client", "completed", routes.clientDashboard],
    ["seo_team", "completed", routes.seoDashboard], ["admin", "completed", routes.admin],
  ] as const) {
    test(`${locale}: ${accountType}/${onboardingStatus} goes to its existing workspace`, async () => {
      state.user = { accountType, onboardingStatus };
      await expect(openDirectRoute(locale)).rejects.toThrow(`Redirect: ${getPathname({ href: destination, locale })}`);
      expect(redirect).toHaveBeenCalledWith({ href: destination, locale }); expect(fetchQuery).toHaveBeenCalledTimes(1);
    });
  }
  test(`${locale}: anonymous direct URL goes to sign-in without querying private data`, async () => {
    state.token = undefined;
    await expect(openDirectRoute(locale)).rejects.toThrow(`Redirect: ${getPathname({ href: routes.signIn, locale })}`);
    expect(fetchQuery).not.toHaveBeenCalled();
  });
  test(`${locale}: a missing authenticated user goes to sign-in`, async () => {
    state.user = null;
    await expect(openDirectRoute(locale)).rejects.toThrow(`Redirect: ${getPathname({ href: routes.signIn, locale })}`);
  });
  test(`${locale}: unfinalized OAuth signup remains available`, async () => {
    state.user = { accountType: null, onboardingStatus: null };
    expect((await openDirectRoute(locale))?.type).toBe(CompanyOnboardingForm); expect(fetchQuery).toHaveBeenCalledTimes(1);
  });
  test(`${locale}: backend failures cannot render the wizard`, async () => {
    state.backendError = true;
    await expect(openDirectRoute(locale)).rejects.toThrow("Backend unavailable");
  });
}
