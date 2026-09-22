import { RelatedReading } from "@/components/blog/related-reading";
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
import { buildWebPageJsonLd } from "@/lib/i18n-seo";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.services, "services");
}

export default async function ServicesPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "meta.services" });
  const tNav = await getTranslations({ locale, namespace: "nav" });

  return (
    <>
      <JsonLd
        data={buildWebPageJsonLd({
          locale,
          href: routes.services,
          title: t("title"),
          description: t("description"),
          crumbs: [
            { name: tNav("home"), href: routes.home },
            { name: tNav("allServices") },
          ],
        })}
      />
      <ServicesHero />
      <ServicesIntro />
      <ServicesBento />
      <GrosOeuvreFeature />
      <SecondOeuvreFeature />
      <CapabilityGallery />
      <ServiceProcess />
      <ServiceProjectProof />
      <RelatedReading articleHrefs={[routes.constructionBudget, routes.constructionTrends2025]} archiveHref={routes.categoryGeneral} heading="Bien préparer votre projet." />
      <ServicesCta />
    </>
  );
}
