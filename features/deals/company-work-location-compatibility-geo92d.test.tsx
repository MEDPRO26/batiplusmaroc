import { getFunctionName, type FunctionReturnType } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CompanyWork, type CompanyWorkView } from "./components/company-work";
import { toDetailedProjectLocation, toGeneralProjectLocation, type ProjectLocation } from "@/lib/geography/project-location";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

type Deal = FunctionReturnType<typeof api.deals.company.listMyDeals>[number];
const mocked = vi.hoisted(() => ({
  deals: [] as unknown[], accountType: "company", onboardingStatus: "completed",
  reads: [] as { name: string; args: unknown }[], writes: [] as unknown[],
}));
vi.mock("convex/react", () => ({
  useQuery: (query: never, args: unknown) => {
    const name = getFunctionName(query);
    mocked.reads.push({ name, args });
    if (args === "skip") return undefined;
    if (name === "users:currentUser") return { accountType: mocked.accountType, onboardingStatus: mocked.onboardingStatus };
    if (name === "deals/company:listMyDeals") return mocked.deals;
    throw new Error(`Unexpected query: ${name}`);
  },
  useMutation: () => (args: unknown) => { mocked.writes.push(args); },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string | { pathname: string; params?: Record<string, string> }; children: ReactNode }) => {
    const path = typeof href === "string" ? href : Object.entries(href.params ?? {}).reduce(
      (value, [key, param]) => value.replace(`[${key}]`, param), href.pathname,
    );
    return <a href={path} {...props}>{children}</a>;
  },
  useRouter: () => ({ replace: vi.fn() }),
}));

const structured = {
  locationMode: "structured", regionCode: "05", provinceCode: "05.081", communeName: "Aït Tamlil",
  localityName: "Douar Aït Atlas — دوار ⴰⵣⵓⵍ", neighborhood: "Ancien quartier",
} as const;
const structuredLabel = "Béni Mellal-Khénifra · Azilal · Aït Tamlil · Douar Aït Atlas — دوار ⴰⵣⵓⵍ · Ancien quartier";
type Fixture = { name: string; city: string | null; location?: ProjectLocation; label?: string; legacy?: boolean };
const cases: Fixture[] = [
  { name: "rural no-city Deal", city: null, location: toDetailedProjectLocation(structured), label: structuredLabel },
  { name: "structured plus historical city", city: "tangier", location: toDetailedProjectLocation({ ...structured, city: "tangier" }), label: structuredLabel },
  { name: "legacy city-only Deal", city: "tangier", location: toDetailedProjectLocation({ city: "tangier" }), legacy: true },
  { name: "older city-only response", city: "tangier", legacy: true },
  { name: "cleared structured location", city: "tangier", location: toGeneralProjectLocation({ locationMode: "structured", city: "tangier" }) },
  { name: "missing location", city: null, location: toGeneralProjectLocation({}) },
  { name: "province only", city: null, location: toGeneralProjectLocation({ provinceCode: "05.081" }), label: "Azilal" },
];
const at = Date.parse("2026-10-09T12:00:00Z");

function deal(fixture: Fixture, status: Deal["status"] = "active") {
  return {
    dealId: "deal-geo92d" as Id<"deals">, projectId: "project-geo92d" as Id<"projects">,
    projectTitle: "Rural renovation", city: fixture.city, location: fixture.location,
    status, agreedAmountMad: 380_000.25, conversationId: "conversation-geo92d" as Id<"conversations">,
    createdAt: at, completedAt: status === "completed" ? at + 86_400_000 : null,
  };
}

function render(locale: "en" | "fr", view: CompanyWorkView = "active") {
  const onError = vi.fn();
  const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr}
    timeZone="Africa/Casablanca" onError={onError}><CompanyWork view={view} /></NextIntlClientProvider>);
  expect(onError).not.toHaveBeenCalled();
  expect(mocked.writes).toEqual([]);
  return html;
}

beforeEach(() => {
  mocked.deals = []; mocked.accountType = "company"; mocked.onboardingStatus = "completed";
  mocked.reads = []; mocked.writes = [];
});

describe.each(["en", "fr"] as const)("GEO9.2D Company work %s", locale => {
  const messages = locale === "en" ? en : fr;
  test.each(cases)("active and history render $name", fixture => {
    const label = fixture.label ?? (fixture.legacy ? messages.projectWizard.cityOptions.tangier : messages.projectLocation.unspecified);
    for (const view of ["active", "history"] as const) {
      mocked.deals = [deal(fixture, view === "active" ? "active" : "completed")];
      const html = render(locale, view);
      expect(html).toContain(`<span>${label}</span>`);
      expect(html).not.toContain("cityOptions.");
      expect(html).toContain("flex flex-wrap");
      expect(html).toContain('href="/messages/conversation-geo92d"');
      expect(html).toContain(messages.companyWork.agreedAmount);
      expect(html).toMatch(/380(?:[\s\u202f\u00a0]|<!-- -->|,)*000/);
      expect(html).toContain(messages.companyWork.status[view === "active" ? "active" : "completed"]);
      if (fixture.location && fixture.city && !fixture.legacy) expect(html).not.toContain(
        `<span>${messages.projectWizard.cityOptions.tangier}</span>`,
      );
    }
  });

  test("a general server projection never picks up unauthorized top-level location or Client data", () => {
    mocked.deals = [{ ...deal({ name: "general", city: "tangier", location: toGeneralProjectLocation(structured) }),
      localityName: "PRIVATE_LOCALITY_GEO92D", neighborhood: "PRIVATE_NEIGHBORHOOD_GEO92D",
      siteAddress: "PRIVATE_ADDRESS_GEO92D", clientName: "PRIVATE_CLIENT_GEO92D" }];
    const html = render(locale);
    expect(html).toContain("Béni Mellal-Khénifra · Azilal · Aït Tamlil");
    expect(html).not.toContain("PRIVATE_");
    expect(html).not.toContain(structured.localityName);
    expect(html).not.toContain(structured.neighborhood);
    expect(html).not.toContain(`<span>${messages.projectWizard.cityOptions.tangier}</span>`);
  });

  test("older arbitrary city values fall back without constructing translation keys", () => {
    mocked.deals = [deal({ name: "unknown city", city: "Douar arbitrary ⵣ" })];
    const html = render(locale);
    expect(html).toContain(`<span>${messages.projectLocation.unspecified}</span>`);
    expect(html).not.toContain("Douar arbitrary");
  });

  test("authorized locality text is escaped", () => {
    mocked.deals = [deal({ name: "escaped locality", city: null, location: toDetailedProjectLocation({
      ...structured, localityName: '<img src=x onerror="bad">',
    }) })];
    const html = render(locale);
    expect(html).toContain("&lt;img src=x onerror=&quot;bad&quot;&gt;");
    expect(html).not.toContain("<img src=x");
  });

  test.each(["client", "admin", "seo_team"])("%s does not request Company Deals", accountType => {
    mocked.accountType = accountType;
    render(locale);
    expect(mocked.reads).toContainEqual({ name: "deals/company:listMyDeals", args: "skip" });
  });

  test("incomplete Company onboarding does not request Deals", () => {
    mocked.onboardingStatus = "pending";
    render(locale);
    expect(mocked.reads).toContainEqual({ name: "deals/company:listMyDeals", args: "skip" });
  });

  test("active/history filtering, counts and backend order are unchanged", () => {
    const first = deal(cases[0]);
    const second = { ...deal(cases[2]), dealId: "second-deal", projectTitle: "Second project" };
    const completed = { ...deal(cases[0], "completed"), dealId: "completed-deal", projectTitle: "Completed project" };
    const cancelled = { ...deal(cases[2], "cancelled"), dealId: "cancelled-deal", projectTitle: "Cancelled project" };
    mocked.deals = [first, second, completed, cancelled];
    const active = render(locale);
    expect(active.indexOf(first.projectTitle)).toBeLessThan(active.indexOf(second.projectTitle));
    expect(active).not.toContain(completed.projectTitle);
    expect(active).not.toContain(cancelled.projectTitle);
    const history = render(locale, "history");
    expect(history.indexOf(completed.projectTitle)).toBeLessThan(history.indexOf(cancelled.projectTitle));
    expect(history).not.toContain(second.projectTitle);
    expect(history).toContain(messages.companyWork.status.cancelled);
    expect(history).toContain(messages.companyWork.status.completed);
    expect(history.match(/tabular-nums text-muted">2<\/span>/g)).toHaveLength(2);
  });
});
