import { getTranslations, setRequestLocale } from "next-intl/server";
import { SeoMediaLibrary } from "@/features/seo/components/seo-media-library";
import { resolveLocale } from "@/lib/page-meta";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "seoCms.media" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function SeoMediaPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <SeoMediaLibrary />;
}
