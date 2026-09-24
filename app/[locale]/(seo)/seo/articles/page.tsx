import { getTranslations, setRequestLocale } from "next-intl/server";
import { SeoArticlesList } from "@/features/seo/components/seo-articles-list";
import { resolveLocale } from "@/lib/page-meta";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "seoCms.articles" });
  return { title: t("metaTitle"), description: t("metaDescription"), robots: { index: false, follow: false } };
}

export default async function SeoArticlesPage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <SeoArticlesList />;
}
