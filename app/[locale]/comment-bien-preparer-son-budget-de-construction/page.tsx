import type { Metadata } from "next";
import { ArticlePage } from "@/components/blog/article-page";
import { getArticle } from "@/content/blog";
import { routes } from "@/lib/routes";
import { createMetadata } from "@/lib/seo";

const article = getArticle(routes.constructionBudget);
export const metadata: Metadata = createMetadata({ path: routes.constructionBudget, title: `${article.title} - batiplusmaroc.com` });
export default function Page() { return <ArticlePage article={article} />; }
