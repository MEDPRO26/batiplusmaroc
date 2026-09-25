import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { routing } from "@/i18n/routing";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { routes } from "@/lib/routes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const convex = vi.hoisted(() => ({ queryResults: [] as unknown[] }));
vi.mock("next/font/google", () => ({
  Outfit: () => ({ className: "font-outfit" }),
}));
vi.mock("convex/react", () => ({
  useQuery: () => convex.queryResults.shift(),
  useMutation: () => vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/admin/projects",
  getPathname: () => "/admin/projects",
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));

import {
  AdminProjectsPanel,
  ProjectReviewDrawer,
} from "./components/admin-projects-panel";
import { AdminShell } from "./components/admin-shell";

describe("admin projects interface", () => {
  beforeEach(() => {
    convex.queryResults = [[]];
  });

  test("maps the localized project routes", () => {
    expect(routing.pathnames[routes.adminProjects]).toEqual({
      fr: "/admin/projets",
      en: "/admin/projects",
    });
    expect(routing.pathnames[routes.adminSiteVisits]).toEqual({
      fr: "/admin/visites-techniques",
      en: "/admin/site-visits",
    });
  });

  test.each([
    ["en", "Projects", "Pending review", "Search by project title"],
    ["fr", "Projets", "En attente", "Rechercher par titre de projet"],
  ] as const)(
    "renders the %s project queue",
    (locale, title, pending, search) => {
      const html = renderToStaticMarkup(
        <NextIntlClientProvider
          locale={locale}
          messages={locale === "en" ? en : fr}
          timeZone="Africa/Casablanca"
        >
          <AdminShell
            email="admin@example.test"
            firstName="Ada"
            lastName="Admin"
          >
            <AdminProjectsPanel />
          </AdminShell>
        </NextIntlClientProvider>,
      );
      expect(html).toContain(title);
      expect(html).toContain(pending);
      expect(html).toContain(search);
      expect(html).toMatch(
        new RegExp(
          `aria-current="page"[^>]*>(?:(?!</span>)[\\s\\S])*${title}</span>`,
        ),
      );
      expect(html).toContain("admin@example.test");
    },
  );

  test("renders safe project details, history, and pending review actions", () => {
    convex.queryResults = [
      {
        projectId: "project-1",
        title: "Renovation appartement Agdal",
        client: { displayName: "Samir Client" },
        category: "renovation",
        customCategoryText: null,
        city: "rabat",
        neighborhood: "Agdal",
        propertyType: "apartment",
        surface: 95,
        surfaceUnknown: false,
        description: "Renovation complete with electrical work.",
        budgetRange: "100000_250000",
        budgetMin: 100000,
        budgetMax: 250000,
        budgetUnknown: false,
        timeline: "one_to_three_months",
        submittedAt: 1790000000000,
        publishedAt: null,
        status: "pending_review",
        history: [
          {
            historyId: "history-1",
            oldStatus: "draft",
            newStatus: "pending_review",
            changedAt: 1790000000000,
            reason: null,
            changedBy: {
              userId: "client-1",
              displayName: "Samir Client",
              role: "client",
            },
          },
        ],
      },
      [
        {
          activityId: "activity-1",
          eventType: "project_submitted",
          actor: {
            userId: "client-1",
            displayName: "Samir Client",
            type: "client",
          },
          company: null,
          quoteId: null,
          conversationId: null,
          siteAssessmentId: null,
          siteVisitId: null,
          dealId: null,
          oldStatus: "draft",
          newStatus: "pending_review",
          reason: null,
          metadata: null,
          createdAt: 1790000000000,
        },
        {
          activityId: "activity-2",
          eventType: "site_visit_confirmed",
          actor: {
            userId: "company-user-1",
            displayName: "Atlas Build",
            type: "company",
          },
          company: { id: "company-1", name: "Atlas Build" },
          quoteId: "quote-1",
          conversationId: "conversation-1",
          siteAssessmentId: "assessment-1",
          siteVisitId: "visit-1",
          dealId: null,
          oldStatus: "proposed",
          newStatus: "confirmed",
          reason: null,
          metadata: {
            proposedDate: "2026-09-28",
            proposedTime: "10:00",
            timezone: "Africa/Casablanca",
          },
          createdAt: 1790000001000,
        },
      ],
    ];
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="en"
        messages={en}
        timeZone="Africa/Casablanca"
      >
        <ProjectReviewDrawer
          projectId={"project-1" as Id<"projects">}
          onClose={() => {}}
          onError={() => {}}
          onSuccess={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("Renovation appartement Agdal");
    expect(html).toContain("Samir Client");
    expect(html).toContain("Agdal");
    expect(html).toContain("Approve");
    expect(html).toContain("Request changes");
    expect(html).toContain("Marketplace timeline");
    expect(html).toContain("Project submitted for review");
    expect(html).toContain("Site visit confirmed");
    expect(html).toContain("Visit: 2026-09-28 at 10:00 (Africa/Casablanca)");
    expect(html).toContain(
      formatMarketplaceDateTime(1790000000000, "en", {
        dateStyle: "medium",
        timeStyle: "medium",
      }),
    );
    expect(html).not.toContain("private-client@example.test");
  });

  test("labels project_created as draft creation and formats Africa/Casablanca", () => {
    convex.queryResults = [
      {
        projectId: "project-1",
        title: "Villa draft timing",
        client: { displayName: "hamza ifg" },
        category: "renovation",
        customCategoryText: null,
        city: "casablanca",
        neighborhood: null,
        propertyType: "house",
        surface: 220,
        surfaceUnknown: false,
        description: "Fresh disposable project for timeline QA.",
        budgetRange: "250000_500000",
        budgetMin: 250000,
        budgetMax: 500000,
        budgetUnknown: false,
        timeline: "one_to_three_months",
        submittedAt: 1_700_000_100_000,
        publishedAt: 1_700_000_200_000,
        status: "published",
        history: [],
      },
      [
        {
          activityId: "activity-created",
          eventType: "project_created",
          actor: {
            userId: "client-1",
            displayName: "hamza ifg",
            type: "client",
          },
          company: null,
          quoteId: null,
          conversationId: null,
          siteAssessmentId: null,
          siteVisitId: null,
          dealId: null,
          oldStatus: null,
          newStatus: "draft",
          reason: null,
          metadata: null,
          createdAt: 1_700_000_000_000,
        },
        {
          activityId: "activity-submitted",
          eventType: "project_submitted",
          actor: {
            userId: "client-1",
            displayName: "hamza ifg",
            type: "client",
          },
          company: null,
          quoteId: null,
          conversationId: null,
          siteAssessmentId: null,
          siteVisitId: null,
          dealId: null,
          oldStatus: "draft",
          newStatus: "pending_review",
          reason: null,
          metadata: null,
          createdAt: 1_700_000_100_000,
        },
      ],
    ];
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="en"
        messages={en}
        timeZone="Africa/Casablanca"
      >
        <ProjectReviewDrawer
          projectId={"project-1" as Id<"projects">}
          onClose={() => {}}
          onError={() => {}}
          onSuccess={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("Project draft created");
    expect(html).not.toContain(">Project created<");
    expect(html).toContain(
      formatMarketplaceDateTime(1_700_000_000_000, "en", {
        dateStyle: "medium",
        timeStyle: "medium",
      }),
    );
    convex.queryResults = [
      {
        projectId: "project-1",
        title: "Villa draft timing",
        client: { displayName: "hamza ifg" },
        category: "renovation",
        customCategoryText: null,
        city: "casablanca",
        neighborhood: null,
        propertyType: "house",
        surface: 220,
        surfaceUnknown: false,
        description: "Fresh disposable project for timeline QA.",
        budgetRange: "250000_500000",
        budgetMin: 250000,
        budgetMax: 500000,
        budgetUnknown: false,
        timeline: "one_to_three_months",
        submittedAt: 1_700_000_100_000,
        publishedAt: 1_700_000_200_000,
        status: "published",
        history: [],
      },
      [
        {
          activityId: "activity-created",
          eventType: "project_created",
          actor: {
            userId: "client-1",
            displayName: "hamza ifg",
            type: "client",
          },
          company: null,
          quoteId: null,
          conversationId: null,
          siteAssessmentId: null,
          siteVisitId: null,
          dealId: null,
          oldStatus: null,
          newStatus: "draft",
          reason: null,
          metadata: null,
          createdAt: 1_700_000_000_000,
        },
      ],
    ];
    const frHtml = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="fr"
        messages={fr}
        timeZone="Africa/Casablanca"
      >
        <ProjectReviewDrawer
          projectId={"project-1" as Id<"projects">}
          onClose={() => {}}
          onError={() => {}}
          onSuccess={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(frHtml).toContain("Brouillon du projet créé");
  });

  test("renders a mobile card list alongside the desktop table", () => {
    convex.queryResults = [
      [
        {
          projectId: "project-1",
          title: "Renovation appartement Agdal",
          clientName: "Samir Client",
          city: "rabat",
          category: "renovation",
          customCategoryText: null,
          budgetRange: "100000_250000",
          submittedAt: 1790000000000,
          status: "pending_review",
        },
      ],
    ];

    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="en"
        messages={en}
        timeZone="Africa/Casablanca"
      >
        <AdminShell email="admin@example.test" firstName="Ada" lastName="Admin">
          <AdminProjectsPanel />
        </AdminShell>
      </NextIntlClientProvider>,
    );

    expect(html).toContain("md:hidden");
    expect(html).toContain("md:block");
    expect(html).toContain("<article");
    expect(html).toContain("<table");
  });
});
