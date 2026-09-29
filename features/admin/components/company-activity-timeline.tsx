"use client";

import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ADMIN_PRESS } from "@/features/admin/components/admin-shell";
import { Link } from "@/i18n/navigation";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";

type TimelineItem = FunctionReturnType<
  typeof api.admin.companyActivity.listCompanyActivity
>["page"][number];

const CATEGORY_STYLES: Record<TimelineItem["category"], string> = {
  verification: "bg-[#eef4ff] text-[#2456c7]",
  marketplace: "bg-[#f4f6f8] text-[#4c545d]",
  deals: "bg-[#fff4df] text-[#9a6700]",
  reviews: "bg-[#f3ecff] text-[#7047b8]",
};

export function CompanyActivityTimeline({
  companyId,
  limit,
  footer,
}: {
  companyId: Id<"companies">;
  /** Shows only the newest `limit` events without paging (used by the company overview). */
  limit?: number;
  footer?: ReactNode;
}) {
  const t = useTranslations("adminCompanyActivity");
  const locale = useLocale();
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.companyActivity.listCompanyActivity,
    { companyId },
    { initialNumItems: limit ?? 20 },
  );

  const loadingFirstPage = status === "LoadingFirstPage";
  const empty = status === "Exhausted" && results.length === 0;

  return (
    <section aria-labelledby="company-activity-title" className="rounded-[16px] border border-[#eef1f4] p-4">
      <div>
        <h3 className="text-sm font-semibold text-[#17191d]" id="company-activity-title">
          {t("title")}
        </h3>
        <p className="mt-1 text-xs leading-5 text-[#8b919a]">{t("lead")}</p>
      </div>

      {loadingFirstPage ? (
        <div aria-busy="true" className="mt-4 space-y-3" role="status">
          <span className="sr-only">{t("loading")}</span>
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="h-20 animate-pulse rounded-[12px] bg-[#f4f6f8]" key={index} />
          ))}
        </div>
      ) : empty ? (
        <p className="mt-4 rounded-[12px] bg-[#f8fafb] px-3 py-5 text-center text-sm text-[#8b919a]">
          {t("empty")}
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {(limit ? results.slice(0, limit) : results).map((item) => (
            <TimelineRow item={item} key={item.id} locale={locale} />
          ))}
        </ol>
      )}

      {footer}
      {!limit && (status === "CanLoadMore" || status === "LoadingMore") ? (
        <button
          className={`mt-4 min-h-11 w-full rounded-full border border-[#e6e9ee] px-4 text-sm font-semibold text-[#17191d] disabled:opacity-50 ${ADMIN_PRESS}`}
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(20)}
          type="button"
        >
          {status === "LoadingMore" ? t("loadingMore") : t("loadMore")}
        </button>
      ) : null}
    </section>
  );
}

function TimelineRow({ item, locale }: { item: TimelineItem; locale: string }) {
  const t = useTranslations("adminCompanyActivity");
  const actor = item.actor.displayName ?? t(`actorTypes.${item.actor.type}`);
  const amount = item.context.amountMad ?? item.context.commissionAmountMad;
  const rating = item.context.rating;
  const href = item.category === "deals"
    ? "/admin/deals"
    : item.category === "reviews"
      ? "/admin/reviews"
      : item.category === "marketplace" && item.source === "marketplace_activity"
        ? "/admin/projects"
        : null;

  return (
    <li className="relative rounded-[12px] border border-[#eef1f4] px-3 py-3 pl-9">
      <span
        aria-hidden="true"
        className={`absolute top-4 left-3 inline-flex size-4 rounded-full ${CATEGORY_STYLES[item.category]}`}
      />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-[#17191d]">
          {t(`events.${item.eventType}`)}
        </p>
        <span className={`rounded-full px-2 py-1 text-[0.68rem] font-semibold ${CATEGORY_STYLES[item.category]}`}>
          {t(`categories.${item.category}`)}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#626970]">
        {item.project?.title
          ? t("projectContext", { project: item.project.title })
          : t("companyContext")}
      </p>
      {amount !== null || rating !== null ? (
        <p className="mt-1 text-xs font-medium text-[#4c545d]">
          {amount !== null
            ? t("amount", {
                amount: new Intl.NumberFormat(locale, {
                  style: "currency",
                  currency: item.context.currency ?? "MAD",
                  maximumFractionDigits: 2,
                }).format(amount),
              })
            : t("rating", { rating: rating ?? 0 })}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#8b919a]">
        <span>
          {actor} · {formatMarketplaceDateTime(item.occurredAt, locale)}
        </span>
        {href ? (
          <Link className={`font-semibold text-[#2456c7] ${ADMIN_PRESS}`} href={href}>
            {t("viewDetails")}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
