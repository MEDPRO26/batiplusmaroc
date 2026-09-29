"use client";

import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { ADMIN_PRESS, AdminPage } from "@/features/admin/components/admin-shell";
import { Link, useRouter } from "@/i18n/navigation";
import {
  COMPANIES_RETURN_KEY,
  ONBOARDINGS,
  OPERATIONALS,
  VERIFICATIONS,
  toQuery,
  type AdminCompanyFilters,
} from "@/features/admin/lib/company-filters";
import { routes } from "@/lib/routes";

type Row = FunctionReturnType<typeof api.admin.companies.listCompanies>["page"][number];
type Verification = Row["verificationStatus"];
type QuickView = "all" | "pending" | "verified" | "attention" | "suspended";
const QUICK_VIEWS: Record<QuickView, Partial<AdminCompanyFilters>> = {
  all: { verification: null, operational: null },
  pending: { verification: "pending", operational: null },
  verified: { verification: "verified", operational: null },
  attention: { verification: null, operational: "needs_attention" },
  suspended: { verification: null, operational: "suspended" },
};

export function AdminCompaniesPanel({ initialFilters }: { initialFilters: AdminCompanyFilters }) {
  const t = useTranslations("adminCompanies");
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.companies.listCompanies,
    {
      search: filters.search.trim() || undefined,
      verificationStatus: filters.verification ?? undefined,
      onboardingStatus: filters.onboarding ?? undefined,
      operationalStatus: filters.operational ?? undefined,
    },
    { initialNumItems: 20 },
  );

  // Filters live in the URL so Back, reload and "Back to companies" restore the same view.
  useEffect(() => {
    const query = toQuery(filters);
    router.replace({ pathname: routes.adminCompanies, query }, { scroll: false });
    try {
      window.sessionStorage.setItem(COMPANIES_RETURN_KEY, new URLSearchParams(query).toString());
    } catch {
      // Storage can be unavailable (private mode); the URL still carries the state.
    }
  }, [filters, router]);

  const update = (patch: Partial<AdminCompanyFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const activeView = (Object.keys(QUICK_VIEWS) as QuickView[]).find((view) => {
    const preset = QUICK_VIEWS[view];
    return preset.verification === filters.verification && preset.operational === filters.operational;
  });
  const loading = status === "LoadingFirstPage";
  const empty = status === "Exhausted" && results.length === 0;

  return (
    <AdminPage breadcrumb={t("title")} title={t("title")}>
      <p className="-mt-2 max-w-3xl text-sm leading-6 text-[#626970]">{t("lead")}</p>
      <section className="overflow-hidden rounded-[16px] border border-[#e7eaee] bg-white">
        <div className="overflow-x-auto border-b border-[#eef1f4]">
          <div aria-label={t("views.label")} className="flex min-w-max gap-5 px-4 sm:px-5" role="group">
            {(Object.keys(QUICK_VIEWS) as QuickView[]).map((view) => (
              <button
                aria-pressed={activeView === view}
                className={`-mb-px min-h-12 border-0 border-b-2 border-transparent bg-transparent px-0.5 text-sm font-semibold text-[#626970] hover:text-[#17191d] aria-pressed:border-[#2f6bff] aria-pressed:text-[#17191d] ${ADMIN_PRESS} active:scale-100`}
                key={view}
                onClick={() => update(QUICK_VIEWS[view])}
                type="button"
              >
                {t(`views.${view}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2.5 p-4 sm:grid-cols-3 sm:p-5 xl:grid-cols-[minmax(220px,1fr)_auto_auto_auto]">
          <label className="flex min-h-11 items-center gap-2 rounded-full border border-[#e7eaee] bg-white px-4 text-sm focus-within:border-[#2f6bff] sm:col-span-3 xl:col-span-1">
            <SearchIcon />
            <span className="sr-only">{t("filters.searchLabel")}</span>
            <input
              className="h-11 w-full bg-transparent outline-none placeholder:text-[#8b919a]"
              onChange={(event) => update({ search: event.target.value })}
              placeholder={t("filters.searchPlaceholder")}
              type="search"
              value={filters.search}
            />
          </label>
          <FilterSelect
            allLabel={t("filters.allVerification")}
            label={t("filters.verificationLabel")}
            labelFor={(value) => t(`status.verification.${value}`)}
            onChange={(value) => update({ verification: value })}
            options={VERIFICATIONS}
            value={filters.verification}
          />
          <FilterSelect
            allLabel={t("filters.allOperational")}
            label={t("filters.operationalLabel")}
            labelFor={(value) => t(`operationalStatus.status.${value}`)}
            onChange={(value) => update({ operational: value })}
            options={OPERATIONALS}
            value={filters.operational}
          />
          <FilterSelect
            allLabel={t("filters.allOnboarding")}
            label={t("filters.onboardingLabel")}
            labelFor={(value) => t(`status.onboarding.${value}`)}
            onChange={(value) => update({ onboarding: value })}
            options={ONBOARDINGS}
            value={filters.onboarding}
          />
        </div>

        {loading ? (
          <div aria-busy="true" className="space-y-2 px-4 pb-5 sm:px-5" role="status">
            <span className="sr-only">{t("loading")}</span>
            {Array.from({ length: 6 }).map((_, index) => <div className="h-14 animate-pulse rounded-[10px] bg-[#f4f6f8]" key={index} />)}
          </div>
        ) : empty ? (
          <p className="border-t border-[#eef1f4] py-14 text-center text-sm text-[#8b919a]">{t("empty")}</p>
        ) : (
          <>
            <ul className="m-0 list-none divide-y divide-[#eef1f4] border-t border-[#eef1f4] p-0 xl:hidden">
              {results.map((row) => <CompanyCard key={row.companyId} row={row} />)}
            </ul>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[13%]" />
                  <col className="w-[16%]" />
                  <col className="w-[18%]" />
                  <col className="w-[12%]" />
                  <col className="w-[11%]" />
                </colgroup>
                <thead className="border-t border-[#eef1f4] bg-[#fafbfc]">
                  <tr className="text-xs font-semibold text-[#8b919a]">
                    {(["company", "status", "operational", "marketplace", "activity", "action"] as const).map((key) => (
                      <th className={`px-4 py-2.5 font-semibold ${key === "action" ? "text-right" : ""}`} key={key} scope="col">
                        {key === "action" ? <span className="sr-only">{t(`columns.${key}`)}</span> : t(`columns.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef1f4]">
                  {results.map((row) => <CompanyRow key={row.companyId} row={row} />)}
                </tbody>
              </table>
            </div>
          </>
        )}

        {status === "CanLoadMore" || status === "LoadingMore" ? (
          <div className="border-t border-[#eef1f4] p-4">
            <button
              className={`min-h-11 w-full rounded-full border border-[#e6e9ee] px-4 text-sm font-semibold disabled:opacity-50 ${ADMIN_PRESS}`}
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(20)}
              type="button"
            >
              {status === "LoadingMore" ? t("loadingMore") : t("loadMore")}
            </button>
          </div>
        ) : null}
      </section>
    </AdminPage>
  );
}

function companyHref(row: Row) {
  // Pending submissions open straight on the work Admin has to do.
  return row.verificationStatus === "pending"
    ? { pathname: routes.adminCompany, params: { companyId: row.companyId }, query: { tab: "verification" } }
    : { pathname: routes.adminCompany, params: { companyId: row.companyId } };
}

function CompanyRow({ row }: { row: Row }) {
  const t = useTranslations("adminCompanies");
  const locale = useLocale();
  const router = useRouter();
  return (
    <tr
      className="group cursor-pointer hover:bg-[#f7f9fc]"
      // Whole-row click for pointer users; the name and action links stay the keyboard path.
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, button")) return;
        router.push(companyHref(row));
      }}
    >
      <td className="px-4 py-3">
        <Link className="block truncate font-semibold text-[#17191d] hover:text-[#2456c7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff]" href={companyHref(row)}>
          {row.name}
        </Link>
        <span className="mt-0.5 block truncate text-xs text-[#8b919a]">
          {row.city ?? "—"}
          {row.onboardingStatus === "pending" ? <> · {t("row.onboardingIncomplete")}</> : null}
        </span>
      </td>
      <td className="px-4 py-3"><VerificationPill value={row.verificationStatus} /></td>
      <td className="px-4 py-3"><OperationalPill value={row.operationalStatus} /></td>
      <td className="truncate px-4 py-3 text-[#626970]"><MarketplaceSummary row={row} /></td>
      <td className="px-4 py-3 whitespace-nowrap text-[#626970]">{formatDate(row.latestActivityAt, locale)}</td>
      <td className="px-4 py-3 text-right">
        <Link
          aria-label={t("row.openAria", { name: row.name })}
          className={`inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold whitespace-nowrap text-[#2456c7] hover:bg-[#eef4ff] ${ADMIN_PRESS}`}
          href={companyHref(row)}
        >
          {row.verificationStatus === "pending" ? t("row.review") : t("viewCompany")}
          <span aria-hidden>→</span>
        </Link>
      </td>
    </tr>
  );
}

function CompanyCard({ row }: { row: Row }) {
  const t = useTranslations("adminCompanies");
  const locale = useLocale();
  return (
    <li>
      <Link className="block px-4 py-3.5 hover:bg-[#fafbfc] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#2f6bff]" href={companyHref(row)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 truncate font-semibold text-[#17191d]">{row.name}</p>
            <p className="m-0 mt-0.5 text-xs text-[#8b919a]">{row.city ?? "—"} · {formatDate(row.latestActivityAt, locale)}</p>
          </div>
          <span aria-hidden className="text-[#8b919a]">→</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <VerificationPill value={row.verificationStatus} />
          <OperationalPill value={row.operationalStatus} />
          <span className="text-xs text-[#626970]"><MarketplaceSummary row={row} /></span>
        </div>
        <span className="sr-only">{t("viewCompany")}</span>
      </Link>
    </li>
  );
}

function MarketplaceSummary({ row }: { row: Row }) {
  const t = useTranslations("adminCompanies");
  return (
    <span className="whitespace-nowrap">
      {t("row.members", { count: row.activeMemberCount })}
      {" · "}
      {row.rating === null ? t("row.noReviews") : t("row.rating", { rating: row.rating.toFixed(1), count: row.reviewCount })}
    </span>
  );
}

function FilterSelect<T extends string>({ label, allLabel, value, options, labelFor, onChange }: {
  label: string;
  allLabel: string;
  value: T | null;
  options: readonly T[];
  labelFor: (value: T) => string;
  onChange: (value: T | null) => void;
}) {
  return (
    <select
      aria-label={label}
      className="min-h-11 w-full min-w-0 rounded-full border border-[#e7eaee] bg-white px-4 pr-9 text-sm font-medium text-[#17191d] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff]"
      onChange={(event) => onChange(event.target.value ? (event.target.value as T) : null)}
      value={value ?? ""}
    >
      <option value="">{allLabel}</option>
      {options.map((option) => <option key={option} value={option}>{labelFor(option)}</option>)}
    </select>
  );
}

const PILL = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

export function VerificationPill({ value }: { value: Verification }) {
  const t = useTranslations("adminCompanies");
  const tone = value === "verified" ? "bg-emerald-50 text-emerald-800" : value === "rejected" ? "bg-red-50 text-red-800" : value === "pending" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700";
  return <span className={`${PILL} ${tone}`}>{t(`status.verification.${value}`)}</span>;
}

export function OperationalPill({ value: raw }: { value: Row["operationalStatus"] | undefined }) {
  const t = useTranslations("adminCompanies");
  // A missing value is the stored representation of "normal".
  const value = raw ?? "normal";
  const tone = value === "suspended" ? "bg-red-50 text-red-800" : value === "needs_attention" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600";
  return <span className={`${PILL} ${tone}`}>{t(`operationalStatus.status.${value}`)}</span>;
}

function SearchIcon() {
  return <svg aria-hidden className="size-4 shrink-0 text-[#8b919a]" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>;
}

function formatDate(value: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Africa/Casablanca" }).format(value);
}
