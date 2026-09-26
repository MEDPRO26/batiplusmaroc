"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";

type Obligation = FunctionReturnType<
  typeof api.deals.company.listMyCommissionObligations
>[number];

export function CompanyCommissions() {
  const t = useTranslations("companyCommissions");
  const locale = useLocale();
  const obligations = useQuery(api.deals.company.listMyCommissionObligations);

  if (obligations === undefined) return <CommissionsSkeleton />;

  const complete = obligations.filter(
    (item) => item.snapshotComplete && item.commissionAmountMad !== null,
  );
  const totalDue = complete
    .filter((item) => item.commissionStatus === "due")
    .reduce((sum, item) => sum + (item.commissionAmountMad ?? 0), 0);
  const totalPaid = complete
    .filter((item) => item.commissionStatus === "paid")
    .reduce((sum, item) => sum + (item.commissionAmountMad ?? 0), 0);
  const dueCount = obligations.filter((item) => item.commissionStatus === "due").length;

  return (
    <main className="min-h-[calc(100dvh-4.5rem)] bg-[#f7f9fb] py-8 sm:py-10">
      <div className="mx-auto w-[calc(100%-36px)] max-w-[1120px]">
        <header>
          <p className="m-0 text-sm font-semibold text-brand">{t("eyebrow")}</p>
          <h1 className="mt-2 mb-0 text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-3 mb-0 max-w-2xl text-sm leading-6 text-muted">{t("lead")}</p>
        </header>

        <section aria-label={t("summary.label")} className="mt-7 grid gap-3 sm:grid-cols-3">
          <SummaryCard label={t("summary.due")} value={money(totalDue, locale)} />
          <SummaryCard label={t("summary.paid")} value={money(totalPaid, locale)} />
          <SummaryCard label={t("summary.count")} value={String(dueCount)} />
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-[#e4ebe6] bg-white">
          {obligations.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <h2 className="m-0 text-lg font-semibold text-ink">{t("empty.title")}</h2>
              <p className="mt-2 mb-0 text-sm text-muted">{t("empty.lead")}</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 p-4 md:hidden">
                {obligations.map((item) => (
                  <CommissionCard item={item} key={item.dealId} locale={locale} />
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead className="bg-[#f7faf8] text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                    <tr>
                      <th className="px-5 py-3">{t("columns.project")}</th>
                      <th className="px-5 py-3">{t("columns.dealAmount")}</th>
                      <th className="px-5 py-3">{t("columns.commission")}</th>
                      <th className="px-5 py-3">{t("columns.status")}</th>
                      <th className="px-5 py-3">{t("columns.dealDate")}</th>
                      <th className="px-5 py-3">{t("columns.paidAt")}</th>
                      <th className="px-5 py-3">{t("columns.details")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obligations.map((item) => (
                      <CommissionRow item={item} key={item.dealId} locale={locale} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-[#e4ebe6] bg-white p-5">
      <p className="m-0 text-sm text-muted">{label}</p>
      <p className="mt-2 mb-0 text-2xl font-semibold tracking-[-0.02em] text-ink">{value}</p>
    </article>
  );
}

function CommissionCard({ item, locale }: { item: Obligation; locale: string }) {
  const t = useTranslations("companyCommissions");
  return (
    <article className="rounded-xl border border-[#e4ebe6] p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="m-0 text-base font-semibold text-ink">{item.projectTitle}</h2>
        <StatusBadge status={item.commissionStatus} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <Field label={t("columns.dealAmount")} value={amount(item.agreedAmountMad, locale, t("unavailable"))} />
        <Field label={t("columns.commission")} value={amount(item.commissionAmountMad, locale, t("unavailable"))} />
        <Field label={t("columns.dealDate")} value={date(item.createdAt, locale)} />
        <Field label={t("columns.paidAt")} value={item.paidAt ? date(item.paidAt, locale) : "—"} />
      </dl>
      <CommissionDetails item={item} locale={locale} />
    </article>
  );
}

function CommissionRow({ item, locale }: { item: Obligation; locale: string }) {
  const t = useTranslations("companyCommissions");
  return (
    <tr className="border-t border-[#eef2f0] align-top">
      <td className="px-5 py-4 font-semibold text-ink">{item.projectTitle}</td>
      <td className="px-5 py-4 text-ink">{amount(item.agreedAmountMad, locale, t("unavailable"))}</td>
      <td className="px-5 py-4 font-semibold text-ink">{amount(item.commissionAmountMad, locale, t("unavailable"))}</td>
      <td className="px-5 py-4"><StatusBadge status={item.commissionStatus} /></td>
      <td className="px-5 py-4 text-muted">{date(item.createdAt, locale)}</td>
      <td className="px-5 py-4 text-muted">{item.paidAt ? date(item.paidAt, locale) : "—"}</td>
      <td className="px-5 py-4"><CommissionDetails item={item} locale={locale} /></td>
    </tr>
  );
}

function CommissionDetails({ item, locale }: { item: Obligation; locale: string }) {
  const t = useTranslations("companyCommissions");
  return (
    <details className="mt-4 md:mt-0">
      <summary className="cursor-pointer text-sm font-semibold text-brand">{t("details.open")}</summary>
      <dl className="mt-3 grid gap-3 rounded-xl bg-[#f7faf8] p-3 text-sm md:min-w-56">
        <Field label={t("details.rate")} value={item.commissionRateBps === null ? t("unavailable") : rate(item.commissionRateBps, locale)} />
        <Field label={t("details.beneficiary")} value={t("beneficiary")} />
        <Field label={t("details.configVersion")} value={item.commissionConfigVersion === null ? t("unavailable") : String(item.commissionConfigVersion)} />
        {!item.snapshotComplete ? <Field label={t("details.snapshot")} value={t("details.incomplete")} /> : null}
      </dl>
    </details>
  );
}

function StatusBadge({ status }: { status: "due" | "paid" }) {
  const t = useTranslations("companyCommissions");
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${status === "paid" ? "bg-[#dff6df] text-[#135c2b]" : "bg-[#fff2cc] text-[#7a5200]"}`}>
      {t(`status.${status}`)}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 mb-0 font-medium text-ink">{value}</dd></div>;
}

function CommissionsSkeleton() {
  const t = useTranslations("companyCommissions");
  return (
    <main aria-busy="true" aria-label={t("loading")} className="min-h-[calc(100dvh-4.5rem)] bg-[#f7f9fb] py-10">
      <div className="mx-auto w-[calc(100%-36px)] max-w-[1120px]">
        <div className="skeleton-block h-10 w-64 rounded-lg" />
        <div className="mt-7 grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((item) => <div className="skeleton-block h-28 rounded-2xl" key={item} />)}</div>
        <div className="skeleton-block mt-6 h-72 rounded-2xl" />
      </div>
    </main>
  );
}

function money(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "MAD", maximumFractionDigits: 0 }).format(value);
}
function amount(value: number | null, locale: string, fallback: string) { return value === null ? fallback : money(value, locale); }
function rate(value: number, locale: string) { return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(value / 10_000); }
function date(value: number, locale: string) { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Africa/Casablanca" }).format(value); }
