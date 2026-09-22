import { CeilingsLighting } from "@/components/second-oeuvre/ceilings-lighting";
import { RelatedReading } from "@/components/blog/related-reading";
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
import { buildWebPageJsonLd } from "@/lib/i18n-seo";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.finishingWork, "finishingWork");
}

export default async function SecondOeuvrePage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "meta.finishingWork" });
  const tNav = await getTranslations({ locale, namespace: "nav" });

  return (
    <>
      <JsonLd
        data={buildWebPageJsonLd({
          locale,
          href: routes.finishingWork,
          title: t("title"),
          description: t("description"),
          crumbs: [
            { name: tNav("home"), href: routes.home },
            { name: tNav("finishingWork") },
          ],
        })}
      />
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
      <RelatedReading articleHrefs={[routes.constructionTrends2025, routes.constructionMaterials]} archiveHref={routes.categoryGeneral} heading="Des conseils pour des choix durables." />
      <SecondOeuvreCta />
    </>
  );
}
