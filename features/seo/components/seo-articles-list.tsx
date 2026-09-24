"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { FileText, Pencil, Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useDeferredValue, useState } from "react";
import { api } from "@/convex/_generated/api";
import { SEO_PRESS } from "@/features/seo/components/seo-workspace-shell";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

type ArticleRow = FunctionReturnType<typeof api.seo.content.listArticlesForWorkspace>[number];
type ArticleLocale = "fr" | "en";
type ArticleStatus = "draft" | "review" | "published" | "archived";

export function SeoArticlesList() {
  const t = useTranslations("seoCms.articles");
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [articleLocale, setArticleLocale] = useState<"all" | ArticleLocale>("all");
  const [status, setStatus] = useState<"all" | ArticleStatus>("all");
  const deferredSearch = useDeferredValue(search);
  const articles = useQuery(api.seo.content.listArticlesForWorkspace, {
    locale: articleLocale === "all" ? undefined : articleLocale,
    status: status === "all" ? undefined : status,
    search: deferredSearch.trim() || undefined,
    limit: 100,
  });

  const formatDate = (value: number | null) =>
    value
      ? new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(value)
      : "—";

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.72rem] font-bold tracking-[0.12em] text-[#2f6bff] uppercase">{t("eyebrow")}</p>
          <h1 className="mt-2 text-[1.9rem] font-semibold tracking-[-0.04em] sm:text-[2.2rem]">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#626970]">{t("description")}</p>
        </div>
        <Link
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(47,107,255,0.24)] ${SEO_PRESS}`}
          href={routes.seoArticleNew}
        >
          <Plus aria-hidden className="size-4" />
          {t("newArticle")}
        </Link>
      </div>

      <section className="rounded-[20px] border border-[#e7eaee] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_180px]">
          <label className="flex min-h-11 items-center gap-2 rounded-full bg-[#f4f6f8] px-3 text-sm text-[#8b919a]">
            <Search aria-hidden className="size-4 shrink-0" />
            <span className="sr-only">{t("filters.searchLabel")}</span>
            <input
              className="h-11 w-full bg-transparent text-[#17191d] outline-none placeholder:text-[#8b919a]"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("filters.searchPlaceholder")}
              type="search"
              value={search}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#626970]">
            <span className="sr-only">{t("filters.localeLabel")}</span>
            <select
              className="min-h-11 rounded-full border-0 bg-[#f4f6f8] px-4 text-sm font-medium text-[#17191d] outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bff]"
              onChange={(event) => setArticleLocale(event.target.value as "all" | ArticleLocale)}
              value={articleLocale}
            >
              <option value="all">{t("filters.allLocales")}</option>
              <option value="fr">{t("locales.fr")}</option>
              <option value="en">{t("locales.en")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[#626970]">
            <span className="sr-only">{t("filters.statusLabel")}</span>
            <select
              className="min-h-11 rounded-full border-0 bg-[#f4f6f8] px-4 text-sm font-medium text-[#17191d] outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bff]"
              onChange={(event) => setStatus(event.target.value as "all" | ArticleStatus)}
              value={status}
            >
              <option value="all">{t("filters.allStatuses")}</option>
              {(["draft", "review", "published", "archived"] as const).map((value) => (
                <option key={value} value={value}>{t(`statuses.${value}`)}</option>
              ))}
            </select>
          </label>
        </div>

        {articles === undefined ? (
          <ArticlesLoading label={t("loading")} />
        ) : articles.length === 0 ? (
          <div className="grid min-h-64 place-items-center py-12 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eef3ff] text-[#2f6bff]">
                <FileText aria-hidden className="size-5" />
              </span>
              <h2 className="mt-4 text-base font-semibold">{t("emptyTitle")}</h2>
              <p className="mt-1 text-sm text-[#626970]">{t("emptyDescription")}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-3 md:hidden">
              {articles.map((article: ArticleRow) => (
                <article className="rounded-[16px] bg-[#f8fafb] p-4" key={article.articleId}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{article.title}</h2>
                      <p className="mt-1 truncate text-xs text-[#8b919a]">/{article.slug}</p>
                    </div>
                    <StatusPill status={article.status} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-xs text-[#8b919a]">{t("columns.locale")}</dt><dd className="mt-1 font-medium uppercase">{article.locale}</dd></div>
                    <div><dt className="text-xs text-[#8b919a]">{t("columns.updated")}</dt><dd className="mt-1">{formatDate(article.updatedAt)}</dd></div>
                    <div className="col-span-2"><dt className="text-xs text-[#8b919a]">{t("columns.keyword")}</dt><dd className="mt-1">{article.primaryKeyword}</dd></div>
                  </dl>
                  <EditLink article={article} label={t("edit")} />
                </article>
              ))}
            </div>
            <div className="mt-5 hidden overflow-x-auto md:block">
              <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className="text-[0.72rem] font-semibold tracking-[0.06em] text-[#a0a6ae] uppercase">
                    <th className="px-3 py-2 font-semibold">{t("columns.title")}</th>
                    <th className="px-3 py-2 font-semibold">{t("columns.locale")}</th>
                    <th className="px-3 py-2 font-semibold">{t("columns.status")}</th>
                    <th className="px-3 py-2 font-semibold">{t("columns.keyword")}</th>
                    <th className="px-3 py-2 font-semibold">{t("columns.updated")}</th>
                    <th className="px-3 py-2 font-semibold">{t("columns.published")}</th>
                    <th className="px-3 py-2 font-semibold">{t("columns.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((article: ArticleRow) => (
                    <tr className="bg-[#f8fafb]" key={article.articleId}>
                      <td className="rounded-l-[14px] px-3 py-3">
                        <p className="max-w-[320px] truncate font-semibold">{article.title}</p>
                        <p className="mt-0.5 max-w-[320px] truncate text-xs text-[#8b919a]">/{article.slug}</p>
                      </td>
                      <td className="px-3 py-3 font-semibold uppercase text-[#626970]">{article.locale}</td>
                      <td className="px-3 py-3"><StatusPill status={article.status} /></td>
                      <td className="max-w-[220px] truncate px-3 py-3 text-[#626970]">{article.primaryKeyword}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-[#626970]">{formatDate(article.updatedAt)}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-[#626970]">{formatDate(article.publishedAt)}</td>
                      <td className="rounded-r-[14px] px-3 py-3"><EditLink article={article} label={t("edit")} compact /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function EditLink({ article, label, compact = false }: { article: ArticleRow; label: string; compact?: boolean }) {
  return (
    <Link
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#e6e9ee] bg-white px-3 text-sm font-semibold text-[#17191d] ${compact ? "" : "mt-4 w-full"} ${SEO_PRESS}`}
      href={{ pathname: routes.seoArticle, params: { articleId: article.articleId } }}
    >
      <Pencil aria-hidden className="size-4" />
      {label}
    </Link>
  );
}

function StatusPill({ status }: { status: ArticleStatus }) {
  const t = useTranslations("seoCms.articles.statuses");
  const styles = {
    draft: "bg-[#eef3ff] text-[#2f6bff]",
    review: "bg-[#fff4df] text-[#9a6700]",
    published: "bg-[#e7f8ee] text-[#157a3e]",
    archived: "bg-[#eef0f3] text-[#626970]",
  }[status];
  return <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold ${styles}`}>{t(status)}</span>;
}

function ArticlesLoading({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="mt-5 space-y-3" role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="h-16 animate-pulse rounded-[14px] bg-[#f4f6f8]" key={index} />
      ))}
    </div>
  );
}
