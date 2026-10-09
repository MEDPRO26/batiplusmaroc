import { getFunctionName, type FunctionReturnType } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getRegion } from "@/lib/geography/morocco";
import { toDetailedProjectLocation, toGeneralProjectLocation } from "@/lib/geography/project-location";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const state = vi.hoisted(() => ({
  rows: [] as unknown[], proposals: [] as unknown[], projects: [] as unknown[],
  accountType: "company", openPicker: false, booleans: 0,
}));
vi.mock("convex/react", () => ({
  useQuery: (query: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    switch (getFunctionName(query as never)) {
      case "users:currentUser": return { accountType: state.accountType, onboardingStatus: "completed" };
      case "invitations/index:listMyCompanyInvitations": return state.rows;
      case "invitations/index:listMyEligibleProjectsForCompany": return state.projects;
      case "proposals/index:listMyProposals": return state.proposals;
      default: throw new Error("Unexpected query in location render test");
    }
  },
  useMutation: () => vi.fn(),
}));
// Render the existing invitation picker in its open state. This verifies its
// actual option labels, without treating static rendering as a browser test.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: (initial: unknown) => {
    const original = react.useState(initial);
    return initial === false && state.openPicker && state.booleans++ === 0
      ? [true, original[1]] : original;
  } };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string | { pathname: string } }) => (
    <a href={typeof href === "string" ? href : href.pathname}>{children}</a>
  ),
  useRouter: () => ({ replace: vi.fn() }),
}));

import { CompanyInvitations } from "./components/company-invitations";
import { InviteCompanyButton } from "./components/invite-company-button";
import { CompanyProposals } from "@/features/proposals/components/company-proposals";

const projectId = "project-geo92a" as Id<"projects">;
const companyId = "company-geo92a" as Id<"companies">;
const recorded = {
  regionCode: "05", provinceCode: "05.081", communeName: "Aït Tamlil — آيت تامليل",
  localityName: "PRIVATE_DOUAR_RENDER_GEO92A_ⵜⴰⵎⵍⵉⵍ", neighborhood: "PRIVATE_NEIGHBORHOOD_RENDER_GEO92A",
};
const fixtures = [
  { name: "structured without city", city: null, location: toGeneralProjectLocation(recorded), structured: true },
  { name: "structured with inactive legacy city", city: "rabat", location: toGeneralProjectLocation({ ...recorded, city: "rabat" }), structured: true },
  { name: "legacy city only", city: "rabat", location: toGeneralProjectLocation({ city: "rabat" }), legacy: true },
  { name: "older city-only DTO", city: "rabat", legacy: true },
  { name: "missing historical location", city: null },
  { name: "arbitrary city text in an older DTO", city: "Douar arbitrary ⵣ" },
] as const;

function invitation(project: { city: string | null; location?: ReturnType<typeof toGeneralProjectLocation> }) {
  return {
    id: "invitation-geo92a" as Id<"invitations">, projectId, projectTitle: "Renovation project",
    projectDescription: "A safe renovation summary.", ...project, category: "renovation", companyId,
    companyName: "Atlas Build", isVerified: true, clientDisplayName: "Khadija C.", message: null,
    status: "pending", createdAt: 1_790_000_000_000, updatedAt: 1_790_000_000_000,
    acceptedAt: null, declinedAt: null, canAccept: true,
  };
}

function proposal(project: { city: string | null; location?: ReturnType<typeof toGeneralProjectLocation> }) {
  return {
    quoteId: "quote-geo92a" as Id<"projectQuotes">, projectId, projectTitle: "Renovation project", ...project,
    status: "submitted", estimatedPriceMad: 185_000, submittedAt: 1_790_000_000_000,
    conversationId: null, canOpenQuoteWorkspace: true,
  };
}

function render(locale: "fr" | "en", node: React.ReactNode) {
  state.booleans = 0;
  const onError = vi.fn();
  const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}
    timeZone="Africa/Casablanca" onError={onError}>{node}</NextIntlClientProvider>);
  expect(onError).not.toHaveBeenCalled();
  return html;
}

beforeEach(() => {
  state.rows = []; state.proposals = []; state.projects = [];
  state.accountType = "company"; state.openPicker = false; state.booleans = 0;
});

describe.each(["fr", "en"] as const)("GEO9.2A %s summary labels", (locale) => {
  test.each(fixtures)("invitation and proposal rows support $name without arbitrary translation keys", (fixture) => {
    // Extra top-level values must never substitute for the server projection.
    state.rows = [{ ...invitation(fixture), ...{ localityName: recorded.localityName, neighborhood: recorded.neighborhood } }];
    state.proposals = [{ ...proposal(fixture), ...{ localityName: recorded.localityName, neighborhood: recorded.neighborhood } }];
    const messages = locale === "fr" ? fr : en;
    const label = "structured" in fixture
      ? `${locale === "fr" ? getRegion("05")!.nameFr : getRegion("05")!.nameEn} · Azilal · ${recorded.communeName}`
      : "legacy" in fixture ? messages.projectWizard.cityOptions.rabat : messages.projectLocation.unspecified;
    for (const html of [render(locale, <CompanyInvitations />), render(locale, <CompanyProposals />)]) {
      expect(html).toContain(label);
      expect(html).not.toContain("PRIVATE_");
      expect(html).not.toContain("cityOptions.");
      expect(html).not.toContain("Douar arbitrary");
      expect(html).toContain("flex flex-wrap");
      if ("structured" in fixture) expect(html).not.toContain(">Rabat<");
    }
  });

  test.each(["structured", "legacy"] as const)("the owner picker renders %s saved geography", (kind) => {
    state.accountType = "client";
    state.openPicker = true;
    const fields = kind === "structured" ? recorded : { city: "rabat", neighborhood: recorded.neighborhood };
    const project = {
      id: projectId, title: "Renovation project", city: kind === "structured" ? null : "rabat",
      location: toDetailedProjectLocation(fields), category: "renovation", status: "published",
    } satisfies Pick<NonNullable<FunctionReturnType<typeof api.invitations.index.listMyEligibleProjectsForCompany>>[number],
      "id" | "title" | "city" | "location" | "category" | "status">;
    state.projects = [{ ...project, invitationId: null, invitationStatus: null }];
    const html = render(locale, <InviteCompanyButton companyId={companyId} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain(`value="${projectId}"`);
    expect(html).toContain(recorded.neighborhood);
    if (kind === "structured") {
      expect(html).toContain(locale === "fr" ? getRegion("05")!.nameFr : getRegion("05")!.nameEn);
      expect(html).toContain("Azilal");
      expect(html).toContain(recorded.localityName);
    } else expect(html).toContain((locale === "fr" ? fr : en).projectWizard.cityOptions.rabat);
    expect(html).not.toContain("cityOptions.");
  });

  test("new location labels retain existing status, amount and invitation actions", () => {
    state.rows = [{ ...invitation(fixtures[0]), status: "accepted" }];
    state.proposals = [{ ...proposal(fixtures[0]), status: "discussion_open", conversationId: "conversation-geo92a" }];
    const invitationHtml = render(locale, <CompanyInvitations />);
    const proposalHtml = render(locale, <CompanyProposals />);
    const messages = locale === "fr" ? fr : en;
    expect(invitationHtml).toContain(messages.invitations.company.status.accepted);
    expect(proposalHtml).toContain(messages.initialQuote.detail.discussion_open);
    expect(proposalHtml).toContain(messages.companyProposals.openDiscussion);
    expect(proposalHtml).toMatch(/185(?:[\s\u202f\u00a0]|<!-- -->|,)*000/);
    expect(invitationHtml).not.toContain(messages.invitations.company.accept);
    expect(proposalHtml).not.toContain("PRIVATE_");
  });
});
