import type { Metadata } from "next";

import { AlFarahProject } from "@/components/portfolio/al-farah-project";
import { AlHudaProgression } from "@/components/portfolio/al-huda-progression";
import { AlHudaProject } from "@/components/portfolio/al-huda-project";
import { ExteriorPortfolio } from "@/components/portfolio/exterior-portfolio";
import { InteriorPortfolio } from "@/components/portfolio/interior-portfolio";
import { LegacyProjects } from "@/components/portfolio/legacy-projects";
import { PortfolioCta } from "@/components/portfolio/portfolio-cta";
import { PortfolioHero } from "@/components/portfolio/portfolio-hero";
import { PortfolioIntro } from "@/components/portfolio/portfolio-intro";
import { VillaFountyProject } from "@/components/portfolio/villa-founty-project";
import { JsonLd } from "@/components/seo/json-ld";
import { routes } from "@/lib/routes";
import { createMetadata, SITE_URL } from "@/lib/seo";

const title = "Nos réalisations - batiplusmaroc.com";
const canonical = `${SITE_URL}${routes.projects}`;

export const metadata: Metadata = {
  ...createMetadata({
    path: routes.projects,
    title,
    robots:
      "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
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
    "twitter:data1": "5 minutes",
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
      datePublished: "2025-05-01T17:01:19+00:00",
      dateModified: "2025-08-28T08:43:13+00:00",
      breadcrumb: { "@id": `${canonical}#breadcrumb` },
      inLanguage: "fr-FR",
      potentialAction: [{ "@type": "ReadAction", target: [canonical] }],
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${canonical}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Nos réalisations" },
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
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/?s={search_term_string}`,
          },
          "query-input": {
            "@type": "PropertyValueSpecification",
            valueRequired: true,
            valueName: "search_term_string",
          },
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
      sameAs: [
        "https://www.facebook.com/sgta.btp",
        "https://share.google/j5BiBjLTGpFdjD3f8",
      ],
    },
  ],
};

export default function PortfolioPage() {
  return (
    <>
      <JsonLd data={structuredData} />
      <PortfolioHero />
      <PortfolioIntro />
      <div id="projets" className="scroll-mt-24">
        <AlHudaProject />
      </div>
      <AlHudaProgression />
      <AlFarahProject />
      <VillaFountyProject />
      <InteriorPortfolio />
      <ExteriorPortfolio />
      <LegacyProjects />
      <PortfolioCta />
    </>
  );
}
