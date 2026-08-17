export const routes = { home: "/", about: "/a-propos/", services: "/nos-services/", structuralWork: "/gros-oeuvre/", finishingWork: "/second-oeuvre/", projects: "/nos-realisations/", contact: "/contactez-nous/", helloWorld: "/hello-world/", constructionTrends2025: "/les-nouvelles-tendances-dans-la-construction-en-2025/", categoryGeneral: "/category/general/", categoryStructuralWork: "/category/gros-oeuvre/" } as const;
export type ProtectedRoute = (typeof routes)[keyof typeof routes];
export const protectedRoutes = Object.values(routes);
