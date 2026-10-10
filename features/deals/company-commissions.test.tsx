import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const companyUser = { accountType: "company", onboardingStatus: "completed" } as const;
const convex = vi.hoisted(() => ({
  user: undefined as unknown,
  results: [] as unknown[],
  calls: [] as Array<{ name: string; args: unknown }>,
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (query: never, args: unknown) => {
      const name = getFunctionName(query);
      convex.calls.push({ name, args });
      if (name === "users:currentUser") return convex.user;
      return args === "skip" ? undefined : convex.results.shift();
    },
  };
});
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import {
  CompanyCommissions,
  resolveCompanyCommissionsRedirect,
} from "./components/company-commissions";

function render(locale: "en" | "fr") {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : fr}
      timeZone="Africa/Casablanca"
    >
      <CompanyCommissions />
    </NextIntlClientProvider>,
  );
}

const due = {
  dealId: "deal-due",
  projectTitle: "Villa Anfa",
  agreedAmountMad: 395_000,
  commissionRateBps: 500,
  commissionAmountMad: 19_750,
  commissionConfigVersion: 2,
  commissionStatus: "due",
  beneficiary: "batiplus",
  createdAt: 1_790_000_000_000,
  paidAt: null,
  snapshotComplete: true,
};
const paid = {
  ...due,
  dealId: "deal-paid",
  projectTitle: "Riad Medina",
  commissionStatus: "paid",
  paidAt: 1_790_100_000_000,
};

describe("Company commission visibility UI", () => {
  beforeEach(() => {
    convex.user = companyUser;
    convex.calls = [];
    convex.results = [[], { totalDueMad: 0, totalPaidMad: 0, dueCount: 0 }];
  });

  test("maps the localized Company commissions route", () => {
    expect(routing.pathnames[routes.companyCommissions]).toEqual({
      en: "/company/commissions",
      fr: "/espace-entreprise/commissions",
    });
  });

  test.each([
    ["en", "No commission obligations yet", "Total commission due"],
    ["fr", "Aucune commission à payer pour le moment", "Total des commissions dues"],
  ] as const)("renders localized %s empty and summary states", (locale, empty, summary) => {
    const html = render(locale);
    expect(html).toContain(empty);
    expect(html).toContain(summary);
  });

  test("renders due and paid badges with safe read-only details", () => {
    convex.results = [
      [due, paid],
      { totalDueMad: 19_750, totalPaidMad: 19_750, dueCount: 1 },
    ];
    const html = render("en");
    expect(html).toContain("Villa Anfa");
    expect(html).toContain("Riad Medina");
    expect(html).toContain("Due");
    expect(html).toContain("Paid");
    expect(html).toContain("19,750");
    expect(html).toContain("5%");
    expect(html).toContain("Batiplus");
    expect(html).not.toContain("payment note");
    expect(html).not.toContain("admin@example.test");
    expect(html).not.toMatch(/<button/i);
  });

  test.each([
    ["en", "MAD\u00a0320,000.50", "MAD\u00a016,000.03", "MAD\u00a017,357.55"],
    ["fr", "320\u202f000,50\u00a0MAD", "16\u202f000,03\u00a0MAD", "17\u202f357,55\u00a0MAD"],
  ] as const)(
    "shows centime-exact amounts and totals with two decimals in %s",
    (locale, agreed, commission, total) => {
      convex.results = [
        [{ ...due, agreedAmountMad: 320_000.5, commissionAmountMad: 16_000.03 }],
        { totalDueMad: 17_357.55, totalPaidMad: 0, dueCount: 2 },
      ];
      const html = render(locale);
      expect(html).toContain(agreed);
      expect(html).toContain(commission);
      expect(html).toContain(total);
      expect(html).toContain(locale === "en" ? "MAD\u00a00.00" : "0,00\u00a0MAD");
    },
  );

  test("includes both card and table responsive presentations", () => {
    convex.results = [
      [due],
      { totalDueMad: 19_750, totalPaidMad: 0, dueCount: 1 },
    ];
    const html = render("en");
    expect(html).toContain("md:hidden");
    expect(html).toContain("hidden overflow-x-auto md:block");
  });

  test("renders an accessible loading skeleton", () => {
    convex.results = [undefined, undefined];
    const html = render("fr");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Chargement des obligations de commission");
  });

  test("renders authoritative totals instead of summing the bounded history", () => {
    convex.results = [
      [due],
      { totalDueMad: 4_147_500, totalPaidMad: 2_370_000, dueCount: 210 },
    ];
    const html = render("en");
    expect(html).toContain("MAD\u00a04,147,500");
    expect(html).toContain("MAD\u00a02,370,000");
    expect(html).toContain(">210<");
  });
});

describe("Company commissions route guard", () => {
  const commissionCalls = () =>
    convex.calls.filter((call) => call.name.startsWith("deals/company:"));

  beforeEach(() => {
    convex.calls = [];
    convex.results = [[due], { totalDueMad: 19_750, totalPaidMad: 0, dueCount: 1 }];
  });

  test.each([
    ["Client", { accountType: "client", onboardingStatus: "completed" }, routes.clientDashboard],
    ["Client still onboarding", { accountType: "client", onboardingStatus: "pending" }, routes.clientOnboarding],
    ["Admin", { accountType: "admin", onboardingStatus: null }, routes.admin],
    ["SEO team", { accountType: "seo_team", onboardingStatus: null }, routes.seoDashboard],
    ["Company still onboarding", { accountType: "company", onboardingStatus: "pending" }, routes.companyOnboarding],
    ["anonymous visitor", null, routes.signIn],
  ] as const)(
    "%s never starts commission queries and is sent to the right place",
    (_label, user, destination) => {
      convex.user = user;
      const html = render("en");
      expect(resolveCompanyCommissionsRedirect(user)).toBe(destination);
      expect(destination).not.toBe(routes.companyCommissions);
      expect(commissionCalls()).toHaveLength(2);
      expect(commissionCalls().every((call) => call.args === "skip")).toBe(true);
      expect(html).toContain('aria-busy="true"');
      expect(html).not.toContain("Villa Anfa");
      expect(html).not.toContain("19,750");
    },
  );

  test("a loading session neither queries commissions nor redirects", () => {
    convex.user = undefined;
    const html = render("fr");
    expect(resolveCompanyCommissionsRedirect(undefined)).toBeNull();
    expect(commissionCalls().every((call) => call.args === "skip")).toBe(true);
    expect(html).toContain('aria-busy="true"');
  });

  test("an onboarded Company loads its commissions without a redirect", () => {
    convex.user = companyUser;
    const html = render("en");
    expect(resolveCompanyCommissionsRedirect(companyUser)).toBeNull();
    expect(commissionCalls().map((call) => call.args)).toEqual([{}, {}]);
    expect(html).toContain("Villa Anfa");
    expect(html).toContain("MAD\u00a019,750.00");
  });

  test("switching from a Company to a Client session stops the queries", () => {
    convex.user = companyUser;
    render("en");
    convex.calls = [];
    convex.user = { accountType: "client", onboardingStatus: "completed" };
    const html = render("en");
    expect(commissionCalls().every((call) => call.args === "skip")).toBe(true);
    expect(html).not.toContain("Villa Anfa");
  });
});
