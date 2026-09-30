import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const state = vi.hoisted(() => ({ queryResult: undefined as unknown }));
vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args: unknown) =>
    args === undefined
      ? { accountType: "company", onboardingStatus: "completed" }
      : state.queryResult,
  useMutation: () => vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string | { pathname: string; params?: Record<string, string> };
  }) => (
    <a href={typeof href === "string" ? href : href.pathname}>{children}</a>
  ),
  useRouter: () => ({ replace: vi.fn() }),
}));

import { CompanyInvitations } from "./components/company-invitations";
import { InviteCompanyButton } from "./components/invite-company-button";

function render(locale: "en" | "fr", node: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : fr}
      timeZone="Africa/Casablanca"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

const rows = (["pending", "accepted", "declined"] as const).map(
  (status, index) => ({
    id: `invitation-${index}` as Id<"invitations">,
    projectId: `project-${index}` as Id<"projects">,
    projectTitle: `Project ${index + 1}`,
    projectDescription:
      "A complete renovation project with a safe public summary.",
    city: "rabat",
    category: "renovation",
    companyId: "company-1" as Id<"companies">,
    companyName: "Atlas Build",
    clientDisplayName: "Khadija C.",
    message: index === 0 ? "Please review our project." : null,
    status,
    createdAt: 1_790_000_000_000 + index,
    updatedAt: 1_790_000_000_000 + index,
    acceptedAt: status === "accepted" ? 1_790_000_000_100 : null,
    declinedAt: status === "declined" ? 1_790_000_000_100 : null,
  }),
);

describe("direct invitation UI", () => {
  test("FR and EN invitation namespaces stay aligned", () => {
    expect(Object.keys(fr.invitations)).toEqual(Object.keys(en.invitations));
    expect(Object.keys(fr.invitations.client)).toEqual(
      Object.keys(en.invitations.client),
    );
    expect(Object.keys(fr.invitations.company)).toEqual(
      Object.keys(en.invitations.company),
    );
  });

  test.each([
    [
      "en",
      "Project invitations",
      "Accept invitation",
      "View project and submit proposal",
    ],
    [
      "fr",
      "Invitations aux projets",
      "Accepter l’invitation",
      "Voir le projet et envoyer une proposition",
    ],
  ] as const)(
    "renders responsive %s pending, accepted, and declined states",
    (locale, title, accept, continuation) => {
      state.queryResult = rows;
      const html = render(locale, <CompanyInvitations />);
      expect(html).toContain(title);
      expect(html).toContain(accept);
      expect(html).toContain(continuation);
      expect(html).toContain(locale === "en" ? "Declined" : "Refusée");
      expect(html).not.toContain(locale === "en" ? "100,000–250,000 MAD" : "100 000–250 000 MAD");
      expect(html).not.toContain(locale === "en" ? ">Budget<" : ">Budget<");
      expect(html).toContain("flex flex-wrap");
      expect(html).toContain("sm:p-6");
    },
  );

  test.each([
    ["en", "Invite to a project"],
    ["fr", "Inviter à un projet"],
  ] as const)("renders the %s company CTA", (locale, label) => {
    state.queryResult = [];
    const html = render(
      locale,
      <InviteCompanyButton companyId={"company-1" as Id<"companies">} />,
    );
    expect(html).toContain(label);
  });
});
