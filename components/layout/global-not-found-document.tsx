import localFont from "next/font/local";
import { GlobalNotFoundContent, type GlobalNotFoundCopies } from "@/components/layout/global-not-found-content";
import enMessages from "@/messages/en.json";
import frMessages from "@/messages/fr.json";

const siteSans = localFont({
  src: "../../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
  variable: "--font-site-sans",
  display: "swap",
});

const copies: GlobalNotFoundCopies = {
  en: {
    ...enMessages.notFound,
    brandName: enMessages.brand.name,
    brandHomeAria: enMessages.brand.homeAria,
    languageLabel: enMessages.language.label,
    languageFr: enMessages.language.fr,
    languageEn: enMessages.language.en,
  },
  fr: {
    ...frMessages.notFound,
    brandName: frMessages.brand.name,
    brandHomeAria: frMessages.brand.homeAria,
    languageLabel: frMessages.language.label,
    languageFr: frMessages.language.fr,
    languageEn: frMessages.language.en,
  },
};

export function GlobalNotFoundDocument() {
  return <GlobalNotFoundContent copies={copies} fontClassName={siteSans.variable} />;
}
