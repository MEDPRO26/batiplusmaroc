import { JsonLd } from "@/components/seo/json-ld";
import { CategoryMarketplace } from "@/components/home/category-marketplace";
import { HowItWorks } from "@/components/home/how-it-works";
import { Hero } from "@/components/home/hero";
import { TrustStrip } from "@/components/home/trust-strip";
import { MarketplaceFeed } from "@/components/home/marketplace-feed";
import { Testimonials } from "@/components/home/testimonials";
import { Articles } from "@/components/home/articles";
import { FinalCta } from "@/components/home/final-cta";
import { buildWebPageJsonLd } from "@/lib/i18n-seo";
import { managedPageMetadata, resolveLocale } from "@/lib/page-meta";
import { routes } from "@/lib/routes";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return managedPageMetadata(params, routes.home, "home", "homepage");
}

export default async function Home({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "meta.home" });
  const tNav = await getTranslations({ locale, namespace: "nav" });

  return (
    <>
      <JsonLd
        data={buildWebPageJsonLd({
          locale,
          href: routes.home,
          title: t("title"),
          description: t("description"),
          crumbs: [{ name: tNav("home"), href: routes.home }],
        })}
      />
      <Hero />
      <CategoryMarketplace />
      <HowItWorks />
      <TrustStrip />
      <MarketplaceFeed />
      <Testimonials />
      <Articles />
      <FinalCta />
    </>
  );
}
