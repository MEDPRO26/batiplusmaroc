import { routes } from "@/lib/routes";
import type { AppRoute } from "@/lib/routes";

export const marketplaceNavItems: {
  href: AppRoute;
  labelKey: "findCompanies" | "findProjects" | "projects" | "howItWorks";
  hash?: string;
}[] = [
  { href: routes.companies, labelKey: "findCompanies" },
  { href: routes.browseProjects, labelKey: "findProjects" },
  { href: routes.projects, labelKey: "projects" },
  { href: routes.howItWorks, labelKey: "howItWorks" },
];

export const footerColumns = [
  {
    key: "clients",
    links: [
      { href: routes.postProject, labelKey: "postProject" },
      { href: routes.companies, labelKey: "findCompany" },
      { href: routes.services, labelKey: "services" },
      { href: routes.contact, labelKey: "contact" },
    ],
  },
  {
    key: "companies",
    links: [
      { href: routes.browseProjects, labelKey: "browseProjects" },
      { href: routes.signUp, labelKey: "signUp" },
      { href: routes.signIn, labelKey: "signIn" },
      { href: routes.contact, labelKey: "contact" },
    ],
  },
  {
    key: "resources",
    links: [
      { href: routes.categoryGeneral, labelKey: "blog" },
      { href: routes.categoryStructuralWork, labelKey: "structural" },
      { href: routes.projects, labelKey: "projects" },
      { href: routes.howItWorks, labelKey: "howItWorks" },
    ],
  },
  {
    key: "company",
    links: [
      { href: routes.about, labelKey: "about" },
      { href: routes.contact, labelKey: "contact" },
      { href: routes.services, labelKey: "services" },
      { href: routes.signIn, labelKey: "signIn" },
    ],
  },
] as const;

export const footerSocial = [
  { key: "facebook", href: "https://www.facebook.com/sgta.btp" },
] as const;
