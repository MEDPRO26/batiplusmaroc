import { routes, type ProtectedRoute } from "@/lib/routes";
type NavigationItem = { label: string; href: ProtectedRoute };
export const primaryNavigation: NavigationItem[] = [
  { label: "Accueil", href: routes.home },
  { label: "À propos", href: routes.about },
  { label: "Réalisations", href: routes.projects },
  { label: "Blog", href: routes.categoryGeneral },
  { label: "Contact", href: routes.contact },
];
export const serviceNavigation: NavigationItem[] = [{ label: "Gros œuvre", href: routes.structuralWork }, { label: "Second œuvre", href: routes.finishingWork }];
export const footerNavigation: NavigationItem[] = [
  { label: "À propos", href: routes.about },
  { label: "Nos services", href: routes.services },
  { label: "Nos réalisations", href: routes.projects },
  { label: "Conseils & actualités", href: routes.categoryGeneral },
  { label: "Contactez-nous", href: routes.contact },
];
