import Image from "next/image";
import Link from "next/link";

import type { BlogArticle } from "@/content/blog";

export function ArticleCard({ article, featured = false }: { article: BlogArticle; featured?: boolean }) {
  return (
    <article className={`group grid overflow-hidden border border-[#d9e3e9] bg-white ${featured ? "lg:grid-cols-[1.15fr_0.85fr]" : "grid-rows-[auto_1fr]"}`}>
      <Link className={`relative block overflow-hidden ${featured ? "min-h-[320px] lg:min-h-[500px]" : "aspect-[16/10]"}`} href={article.href} tabIndex={-1} aria-hidden="true">
        <Image className="object-cover transition-transform duration-700 group-hover:scale-[1.035]" src={article.image} alt="" fill sizes={featured ? "(max-width: 1024px) 100vw, 58vw" : "(max-width: 768px) 100vw, 50vw"} />
      </Link>
      <div className={`flex flex-col ${featured ? "justify-between p-7 sm:p-10 lg:p-12" : "p-6 sm:p-8"}`}>
        <div>
          <div className="mb-6 flex items-center gap-3 text-[0.68rem] font-bold tracking-[0.15em] text-[#07598e] uppercase">
            <span>{article.category}</span><span className="h-px w-8 bg-[#e5b43c]" aria-hidden="true" />
            <time dateTime={article.publishedIso}>{article.published}</time>
          </div>
          <h2 className={`${featured ? "text-[clamp(2rem,4vw,3.5rem)]" : "text-[clamp(1.45rem,2.7vw,2rem)]"} m-0 leading-[1.06] text-[#111820]!`}>
            <Link className="transition-colors hover:text-[#07598e]" href={article.href}>{article.title}</Link>
          </h2>
          <p className="mt-6 line-clamp-3 text-[0.98rem] leading-7 text-[#69727a]">{article.introduction[0]}</p>
        </div>
        <Link className="mt-8 inline-flex w-fit items-center gap-3 border-b border-[#aebdc7] pb-1 text-sm font-semibold text-[#11263a] transition-colors hover:border-[#07598e] hover:text-[#07598e]" href={article.href}>Lire l’article <span aria-hidden="true">↗</span></Link>
      </div>
    </article>
  );
}

