import type { Metadata } from "next";

import { CeilingsLighting } from "@/components/second-oeuvre/ceilings-lighting";
import { FinishingPortfolio } from "@/components/second-oeuvre/finishing-portfolio";
import { FinishingQuality } from "@/components/second-oeuvre/finishing-quality";
import { InteriorFinishes } from "@/components/second-oeuvre/interior-finishes";
import { JoineryCirculation } from "@/components/second-oeuvre/joinery-circulation";
import { LegacyProjects } from "@/components/second-oeuvre/legacy-projects";
import { SecondOeuvreCta } from "@/components/second-oeuvre/second-oeuvre-cta";
import { SecondOeuvreHero } from "@/components/second-oeuvre/second-oeuvre-hero";
import { SecondOeuvreIntro } from "@/components/second-oeuvre/second-oeuvre-intro";
import { SecondOeuvreServices } from "@/components/second-oeuvre/second-oeuvre-services";
import { TechnicalInstallations } from "@/components/second-oeuvre/technical-installations";
import { JsonLd } from "@/components/seo/json-ld";
import { routes } from "@/lib/routes";
import { createMetadata, SITE_URL } from "@/lib/seo";

const title = "Second Œuvre à Agadir – rénovation & finitions Pro";
const description = "Travaux de second œuvre à Agadir : électricité, plomberie, peinture, carrelage. Des finitions de qualité pour vos projets résidentiels .";
const canonical = `${SITE_URL}${routes.finishingWork}`;

export const metadata: Metadata = {
  ...createMetadata({
    path: routes.finishingWork,
    title,
    description,
    robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  }),
  openGraph: {
    locale: "fr_FR",
    type: "article",
    title,
    description,
    url: canonical,
    siteName: "batiplusmaroc.com",
  },
  twitter: { card: "summary_large_image" },
  other: {
    "twitter:label1": "Durée de lecture estimée",
    "twitter:data1": "3 minutes",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": canonical,
      url: canonical,
      name: title,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      datePublished: "2025-05-10T17:24:36+00:00",
      dateModified: "2025-08-28T08:42:36+00:00",
      description,
      breadcrumb: { "@id": `${canonical}#breadcrumb` },
      inLanguage: "fr-FR",
      potentialAction: [{ "@type": "ReadAction", target: [canonical] }],
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${canonical}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Second oeuvre" },
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: "batiplusmaroc.com",
      description: "",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: [
        {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/?s={search_term_string}` },
          "query-input": { "@type": "PropertyValueSpecification", valueRequired: true, valueName: "search_term_string" },
        },
      ],
      inLanguage: "fr-FR",
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "batiplusmaroc.com",
      url: `${SITE_URL}/`,
      logo: {
        "@type": "ImageObject",
        inLanguage: "fr-FR",
        "@id": `${SITE_URL}/#/schema/logo/image/`,
        url: `${SITE_URL}/brand/s2mbou-logo.webp`,
        contentUrl: `${SITE_URL}/brand/s2mbou-logo.webp`,
        width: 153,
        height: 40,
        caption: "batiplusmaroc.com",
      },
      image: { "@id": `${SITE_URL}/#/schema/logo/image/` },
      sameAs: ["https://www.facebook.com/sgta.btp", "https://share.google/j5BiBjLTGpFdjD3f8"],
    },
  ],
};

export default function SecondOeuvrePage() {
  return (
    <>
      <JsonLd data={structuredData} />
      <SecondOeuvreHero />
      <SecondOeuvreIntro />
      <SecondOeuvreServices />
      <InteriorFinishes />
      <TechnicalInstallations />
      <CeilingsLighting />
      <JoineryCirculation />
      <FinishingPortfolio />
      <LegacyProjects />
      <FinishingQuality />
      <SecondOeuvreCta />
    </>
  );
}
