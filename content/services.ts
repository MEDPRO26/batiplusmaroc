import { routes } from "@/lib/routes";

export const services = [
  { id: "structural", number: "01", href: routes.structuralWork, image: "/images/about-project.jpg", imagePosition: "object-[58%_center]" },
  { id: "finishing", number: "02", href: routes.finishingWork, image: "/images/service-construction.png", imagePosition: "object-center" },
  { id: "fitout", number: "03", href: routes.services, image: "/images/hero-amenagement.png", imagePosition: "object-center" },
] as const;
