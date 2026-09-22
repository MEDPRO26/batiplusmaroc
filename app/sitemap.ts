import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { routes, type AppRoute } from "@/lib/routes";
import { languageAlternates, localizedUrl } from "@/lib/i18n-seo";
import { projects } from "@/content/projects";

const sitemapPages: { path: AppRoute; changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>; priority: number }[] = [
  { path: routes.home, changeFrequency: "weekly", priority: 1 },
  { path: routes.services, changeFrequency: "monthly", priority: 0.9 },
  { path: routes.structuralWork, changeFrequency: "monthly", priority: 0.9 },
  { path: routes.finishingWork, changeFrequency: "monthly", priority: 0.9 },
  { path: routes.projects, changeFrequency: "monthly", priority: 0.9 },
  { path: routes.howItWorks, changeFrequency: "monthly", priority: 0.8 },
  { path: routes.about, changeFrequency: "yearly", priority: 0.7 },
  { path: routes.contact, changeFrequency: "yearly", priority: 0.7 },
  { path: routes.categoryGeneral, changeFrequency: "weekly", priority: 0.7 },
  { path: routes.categoryStructuralWork, changeFrequency: "weekly", priority: 0.7 },
  { path: routes.constructionTrends2025, changeFrequency: "yearly", priority: 0.6 },
  { path: routes.constructionBudget, changeFrequency: "yearly", priority: 0.6 },
  { path: routes.constructionMaterials, changeFrequency: "yearly", priority: 0.6 },
  { path: routes.helloWorld, changeFrequency: "yearly", priority: 0.6 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = sitemapPages.flatMap(({ path, changeFrequency, priority }) =>
    routing.locales.map((locale) => ({
      url: localizedUrl(locale, path),
      changeFrequency,
      priority,
      alternates: {
        languages: languageAlternates(path),
      },
    })),
  );

  const projectPages = projects.flatMap((project) =>
    routing.locales.map((locale) => ({
      url: localizedUrl(locale, "/nos-realisations/[slug]", { slug: project.slug }),
      changeFrequency: "yearly" as const,
      priority: 0.8,
      alternates: {
        languages: languageAlternates("/nos-realisations/[slug]", { slug: project.slug }),
      },
    })),
  );

  return [...pages, ...projectPages];
}
