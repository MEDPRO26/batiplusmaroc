import { getTranslations, setRequestLocale } from "next-intl/server";
import { SeoPagesManager } from "@/features/seo/components/seo-pages-manager";
import { resolveLocale } from "@/lib/page-meta";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "seoCms.pages" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function SeoPagesPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <SeoPagesManager />;
}
