import { AboutCta } from "@/components/about/about-cta";
import { AboutHero } from "@/components/about/about-hero";
import { AboutWhyUs } from "@/components/about/about-why-us";
import { CapabilitiesGallery } from "@/components/about/capabilities-gallery";
import { CompanyIntro } from "@/components/about/company-intro";
import { CoreActivities } from "@/components/about/core-activities";
import { ProjectProgression } from "@/components/about/project-progression";
import { JsonLd } from "@/components/seo/json-ld";
import { buildWebPageJsonLd } from "@/lib/i18n-seo";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.about, "about");
}

export default async function AboutPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "meta.about" });
  const tNav = await getTranslations({ locale, namespace: "nav" });

  return (
    <>
      <JsonLd
        data={buildWebPageJsonLd({
          locale,
          href: routes.about,
          title: t("title"),
          description: t("description"),
          crumbs: [
            { name: tNav("home"), href: routes.home },
            { name: tNav("about") },
          ],
        })}
      />
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
