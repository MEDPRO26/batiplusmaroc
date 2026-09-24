import { ArticlePage } from "@/components/blog/article-page";
import { getArticle } from "@/content/blog";
import { articleMetaByRoute, localizedPageMetadata } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

const article = getArticle(routes.constructionTrends2025);
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.constructionTrends2025, articleMetaByRoute[routes.constructionTrends2025]);
}

export default function Page() {
  return <ArticlePage article={article} />;
}
