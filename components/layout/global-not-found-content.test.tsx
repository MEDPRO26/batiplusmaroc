import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalNotFoundContent, type GlobalNotFoundCopies } from "./global-not-found-content";

const navigation = vi.hoisted(() => ({ pathname: "/en/missing" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("next/font/google", () => ({
  Outfit: () => ({ className: "font-outfit" }),
}));

vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ href, locale }: { href: string; locale: "en" | "fr" }) => {
    const paths: Record<string, { en: string; fr: string }> = {
      "/": { en: "", fr: "" },
      "/entreprises": { en: "/companies", fr: "/entreprises" },
      "/nos-services": { en: "/services", fr: "/nos-services" },
      "/nos-realisations": { en: "/projects", fr: "/nos-realisations" },
      "/contactez-nous": { en: "/contact", fr: "/contactez-nous" },
    };
    return `/${locale}${paths[href][locale]}`;
  },
}));

const copies: GlobalNotFoundCopies = {
  en: {
    kicker: "Navigation error · Page not found",
    eyebrow: "Page not found",
    title: "This page is not on the plan.",
    description: "The address may be incorrect.",
    actionsLabel: "Ways to continue",
    home: "Back to home",
    browseCompanies: "Find companies",
    contact: "Contact us",
    services: "Our services",
    projects: "Our work",
    brandName: "Batiplus",
    brandHomeAria: "Batiplus — Home",
    languageLabel: "Language",
    languageFr: "FR",
    languageEn: "EN",
  },
  fr: {
    kicker: "Erreur de navigation · Page introuvable",
    eyebrow: "Page non trouvée",
    title: "Cette page n’est pas sur le plan.",
    description: "L’adresse est peut-être incorrecte.",
    actionsLabel: "Options pour continuer",
    home: "Retour à l’accueil",
    browseCompanies: "Trouver des entreprises",
    contact: "Nous contacter",
    services: "Nos services",
    projects: "Nos réalisations",
    brandName: "Batiplus",
    brandHomeAria: "Batiplus — Accueil",
    languageLabel: "Langue",
    languageFr: "FR",
    languageEn: "EN",
  },
};

describe("GlobalNotFoundContent", () => {
  beforeEach(() => {
    navigation.pathname = "/en/missing";
  });

  it("renders English recovery actions for an English URL", () => {
    const html = renderToStaticMarkup(
      <GlobalNotFoundContent copies={copies} fontClassName="font-test" />,
    );

    expect(html).toContain('<html lang="en"');
    expect(html).toContain("This page is not on the plan.");
    expect(html).toContain("Find companies");
    expect(html).toContain("/en/companies");
  });

  it("renders French recovery actions for a French URL", () => {
    navigation.pathname = "/fr/introuvable";
    const html = renderToStaticMarkup(
      <GlobalNotFoundContent copies={copies} fontClassName="font-test" />,
    );

    expect(html).toContain('<html lang="fr-FR"');
    expect(html).toContain("Cette page n’est pas sur le plan.");
    expect(html).toContain("Trouver des entreprises");
    expect(html).toContain("/fr/entreprises");
  });
});
