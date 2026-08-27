import type { MetadataRoute } from "next";
import { routes, type ProtectedRoute } from "@/lib/routes";
import { absoluteUrl } from "@/lib/seo";
import { projects, projectPath } from "@/content/projects";

type SitemapPage = {
  path: ProtectedRoute;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
};

const sitemapPages: SitemapPage[] = [
  { path: routes.home, changeFrequency: "weekly", priority: 1 },
  { path: routes.services, changeFrequency: "monthly", priority: 0.9 },
  { path: routes.structuralWork, changeFrequency: "monthly", priority: 0.9 },
  { path: routes.finishingWork, changeFrequency: "monthly", priority: 0.9 },
  { path: routes.projects, changeFrequency: "monthly", priority: 0.9 },
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
  const pages = sitemapPages.map(({ path, ...metadata }) => ({
    url: absoluteUrl(path),
    ...metadata,
  }));

  const projectPages = projects.map((project) => ({
    url: new URL(projectPath(project.slug), "https://batiplusmaroc.com").toString(),
    changeFrequency: "yearly" as const,
    priority: 0.8,
  }));

  return [...pages, ...projectPages];
}
