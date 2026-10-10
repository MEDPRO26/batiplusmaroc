import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { getProvince, getRegion } from "@/lib/geography/morocco";
import { toDetailedProjectLocation, toGeneralProjectLocation } from "@/lib/geography/project-location";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const state = vi.hoisted(() => ({ queries: {} as Record<string, unknown>, projects: [] as unknown[], mutate: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: (query: FunctionReference<"query">, args: unknown) => args === "skip" ? undefined : state.queries[getFunctionName(query)],
  usePaginatedQuery: () => ({ results: state.projects, status: "Exhausted", loadMore: vi.fn() }),
  useMutation: () => state.mutate,
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | { pathname: string } }) =>
    <a href={typeof href === "string" ? href : href.pathname} {...props}>{children}</a>,
  useRouter: () => ({ replace: vi.fn() }),
}));

import { ClientProjectCard } from "@/features/clients/components/client-dashboard";
import { CompanyDashboard } from "@/features/companies/components/company-dashboard";
import { ClientProjectDetailsView } from "./components/client-project-details";
import { ProjectDetailsView } from "./components/company-project-details";
import { ConversationSiteAssessment, ProjectSiteAssessment, SiteAssessmentPanel } from "@/features/site-assessments/components/site-assessment-panel";

const privateLocality = "PRIVATE_DOUAR_ⵜⴰⵎⵍⵉⵍ";
const privateNeighborhood = "PRIVATE_NEIGHBORHOOD";
const exactAddress = "PRIVATE_VISIT_ADDRESS_آيت تامليل";
const recorded = { regionCode: "05", provinceCode: "05.081", communeName: "Aït Tamlil — آيت تامليل", localityName: privateLocality, neighborhood: privateNeighborhood };
const shapes = [
  { name: "structured without city", recorded, city: null },
  { name: "legacy city only", recorded: { city: "rabat", neighborhood: privateNeighborhood }, city: "rabat" as const },
  { name: "incomplete historical", recorded: {}, city: null },
] as const;
const base = {
  id: "project-1" as Id<"projects">, title: "Rural renovation", primaryCategory: "renovation" as const,
  timeline: "flexible" as const, status: "published" as const, createdAt: 1, submittedAt: 1, updatedAt: 1,
  thumbnailUrl: null, canResume: false, canView: true,
};
const companyBase = {
  ...base, customCategoryText: null, propertyType: "house" as const, surface: null, surfaceUnknown: true,
  description: "A safe general description.", publishedAt: 1, client: null, canSubmitQuote: true, myQuoteId: null,
};
const ownerBase = { ...companyBase, images: [], attachments: [], history: [], viewerRole: "owner" as const, neighborhood: null };
type SiteResult = ComponentProps<typeof SiteAssessmentPanel>["result"];
type Visit = NonNullable<NonNullable<SiteResult["assessment"]>["visit"]>;
const visit: Visit = {
  id: "visit-1" as Id<"siteVisits">, assessmentId: "assessment-1" as Id<"siteAssessments">,
  projectId: base.id, clientId: "client-1" as Id<"users">, companyId: "company-1" as Id<"companies">,
  conversationId: "conversation-1" as Id<"conversations">, initialQuoteId: "quote-1" as Id<"projectQuotes">,
  proposedByUserId: "client-1" as Id<"users">, proposedDate: "2099-10-12", proposedTime: "10:00",
  timezone: "Africa/Casablanca", scheduledEpoch: Date.UTC(2099, 9, 12, 9), siteAddress: exactAddress,
  note: "Private directions", status: "confirmed", proposedAt: 1, confirmedByUserId: "company-user" as Id<"users">,
  confirmedAt: 2, declinedByUserId: null, declinedAt: null, cancelledByUserId: null, cancelledAt: null,
  cancellationReason: null, completedByUserId: null, completedAt: null, createdAt: 1, updatedAt: 2,
  proposals: [], canPropose: false, canConfirm: false, canDecline: false, canCancel: true, canComplete: true,
};
const assessment: NonNullable<SiteResult["assessment"]> = {
  id: visit.assessmentId, projectId: base.id, companyId: visit.companyId, companyName: "Company BP",
  initialQuoteId: visit.initialQuoteId, conversationId: visit.conversationId, status: "accepted",
  invitedAt: 1, acceptedAt: 2, clientNote: null, companyNote: null, updatedAt: 2, visit,
};

function render(locale: "fr" | "en", child: ReactNode) {
  const onError = vi.fn();
  const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}
    now={new Date("2026-10-09T12:00:00Z")} timeZone="Africa/Casablanca" onError={onError}>{child}</NextIntlClientProvider>);
  expect(onError).not.toHaveBeenCalled();
  expect(state.mutate).not.toHaveBeenCalled();
  return html;
}
function expectGeneral(html: string) {
  for (const secret of [privateLocality, privateNeighborhood, exactAddress, "Private directions"]) expect(html).not.toContain(secret);
  expect(html).not.toContain("cityOptions.");
}

beforeEach(() => {
  state.queries = {
    "users:currentUser": { accountType: "company", onboardingStatus: "completed" },
    "companies/index:getOnboardingProfile": { name: "Company BP", description: "A complete test Company profile.", city: "HQ_ONLY",
      phone: "0600000000", logoUrl: null, services: ["renovation"], yearsExperience: 8, website: "", verificationStatus: "verified" },
  };
  state.projects = [];
  state.mutate.mockClear();
});

describe.each(["fr", "en"] as const)("GEO9.2B %s location consumers", (locale) => {
  const messages = locale === "fr" ? fr : en;
  for (const shape of shapes) {
    const location = toGeneralProjectLocation(shape.recorded);
    const detailed = toDetailedProjectLocation(shape.recorded);
    const expected = shape.name === "structured without city"
      ? `${locale === "fr" ? getRegion("05")!.nameFr : getRegion("05")!.nameEn} · ${locale === "fr" ? getProvince("05.081")!.nameFr : getProvince("05.081")!.nameEn}`
      : shape.city ? messages.projectWizard.cityOptions.rabat : messages.projectLocation.unspecified;

    test.each(["grid", "list"] as const)(`${shape.name}: Client dashboard %s summary`, (layout) => {
      const html = render(locale, <ClientProjectCard layout={layout} project={{ ...base, city: shape.city, location: detailed }} />);
      expect(html).toContain(expected);
      if ("localityName" in shape.recorded) expect(html).toContain(privateLocality);
      expect(html).not.toContain(exactAddress);
      expect(html).toContain(messages.clientProjects.viewProject);
    });
    test(`${shape.name}: Company dashboard general summary`, () => {
      state.projects = [{ ...companyBase, city: shape.city, location, neighborhood: privateNeighborhood }];
      const html = render(locale, <CompanyDashboard />);
      expect(html).toContain(expected);
      expectGeneral(html);
      expect(html).toContain(messages.projectWizard.timelineOptions.flexible);
    });
    test(`${shape.name}: owner Project detail`, () => {
      const html = render(locale, <ClientProjectDetailsView project={{ ...ownerBase, city: shape.city, location: detailed }} />);
      expect(html).toContain(expected);
      expect(html).not.toContain(exactAddress);
      expect(html).toContain(messages.clientProjects.projectInformation);
    });
    test(`${shape.name}: pre-interest Company Project detail`, () => {
      const html = render(locale, <ProjectDetailsView project={{ ...companyBase, city: shape.city, location, neighborhood: privateNeighborhood }} />);
      expect(html).toContain(expected);
      expectGeneral(html);
      expect(html).toContain(messages.companyProjects.quote.submit);
    });
  }

  test("only the authorized detailed Company projection adds private locality", () => {
    const html = render(locale, <ProjectDetailsView project={{ ...companyBase, city: null, location: toDetailedProjectLocation(recorded) }} />);
    expect(html).toContain(privateLocality);
    expect(html).toContain(privateNeighborhood);
    expect(html).not.toContain(exactAddress);
  });
  test("older city-only dashboard responses keep their fallback", () => {
    state.projects = [{ ...companyBase, city: "tangier" }];
    expect(render(locale, <CompanyDashboard />)).toContain(messages.projectWizard.cityOptions.tangier);
  });

  for (const viewerType of ["client", "company"] as const) {
    test(`${viewerType}: authorized Site Visit detail displays the separate address without a Project city`, () => {
      const result = { viewerType, canInvite: false, assessment };
      state.queries["siteVisits/index:getForProject"] = result;
      state.queries["siteVisits/index:getForConversation"] = result;
      for (const child of [<ProjectSiteAssessment key="project" projectId={base.id} />,
        <ConversationSiteAssessment key="conversation" conversationId={visit.conversationId} />]) {
        const html = render(locale, child);
        expect(html).toContain(exactAddress);
        expect(html).toContain("10:00");
        expect(html).toContain(messages.siteAssessment.visit.timezone);
        expect(html).toContain(messages.siteAssessment.visit.actions.cancel);
        expect(html).not.toContain(privateLocality);
      }
    });
    test(`${viewerType}: no authorized assessment renders no visit address`, () => {
      state.queries["siteVisits/index:getForProject"] = { viewerType, canInvite: false, assessment: null };
      expect(render(locale, <ProjectSiteAssessment projectId={base.id} />)).toBe("");
    });
    test.each(["proposed", "completed", "declined", "cancelled"] as const)(`${viewerType}: %s visit preserves its authorized address`, (status) => {
      const html = render(locale, <SiteAssessmentPanel result={{ viewerType, canInvite: false,
        assessment: { ...assessment, visit: { ...visit, status } } }} />);
      expect(html).toContain(exactAddress);
      expect(html).not.toContain(privateLocality);
      expect(html).not.toContain("cityOptions.");
    });
  }
});
