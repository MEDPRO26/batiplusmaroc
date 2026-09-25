import { defineRouting } from "next-intl/routing";

export const locales = ["fr", "en"] as const;
export type AppLocale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "fr",
  localePrefix: "always",
  localeDetection: false,
  pathnames: {
    "/": "/",
    "/a-propos": {
      fr: "/a-propos",
      en: "/about",
    },
    "/nos-services": {
      fr: "/nos-services",
      en: "/services",
    },
    "/gros-oeuvre": {
      fr: "/gros-oeuvre",
      en: "/structural-work",
    },
    "/second-oeuvre": {
      fr: "/second-oeuvre",
      en: "/finishing-work",
    },
    "/nos-realisations": {
      fr: "/nos-realisations",
      en: "/projects",
    },
    "/nos-realisations/[slug]": {
      fr: "/nos-realisations/[slug]",
      en: "/projects/[slug]",
    },
    "/contactez-nous": {
      fr: "/contactez-nous",
      en: "/contact",
    },
    "/terms": "/terms",
    "/privacy": "/privacy",
    "/hello-world": {
      fr: "/hello-world",
      en: "/hello-world",
    },
    "/les-nouvelles-tendances-dans-la-construction-en-2025": {
      fr: "/les-nouvelles-tendances-dans-la-construction-en-2025",
      en: "/new-construction-trends-2025",
    },
    "/comment-bien-preparer-son-budget-de-construction": {
      fr: "/comment-bien-preparer-son-budget-de-construction",
      en: "/how-to-plan-a-construction-budget",
    },
    "/comment-choisir-les-bons-materiaux-pour-votre-maison": {
      fr: "/comment-choisir-les-bons-materiaux-pour-votre-maison",
      en: "/how-to-choose-the-right-materials",
    },
    "/category/general": {
      fr: "/category/general",
      en: "/category/general",
    },
    "/category/gros-oeuvre": {
      fr: "/category/gros-oeuvre",
      en: "/category/structural-work",
    },
    "/comment-ca-marche": {
      fr: "/comment-ca-marche",
      en: "/how-it-works",
    },
    "/entreprises": {
      fr: "/entreprises",
      en: "/companies",
    },
    "/entreprises/[slug]": {
      fr: "/entreprises/[slug]",
      en: "/companies/[slug]",
    },
    "/projets": {
      fr: "/projets",
      en: "/browse-projects",
    },
    "/publier-un-projet": {
      fr: "/publier-un-projet",
      en: "/post-a-project",
    },
    "/connexion": {
      fr: "/connexion",
      en: "/sign-in",
    },
    "/inscription": {
      fr: "/inscription",
      en: "/sign-up",
    },
    "/inscription/client": {
      fr: "/inscription/client",
      en: "/sign-up/client",
    },
    "/inscription/entreprise": {
      fr: "/inscription/entreprise",
      en: "/sign-up/company",
    },
    "/espace-client": {
      fr: "/espace-client",
      en: "/client",
    },
    "/espace-client/tableau-de-bord": {
      fr: "/espace-client/tableau-de-bord",
      en: "/client/dashboard",
    },
    "/espace-client/projets/nouveau": {
      fr: "/espace-client/projets/nouveau",
      en: "/client/projects/new",
    },
    "/espace-client/projets/[projectId]": {
      fr: "/espace-client/projets/[projectId]",
      en: "/client/projects/[projectId]",
    },
    "/espace-client/onboarding": {
      fr: "/espace-client/onboarding",
      en: "/client/onboarding",
    },
    "/espace-client/profil": {
      fr: "/espace-client/profil",
      en: "/client/profile",
    },
    "/espace-entreprise": {
      fr: "/espace-entreprise",
      en: "/company",
    },
    "/espace-entreprise/projets": {
      fr: "/espace-entreprise/projets",
      en: "/company/projects",
    },
    "/espace-entreprise/projets/[projectId]": {
      fr: "/espace-entreprise/projets/[projectId]",
      en: "/company/projects/[projectId]",
    },
    "/espace-entreprise/projets/[projectId]/devis": {
      fr: "/espace-entreprise/projets/[projectId]/devis",
      en: "/company/projects/[projectId]/quote",
    },
    "/espace-entreprise/profil": {
      fr: "/espace-entreprise/profil",
      en: "/company/profile",
    },
    "/espace-entreprise/onboarding": {
      fr: "/espace-entreprise/onboarding",
      en: "/company/onboarding",
    },
    "/espace-entreprise/verification": {
      fr: "/espace-entreprise/verification",
      en: "/company/verification",
    },
    "/espace-entreprise/portfolio": {
      fr: "/espace-entreprise/portfolio",
      en: "/company/portfolio",
    },
    "/admin": "/admin",
    "/admin/projects": {
      fr: "/admin/projets",
      en: "/admin/projects",
    },
    "/admin/site-visits": {
      fr: "/admin/visites-techniques",
      en: "/admin/site-visits",
    },
    "/admin/verification": {
      fr: "/admin/verification",
      en: "/admin/verification",
    },
    "/seo": "/seo",
    "/seo/dashboard": "/seo/dashboard",
    "/seo/articles": "/seo/articles",
    "/seo/articles/new": {
      fr: "/seo/articles/nouveau",
      en: "/seo/articles/new",
    },
    "/seo/articles/[articleId]": "/seo/articles/[articleId]",
    "/seo/media": "/seo/media",
    "/seo/pages": "/seo/pages",
    "/seo/pillars": "/seo/pillars",
    "/seo/clusters": "/seo/clusters",
    "/seo/briefs": {
      fr: "/seo/briefs-seo",
      en: "/seo/seo-briefs",
    },
    "/messages": "/messages",
    "/messages/[conversationId]": "/messages/[conversationId]",
    "/notifications": "/notifications",
  },
});
