import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { routes } from "@/lib/routes";

vi.mock("convex/react", () => ({ useQuery: () => undefined }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span data-image-alt={alt} /> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    className,
    ...props
  }: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | { pathname: string } }) => (
    <a className={className} href={typeof href === "string" ? href : href.pathname} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace: vi.fn() }),
}));

import { MessagesInboxView, resolveMessagesRedirect, type MessageThread } from "./components/messages-inbox";

function render(locale: "en" | "fr", node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">
      {node}
    </NextIntlClientProvider>,
  );
}

describe("messages inbox", () => {
  test("keeps EN and FR message keys aligned", () => {
    expect(Object.keys(en.messages).sort()).toEqual(Object.keys(fr.messages).sort());
    expect(en.messages.welcomeTitle).toBe("Welcome to Messages");
    expect(fr.messages.welcomeTitle).toBe("Bienvenue dans Messages");
  });

  test("redirects guests and unfinished accounts away from messages", () => {
    expect(resolveMessagesRedirect(null)).toBe(routes.signIn);
    expect(resolveMessagesRedirect({ accountType: "client", onboardingStatus: "pending" })).toBe(
      routes.clientOnboarding,
    );
    expect(resolveMessagesRedirect({ accountType: "company", onboardingStatus: "pending" })).toBe(
      routes.companyOnboarding,
    );
    expect(resolveMessagesRedirect({ accountType: "admin", onboardingStatus: "completed" })).toBe(routes.admin);
    expect(resolveMessagesRedirect({ accountType: "seo_team", onboardingStatus: "completed" })).toBe(
      routes.seoDashboard,
    );
    expect(resolveMessagesRedirect({ accountType: "client", onboardingStatus: "completed" })).toBeNull();
  });

  test("renders the Upwork-style empty client inbox in English", () => {
    const html = render("en", <MessagesInboxView accountType="client" projects={[]} threads={[]} />);
    expect(html).toContain("Welcome to Messages");
    expect(html).toContain("Your conversations will appear here after a client and company open a discussion.");
    expect(html).toContain("Find companies");
    expect(html).toContain(routes.companies);
    expect(html).toContain("Unread");
    expect(html).toContain("Projects");
    expect(html).not.toContain("Write a message");
  });

  test("renders the company empty inbox in French", () => {
    const html = render("fr", <MessagesInboxView accountType="company" projects={[]} threads={[]} />);
    expect(html).toContain("Bienvenue dans Messages");
    expect(html).toContain("Trouver des projets");
    expect(html).toContain(routes.browseProjects);
    expect(html).toContain("Vos conversations apparaîtront ici lorsqu’un client et une entreprise ouvriront une discussion.");
  });

  test("lists real owned projects in the project filter and keeps the empty thread pane", () => {
    const html = render(
      "en",
      <MessagesInboxView
        accountType="client"
        projects={[
          {
            id: "project-1" as Id<"projects">,
            title: "Villa build",
            primaryCategory: "houseConstruction",
            city: "casablanca",
            budgetRange: "50000_100000",
            timeline: "one_to_three_months",
            status: "pending_review",
            createdAt: 1,
            submittedAt: 1,
            updatedAt: 1,
            thumbnailUrl: null,
            canResume: false,
            canView: true,
          },
        ]}
        threads={[]}
      />,
    );
    expect(html).toContain("Villa build");
    expect(html).toContain("All projects");
    expect(html).toContain("Welcome to Messages");
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain('role="option"');
  });

  test("renders conversation rows as a flat list without floating pill cards", () => {
    const thread: MessageThread = {
      id: "conversation-1" as Id<"conversations">,
      projectId: "project-1" as Id<"projects">,
      quoteId: "quote-1" as Id<"projectQuotes">,
      projectTitle: "Villa renovation",
      otherPartyName: "Atlas Construction",
      otherPartyAvatarUrl: null,
      companySlug: "atlas-construction",
      status: "active",
      preview: "We can schedule the site visit next week.",
      lastMessageAt: Date.now(),
      unread: true,
    };
    const html = render("en", <MessagesInboxView accountType="client" projects={[]} threads={[thread]} />);
    expect(html).toContain("Atlas Construction");
    expect(html).toContain("Villa renovation");
    expect(html).toContain("We can schedule the site visit next week.");
    expect(html).toContain("Active");
    expect(html).toContain('<span class="sr-only">Unread</span>');
    expect(html).toContain("divide-y");
    expect(html).toContain("border-l-2");
    expect(html).not.toContain("rounded-xl px-3 py-3");
    expect(html).not.toContain("shadow-sm");
    expect(html).not.toContain("rounded-2xl border border-brand-border bg-[#f7f9fb]");
  });
});
