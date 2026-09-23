import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const convex = vi.hoisted(() => ({ queryResult: [] as unknown }));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("convex/react", () => ({ useQuery: () => convex.queryResult, useMutation: () => vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
  usePathname: () => "/admin/projects",
  getPathname: () => "/admin/projects",
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));

import { AdminProjectsPanel, ProjectReviewDrawer } from "./components/admin-projects-panel";

describe("admin projects interface", () => {
  beforeEach(() => { convex.queryResult = []; });

  test("maps the localized project routes", () => {
    expect(routing.pathnames[routes.adminProjects]).toEqual({ fr: "/admin/projets", en: "/admin/projects" });
  });

  test.each([
    ["en", "Projects", "Pending review", "Search by project title"],
    ["fr", "Projets", "En attente", "Rechercher par titre de projet"],
  ] as const)("renders the %s project queue", (locale, title, pending, search) => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">
        <AdminProjectsPanel email="admin@example.test" firstName="Ada" lastName="Admin" />
      </NextIntlClientProvider>,
    );
    expect(html).toContain(title);
    expect(html).toContain(pending);
    expect(html).toContain(search);
    expect(html).toContain("admin@example.test");
  });

  test("renders safe project details, history, and pending review actions", () => {
    convex.queryResult = {
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
      history: [{ historyId: "history-1", oldStatus: "draft", newStatus: "pending_review", changedAt: 1790000000000, reason: null, changedBy: { userId: "client-1", displayName: "Samir Client", role: "client" } }],
    };
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Africa/Casablanca">
        <ProjectReviewDrawer projectId={"project-1" as Id<"projects">} onClose={() => {}} onError={() => {}} onSuccess={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("Renovation appartement Agdal");
    expect(html).toContain("Samir Client");
    expect(html).toContain("Agdal");
    expect(html).toContain("Approve");
    expect(html).toContain("Request changes");
    expect(html).not.toContain("private-client@example.test");
  });

  test("renders a mobile card list alongside the desktop table", () => {
    convex.queryResult = [{
      projectId: "project-1",
      title: "Renovation appartement Agdal",
      clientName: "Samir Client",
      city: "rabat",
      category: "renovation",
      customCategoryText: null,
      budgetRange: "100000_250000",
      submittedAt: 1790000000000,
      status: "pending_review",
    }];

    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Africa/Casablanca">
        <AdminProjectsPanel email="admin@example.test" firstName="Ada" lastName="Admin" />
      </NextIntlClientProvider>,
    );

    expect(html).toContain("md:hidden");
    expect(html).toContain("md:block");
    expect(html).toContain("<article");
    expect(html).toContain("<table");
  });
});
