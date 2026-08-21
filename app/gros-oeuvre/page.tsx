import type { Metadata } from "next";

import { AlFarahCaseStudy } from "@/components/gros-oeuvre/al-farah-case-study";
import { AlHudaProgression } from "@/components/gros-oeuvre/al-huda-progression";
import { ExecutionProcess } from "@/components/gros-oeuvre/execution-process";
import { GrosOeuvreCta } from "@/components/gros-oeuvre/gros-oeuvre-cta";
import { GrosOeuvreHero } from "@/components/gros-oeuvre/gros-oeuvre-hero";
import { GrosOeuvreIntro } from "@/components/gros-oeuvre/gros-oeuvre-intro";
import { LegacyProjects } from "@/components/gros-oeuvre/legacy-projects";
import { ProjectTypes } from "@/components/gros-oeuvre/project-types";
import { StructuralExpertise } from "@/components/gros-oeuvre/structural-expertise";
import { JsonLd } from "@/components/seo/json-ld";
import { routes } from "@/lib/routes";
import { createMetadata, SITE_URL } from "@/lib/seo";

const title = "Gros Œuvre à Agadir – construction & maçonnerie pro";
const description = "Travaux de gros œuvre à Agadir : fondations, maçonnerie. Expertise et qualité pour vos projets de construction résidentiels et professionnels";
const canonical = `${SITE_URL}${routes.structuralWork}`;

export const metadata: Metadata = {
  ...createMetadata({
    path: routes.structuralWork,
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
    "twitter:data1": "2 minutes",
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
      datePublished: "2025-05-10T17:24:06+00:00",
      dateModified: "2025-08-28T08:41:51+00:00",
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
        { "@type": "ListItem", position: 2, name: "Gros oeuvre" },
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

export default function GrosOeuvrePage() {
  return (
    <>
      <JsonLd data={structuredData} />
      <GrosOeuvreHero />
      <GrosOeuvreIntro />
      <StructuralExpertise />
      <AlHudaProgression />
      <AlFarahCaseStudy />
      <ProjectTypes />
      <LegacyProjects />
      <ExecutionProcess />
      <GrosOeuvreCta />
    </>
  );
}
