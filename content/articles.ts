import { routes } from "@/lib/routes";

export const articles = [
  { title: "Les nouvelles tendances dans la construction en 2025", href: routes.constructionTrends2025, category: "Général" },
  { title: "Comment bien préparer son budget de construction ?", href: routes.constructionBudget, category: "Général" },
  { title: "Comment choisir les bons matériaux pour votre maison ?", href: routes.constructionMaterials, category: "Gros œuvre" },
  { title: "Construction sur-mesure : quels avantages pour votre projet ?", href: routes.helloWorld, category: "Gros œuvre" },
] as const;
