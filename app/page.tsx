import type { Metadata } from "next";
import { AboutPreview } from "@/components/home/about-preview";
import { Articles } from "@/components/home/articles";
import { ExpertiseGrid } from "@/components/home/expertise-grid";
import { FinalCta } from "@/components/home/final-cta";
import { Hero } from "@/components/home/hero";
import { Process } from "@/components/home/process";
import { Projects } from "@/components/home/projects";
import { Services } from "@/components/home/services";
import { Testimonials } from "@/components/home/testimonials";
import { TrustStrip } from "@/components/home/trust-strip";
import { WhyUs } from "@/components/home/why-us";
import { JsonLd } from "@/components/seo/json-ld";
import { routes } from "@/lib/routes";
import { createMetadata, SITE_URL } from "@/lib/seo";

const title = "Entreprise BTP et aménagement à Agadir – Construction pro";
const description = "Expert en construction, rénovation et aménagement à Agadir. Devis rapide, qualité garantie pour vos projets BTP résidentiels et professionnels";

export const metadata: Metadata = {
  ...createMetadata({ path: routes.home, title, description, robots: { index: true, follow: true } }),
  openGraph: { title, description, url: `${SITE_URL}/`, type: "website" },
  twitter: { card: "summary_large_image" },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", "@id": `${SITE_URL}/`, url: `${SITE_URL}/`, name: title, isPartOf: { "@id": `${SITE_URL}/#website` }, about: { "@id": `${SITE_URL}/#organization` }, description, breadcrumb: { "@id": `${SITE_URL}/#breadcrumb` }, inLanguage: "fr-FR" },
    { "@type": "BreadcrumbList", "@id": `${SITE_URL}/#breadcrumb`, itemListElement: [{ "@type": "ListItem", position: 1, name: "Accueil" }] },
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: `${SITE_URL}/`, name: "S2MBOU", publisher: { "@id": `${SITE_URL}/#organization` }, inLanguage: "fr-FR" },
    { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "S2MBOU", url: `${SITE_URL}/`, logo: { "@type": "ImageObject", url: `${SITE_URL}/brand/s2mbou-logo.webp`, width: 153, height: 40, caption: "S2MBOU" } },
  ],
};

export default function Home() {
  return <><JsonLd data={structuredData} /><Hero /><TrustStrip /><AboutPreview /><Services /><ExpertiseGrid /><Projects /><Process /><WhyUs /><Testimonials /><Articles /><FinalCta /></>;
}
