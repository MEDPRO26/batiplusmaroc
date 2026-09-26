import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { Project } from "@/features/clients/components/client-dashboard";
import type { ProjectDetails } from "@/features/projects/components/client-project-details";
import type { PublicProject } from "@/features/projects/components/project-discovery-empty-state";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const queryState = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("convex/react", () => ({ useQuery: () => queryState.value, useMutation: () => vi.fn() }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span data-alt={alt} /> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string | { pathname: string; query?: Record<string, string> } }) => {
    const value = typeof href === "string"
      ? href
      : `${href.pathname}${href.query ? `?${new URLSearchParams(href.query)}` : ""}`;
    return <a href={value}>{children}</a>;
  },
  useRouter: () => ({ replace: vi.fn() }),
}));

import { ClientDashboardView, ClientProjectCard, ClientProjectsView, greetingPeriod, resolveClientDashboardRedirect } from "@/features/clients/components/client-dashboard";
import { routes } from "@/lib/routes";
import { ClientDealCompletion, ClientProjectDetailsView, DealCompletionDialog } from "@/features/projects/components/client-project-details";
import { ProjectDiscoveryEmptyState, ProjectDiscoveryResults } from "@/features/projects/components/project-discovery-empty-state";

const projectId = "project-1" as Id<"projects">;
const baseProject: Project = {
  id: projectId,
  title: "Villa build",
  primaryCategory: "houseConstruction",
  city: "casablanca",
  budgetRange: "50000_100000",
  timeline: "one_to_three_months",
  status: "pending_review",
  createdAt: 1_790_000_000_000,
  submittedAt: 1_790_000_100_000,
  updatedAt: 1_790_000_100_000,
  thumbnailUrl: null,
  canResume: false,
  canView: true,
};

function render(locale: "en" | "fr", node: React.ReactNode) {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">{node}</NextIntlClientProvider>);
}

describe("client project workspace", () => {
  beforeEach(() => { queryState.value = undefined; });

  test("shows the post-project action when the owner has zero projects", () => {
    const html = render("en", <ClientProjectsView projects={[]} />);
    expect(html).toContain("Post a project");
    expect(html).toContain("Overview");
    expect(html).toContain("Grid view");
    expect(html).toContain("List view");
  });

  test("renders the dashboard greeting, useful setup cards, real projects, and post action", () => {
    const profile = {
      firstName: "Yassine",
      lastName: "Ifguisse",
      initials: "YI",
      profilePhotoUrl: null,
      city: "Agadir",
      phone: "0612345678",
      email: "yassine@example.test",
      joinedAt: 1_700_000_000_000,
      projectsPostedCount: 1,
      projectsCompletedCount: 0,
    };
    const html = render("en", <ClientDashboardView firstName="Yassine" hour={9} profile={profile} projects={[baseProject]} />);
    expect(html).toContain("Good morning, Yassine");
    expect(html).toContain("Profile completed");
    expect(html).toContain("Phone added");
    expect(html).toContain("Villa build");
    expect(html).toContain("Overview");
    expect(html).toContain("Post a project");
  });

  test("uses the French greeting and stable time periods", () => {
    expect(greetingPeriod(8)).toBe("morning");
    expect(greetingPeriod(14)).toBe("afternoon");
    expect(greetingPeriod(21)).toBe("evening");
    const profile = { firstName: "Yassine", lastName: "I", initials: "YI", profilePhotoUrl: null, city: "Agadir", phone: "0612345678", email: "y@example.test", joinedAt: 1, projectsPostedCount: 0, projectsCompletedCount: 0 };
    expect(render("fr", <ClientDashboardView firstName="Yassine" hour={14} profile={profile} projects={[]} />)).toContain("Bonjour, Yassine");
  });

  test("redirects unauthenticated and company viewers away from the client dashboard", () => {
    expect(resolveClientDashboardRedirect(null)).toBe(routes.signIn);
    expect(resolveClientDashboardRedirect({ accountType: "company", onboardingStatus: "completed" })).toBe(routes.companyDashboard);
    expect(resolveClientDashboardRedirect({ accountType: "company", onboardingStatus: "pending" })).toBe(routes.companyOnboarding);
    expect(resolveClientDashboardRedirect({ accountType: "admin", onboardingStatus: "completed" })).toBe(routes.admin);
    expect(resolveClientDashboardRedirect({ accountType: "seo_team", onboardingStatus: "completed" })).toBe(routes.seoDashboard);
    expect(resolveClientDashboardRedirect({ accountType: "client", onboardingStatus: "completed" })).toBeNull();
  });

  test("renders a resumable draft card in French", () => {
    const html = render("fr", <ClientProjectCard project={{ ...baseProject, status: "draft", submittedAt: null, canResume: true }} />);
    expect(html).toContain("Projet en brouillon");
    expect(html).toContain("Compléter le brouillon");
    expect(html).toContain("Ajoutez des détails à votre brouillon");
  });

  test("renders a resumable draft card", () => {
    const html = render("en", <ClientProjectCard project={{ ...baseProject, status: "draft", submittedAt: null, canResume: true }} />);
    expect(html).toContain("Draft project");
    expect(html).toContain("Fill in draft");
    expect(html).toContain("Add details to your draft");
    expect(html).not.toContain("View project");
  });

  test("renders pending-review status and private visibility copy in English", () => {
    const html = render("en", <ClientProjectCard project={baseProject} />);
    expect(html).toContain("Pending review");
    expect(html).toContain("Waiting for Batiplus review");
    expect(html).toContain("View project");
  });

  test("renders the pending-review status in French", () => {
    const html = render("fr", <ClientProjectCard project={baseProject} />);
    expect(html).toContain("En cours de vérification");
    expect(html).toContain("En attente de validation Batiplus");
  });

  test("renders multiple owned projects", () => {
    const html = render("en", <ClientProjectsView projects={[baseProject, { ...baseProject, id: "project-2" as Id<"projects">, title: "Apartment renovation", status: "draft", canResume: true }]} />);
    expect(html).toContain("Villa build");
    expect(html).toContain("Apartment renovation");
  });

  test("renders owner project details, attachment metadata, and safe history", () => {
    const details: ProjectDetails = {
      ...baseProject,
      customCategoryText: null,
      neighborhood: "Maarif",
      description: "A complete family villa construction project.",
      propertyType: "house",
      surface: 180,
      surfaceUnknown: false,
      images: [],
      attachments: [{ id: "attachment-1" as Id<"projectAttachments">, fileName: "plan.pdf", size: 2048 }],
      history: [{ oldStatus: "draft", newStatus: "pending_review", changedAt: 1_790_000_100_000, actor: "client", reason: null }],
      viewerRole: "owner",
    };
    const html = render("en", <ClientProjectDetailsView project={details} />);
    expect(html).toContain("Project summary");
    expect(html).toContain("plan.pdf");
    expect(html).toContain("Draft → Pending review");
    expect(html).not.toContain(details.id);
  });

  test("shows the admin change reason to the client", () => {
    const details: ProjectDetails = {
      ...baseProject,
      status: "needs_changes",
      canResume: true,
      customCategoryText: null,
      neighborhood: "Maarif",
      description: "A complete family villa construction project.",
      propertyType: "house",
      surface: 180,
      surfaceUnknown: false,
      images: [],
      attachments: [],
      history: [{ oldStatus: "pending_review", newStatus: "needs_changes", changedAt: 1_790_000_200_000, actor: "staff", reason: "Add the exact surface area." }],
      viewerRole: "owner",
    };
    const html = render("en", <ClientProjectDetailsView project={details} />);
    expect(html).toContain("Batiplus requested changes");
    expect(html).toContain("Add the exact surface area.");
    expect(html).toContain("Pending review → Needs changes");
    expect(html).toContain("Continue project");
    expect(html).toContain("?projectId=project-1");
  });

  test("shows the Client-only completion action and confirmation dialog in EN and FR", () => {
    const details: ProjectDetails = {
      ...baseProject,
      status: "company_selected",
      customCategoryText: null,
      neighborhood: null,
      description: "A complete family villa construction project.",
      propertyType: "house",
      surface: 180,
      surfaceUnknown: false,
      images: [],
      attachments: [],
      history: [],
      viewerRole: "owner",
    };
    queryState.value = { id: "deal-1", status: "active", completedAt: null, reviewEligible: false };
    const active = render("en", <ClientDealCompletion project={details} />);
    expect(active).toContain("Confirm completion");
    expect(active).toContain("Work in progress");
    const dialog = render("fr", <DealCompletionDialog busy={false} error="" onCancel={() => undefined} onConfirm={() => undefined} />);
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain("Confirmer que les travaux sont terminés");
    expect(dialog).toContain("Terminer l’accord");
  });

  test("shows completion date and review eligibility without another action", () => {
    const details = {
      ...baseProject,
      status: "completed" as const,
      customCategoryText: null,
      neighborhood: null,
      description: "A complete family villa construction project.",
      propertyType: "house" as const,
      surface: 180,
      surfaceUnknown: false,
      images: [],
      attachments: [],
      history: [],
      viewerRole: "owner" as const,
    } satisfies ProjectDetails;
    queryState.value = { id: "deal-1", status: "completed", completedAt: 1_790_000_000_000, reviewEligible: true };
    const html = render("en", <ClientDealCompletion project={details} />);
    expect(html).toContain("Work completed");
    expect(html).toContain("eligible for a review");
    expect(html).not.toContain("Confirm completion");
  });

  test("uses the marketplace empty state and never the personal-project message", () => {
    const html = render("en", <ProjectDiscoveryResults projects={[]} />);
    expect(html).toContain("No projects are available yet.");
    expect(html).toContain("New client projects will appear here after review.");
    expect(html).not.toContain("You haven’t posted a project yet.");
  });

  test("renders discovery results and a translated loading state", () => {
    const publicProject: PublicProject = { id: projectId, title: "Published villa", description: "A safe public project description.", city: "rabat", primaryCategory: "houseConstruction", budgetRange: null, timeline: null, publishedAt: 1, thumbnailUrl: null };
    expect(render("en", <ProjectDiscoveryResults projects={[publicProject]} />)).toContain("Published villa");
    expect(render("en", <ProjectDiscoveryEmptyState />)).toContain("Loading available projects…");
  });

  test("keeps EN and FR lifecycle translation keys aligned", () => {
    expect(Object.keys(en.clientProjects.status)).toEqual(Object.keys(fr.clientProjects.status));
    expect(Object.keys(en.clientProjects)).toEqual(Object.keys(fr.clientProjects));
    expect(Object.keys(en.clientDashboard)).toEqual(Object.keys(fr.clientDashboard));
  });
});
