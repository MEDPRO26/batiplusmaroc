import Image from "next/image";
import Link from "next/link";

import type { BlogArticle } from "@/content/blog";
import { blogArticles } from "@/content/blog";
import { routes } from "@/lib/routes";

function ArticleBlock({ block }: { block: BlogArticle["sections"][number]["blocks"][number] }) {
  if (block.type === "list") {
    return <ul>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
  }
  if (block.type === "subheading") return <h3>{block.text}</h3>;
  return <p>{block.text}</p>;
}

export function ArticlePage({ article }: { article: BlogArticle }) {
  const currentIndex = blogArticles.findIndex((item) => item.href === article.href);
  const nextArticle = blogArticles[(currentIndex + 1) % blogArticles.length];

  return (
    <article className="bg-white">
      <header className="bg-[#edf3f6] px-[18px] pt-12 pb-10 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20 lg:pb-14">
        <div className="mx-auto max-w-[1280px]">
          <nav className="mb-10 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#60717e]" aria-label="Fil d’Ariane">
            <Link className="hover:text-[#07598e]" href={routes.home}>Accueil</Link><span aria-hidden="true">/</span>
            <Link className="hover:text-[#07598e]" href={article.categoryHref}>{article.category}</Link>
          </nav>
          <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <p className="mb-7 text-[0.7rem] font-bold tracking-[0.2em] text-[#07598e] uppercase">Journal de chantier</p>
              <h1 className="m-0 max-w-5xl text-[clamp(2.8rem,6vw,6.4rem)] leading-[0.96] font-semibold tracking-[-0.06em] text-[#111820]!">{article.title}</h1>
            </div>
            <div className="border-t border-[#c7d4dc] pt-5 text-sm text-[#5e6c76] lg:mb-2">
              <Link className="font-semibold text-[#07598e]" href={article.categoryHref}>{article.category}</Link>
              <span className="mx-3 text-[#a4b1b9]">·</span>
              <time dateTime={article.publishedIso}>{article.published}</time>
            </div>
          </div>
        </div>
      </header>

      <div className="px-[18px] sm:px-6 lg:px-8">
        <div className="relative mx-auto h-[300px] max-w-[1280px] overflow-hidden bg-[#dce6eb] sm:aspect-[16/8] sm:h-auto lg:min-h-[560px]">
          <Image className="object-cover" src={article.image} alt={article.imageAlt} fill priority sizes="(max-width: 1320px) 100vw, 1280px" />
        </div>
      </div>

      <div className="px-[18px] py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-[1120px] gap-14 lg:grid-cols-[220px_minmax(0,720px)] lg:gap-20">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="border-t border-[#ccd8df] pt-5">
              <p className="text-[0.66rem] font-bold tracking-[0.17em] text-[#778893] uppercase">Dans cet article</p>
              <ol className="mt-5 grid gap-3 text-sm leading-5 text-[#5f6d77]">
                {article.sections.map((section, index) => <li key={section.title}><a className="transition-colors hover:text-[#07598e]" href={`#section-${index + 1}`}>{section.title}</a></li>)}
              </ol>
            </div>
            <Link className="mt-8 inline-flex items-center gap-3 text-sm font-semibold text-[#07598e]" href={routes.contact}>Parler de votre projet <span aria-hidden="true">↗</span></Link>
          </aside>

          <div className="blog-prose min-w-0">
            <div className="blog-lead">
              {article.introduction.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
            {article.sections.map((section, index) => (
              <section id={`section-${index + 1}`} className="scroll-mt-28" key={section.title}>
                <span className="blog-section-number" aria-hidden="true">{(index + 1).toString().padStart(2, "0")}</span>
                <h2>{section.title}</h2>
                {section.blocks.map((block, blockIndex) => <ArticleBlock block={block} key={`${block.type}-${blockIndex}`} />)}
              </section>
            ))}
          </div>
        </div>
      </div>

      <footer className="border-t border-[#d8e1e6] bg-[#f2f6f8] px-[18px] py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto grid max-w-[1120px] gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="mb-4 text-[0.68rem] font-bold tracking-[0.18em] text-[#07598e] uppercase">À lire ensuite</p>
            <h2 className="m-0 max-w-3xl text-[clamp(1.8rem,4vw,3.2rem)] leading-[1.08] text-[#111820]!"><Link className="hover:text-[#07598e]" href={nextArticle.href}>{nextArticle.title}</Link></h2>
          </div>
          <Link className="grid size-14 place-items-center rounded-full border border-[#b9c8d1] text-xl text-[#07598e] transition hover:bg-[#07598e] hover:text-white!" href={nextArticle.href} aria-label={`Lire : ${nextArticle.title}`}>↗</Link>
        </div>
      </footer>
    </article>
  );
}
