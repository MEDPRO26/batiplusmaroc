import Link from "next/link";

import { getArticle } from "@/content/blog";
import type { ProtectedRoute } from "@/lib/routes";

export function RelatedReading({
  articleHrefs,
  heading = "Pour aller plus loin.",
  archiveHref,
}: {
  articleHrefs: readonly ProtectedRoute[];
  heading?: string;
  archiveHref: ProtectedRoute;
}) {
  const selectedArticles = articleHrefs.map(getArticle);

  return (
    <section className="border-y border-[#d7e1e7] bg-[#f2f6f8] px-[18px] py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-4 text-[0.68rem] font-bold tracking-[0.18em] text-[#07598e] uppercase">Conseils liés à votre projet</p>
            <h2 className="m-0 max-w-3xl text-[clamp(2rem,4.2vw,3.8rem)] leading-[1.02] text-[#111820]!">{heading}</h2>
          </div>
          <Link className="inline-flex w-fit items-center gap-3 border-b border-[#9fb1bc] pb-1 text-sm font-semibold text-[#07598e]" href={archiveHref}>Voir tous les articles <span aria-hidden="true">→</span></Link>
        </div>

        <div className="grid border-t border-[#cdd9e0] md:grid-cols-2">
          {selectedArticles.map((article, index) => (
            <article className={`group py-7 md:p-8 ${index === 0 ? "md:border-r md:border-[#cdd9e0] md:pl-0" : "border-t border-[#cdd9e0] md:border-t-0 md:pr-0"}`} key={article.href}>
              <div className="mb-5 flex items-center justify-between gap-5 text-[0.66rem] font-bold tracking-[0.14em] text-[#697a85] uppercase">
                <span>{article.category}</span><span>{(index + 1).toString().padStart(2, "0")}</span>
              </div>
              <h3 className="m-0 max-w-xl text-[clamp(1.4rem,2.6vw,2.15rem)] leading-[1.12] text-[#111820]!"><Link className="transition-colors group-hover:text-[#07598e]" href={article.href}>{article.title}</Link></h3>
              <Link className="mt-7 inline-flex items-center gap-3 text-sm font-semibold text-[#07598e]" href={article.href} aria-label={`Lire : ${article.title}`}>Lire le conseil <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">↗</span></Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

