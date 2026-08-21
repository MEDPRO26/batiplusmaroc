export const routes = {
  home: "/",
  about: "/a-propos/",
  services: "/nos-services/",
  structuralWork: "/gros-oeuvre/",
  finishingWork: "/second-oeuvre/",
  projects: "/nos-realisations/",
  contact: "/contactez-nous/",
  helloWorld: "/hello-world/",
  constructionTrends2025: "/les-nouvelles-tendances-dans-la-construction-en-2025/",
  constructionBudget: "/comment-bien-preparer-son-budget-de-construction/",
  constructionMaterials: "/comment-choisir-les-bons-materiaux-pour-votre-maison/",
  categoryGeneral: "/category/general/",
  categoryStructuralWork: "/category/gros-oeuvre/",
} as const;
export type ProtectedRoute = (typeof routes)[keyof typeof routes];
export const protectedRoutes = Object.values(routes);
