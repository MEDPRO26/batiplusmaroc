import { routes, type ProtectedRoute } from "@/lib/routes";
type NavigationItem = { label: string; href: ProtectedRoute };
export const primaryNavigation: NavigationItem[] = [{ label: "Accueil", href: routes.home }, { label: "À propos", href: routes.about }, { label: "Services", href: routes.services }, { label: "Réalisations", href: routes.projects }, { label: "Contact", href: routes.contact }];
export const serviceNavigation: NavigationItem[] = [{ label: "Gros œuvre", href: routes.structuralWork }, { label: "Second œuvre", href: routes.finishingWork }];
export const footerNavigation = primaryNavigation.slice(1);
