import { ClientHiringGuide } from "@/components/how-it-works/client-hiring-guide";
import { JsonLd } from "@/components/seo/json-ld";
import { buildWebPageJsonLd } from "@/lib/i18n-seo";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.howItWorks, "howItWorks");
}

export default async function HowItWorksPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "meta.howItWorks" });
  const tNav = await getTranslations({ locale, namespace: "nav" });

  return (
    <>
      <JsonLd
        data={buildWebPageJsonLd({
          locale,
          href: routes.howItWorks,
          title: t("title"),
          description: t("description"),
          crumbs: [
            { name: tNav("home"), href: routes.home },
            { name: tNav("howItWorks"), href: routes.howItWorks },
          ],
        })}
      />
      <ClientHiringGuide />
    </>
  );
}
