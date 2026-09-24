import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { articles } from "@/content/articles";
import { routes } from "@/lib/routes";
import { outfit } from "@/components/shared/outfit";

function formatArticleDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00`));
}

export async function Articles() {
  const locale = await getLocale();
  const t = await getTranslations("home.articles");
  const tItems = await getTranslations("content.articles");
  const [featured, ...rest] = articles;

  return (
    <section
      aria-labelledby="articles-title"
      className={`${outfit.className} bg-white py-16 text-start sm:py-22 lg:py-30`}
      id="actualites"
    >
      <div className="mx-auto w-[calc(100%-36px)] max-w-7xl sm:w-[calc(100%-64px)] lg:w-[calc(100%-80px)]">
        <header className="max-w-160">
          <h2
            className="mb-0 text-[clamp(1.85rem,4.4vw,3.15rem)] leading-[1.04] font-semibold tracking-[-0.045em] text-ink!"
            id="articles-title"
          >
            {t("title")}
          </h2>
          <p className="mt-4 max-w-136 text-[1rem] leading-7 text-muted sm:mt-5 sm:text-[1.05rem] sm:leading-7">
            {t("description")}
          </p>
        </header>

        <nav aria-label={t("categoriesLabel")} className="mt-8 border-b border-brand-border sm:mt-10">
          <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
            <li>
              <a
                aria-current="page"
                className="inline-flex min-h-11 items-center border-b-2 border-ink pb-2 text-[0.92rem] font-semibold text-ink"
                href="#actualites"
              >
                {t("all")}
              </a>
            </li>
            <li>
              <Link
                className="inline-flex min-h-11 items-center border-b-2 border-transparent pb-2 text-[0.92rem] font-medium text-muted hover:text-ink"
                href={routes.categoryGeneral}
              >
                {t("general")}
              </Link>
            </li>
            <li>
              <Link
                className="inline-flex min-h-11 items-center border-b-2 border-transparent pb-2 text-[0.92rem] font-medium text-muted hover:text-ink"
                href={routes.categoryStructuralWork}
              >
                {t("structural")}
              </Link>
            </li>
          </ul>
        </nav>

        <article className="group mt-10 grid items-center gap-8 sm:mt-12 lg:grid-cols-2 lg:gap-14">
          <div className="order-2 lg:order-1">
            <h3 className="mb-0 max-w-prose text-[clamp(1.45rem,2.6vw,2.15rem)] leading-snug font-semibold tracking-[-0.035em] text-ink">
              <Link
                className="text-ink! hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                href={featured.href}
              >
                {tItems(`${featured.id}.title`)}
              </Link>
            </h3>
            <p className="mt-4 mb-0 max-w-prose text-[1rem] leading-7 text-muted">
              {tItems(`${featured.id}.excerpt`)}
            </p>
            <time className="mt-5 block text-[0.88rem] text-muted" dateTime={featured.publishedIso}>
              {formatArticleDate(featured.publishedIso, locale)}
            </time>
          </div>
          <Link
            aria-hidden="true"
            className="order-1 block overflow-hidden rounded-md outline-1 outline-black/10 lg:order-2"
            href={featured.href}
            tabIndex={-1}
          >
            <span className="relative block aspect-4/3">
              <Image
                alt=""
                className="object-cover transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.03]"
                fill
                sizes="(max-width: 1023px) 100vw, 50vw"
                src={featured.image}
              />
            </span>
          </Link>
        </article>

        <ul className="mt-14 grid list-none grid-cols-1 gap-10 p-0 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {rest.map((article) => {
            const title = tItems(`${article.id}.title`);

            return (
              <li key={article.id}>
                <article className="group">
                  <Link
                    aria-hidden="true"
                    className="block overflow-hidden rounded-md outline-1 outline-black/10"
                    href={article.href}
                    tabIndex={-1}
                  >
                    <span className="relative block aspect-4/3">
                      <Image
                        alt=""
                        className="object-cover transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.03]"
                        fill
                        sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                        src={article.image}
                      />
                    </span>
                  </Link>
                  <p className="mt-5 mb-0">
                    <Link
                      className="inline-flex rounded-full bg-surface-muted px-3 py-1 text-[0.72rem] font-medium text-muted hover:text-ink"
                      href={article.categoryHref}
                    >
                      {tItems(`${article.id}.category`)}
                    </Link>
                  </p>
                  <h3 className="mt-3 mb-0 text-[1.12rem] leading-snug font-semibold tracking-[-0.03em] text-ink sm:text-[1.2rem]">
                    <Link
                      className="text-ink! hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                      href={article.href}
                    >
                      {title}
                    </Link>
                  </h3>
                  <time className="mt-3 block text-[0.84rem] text-muted" dateTime={article.publishedIso}>
                    {formatArticleDate(article.publishedIso, locale)}
                  </time>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
