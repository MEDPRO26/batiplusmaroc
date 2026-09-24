import { AlFarahCaseStudy } from "@/components/gros-oeuvre/al-farah-case-study";
import { RelatedReading } from "@/components/blog/related-reading";
import { AlHudaProgression } from "@/components/gros-oeuvre/al-huda-progression";
import { ExecutionProcess } from "@/components/gros-oeuvre/execution-process";
import { GrosOeuvreCta } from "@/components/gros-oeuvre/gros-oeuvre-cta";
import { GrosOeuvreHero } from "@/components/gros-oeuvre/gros-oeuvre-hero";
import { GrosOeuvreIntro } from "@/components/gros-oeuvre/gros-oeuvre-intro";
import { LegacyProjects } from "@/components/gros-oeuvre/legacy-projects";
import { ProjectTypes } from "@/components/gros-oeuvre/project-types";
import { StructuralExpertise } from "@/components/gros-oeuvre/structural-expertise";
import { JsonLd } from "@/components/seo/json-ld";
import { buildWebPageJsonLd } from "@/lib/i18n-seo";
import { managedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return managedPageMetadata(params, routes.structuralWork, "structuralWork", "service:gros-oeuvre");
}

export default async function GrosOeuvrePage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "meta.structuralWork" });
  const tNav = await getTranslations({ locale, namespace: "nav" });

  return (
    <>
      <JsonLd
        data={buildWebPageJsonLd({
          locale,
          href: routes.structuralWork,
          title: t("title"),
          description: t("description"),
          crumbs: [
            { name: tNav("home"), href: routes.home },
            { name: tNav("structuralWork") },
          ],
        })}
      />
      <GrosOeuvreHero />
      <GrosOeuvreIntro />
      <StructuralExpertise />
      <AlHudaProgression />
      <AlFarahCaseStudy />
      <ProjectTypes />
      <LegacyProjects />
      <ExecutionProcess />
      <RelatedReading articleHrefs={[routes.constructionMaterials, routes.helloWorld]} archiveHref={routes.categoryStructuralWork} heading="Approfondir votre projet de construction." />
      <GrosOeuvreCta />
    </>
  );
}
