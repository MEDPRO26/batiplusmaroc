import { routes } from "@/lib/routes";

export const services = [
  { number: "01", title: "Gros œuvre", description: "Fondations, maçonnerie et structure pour donner à chaque projet une base solide.", cta: "Découvrir le gros œuvre", href: routes.structuralWork, image: "/images/about-project.jpg", alt: "Poste de travail face à un chantier en construction", caption: "Structure", imagePosition: "object-[58%_center]" },
  { number: "02", title: "Second œuvre", description: "Électricité, plomberie, revêtements, menuiserie, peinture et finitions intérieures.", cta: "Découvrir le second œuvre", href: routes.finishingWork, image: "/images/service-construction.png", alt: "Responsable supervisant des engins sur un chantier", caption: "Finitions", imagePosition: "object-center" },
  { number: "03", title: "Construction & aménagement", description: "Des solutions coordonnées pour vos projets de construction et d’aménagement intérieur ou extérieur.", cta: "Voir nos services", href: routes.services, image: "/images/hero-amenagement.png", alt: "Équipe examinant les plans d’un projet de construction", caption: "Aménagement", imagePosition: "object-center" },
] as const;
