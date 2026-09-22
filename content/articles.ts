import { routes } from "@/lib/routes";

export const articles = [
  {
    id: "trends2025",
    href: routes.constructionTrends2025,
    categoryHref: routes.categoryGeneral,
    image: "/images/blog/trends-2025.webp",
    publishedIso: "2025-05-07",
  },
  {
    id: "budget",
    href: routes.constructionBudget,
    categoryHref: routes.categoryGeneral,
    image: "/images/blog/budget.webp",
    publishedIso: "2025-05-07",
  },
  {
    id: "materials",
    href: routes.constructionMaterials,
    categoryHref: routes.categoryStructuralWork,
    image: "/images/blog/materials.webp",
    publishedIso: "2025-05-07",
  },
  {
    id: "custom",
    href: routes.helloWorld,
    categoryHref: routes.categoryStructuralWork,
    image: "/images/blog/custom.webp",
    publishedIso: "2025-04-20",
  },
] as const;
