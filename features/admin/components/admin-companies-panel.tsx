"use client";

import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { ADMIN_PRESS, AdminPage } from "@/features/admin/components/admin-shell";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

type Row = FunctionReturnType<typeof api.admin.companies.listCompanies>["page"][number];
type Verification = Row["verificationStatus"] | "all";
type Onboarding = Row["onboardingStatus"] | "all";
type FilterOption = "all" | "draft" | "pending" | "verified" | "rejected" | "completed";

export function AdminCompaniesPanel() {
  const t = useTranslations("adminCompanies");
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<Verification>("all");
  const [onboardingStatus, setOnboardingStatus] = useState<Onboarding>("all");
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.companies.listCompanies,
    {
      search: search.trim() || undefined,
      verificationStatus: verificationStatus === "all" ? undefined : verificationStatus,
      onboardingStatus: onboardingStatus === "all" ? undefined : onboardingStatus,
    },
    { initialNumItems: 20 },
  );

  const loading = status === "LoadingFirstPage";
  const empty = status === "Exhausted" && results.length === 0;

  return (
    <AdminPage breadcrumb={t("title")} title={t("title")}>
      <p className="max-w-3xl text-sm leading-6 text-[#626970]">{t("lead")}</p>
      <section className="rounded-[20px] border border-[#e7eaee] bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_200px_200px]">
          <label className="flex min-h-11 items-center rounded-full bg-[#f4f6f8] px-4 text-sm">
            <span className="sr-only">{t("filters.searchLabel")}</span>
            <input
              className="h-11 w-full bg-transparent outline-none placeholder:text-[#8b919a]"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("filters.searchPlaceholder")}
              value={search}
            />
          </label>
          <FilterSelect
            label={t("filters.verificationLabel")}
            onChange={(value) => setVerificationStatus(value as Verification)}
            options={["all", "draft", "pending", "verified", "rejected"]}
            value={verificationStatus}
          />
          <FilterSelect
            label={t("filters.onboardingLabel")}
            onChange={(value) => setOnboardingStatus(value as Onboarding)}
            options={["all", "pending", "completed"]}
            value={onboardingStatus}
          />
        </div>

        {loading ? (
          <div aria-busy="true" className="mt-5 space-y-3" role="status">
            <span className="sr-only">{t("loading")}</span>
            {Array.from({ length: 5 }).map((_, index) => (
              <div className="h-20 animate-pulse rounded-[14px] bg-[#f4f6f8]" key={index} />
            ))}
          </div>
        ) : empty ? (
          <p className="py-14 text-center text-sm text-[#8b919a]">{t("empty")}</p>
        ) : (
          <>
            <div className="mt-5 grid gap-3 md:hidden">
              {results.map((row) => <CompanyCard key={row.companyId} locale={locale} row={row} />)}
            </div>
            <div className="mt-5 hidden overflow-x-auto md:block">
              <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className="text-xs font-semibold uppercase tracking-wide text-[#8b919a]">
                    {(["company", "status", "onboarding", "services", "members", "activity", "action"] as const).map((key) => (
                      <th className="px-3 py-2" key={key}>{t(`columns.${key}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr className="bg-[#f8fafb]" key={row.companyId}>
                      <td className="rounded-l-[14px] px-3 py-3">
                        <span className="block font-semibold text-[#17191d]">{row.name}</span>
                        <span className="block text-xs text-[#8b919a]">{row.city ?? "—"}</span>
                      </td>
                      <td className="px-3 py-3"><Status kind="verification" value={row.verificationStatus} /></td>
                      <td className="px-3 py-3"><Status kind="onboarding" value={row.onboardingStatus} /></td>
                      <td className="max-w-60 px-3 py-3 text-[#626970]">{serviceList(row.services, t)}</td>
                      <td className="px-3 py-3">{row.activeMemberCount}</td>
                      <td className="px-3 py-3 text-[#626970]">{formatDate(row.latestActivityAt, locale)}</td>
                      <td className="rounded-r-[14px] px-3 py-3"><CompanyLink companyId={row.companyId} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {status === "CanLoadMore" || status === "LoadingMore" ? (
          <button
            className={`mt-5 min-h-11 w-full rounded-full border border-[#e6e9ee] px-4 text-sm font-semibold disabled:opacity-50 ${ADMIN_PRESS}`}
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(20)}
            type="button"
          >
            {status === "LoadingMore" ? t("loadingMore") : t("loadMore")}
          </button>
        ) : null}
      </section>
    </AdminPage>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: FilterOption[]; onChange: (value: string) => void }) {
  const t = useTranslations("adminCompanies");
  return (
    <label className="grid gap-1 text-xs font-semibold text-[#626970]">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        className="min-h-11 rounded-full border-0 bg-[#f4f6f8] px-4 text-sm font-medium text-[#17191d] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => <option key={option} value={option}>{t(`filters.options.${option}`)}</option>)}
      </select>
    </label>
  );
}

function CompanyCard({ row, locale }: { row: Row; locale: string }) {
  const t = useTranslations("adminCompanies");
  return (
    <article className="rounded-[16px] bg-[#f8fafb] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{row.name}</h2>
          <p className="mt-1 text-sm text-[#626970]">{row.city ?? "—"}</p>
        </div>
        <Status kind="verification" value={row.verificationStatus} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><Status kind="onboarding" value={row.onboardingStatus} /></div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Item label={t("columns.services")} value={serviceList(row.services, t)} />
        <Item label={t("columns.members")} value={String(row.activeMemberCount)} />
        <Item label={t("rating")} value={row.rating === null ? "—" : `${row.rating.toFixed(1)} · ${row.reviewCount}`} />
        <Item label={t("columns.activity")} value={formatDate(row.latestActivityAt, locale)} />
      </dl>
      <CompanyLink companyId={row.companyId} />
    </article>
  );
}

function CompanyLink({ companyId }: { companyId: Row["companyId"] }) {
  const t = useTranslations("adminCompanies");
  return <Link className={`mt-4 inline-flex min-h-10 items-center rounded-full border bg-white px-4 text-sm font-semibold ${ADMIN_PRESS}`} href={{ pathname: routes.adminCompany, params: { companyId } }}>{t("viewCompany")}</Link>;
}

function Status(props: { value: Row["verificationStatus"]; kind: "verification" } | { value: Row["onboardingStatus"]; kind: "onboarding" }) {
  const t = useTranslations("adminCompanies");
  const value = props.value;
  const style = value === "verified" || value === "completed"
    ? "bg-emerald-100 text-emerald-800"
    : value === "rejected"
      ? "bg-red-100 text-red-800"
      : value === "pending"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-200 text-slate-700";
  const label = props.kind === "verification"
    ? t(`status.verification.${props.value}`)
    : t(`status.onboarding.${props.value}`);
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{label}</span>;
}

function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold text-[#8b919a]">{label}</dt><dd className="mt-1 text-[#30343a]">{value}</dd></div>; }
function serviceList(services: Row["services"], t: ReturnType<typeof useTranslations>) { return services.length ? services.slice(0, 3).map((service) => t(`services.${service}`)).join(", ") : "—"; }
function formatDate(value: number, locale: string) { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Africa/Casablanca" }).format(value); }
