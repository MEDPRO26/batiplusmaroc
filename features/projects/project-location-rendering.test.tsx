import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => vi.fn() }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string | { pathname: string } }) =>
    <a href={typeof href === "string" ? href : href.pathname}>{children}</a>,
  useRouter: () => ({ replace: vi.fn() }),
}));

import { ProjectDetailsView } from "./components/company-project-details";
import { ClientProjectDetailsView } from "./components/client-project-details";
import { ProjectDiscoveryResults } from "./components/project-discovery-empty-state";
import { toDetailedProjectLocation, toGeneralProjectLocation } from "@/lib/geography/project-location";

const recorded = {
  regionCode: "05", provinceCode: "05.081", communeName: "Aït Tamlil — آيت تامليل",
  localityName: "PRIVATE_DOUAR_RENDER_SENTINEL", neighborhood: "PRIVATE_NEIGHBORHOOD_RENDER_SENTINEL",
};
const companyProject: ComponentProps<typeof ProjectDetailsView>["project"] = {
  id: "project-rural" as Id<"projects">, title: "Rural renovation", city: null,
  location: toGeneralProjectLocation(recorded), primaryCategory: "renovation", customCategoryText: null,
  timeline: "flexible", propertyType: "house", surface: null, surfaceUnknown: true,
  description: "A safe general project description.", publishedAt: 1, client: null,
  canSubmitQuote: true, myQuoteId: null,
};
const publicProject: ComponentProps<typeof ProjectDiscoveryResults>["projects"][number] = {
  id: companyProject.id, title: companyProject.title, description: companyProject.description,
  city: null, location: toGeneralProjectLocation(recorded), primaryCategory: "renovation",
  timeline: "flexible", publishedAt: 1, thumbnailUrl: null,
};
const ownerProject: ComponentProps<typeof ClientProjectDetailsView>["project"] = {
  id: companyProject.id, title: companyProject.title, description: companyProject.description,
  city: null, location: toDetailedProjectLocation(recorded), neighborhood: recorded.neighborhood,
  primaryCategory: "renovation", customCategoryText: null, propertyType: "house", surface: null, surfaceUnknown: true,
  timeline: "flexible", status: "published", createdAt: 1, submittedAt: 1, updatedAt: 1,
  thumbnailUrl: null, canResume: false, canView: true, images: [], attachments: [], history: [], viewerRole: "owner",
};

function render(locale: "fr" | "en", child: React.ReactNode) {
  const onError = vi.fn();
  const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en}
    now={new Date("2026-10-08T12:00:00Z")} timeZone="Africa/Casablanca" onError={onError}>{child}</NextIntlClientProvider>);
  expect(onError).not.toHaveBeenCalled();
  return html;
}

describe.each(["fr", "en"] as const)("GEO3 %s minimal rendering compatibility", (locale) => {
  test("public no-city cards use the shared general label", () => {
    const html = render(locale, <ProjectDiscoveryResults projects={[publicProject]} />);
    expect(html).toContain("Azilal");
    expect(html).toContain(recorded.communeName);
    expect(html).not.toContain("PRIVATE_");
    expect(html).not.toContain("cityOptions.null");
  });

  test("Company general location ignores old top-level neighborhood and quote eligibility flags", () => {
    const html = render(locale, <ProjectDetailsView project={{ ...companyProject, neighborhood: recorded.neighborhood }} />);
    expect(html).toContain("Azilal");
    expect(html).toContain(recorded.communeName);
    expect(html).not.toContain("PRIVATE_");
    expect(html).not.toContain("cityOptions.null");
  });

  test("authorized Company and owning Client detailed DTOs render permitted locality values", () => {
    const companyHtml = render(locale, <ProjectDetailsView project={{ ...companyProject, location: toDetailedProjectLocation(recorded) }} />);
    const ownerHtml = render(locale, <ClientProjectDetailsView project={ownerProject} />);
    for (const html of [companyHtml, ownerHtml]) {
      expect(html).toContain(recorded.localityName);
      expect(html).toContain(recorded.neighborhood);
      expect(html).toContain("Azilal");
    }
  });

  test("unknown historical administrative/city codes use translated fallback without missing translation keys", () => {
    const html = render(locale, <ProjectDetailsView project={{ ...companyProject,
      location: toDetailedProjectLocation({ regionCode: "UNKNOWN_REGION", provinceCode: "UNKNOWN_PROVINCE", city: "UNKNOWN_CITY" }),
    }} />);
    expect(html).toContain((locale === "fr" ? fr : en).projectLocation.unspecified);
    expect(html).not.toContain("UNKNOWN_");
  });

  test("cleared structured geography does not restore the old city in Client, public or Company views", () => {
    const cleared = { locationMode: "structured" as const, city: "agadir", neighborhood: recorded.neighborhood };
    const general = toGeneralProjectLocation(cleared);
    const publicHtml = render(locale, <ProjectDiscoveryResults projects={[{ ...publicProject, city: "agadir", location: general }]} />);
    const companyHtml = render(locale, <ProjectDetailsView project={{ ...companyProject, city: "agadir", location: general }} />);
    const ownerHtml = render(locale, <ClientProjectDetailsView project={{ ...ownerProject, city: "agadir", location: toDetailedProjectLocation(cleared) }} />);
    for (const html of [publicHtml, companyHtml, ownerHtml]) {
      expect(html).not.toContain((locale === "fr" ? fr : en).projectWizard.cityOptions.agadir);
      expect(html).not.toContain("cityOptions.");
    }
    for (const html of [publicHtml, companyHtml]) {
      expect(html).toContain((locale === "fr" ? fr : en).projectLocation.unspecified);
      expect(html).not.toContain("PRIVATE_");
    }
    expect(ownerHtml).toContain(recorded.neighborhood);
  });
});
