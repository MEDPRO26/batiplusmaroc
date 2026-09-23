export const routes = {
  home: "/",
  about: "/a-propos",
  services: "/nos-services",
  structuralWork: "/gros-oeuvre",
  finishingWork: "/second-oeuvre",
  projects: "/nos-realisations",
  contact: "/contactez-nous",
  terms: "/terms",
  privacy: "/privacy",
  helloWorld: "/hello-world",
  constructionTrends2025: "/les-nouvelles-tendances-dans-la-construction-en-2025",
  constructionBudget: "/comment-bien-preparer-son-budget-de-construction",
  constructionMaterials: "/comment-choisir-les-bons-materiaux-pour-votre-maison",
  categoryGeneral: "/category/general",
  categoryStructuralWork: "/category/gros-oeuvre",
  howItWorks: "/comment-ca-marche",
  companies: "/entreprises",
  browseProjects: "/projets",
  postProject: "/publier-un-projet",
  signIn: "/connexion",
  signUp: "/inscription",
  signUpClient: "/inscription/client",
  signUpCompany: "/inscription/entreprise",
  clientRoot: "/espace-client",
  clientDashboard: "/espace-client/tableau-de-bord",
  clientProfile: "/espace-client/profil",
  postProjectWizard: "/espace-client/projets/nouveau",
  clientProject: "/espace-client/projets/[projectId]",
  companyDashboard: "/espace-entreprise",
  companyProjects: "/espace-entreprise/projets",
  companyProject: "/espace-entreprise/projets/[projectId]",
  companyInitialQuote: "/espace-entreprise/projets/[projectId]/devis",
  companyProfileManagement: "/espace-entreprise/profil",
  clientOnboarding: "/espace-client/onboarding",
  companyOnboarding: "/espace-entreprise/onboarding",
  companyVerification: "/espace-entreprise/verification",
  companyPortfolio: "/espace-entreprise/portfolio",
  admin: "/admin",
  adminProjects: "/admin/projects",
  adminVerification: "/admin/verification",
  messages: "/messages",
  notifications: "/notifications",
} as const;

export type AppRoute = Exclude<
  (typeof routes)[keyof typeof routes],
  typeof routes.clientProject | typeof routes.companyProject | typeof routes.companyInitialQuote
>;
export type DynamicAppRoute =
  | typeof routes.clientProject
  | typeof routes.companyProject
  | typeof routes.companyInitialQuote;
export type ProtectedRoute = AppRoute;
