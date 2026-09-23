import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { routes } from "@/lib/routes";

const state = vi.hoisted(() => ({
  queryResults: [] as unknown[],
  queryIndex: 0,
}));

vi.mock("convex/react", () => ({
  useQuery: () => state.queryResults[state.queryIndex++],
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string | { pathname: string };
  }) => <a href={typeof href === "string" ? href : href.pathname}>{children}</a>,
}));

import {
  PublicProjectBrowse,
  PublicProjectBrowseSkeleton,
} from "./components/public-project-browse";

const publicProject = {
  id: "project-public-1" as Id<"projects">,
  title: "Published villa renovation",
  description: "A safe public project description for marketplace browsing.",
  city: "casablanca" as const,
  primaryCategory: "renovation" as const,
  budgetRange: "50000_100000" as const,
  timeline: "one_to_three_months" as const,
  publishedAt: Date.now() - 86_400_000,
  thumbnailUrl: null,
};

function render(locale: "en" | "fr", node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : fr}
      now={new Date("2026-09-23T18:00:00.000Z")}
      timeZone="Africa/Casablanca"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

describe("public project browse", () => {
  beforeEach(() => {
    state.queryResults = [];
    state.queryIndex = 0;
  });

  test("keeps FR and EN browse page keys aligned", () => {
    expect(Object.keys(fr.browseProjectsPage).sort()).toEqual(
      Object.keys(en.browseProjectsPage).sort(),
    );
    expect(en.browseProjectsPage.title).toBe("Browse projects");
    expect(fr.browseProjectsPage.title).toBe("Parcourir les projets");
  });

  test("renders an announced loading skeleton", () => {
    const html = renderToStaticMarkup(
      <PublicProjectBrowseSkeleton label="Loading projects…" />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading projects…");
    expect(html.match(/skeleton-block/g)?.length).toBeGreaterThan(3);
  });

  test("shows loading copy while public projects resolve", () => {
    state.queryResults = [undefined, null];
    const html = render("en", <PublicProjectBrowse />);
    expect(html).toContain("Loading projects…");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("ConvexError");
  });

  test("renders guest empty state and company signup CTA", () => {
    state.queryResults = [[], null];
    const html = render("en", <PublicProjectBrowse />);
    expect(html).toContain("No matching projects");
    expect(html).toContain("Create a company account");
    expect(html).toContain(routes.signUpCompany);
    expect(html).toContain(routes.signIn);
    expect(html).toContain("Filters");
  });

  test("renders marketplace project rows without exposing raw ids", () => {
    state.queryResults = [[publicProject], null];
    const html = render("en", <PublicProjectBrowse initialSearch="villa" />);
    expect(html).toContain("Published villa renovation");
    expect(html).toContain("Casablanca");
    expect(html).toContain("Renovation");
    expect(html).toContain("View project");
    expect(html).toContain("1 project");
    expect(html).not.toContain(publicProject.id);
  });

  test("renders French browse chrome and empty lead", () => {
    state.queryResults = [[], null];
    const html = render("fr", <PublicProjectBrowse />);
    expect(html).toContain("Parcourir les projets");
    expect(html).toContain("Aucun projet correspondant");
    expect(html).toContain("Créer un compte entreprise");
  });

  test("points signed-in companies to the company find-projects workspace", () => {
    state.queryResults = [
      [publicProject],
      {
        _id: "user-1",
        email: "co@example.test",
        firstName: "Amina",
        lastName: "Bennani",
        accountType: "company",
        acceptedTerms: true,
        countryCode: "MA",
        marketingOptIn: false,
        onboardingStatus: "completed",
      },
    ];
    const html = render("en", <PublicProjectBrowse />);
    expect(html).toContain("Published villa renovation");
    expect(html).not.toContain("Create a company account");
    expect(html).not.toContain(routes.signUpCompany);
  });
});
