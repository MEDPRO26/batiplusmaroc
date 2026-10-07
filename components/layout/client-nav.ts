import type { useTranslations } from "next-intl";
import type { NavbarItem } from "@/components/layout/signed-in-navbar-chrome";
import { routes } from "@/lib/routes";

type Translate = ReturnType<typeof useTranslations<"nav">>;

/**
 * Client navigation architecture: projects (what is posted, and finding
 * companies for it), manage work (contracts) and marketplace Messages. Built
 * from existing routes only, so the menu never points at a missing page.
 */
export function buildClientNav(t: Translate, onboarded: boolean) {
  // Until onboarding completes, workspace destinations funnel to onboarding.
  const gated = <T extends string>(href: T) => (onboarded ? href : routes.clientOnboarding);

  const items: NavbarItem[] = [
    {
      kind: "group",
      id: "projects",
      label: t("client.projects"),
      sections: [
        {
          heading: t("client.manageHeading"),
          items: [
            // A project and its Batiplus support page belong to "My projects".
            { href: gated(routes.clientDashboard), label: t("myProjects"), match: [routes.clientDashboard, routes.clientProject] },
            // Shares the page with "Your contracts"; only Manage work lights up there.
            { href: gated(routes.clientWork), label: t("client.allProjects"), match: [] },
          ],
        },
        {
          heading: t("client.companies"),
          items: [
            { href: gated(routes.postProjectWizard), label: t("postProject"), match: [routes.postProjectWizard] },
            { href: routes.companies, label: t("client.browseCompanies"), match: [routes.companies] },
          ],
        },
      ],
    },
    {
      kind: "group",
      id: "manage-work",
      label: t("client.manageWork"),
      sections: [
        {
          heading: t("client.workHeading"),
          items: [
            { href: gated(routes.clientWork), label: t("client.contracts"), query: { tab: "contracts" }, match: [routes.clientWork] },
          ],
        },
      ],
    },
    { href: routes.messages, label: t("messages"), match: [routes.messages] },
  ];

  return items;
}
