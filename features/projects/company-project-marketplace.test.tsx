import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const state = vi.hoisted(() => ({
  results: [] as unknown[],
  status: "Exhausted",
  initialNumItems: 0,
  queryResults: [] as unknown[],
  queryIndex: 0,
  replace: vi.fn(),
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: (_query: unknown, _args: unknown, options: { initialNumItems: number }) => {
    state.initialNumItems = options.initialNumItems;
    return { results: state.results, status: state.status, loadMore: vi.fn() };
  },
  useQuery: () => state.queryResults[state.queryIndex++],
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | { pathname: string; params: Record<string, string> } }) => <a href={typeof href === "string" ? href : `${href.pathname}/${href.params.projectId}`} {...props}>{children}</a>,
  useRouter: () => ({ replace: state.replace }),
}));

import { CompanyProjectDetails } from "./components/company-project-details";
import { CompanyProjectMarketplace, ProjectDetailsSheet, resolveCompanyProjectsRedirect } from "./components/company-project-marketplace";

const companyUser = {
  accountType: "company",
  onboardingStatus: "completed",
  firstName: "Sara",
  lastName: "Company",
  email: "company@example.test",
};
const project = {
  id: "project-1",
  title: "Renovation appartement Agdal",
  city: "rabat",
  primaryCategory: "renovation",
  customCategoryText: null,
  budgetRange: "100000_250000",
  timeline: "one_to_three_months",
  propertyType: "apartment",
  surface: 95,
  surfaceUnknown: false,
  description: "Renovation complete with electrical and plumbing work.",
  publishedAt: 1790000000000,
  client: {
    displayName: "Samir C.",
    firstName: "Samir",
    lastInitial: "C",
    city: "Rabat",
    joinedAt: 1700000000000,
    projectsPostedCount: 2,
    projectsCompletedCount: 1,
    emailVerified: true,
    phoneVerified: false,
  },
};

function provider(locale: "en" | "fr", child: React.ReactNode) {
  return <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">{child}</NextIntlClientProvider>;
}

function renderFeed(locale: "en" | "fr" = "en") {
  state.queryResults = [companyUser];
  state.queryIndex = 0;
  return renderToStaticMarkup(provider(locale, <CompanyProjectMarketplace />));
}

function renderDetail(canSubmitQuote: boolean, locale: "en" | "fr" = "en", myQuoteId: string | null = null) {
  state.queryResults = [companyUser, { ...project, neighborhood: "Agdal", budgetMin: 100000, budgetMax: 250000, budgetUnknown: false, canSubmitQuote, myQuoteId }];
  state.queryIndex = 0;
  return renderToStaticMarkup(provider(locale, <CompanyProjectDetails projectId="project-1" />));
}

describe("company project routes and access", () => {
  test("maps EN and FR list/detail routes", () => {
    expect(routing.pathnames[routes.companyProjects]).toEqual({ en: "/company/projects", fr: "/espace-entreprise/projets" });
    expect(routing.pathnames[routes.companyProject]).toEqual({ en: "/company/projects/[projectId]", fr: "/espace-entreprise/projets/[projectId]" });
  });

  test("redirects every non-company role to its own workspace", () => {
    expect(resolveCompanyProjectsRedirect({ accountType: "client", onboardingStatus: "completed" } as never)).toBe(routes.clientDashboard);
    expect(resolveCompanyProjectsRedirect({ accountType: "admin", onboardingStatus: "completed" } as never)).toBe(routes.admin);
    expect(resolveCompanyProjectsRedirect({ accountType: "seo_team", onboardingStatus: "completed" } as never)).toBe(routes.seoDashboard);
    expect(resolveCompanyProjectsRedirect({ accountType: "company", onboardingStatus: "pending" } as never)).toBe(routes.companyOnboarding);
    expect(resolveCompanyProjectsRedirect(null)).toBe(routes.signIn);
    expect(resolveCompanyProjectsRedirect(companyUser as never)).toBeNull();
  });
});

describe("company project feed", () => {
  beforeEach(() => {
    state.results = [];
    state.status = "Exhausted";
    state.initialNumItems = 0;
    state.replace.mockReset();
  });

  test.each([
    ["en", "Find your next construction project", "Load more"],
    ["fr", "Trouvez votre prochain projet de construction", "Voir plus"],
  ] as const)("renders localized %s feed", (locale, title, loadMore) => {
    state.results = [project];
    state.status = "CanLoadMore";
    const html = renderFeed(locale);
    expect(html).toContain(title);
    expect(html).toContain(loadMore);
    expect(html).toContain("Renovation appartement Agdal");
    expect(state.initialNumItems).toBe(10);
  });

  test("deduplicates projects and hides load more when exhausted", () => {
    state.results = [project, { ...project }];
    state.status = "Exhausted";
    const html = renderFeed();
    expect(html.match(/<h2[^>]*>Renovation appartement Agdal<\/h2>/g)).toHaveLength(1);
    expect(html).not.toContain("Load more");
  });

  test("renders mobile filters, desktop filters, skeletons, and empty state", () => {
    let html = renderFeed();
    expect(html).toContain("lg:hidden");
    expect(html).toContain("lg:block");
    expect(html.match(/<details/g)).toHaveLength(7);
    expect(html).toContain("<summary");
    expect(html).toContain('open=""');
    expect(html).toContain('id="desktop-city"');
    expect(html).toContain('type="search"');
    expect(html).toContain('id="desktop-category"');
    expect(html).toContain('id="desktop-budget-under_50000"');
    expect(html).toContain('id="desktop-timeline-asap"');
    expect(html).toContain('id="desktop-property-house"');
    expect(html).toContain('id="desktop-surface-under_100"');
    expect(html).toContain('id="desktop-posted-last_24h"');
    expect(html).toContain("Select categories");
    expect(html).toContain("As soon as possible");
    expect(html).toContain("Villa / house");
    expect(html).toContain("Under 100 m²");
    expect(html).toContain("Last 24 hours");
    expect(html).toContain('aria-label="Filters"');
    expect(html).toContain("border-b border-[#e4e8eb]");
    expect(html).not.toContain("<select");
    expect(html).toContain("No projects match your filters.");
    expect(html).toContain("Clear filters");
    expect(html).toContain("Sort by");
    expect(html).toContain("Most recent");
    expect(html).toContain('aria-label="Sort by: Most recent"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(en.companyProjects.sort.options.oldest).toBe("Oldest");
    expect(en.companyProjects.sort.options.budgetHigh).toBe("Highest budget");
    expect(en.companyProjects.sort.options.budgetLow).toBe("Lowest budget");

    state.status = "LoadingFirstPage";
    html = renderFeed();
    expect(html).toContain("Loading projects…");
    expect(html).toContain('aria-busy="true"');
  });

  test("renders localized French filter labels", () => {
    const html = renderFeed("fr");
    expect(html).toContain("Ville");
    expect(html).toContain("Catégorie");
    expect(html).toContain("Budget");
    expect(html).toContain("Délai");
    expect(html).toContain("Type de bien");
    expect(html).toContain("Surface");
    expect(html).toContain("Date de publication");
    expect(html).toContain("Plus récents");
    expect(html).toContain("Effacer les filtres");
    expect(fr.companyProjects.sort.options.oldest).toBe("Plus anciens");
    expect(fr.companyProjects.sort.options.budgetHigh).toBe("Budget le plus élevé");
    expect(fr.companyProjects.filters.postedOptions.last_24h).toBe("Dernières 24 heures");
  });
});

describe("company project detail sheet", () => {
  test.each([
    ["en", "Open full project page", "Project details", "Interested in this project?"],
    ["fr", "Ouvrir la page complète du projet", "Détails du projet", "Intéressé par ce projet ?"],
  ] as const)("renders localized %s safe details", (locale, openPage, detailsHeading, proposalTitle) => {
    state.queryResults = [{
      ...project,
      neighborhood: "Agdal",
      budgetMin: 100000,
      budgetMax: 250000,
      budgetUnknown: false,
      canSubmitQuote: true,
      myQuoteId: null,
    }];
    state.queryIndex = 0;
    const html = renderToStaticMarkup(provider(locale, <ProjectDetailsSheet onClose={() => undefined} projectId="project-1" />));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-testid="project-detail-sheet"');
    expect(html).toContain("lg:w-[min(62vw,1040px)]");
    expect(html).toContain("bg-ink/50");
    expect(html).toContain(openPage);
    expect(html).toContain(detailsHeading);
    expect(html).toContain(proposalTitle);
    expect(html).toContain("Samir C.");
    expect(html).toContain("Rabat");
    expect(html).not.toContain("company@example.test");
    expect(html).not.toContain("@private.test");
    expect(html).not.toContain("+212");
  });

  test("shows layout skeleton while loading", () => {
    state.queryResults = [undefined];
    state.queryIndex = 0;
    const html = renderToStaticMarkup(provider("en", <ProjectDetailsSheet onClose={() => undefined} projectId="project-1" />));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading project details…");
    expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(260px,30%)]");
  });
});

describe("company project detail", () => {
  test("shows safe detail and verified-company proposal placeholder", () => {
    const html = renderDetail(true);
    expect(html).toContain("Renovation appartement Agdal");
    expect(html).toContain("Samir C.");
    expect(html).toContain("Send an initial quote");
    expect(html).toContain("Messaging stays locked until the client opens a discussion");
    expect(html).not.toContain("company@example.test");
    expect(html).not.toContain("phone");
  });

  test("shows disabled verification guidance in French for an unverified company", () => {
    const html = renderDetail(false, "fr");
    expect(html).toContain("Envoyer un devis estimatif");
    expect(html).toContain("Vérifiez votre entreprise avant d’envoyer un devis.");
    expect(html).toContain("disabled");
  });

  test("shows the company quote link when a quote already exists", () => {
    const html = renderDetail(false, "en", "quote-1");
    expect(html).toContain("View my quote");
    expect(html).not.toContain("disabled");
  });

  test("sheet shows active CTA for verified companies and safe client stats", () => {
    state.queryResults = [{
      ...project,
      neighborhood: "Agdal",
      budgetMin: 100000,
      budgetMax: 250000,
      budgetUnknown: false,
      canSubmitQuote: true,
      myQuoteId: null,
    }];
    state.queryIndex = 0;
    const html = renderToStaticMarkup(provider("en", <ProjectDetailsSheet onClose={() => undefined} projectId="project-1" />));
    expect(html).toContain("Send an initial quote");
    expect(html).not.toContain("cursor-not-allowed");
    expect(html).toContain("2 projects posted");
    expect(html).toContain("1 project completed");
    expect(html).toContain("Email verified");
    expect(html).not.toContain("Phone verified");
  });
});
