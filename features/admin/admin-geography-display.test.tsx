import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { getProvincesByRegion, getRegions } from "@/lib/geography/morocco";
import { toDetailedProjectLocation } from "@/lib/geography/project-location";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const convex = vi.hoisted(() => ({ responses: {} as Record<string, unknown> }));
vi.mock("convex/react", () => ({
  useQuery: (query: Parameters<typeof getFunctionName>[0]) => convex.responses[getFunctionName(query)],
  useMutation: () => vi.fn(),
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
}));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={typeof href === "string" ? href : "#"} {...props}>{children}</a>,
  usePathname: () => "/admin/projects",
  getPathname: () => "/admin/projects",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));

import { AdminProjectsPanel, ProjectReviewDrawer } from "./components/admin-projects-panel";
import { AdminSiteVisitsPanel } from "./components/admin-site-visits-panel";
import { AdminShell } from "./components/admin-shell";

const location = toDetailedProjectLocation({
  regionCode: "05", provinceCode: "05.081", communeName: "Aït Tamlil — آيت تامليل",
  localityName: "Douar ⵜⴰⵎⵍⵉⵍ", neighborhood: "Secteur rural",
});
const project = {
  projectId: "project-1", title: "Rural project", clientName: "Client Tester",
  city: null, location, category: "renovation", customCategoryText: null,
  submittedAt: 1, status: "pending_review",
};
const visit = {
  assessmentId: "assessment-1", projectId: "project-1", projectTitle: "Rural project",
  clientName: "Client Tester", companyName: "Atlas BTP", city: null, location,
  assessmentStatus: "scheduled", visitDate: "2026-10-12", visitTime: "10:00",
  proposedBy: "company", status: "confirmed", finalQuoteStatus: "not_available",
  riskSignal: null, sortAt: 1,
};

function render(locale: "fr" | "en", component: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en} timeZone="Africa/Casablanca">
      <AdminShell email="admin@example.test" firstName="Ada" lastName="Admin">
        {component}
      </AdminShell>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => { convex.responses = {}; });

describe.each(["fr", "en"] as const)("GEO9.1 %s Admin location display", (locale) => {
  const messages = locale === "fr" ? fr : en;

  test("renders all 12 GEO1 regions and recorded provinces on both existing screens", () => {
    for (const region of getRegions()) {
      const province = getProvincesByRegion(region.code)[0];
      const recorded = { ...location, regionCode: region.code, provinceCode: province.code };
      convex.responses["admin/projects:listProjects"] = [{ ...project, location: recorded }];
      convex.responses["admin/siteVisits:listSiteVisits"] = [{ ...visit, location: recorded }];
      for (const panel of [<AdminProjectsPanel key="projects" />, <AdminSiteVisitsPanel key="visits" />]) {
        const html = render(locale, panel);
        expect(html).toContain(locale === "fr" ? region.nameFr : region.nameEn);
        expect(html).toContain(locale === "fr" ? province.nameFr : province.nameEn);
        expect(html).toContain("Douar ⵜⴰⵎⵍⵉⵍ");
        expect(html).not.toContain("cityOptions.null");
        expect(html).not.toContain(messages.adminProjectLocation.incomplete);
      }
    }
  });

  test("keeps translated legacy city labels for old city-only DTOs", () => {
    convex.responses["admin/projects:listProjects"] = [{ ...project, city: "rabat", location: undefined }];
    convex.responses["admin/siteVisits:listSiteVisits"] = [{ ...visit, city: "rabat", location: undefined }];
    for (const panel of [<AdminProjectsPanel key="projects" />, <AdminSiteVisitsPanel key="visits" />]) {
      const html = render(locale, panel);
      expect(html).toContain(messages.projectWizard.cityOptions.rabat);
      expect(html).not.toContain(messages.adminProjectLocation.incomplete);
      expect(html).not.toContain("Douar ⵜⴰⵎⵍⵉⵍ");
    }
  });

  test("labels cleared structured locations as incomplete instead of using leftover city data", () => {
    const cleared = toDetailedProjectLocation({ locationMode: "structured", city: "rabat" });
    convex.responses["admin/projects:listProjects"] = [{ ...project, city: "rabat", location: cleared, status: "draft" }];
    convex.responses["admin/siteVisits:listSiteVisits"] = [{ ...visit, city: "rabat", location: cleared }];
    for (const panel of [<AdminProjectsPanel key="projects" />, <AdminSiteVisitsPanel key="visits" />]) {
      const html = render(locale, panel);
      expect(html).toContain(messages.adminProjectLocation.incomplete);
      expect(html).not.toContain(`>${messages.projectWizard.cityOptions.rabat}</dd>`);
      expect(html).not.toContain("cityOptions.null");
    }
  });

  test("marks partial/invalid administrative pairs without inferring a province", () => {
    const region = getRegions()[0];
    const wrongProvince = getProvincesByRegion("09")[0];
    for (const recorded of [
      { ...location, regionCode: region.code, provinceCode: null },
      { ...location, regionCode: region.code, provinceCode: wrongProvince.code },
      { ...location, regionCode: "PRIVATE_UNKNOWN_REGION", provinceCode: "99.999" },
      { ...location, localityName: null },
    ]) {
      convex.responses["admin/projects:listProjects"] = [{ ...project, location: recorded }];
      convex.responses["admin/siteVisits:listSiteVisits"] = [{ ...visit, location: recorded }];
      for (const panel of [<AdminProjectsPanel key="projects" />, <AdminSiteVisitsPanel key="visits" />]) {
        const html = render(locale, panel);
        expect(html).toContain(messages.adminProjectLocation.incomplete);
        expect(html).not.toContain("PRIVATE_UNKNOWN_REGION");
        expect(html).not.toContain("99.999");
        expect(html).not.toContain(` · ${locale === "fr" ? wrongProvince.nameFr : wrongProvince.nameEn}`);
      }
    }
  });

  test("keeps existing filters and keyboard-accessible review/view actions with both row layouts", () => {
    convex.responses["admin/projects:listProjects"] = [project];
    convex.responses["admin/siteVisits:listSiteVisits"] = [visit];
    const projectHtml = render(locale, <AdminProjectsPanel />);
    const visitHtml = render(locale, <AdminSiteVisitsPanel />);
    expect(projectHtml).toContain(messages.adminProjects.searchPlaceholder);
    expect(projectHtml).toContain(messages.adminProjects.statusFilterLabel);
    expect(projectHtml).toContain(messages.adminProjects.columns.location);
    expect(projectHtml).toContain("md:hidden");
    expect(projectHtml).toContain("md:block");
    expect(projectHtml).toContain(messages.adminProjects.review);
    expect(visitHtml).toContain(messages.adminSiteVisits.filters.companyLabel);
    expect(visitHtml).toContain(messages.adminSiteVisits.filters.dateRange);
    expect(visitHtml).toContain("sm:grid-cols-2");
    expect(visitHtml).toContain('type="button"');
    expect(visitHtml).toContain("[overflow-wrap:anywhere]");
    expect(visitHtml).not.toContain("PRIVATE_VISIT_STREET_ADDRESS");
  });

  test("renders rural review detail with the existing review actions and without site addresses", () => {
    convex.responses["admin/projects:getProjectReview"] = {
      ...project, client: { displayName: "Client Tester" }, neighborhood: "Secteur rural",
      propertyType: "house", surface: null, surfaceUnknown: true, description: "Rural work.",
      timeline: "flexible", publishedAt: null, history: [],
    };
    convex.responses["admin/projects:listProjectActivity"] = [];
    const html = render(locale, <ProjectReviewDrawer
      projectId={"project-1" as Id<"projects">} onClose={() => {}} onError={() => {}} onSuccess={() => {}}
    />);
    expect(html).toContain("Douar ⵜⴰⵎⵍⵉⵍ");
    expect(html).toContain(messages.adminProjects.fields.location);
    expect(html).toContain(messages.adminProjects.approve);
    expect(html).not.toContain("PRIVATE_VISIT_STREET_ADDRESS");
    expect(html).toContain('role="dialog"');
  });
});
