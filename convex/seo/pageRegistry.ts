import { ConvexError } from "convex/values";

export const SEO_PAGE_REGISTRY = [
  { pageKey: "homepage", nameKey: "homepage", paths: { fr: "/fr", en: "/en" }, critical: true },
  { pageKey: "companies-directory", nameKey: "companiesDirectory", paths: { fr: "/fr/entreprises", en: "/en/companies" }, critical: false },
  { pageKey: "projects-directory", nameKey: "projectsDirectory", paths: { fr: "/fr/projets", en: "/en/browse-projects" }, critical: false },
  { pageKey: "realisations-index", nameKey: "realisationsIndex", paths: { fr: "/fr/nos-realisations", en: "/en/projects" }, critical: false },
  { pageKey: "services-index", nameKey: "servicesIndex", paths: { fr: "/fr/nos-services", en: "/en/services" }, critical: false },
  { pageKey: "service:gros-oeuvre", nameKey: "structuralWork", paths: { fr: "/fr/gros-oeuvre", en: "/en/structural-work" }, critical: false },
  { pageKey: "service:second-oeuvre", nameKey: "finishingWork", paths: { fr: "/fr/second-oeuvre", en: "/en/finishing-work" }, critical: false },
  { pageKey: "about", nameKey: "about", paths: { fr: "/fr/a-propos", en: "/en/about" }, critical: false },
  { pageKey: "contact", nameKey: "contact", paths: { fr: "/fr/contactez-nous", en: "/en/contact" }, critical: false },
] as const;

export type SeoPageKey = (typeof SEO_PAGE_REGISTRY)[number]["pageKey"];

export function findApprovedPage(value: string) {
  const key = value.trim().toLowerCase();
  return SEO_PAGE_REGISTRY.find((page) => page.pageKey === key) ?? null;
}

export function requireApprovedPage(value: string) {
  const page = findApprovedPage(value);
  if (!page) throw new ConvexError("SEO_PAGE_NOT_APPROVED");
  return page;
}
