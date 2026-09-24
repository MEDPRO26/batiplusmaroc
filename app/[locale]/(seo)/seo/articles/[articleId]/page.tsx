import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Id } from "@/convex/_generated/dataModel";
import { SeoArticleEditor } from "@/features/seo/components/seo-article-editor";
import { resolveLocale } from "@/lib/page-meta";

type Props = { params: Promise<{ locale: string; articleId: string }> };

export async function generateMetadata({ params }: Props) {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: "seoCms.editor" });
  return { title: t("editMetaTitle"), description: t("metaDescription"), robots: { index: false, follow: false } };
}

export default async function EditSeoArticlePage({ params }: Props) {
  const resolved = await params;
  const locale = await resolveLocale(Promise.resolve({ locale: resolved.locale }));
  setRequestLocale(locale);
  return <SeoArticleEditor articleId={resolved.articleId as Id<"seoArticles">} />;
}
