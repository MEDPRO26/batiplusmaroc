import type { Metadata } from "next";

import { CapabilityGallery } from "@/components/services-page/capability-gallery";
import { GrosOeuvreFeature } from "@/components/services-page/gros-oeuvre-feature";
import { SecondOeuvreFeature } from "@/components/services-page/second-oeuvre-feature";
import { ServiceProcess } from "@/components/services-page/service-process";
import { ServiceProjectProof } from "@/components/services-page/service-project-proof";
import { ServicesBento } from "@/components/services-page/services-bento";
import { ServicesCta } from "@/components/services-page/services-cta";
import { ServicesHero } from "@/components/services-page/services-hero";
import { ServicesIntro } from "@/components/services-page/services-intro";
import { JsonLd } from "@/components/seo/json-ld";
import { routes } from "@/lib/routes";
import { createMetadata, SITE_URL } from "@/lib/seo";

const title = "Nos services - batiplusmaroc.com";
const canonical = `${SITE_URL}${routes.services}`;

export const metadata: Metadata = {
  ...createMetadata({
    path: routes.services,
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
      datePublished: "2025-05-01T16:55:51+00:00",
      dateModified: "2025-05-07T14:09:07+00:00",
      breadcrumb: { "@id": `${canonical}#breadcrumb` },
      inLanguage: "fr-FR",
      potentialAction: [{ "@type": "ReadAction", target: [canonical] }],
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${canonical}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Nos services" },
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

export default function ServicesPage() {
  return (
    <>
      <JsonLd data={structuredData} />
      <ServicesHero />
      <ServicesIntro />
      <ServicesBento />
      <GrosOeuvreFeature />
      <SecondOeuvreFeature />
      <CapabilityGallery />
      <ServiceProcess />
      <ServiceProjectProof />
      <ServicesCta />
    </>
  );
}
