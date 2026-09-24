"use client";

import { useQuery } from "convex/react";
import { FileCheck2, FileClock, FileEdit, Files, GitBranch, Network, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { SEO_PRESS } from "@/features/seo/components/seo-workspace-shell";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

const CARDS = [
  { id: "draftArticles", icon: FileEdit, tone: "bg-[#eef3ff] text-[#2f6bff]" },
  { id: "reviewArticles", icon: FileClock, tone: "bg-[#fff4df] text-[#9a6700]" },
  { id: "publishedArticles", icon: FileCheck2, tone: "bg-[#e7f8ee] text-[#157a3e]" },
  { id: "missingMetadata", icon: Files, tone: "bg-[#fdecec] text-[#b42318]" },
  { id: "pillars", icon: Network, tone: "bg-[#f1edff] text-[#6941c6]" },
  { id: "clusters", icon: GitBranch, tone: "bg-[#e8f7f6] text-[#087f75]" },
] as const;

export function SeoDashboard() {
  const t = useTranslations("seoCms.dashboard");
  const overview = useQuery(api.seo.content.getWorkspaceDashboard);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.72rem] font-bold tracking-[0.12em] text-[#2f6bff] uppercase">{t("eyebrow")}</p>
          <h1 className="mt-2 text-[1.9rem] font-semibold tracking-[-0.04em] text-[#17191d] sm:text-[2.2rem]">
            {t("title")}
          </h1>
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

      <section aria-label={t("metricsLabel")} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CARDS.map(({ id, icon: Icon, tone }) => (
          <article
            className="rounded-[20px] border border-[#e7eaee] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
            key={id}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#626970]">{t(`metrics.${id}`)}</p>
                {overview === undefined ? (
                  <div aria-hidden className="mt-3 h-9 w-16 animate-pulse rounded-lg bg-[#eef0f3]" />
                ) : (
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] tabular-nums text-[#17191d]">
                    {overview[id].toLocaleString()}
                  </p>
                )}
              </div>
              <span className={`grid size-11 place-items-center rounded-[14px] ${tone}`}>
                <Icon aria-hidden className="size-5" />
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-[20px] border border-[#e7eaee] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em]">{t("articlesTitle")}</h2>
            <p className="mt-1 text-sm leading-6 text-[#626970]">{t("articlesDescription")}</p>
          </div>
          <Link
            className={`inline-flex min-h-11 items-center justify-center rounded-full border border-[#e6e9ee] bg-white px-4 text-sm font-semibold text-[#17191d] ${SEO_PRESS}`}
            href={routes.seoArticles}
          >
            {t("manageArticles")}
          </Link>
        </div>
      </section>
    </div>
  );
}
