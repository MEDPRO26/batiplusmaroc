import { getTranslations, setRequestLocale } from "next-intl/server";
import { SeoArticleEditor } from "@/features/seo/components/seo-article-editor";
import { resolveLocale } from "@/lib/page-meta";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "seoCms.editor" });
  return { title: t("createMetaTitle"), description: t("metaDescription"), robots: { index: false, follow: false } };
}

export default async function NewSeoArticlePage({ params }: Props) {
  const locale = await resolveLocale(params);
  setRequestLocale(locale);
  return <SeoArticleEditor />;
}
