import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const state = vi.hoisted(() => ({
  queryResult: undefined as unknown,
  queryCalls: [] as { name: string; args: unknown }[],
  accountType: "company",
}));
vi.mock("convex/react", () => ({
  useQuery: (query: unknown, args: unknown) => {
    state.queryCalls.push({ name: getFunctionName(query as never), args });
    return args === undefined
      ? { accountType: state.accountType, onboardingStatus: "completed" }
      : args === "skip" ? undefined : state.queryResult;
  },
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

import { ClientProjectInvitations } from "./components/client-project-invitations";
import { VerifiedBadge } from "@/features/companies/components/verified-badge";
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
    isVerified: true,
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
  for (const locale of ["en", "fr"] as const) {
    test.each(["verified", "draft", "pending", "rejected"])(`client invitation identity badge in ${locale}: %s`, (status) => {
      const isVerified = status === "verified";
      state.queryResult = [{ ...rows[0], isVerified }];
      const html = render(locale, <ClientProjectInvitations projectId={"project-0" as Id<"projects">} />);
      expect(html).toContain("Atlas Build");
      expect(html.match(/data-verification="verified"/g) ?? []).toHaveLength(isVerified ? 1 : 0);
      expect(html).not.toMatch(/data-verification="unverified"|Unverified company|Entreprise non vérifiée/);
      if (isVerified) expect(html).toContain(renderToStaticMarkup(<VerifiedBadge isVerified label={(locale === "en" ? en : fr).publicCompany.verified} />));
    });
  }

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

  for (const locale of ["en", "fr"] as const) {
    test.each([true, false])(`opening a ${locale} profile keeps invitations lazy (eligible: %s)`, (companyEligible) => {
      state.accountType = "client";
      state.queryCalls = [];
      const html = render(locale, <InviteCompanyButton companyId={"company-1" as Id<"companies">} companyEligible={companyEligible} />);
      expect(state.queryCalls.find(call => call.name === "invitations/index:listMyEligibleProjectsForCompany")?.args).toBe("skip");
      expect(html.includes('disabled=""')).toBe(!companyEligible);
      if (!companyEligible) expect(html).toContain((locale === "en" ? en : fr).invitations.client.unavailable);
      state.accountType = "company";
    });
  }
});
