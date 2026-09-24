import { ArticlePage } from "@/components/blog/article-page";
import { getArticle } from "@/content/blog";
import { articleMetaByRoute, localizedPageMetadata } from "@/lib/page-meta";
import { routes } from "@/lib/routes";

const article = getArticle(routes.constructionBudget);
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  return localizedPageMetadata(params, routes.constructionBudget, articleMetaByRoute[routes.constructionBudget]);
}

export default function Page() {
  return <ArticlePage article={article} />;
}
