import { AlFarahProject } from "@/components/portfolio/al-farah-project";
import { AlHudaProgression } from "@/components/portfolio/al-huda-progression";
import { AlHudaProject } from "@/components/portfolio/al-huda-project";
import { ExteriorPortfolio } from "@/components/portfolio/exterior-portfolio";
import { InteriorPortfolio } from "@/components/portfolio/interior-portfolio";
import { LegacyProjects } from "@/components/portfolio/legacy-projects";
import { PortfolioCta } from "@/components/portfolio/portfolio-cta";
import { PortfolioHero } from "@/components/portfolio/portfolio-hero";
import { PortfolioIntro } from "@/components/portfolio/portfolio-intro";
import { ProjectDirectory } from "@/components/portfolio/project-directory";
import { VillaFountyProject } from "@/components/portfolio/villa-founty-project";
import { JsonLd } from "@/components/seo/json-ld";
import { buildWebPageJsonLd } from "@/lib/i18n-seo";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.projects, "projects");
}

export default async function PortfolioPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "meta.projects" });
  const tNav = await getTranslations({ locale, namespace: "nav" });

  return (
    <>
      <JsonLd
        data={buildWebPageJsonLd({
          locale,
          href: routes.projects,
          title: t("title"),
          description: t("description"),
          crumbs: [
            { name: tNav("home"), href: routes.home },
            { name: tNav("projects") },
          ],
        })}
      />
      <PortfolioHero />
      <PortfolioIntro />
      <ProjectDirectory />
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
