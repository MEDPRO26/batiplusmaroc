import type { Metadata } from "next";

import { AboutCta } from "@/components/about/about-cta";
import { AboutHero } from "@/components/about/about-hero";
import { AboutWhyUs } from "@/components/about/about-why-us";
import { CapabilitiesGallery } from "@/components/about/capabilities-gallery";
import { CompanyIntro } from "@/components/about/company-intro";
import { CoreActivities } from "@/components/about/core-activities";
import { ProjectProgression } from "@/components/about/project-progression";
import { JsonLd } from "@/components/seo/json-ld";
import { routes } from "@/lib/routes";
import { createMetadata, SITE_URL } from "@/lib/seo";

const title = "À propos - batiplusmaroc.com";
const canonical = `${SITE_URL}${routes.about}`;

export const metadata: Metadata = {
  ...createMetadata({
    path: routes.about,
    title,
    robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  }),
  openGraph: {
    locale: "fr_FR",
    type: "article",
    title,
    url: canonical,
    siteName: "batiplusmaroc.com",
  },
  twitter: { card: "summary_large_image" },
  other: {
    "twitter:label1": "Durée de lecture estimée",
    "twitter:data1": "22 minutes",
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
      datePublished: "2025-05-01T16:57:41+00:00",
      dateModified: "2025-08-28T08:41:07+00:00",
      breadcrumb: { "@id": `${canonical}#breadcrumb` },
      inLanguage: "fr-FR",
      potentialAction: [{ "@type": "ReadAction", target: [canonical] }],
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${canonical}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "À propos" },
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

export default function AboutPage() {
  return (
    <>
      <JsonLd data={structuredData} />
      <AboutHero />
      <CompanyIntro />
      <CoreActivities />
      <ProjectProgression />
      <CapabilitiesGallery />
      <AboutWhyUs />
      <AboutCta />
    </>
  );
}
