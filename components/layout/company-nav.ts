import type { useTranslations } from "next-intl";
import type { NavbarItem, NavbarLink } from "@/components/layout/signed-in-navbar-chrome";
import { routes } from "@/lib/routes";

type Translate = ReturnType<typeof useTranslations<"nav">>;

/**
 * Company navigation architecture: acquisition (find work), delivery (manage
 * work), money (finances), marketplace Messages, and Batiplus operations. Built from existing routes only, so the
 * menu never points at a page that does not exist.
 */
export function buildCompanyNav(t: Translate, onboarded: boolean) {
  // Until onboarding completes, every workspace destination funnels to onboarding.
  const gated = <T extends NavbarLink["href"]>(href: T) => (onboarded ? href : routes.companyOnboarding);

  const items: NavbarItem[] = [
    {
      kind: "group",
      id: "find-work",
      label: t("company.findWork"),
      sections: [
        {
          items: [
            {
              href: routes.companyProjects,
              label: t("company.findProjects"),
              match: [routes.companyProjects],
              // The company home is the project feed.
              exact: [routes.companyDashboard],
            },
            { href: gated(routes.companyProposals), label: t("company.proposals"), match: [routes.companyProposals] },
            { href: routes.companyInvitations, label: t("company.invitations"), match: [routes.companyInvitations] },
          ],
        },
        {
          heading: t("company.growPresence"),
          items: [
            {
              href: gated(routes.companyProfileManagement),
              label: t("company.companyProfile"),
              match: [routes.companyProfileManagement],
            },
            { href: gated(routes.companyPortfolio), label: t("company.portfolio"), match: [routes.companyPortfolio] },
          ],
        },
      ],
    },
    {
      kind: "group",
      id: "manage-work",
      label: t("company.manageWork"),
      sections: [
        {
          items: [
            { href: gated(routes.companyWork), label: t("company.activeProjects"), match: [routes.companyWork] },
            {
              href: gated(routes.companyWork),
              label: t("company.projectHistory"),
              query: { view: "history" },
              // Shares the page with Active projects; the group still lights up.
              match: [],
            },
          ],
        },
      ],
    },
    {
      kind: "group",
      id: "finances",
      label: t("company.finances"),
      sections: [
        {
          items: [
            { href: routes.companyCommissions, label: t("company.commissions"), match: [routes.companyCommissions] },
          ],
        },
      ],
    },
    { href: routes.messages, label: t("messages"), match: [routes.messages] },
    { href: routes.companyBatiplus, label: t("company.batiplus"), match: [routes.companyBatiplus] },
  ];

  return items;
}
