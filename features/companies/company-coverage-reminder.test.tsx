import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { routing } from "@/i18n/routing";
import { CompanyCoverageReminder, CompanyDashboardCoverageReminder } from "./components/company-coverage-reminder";
import { CompanyDashboard } from "./components/company-dashboard";
import { CompanyProfileEditor } from "./components/company-profile-editor";
import CompanyProfileManagementPage from "@/app/[locale]/(account)/espace-entreprise/profil/page";

const state = vi.hoisted(() => ({
  locale: "en" as "fr" | "en",
  coverageScopeKeys: [] as string[] | undefined,
  user: { _id: "owner", accountType: "company", onboardingStatus: "completed" } as {
    _id: string; accountType: string; onboardingStatus: string;
  } | null | undefined,
}));

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));
vi.mock("@/lib/page-meta", () => ({
  resolveLocale: async (params: Promise<{ locale: string }>) => (await params).locale,
  localizedPageMetadata: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: {
    href: keyof typeof routing.pathnames | { pathname: keyof typeof routing.pathnames; query?: Record<string, string> };
    children?: ReactNode;
  }) => {
    const pathname = typeof href === "string" ? href : href.pathname;
    const route = routing.pathnames[pathname];
    const localized = typeof route === "string" ? route : route[state.locale];
    const query = typeof href === "string" ? "" : new URLSearchParams(href.query).toString();
    return <a {...props} href={`/${state.locale}${localized}${query ? `?${query}` : ""}`}>{children}</a>;
  },
  useRouter: () => ({ replace: vi.fn() }),
}));

function render(child: ReactNode) {
  const onError = vi.fn();
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale={state.locale} messages={state.locale === "fr" ? fr : en} onError={onError} timeZone="Africa/Casablanca">
      {child}
    </NextIntlClientProvider>,
  );
  expect(onError).not.toHaveBeenCalled();
  return html;
}

beforeEach(() => {
  state.locale = "en";
  state.coverageScopeKeys = [];
  state.user = { _id: "owner", accountType: "company", onboardingStatus: "completed" };
  vi.mocked(useQuery).mockReset();
  vi.mocked(useQuery).mockImplementation(((ref: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(ref as never);
    if (name === "users:currentUser") return state.user;
    if (name === "companies/index:getMyGeographicCoverage") return state.coverageScopeKeys;
    if (name === "serviceCatalog:listActive") return [];
    if (name === "companies/index:getOnboardingProfile") return {
      name: "Atlas Build", description: "Construction company in Morocco.", city: "Rabat",
      phone: "0612345678", website: "", yearsExperience: 12, logoUrl: null,
      services: [], serviceAreas: ["rabat", "sale"], verificationStatus: "verified",
    };
    return undefined;
  }) as never);
});

describe.each(["fr", "en"] as const)("GEO-D2 reminder in %s", (locale) => {
  const copy = (locale === "fr" ? fr : en).companyProfileManager.coverage.reminder;

  beforeEach(() => { state.locale = locale; });

  test("explains undeclared coverage and links straight to the localized existing editor", () => {
    const html = render(<CompanyCoverageReminder coverageScopeKeys={[]} />);
    for (const text of Object.values(copy)) expect(html).toContain(text);
    const path = locale === "fr" ? "/fr/espace-entreprise/profil" : "/en/company/profile";
    expect(html).toContain(`href="${path}?edit=coverage"`);
    expect(html).toContain('aria-labelledby="');
  });

  test.each([
    { keys: ["MA"] }, { keys: ["R:09"] }, { keys: ["P:09.541"] },
    { keys: ["MA", "R:09", "P:09.541"] },
  ])("hides for explicit coverage $keys", ({ keys }) => {
    expect(render(<CompanyCoverageReminder coverageScopeKeys={keys} />)).toBe("");
  });

  test("does not classify a pending coverage read as undeclared", () => {
    state.coverageScopeKeys = undefined;
    expect(render(<CompanyDashboardCoverageReminder />)).toBe("");
  });

  test("uses the private coverage read despite headquarters and legacy cities, then hides after save", () => {
    const html = render(<CompanyDashboard />);
    expect(html).toContain(copy.title);
    expect(html).toContain("Atlas Build");
    const coverageReads = vi.mocked(useQuery).mock.calls.filter(([ref]) => getFunctionName(ref) === "companies/index:getMyGeographicCoverage");
    expect(coverageReads).toHaveLength(1);
    state.coverageScopeKeys = ["P:09.541"];
    const saved = render(<CompanyDashboard />);
    expect(saved).toContain("Atlas Build");
    expect(saved).not.toContain(copy.title);
    state.coverageScopeKeys = [];
    expect(render(<CompanyDashboard />)).toContain(copy.title);
  });
});

test.each([
  null,
  undefined,
  { _id: "client", accountType: "client", onboardingStatus: "completed" },
  { _id: "company", accountType: "company", onboardingStatus: "pending" },
])("does not read Company coverage before dashboard access is ready: %j", (user) => {
  state.user = user;
  const html = render(<CompanyDashboard />);
  expect(html).not.toContain(en.companyProfileManager.coverage.reminder.title);
  const names = vi.mocked(useQuery).mock.calls.map(([ref]) => getFunctionName(ref));
  expect(names).not.toContain("companies/index:getMyGeographicCoverage");
});

const editorRequests: { edit?: string | string[]; requested: boolean }[] = [
  { edit: "coverage", requested: true },
  { requested: false },
  { edit: "contact", requested: false },
  { edit: ["coverage", "contact"], requested: false },
];

test.each(editorRequests)("the profile route honors only an explicit coverage editor link: $edit", async ({ edit, requested }) => {
  const page = await CompanyProfileManagementPage({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve({ edit }),
  });
  const editor = Children.toArray(page.props.children).find((child) => isValidElement(child) && child.type === CompanyProfileEditor);
  expect(editor).toMatchObject({ props: { coverageEditorRequested: requested } });
});
