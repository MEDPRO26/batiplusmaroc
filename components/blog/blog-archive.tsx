import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArticleCard } from "@/components/blog/article-card";
import { blogArticles } from "@/content/blog";
import { routes, type AppRoute } from "@/lib/routes";

export async function BlogArchive({ category }: { category: "general" | "structural" }) {
  const t = await getTranslations("blog");
  const activeCategory = category === "general" ? routes.categoryGeneral : routes.categoryStructuralWork;
  const articles = blogArticles.filter((article) => article.categoryHref === activeCategory);
  const title = category === "general" ? t("general") : t("structural");

  return (
    <>
      <section className="relative overflow-hidden bg-[#0b223a] px-[18px] py-20 text-white sm:px-6 sm:py-24 lg:px-8 lg:py-28">
        <div className="pointer-events-none absolute top-0 right-0 size-[480px] -translate-y-1/2 translate-x-1/3 rounded-full border border-white/8" aria-hidden="true" />
        <div className="pointer-events-none absolute top-0 right-0 size-[320px] -translate-y-1/2 translate-x-1/3 rounded-full border border-white/8" aria-hidden="true" />
        <div className="relative mx-auto max-w-[1280px]">
          <p className="mb-7 text-[0.7rem] font-bold tracking-[0.2em] text-[#80c9ef] uppercase">{t("eyebrow")}</p>
          <div className="grid items-end gap-10 lg:grid-cols-[1fr_auto]">
            <h1 className="m-0 max-w-4xl text-[clamp(3rem,7vw,6.8rem)] leading-[0.93] font-semibold tracking-[-0.06em] text-white!">{title}</h1>
            <p className="max-w-sm text-base leading-7 text-white/65">{t("description")}</p>
          </div>
          <nav className="mt-14 flex flex-wrap gap-2" aria-label={t("categories")}>
            <Link className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition ${activeCategory === routes.categoryGeneral ? "border-white bg-white text-[#0b223a]!" : "border-white/20 text-white! hover:border-white/55"}`} href={routes.categoryGeneral}>{t("general")}</Link>
            <Link className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition ${activeCategory === routes.categoryStructuralWork ? "border-white bg-white text-[#0b223a]!" : "border-white/20 text-white! hover:border-white/55"}`} href={routes.categoryStructuralWork}>{t("structural")}</Link>
          </nav>
        </div>
      </section>

      <section className="bg-white px-[18px] py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-10 flex items-end justify-between gap-6 border-b border-[#cfdbe2] pb-6">
            <p className="m-0 text-sm text-[#63717c]">{t("count", { count: articles.length.toString().padStart(2, "0") })}</p>
            <span className="text-[0.68rem] font-bold tracking-[0.18em] text-[#07598e] uppercase">{t("badge")}</span>
          </div>
          <div className="grid gap-6">
            {articles.map((article, index) => <ArticleCard article={article} featured={index === 0} key={article.href} />)}
          </div>
        </div>
      </section>
    </>
  );
}

export type { AppRoute };
