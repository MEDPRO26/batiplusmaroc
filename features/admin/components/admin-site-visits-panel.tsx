"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MapPin,
  Search,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog, Tabs } from "radix-ui";
import { useEffect, useId, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AdminPage,
  ADMIN_PRESS,
} from "@/features/admin/components/admin-shell";
import { Link } from "@/i18n/navigation";
import { hasAdminVisitDateTimeFormat } from "@/lib/dates/admin-site-visit";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { getProvincesByRegion, getRegions } from "@/lib/geography/morocco";
import { useAdminProjectLocationLabel } from "@/features/admin/hooks/use-admin-project-location-label";

const TABS = [
  "all",
  "invited",
  "accepted",
  "proposed",
  "confirmed",
  "completed",
  "cancelled_declined",
] as const;
const CITIES = [
  "agadir",
  "casablanca",
  "fes",
  "marrakech",
  "meknes",
  "oujda",
  "rabat",
  "sale",
  "tangier",
  "tetouan",
] as const;
const PAGE_SIZE = 15;
const CURSOR_PAGE_SIZE = 25;

const SECONDARY = `inline-flex min-h-10 items-center justify-center gap-1.5 rounded-sm border border-[#e6e9ee] bg-white px-4 text-sm font-semibold text-[#17191d] hover:bg-[#f7f9fc] ${ADMIN_PRESS}`;
const ICON_BUTTON = `inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-[#626970] hover:bg-[#f2f4f7] hover:text-[#17191d] ${ADMIN_PRESS}`;
const FILTER_SHELL =
  "flex min-h-11 min-w-0 items-center gap-2 rounded-sm border border-[#e7eaee] bg-white px-4 text-sm transition-[border-color,box-shadow] duration-150 focus-within:border-[#2f6bff] focus-within:ring-3 focus-within:ring-[#2f6bff]/15";
const UNDERLINE_TAB = `-mb-px inline-flex min-h-12 items-center gap-2 border-0 border-b-2 border-transparent bg-transparent px-0.5 text-sm font-semibold whitespace-nowrap text-[#626970] hover:text-[#17191d] aria-pressed:border-[#2f6bff] aria-pressed:text-[#17191d] ${ADMIN_PRESS} active:scale-100`;
const DRAWER_TAB = `-mb-px inline-flex min-h-12 items-center gap-2 border-0 border-b-2 border-transparent bg-transparent px-0.5 text-sm font-semibold whitespace-nowrap text-[#626970] hover:text-[#17191d] data-[state=active]:border-[#2f6bff] data-[state=active]:text-[#17191d] ${ADMIN_PRESS} active:scale-100`;
const PILL =
  "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

type Tab = (typeof TABS)[number];
type City = (typeof CITIES)[number];
type Row = FunctionReturnType<
  typeof api.admin.siteVisits.listSiteVisits
>[number];
type Detail = NonNullable<
  FunctionReturnType<typeof api.admin.siteVisits.getSiteVisitDetail>
>;
type Status =
  | Row["status"]
  | Row["assessmentStatus"]
  | Detail["assessment"]["status"]
  | NonNullable<Detail["visit"]>["status"];
type FinalQuoteStatus = Row["finalQuoteStatus"];
type Tone = "success" | "danger" | "info" | "warning" | "neutral";

const TONE_PILL: Record<Tone, string> = {
  success: "bg-[#e7f8ee] text-[#157a3e]",
  danger: "bg-[#fdecec] text-[#b42318]",
  info: "bg-[#e8f0ff] text-[#2755c8]",
  warning: "bg-[#fff4df] text-[#9a6700]",
  neutral: "bg-[#f2f4f7] text-[#626970]",
};
const TONE_DOT: Record<Tone, string> = {
  success: "bg-[#22a35a]",
  danger: "bg-[#e5484d]",
  info: "bg-[#2f6bff]",
  warning: "bg-[#e0a100]",
  neutral: "bg-[#a0a6ae]",
};

export function AdminSiteVisitsPanel() {
  const locationLabel = useAdminProjectLocationLabel();
  const t = useTranslations("adminSiteVisits");
  const tWizard = useTranslations("projectWizard");
  const tUx = useTranslations("ux");
  const locale = useLocale();
  const filterId = useId();
  const rollout = useQuery(api.admin.siteVisits.getSiteVisitPaginationRollout, {});
  const indexed = rollout?.enabled === true;
  const [geography, setGeography] = useState({ regionCode: "", provinceCode: "" });
  const provinces = getProvincesByRegion(geography.regionCode);
  const [tab, setTab] = useState<Tab>("all");
  const [projectSearch, setProjectSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [city, setCity] = useState<City | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"siteAssessments"> | null>(
    null,
  );
  const [now, setNow] = useState(0);
  const [pageNow, setPageNow] = useState(0);
  const [expanded, setExpanded] = useState({ key: "", count: PAGE_SIZE });
  const invalidDateRange =
    dateFrom !== "" && dateTo !== "" && dateFrom > dateTo;
  const hasFilters =
    projectSearch !== "" ||
    companySearch !== "" ||
    (!indexed && city !== "") ||
    dateFrom !== "" ||
    dateTo !== "" ||
    (indexed && (geography.regionCode !== "" || geography.provinceCode !== ""));
  // Any filter change falls back to the first page without an effect.
  const filterKey = [tab, projectSearch, companySearch, city, dateFrom, dateTo].join("|");
  const visibleCount = expanded.key === filterKey ? expanded.count : PAGE_SIZE;

  useEffect(() => {
    const updateClock = () => {
      const value = Date.now();
      setNow(value);
      setPageNow((initial) => initial || value);
    };
    const initialTimer = window.setTimeout(updateClock, 0);
    const interval = window.setInterval(updateClock, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  const filters = {
    status: tab,
    projectSearch: projectSearch.trim() || undefined,
    companySearch: companySearch.trim() || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    now,
  };
  const legacyList = useQuery(
    api.admin.siteVisits.listSiteVisits,
    indexed || now === 0 || invalidDateRange ? "skip" : { ...filters, city: city || undefined },
  );
  const pager = usePaginatedQuery(
    api.admin.siteVisits.listSiteVisitsPage,
    !indexed || pageNow === 0 || invalidDateRange ? "skip" : {
      ...filters,
      // A changing clock would discard every loaded cursor page. Live risk is
      // refreshed below; source/status/filter changes still use the native pager.
      now: pageNow,
      regionCode: geography.regionCode || undefined,
      provinceCode: geography.provinceCode || undefined,
    },
    { initialNumItems: CURSOR_PAGE_SIZE },
  );
  const list = indexed ? pager.results : legacyList;
  const loading = indexed ? pager.status === "LoadingFirstPage" : list === undefined;
  const exhausted = !indexed || pager.status === "Exhausted";
  const visible = indexed ? (list ?? []).map((row): Row => {
    if (row.status !== "confirmed" || !row.visitDate || !row.visitTime) return row;
    // Use the authoritative backend epoch: browser timezone data may differ.
    // Malformed schedules use proposedAt for sort, but never acquire overdue risk.
    const parseable = hasAdminVisitDateTimeFormat({ proposedDate: row.visitDate, proposedTime: row.visitTime });
    return { ...row, riskSignal: parseable && row.sortAt < now ? "visit_follow_up_needed" : null };
  }) : list?.slice(0, visibleCount) ?? [];
  const remaining = indexed ? 0 : (list?.length ?? 0) - visible.length;

  function clearFilters() {
    setProjectSearch("");
    setCompanySearch("");
    setCity("");
    setDateFrom("");
    setDateTo("");
    setGeography({ regionCode: "", provinceCode: "" });
  }

  return (
    <AdminPage breadcrumb={t("title")} title={t("title")}>
      <p className="max-w-3xl text-sm leading-6 text-pretty text-[#626970]">
        {t("lead")}
      </p>

      <section className="overflow-hidden rounded-[16px] border border-[#e7eaee] bg-white">
        <div
          aria-label={t("tabsLabel")}
          className="flex gap-5 overflow-x-auto border-b border-[#eef1f4] px-4 sm:px-5"
          role="group"
        >
          {TABS.map((status) => (
            <button
              aria-pressed={tab === status}
              className={UNDERLINE_TAB}
              key={status}
              onClick={() => {
                setTab(status);
                setSelectedId(null);
              }}
              type="button"
            >
              {t(`tabs.${status}`)}
            </button>
          ))}
        </div>

        <div className={`grid grid-cols-1 gap-2 border-b border-[#eef1f4] p-4 sm:grid-cols-2 sm:px-5 ${indexed
          ? "2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          : "2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_11rem_auto]"}`}>
          <FilterInput
            label={t("filters.projectLabel")}
            onChange={setProjectSearch}
            placeholder={t("filters.projectPlaceholder")}
            value={projectSearch}
          />
          <FilterInput
            label={t("filters.companyLabel")}
            onChange={setCompanySearch}
            placeholder={t("filters.companyPlaceholder")}
            value={companySearch}
          />
          {!indexed ? <label className={`${FILTER_SHELL} relative`}>
            <MapPin aria-hidden className="size-4 shrink-0 text-[#8b919a]" />
            <span className="sr-only">{t("filters.cityLabel")}</span>
            <select
              className={`h-10 w-full min-w-0 cursor-pointer appearance-none bg-transparent pr-5 outline-none ${city ? "text-[#17191d]" : "text-[#626970]"}`}
              onChange={(event) => setCity(event.target.value as City | "")}
              value={city}
            >
              <option value="">{t("filters.allCities")}</option>
              {CITIES.map((value) => (
                <option key={value} value={value}>
                  {tWizard(`cityOptions.${value}`)}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute right-4 size-4 text-[#8b919a]"
            />
          </label> : null}
          <div
            aria-label={t("filters.dateRange")}
            className={`${FILTER_SHELL} ${invalidDateRange ? "border-[#e5484d]" : ""}`}
            role="group"
          >
            <CalendarDays
              aria-hidden
              className="size-4 shrink-0 text-[#8b919a]"
            />
            <DateInput
              label={t("filters.dateFrom")}
              onChange={setDateFrom}
              value={dateFrom}
            />
            <span aria-hidden className="text-[#c5cad1]">
              –
            </span>
            <DateInput
              label={t("filters.dateTo")}
              onChange={setDateTo}
              value={dateTo}
            />
          </div>
        </div>
        {indexed ? (
          <div className="grid min-w-0 gap-2 border-b border-[#eef1f4] p-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className={FILTER_SHELL}>
              <span className="sr-only">{t("filters.regionLabel")}</span>
              <select className="h-10 w-full min-w-0 bg-transparent text-[#17191d] outline-none"
                onChange={(event) => setGeography({ regionCode: event.target.value, provinceCode: "" })}
                value={geography.regionCode}>
                <option value="">{t("filters.allMorocco")}</option>
                {getRegions().map((region) => <option key={region.code} value={region.code}>
                  {locale === "fr" ? region.nameFr : region.nameEn}
                </option>)}
              </select>
            </label>
            <div className="min-w-0">
              <label className={FILTER_SHELL}>
                <span className="sr-only">{t("filters.provinceLabel")}</span>
                <select aria-describedby={!geography.regionCode ? `${filterId}-province-help` : undefined}
                  className="h-10 w-full min-w-0 bg-transparent text-[#17191d] outline-none disabled:text-[#8b919a]"
                  disabled={!geography.regionCode}
                  onChange={(event) => setGeography((current) => ({ ...current, provinceCode: event.target.value }))}
                  value={geography.provinceCode}>
                  <option value="">{t("filters.allProvinces")}</option>
                  {provinces.map((province) => <option key={province.code} value={province.code}>
                    {locale === "fr" ? province.nameFr : province.nameEn}
                  </option>)}
                </select>
              </label>
              {!geography.regionCode ? <p className="mt-1 text-xs text-[#626970]" id={`${filterId}-province-help`}>
                {t("filters.provinceDisabled")}
              </p> : null}
            </div>
            <button className={SECONDARY} disabled={!geography.regionCode && !geography.provinceCode}
              onClick={() => setGeography({ regionCode: "", provinceCode: "" })} type="button">
              {t("filters.clearGeography")}
            </button>
          </div>
        ) : <p className="border-b border-[#eef1f4] px-4 py-3 text-xs leading-5 text-[#626970] sm:px-5">
          {t("pagination.legacyLimited")}
        </p>}
        {invalidDateRange ? (
          <p
            className="mx-4 mt-4 rounded-[10px] bg-[#fff4f2] px-3 py-2 text-sm text-[#8a2f28] sm:mx-5"
            role="alert"
          >
            {t("filters.invalidRange")}
          </p>
        ) : null}

        {invalidDateRange ? (
          <div className="h-4" />
        ) : loading ? (
          <SiteVisitSkeleton label={tUx("loading.dashboard")} />
        ) : (
          <>
            <div className="flex min-h-12 items-center justify-between gap-3 px-4 sm:px-5">
              <p className="text-sm text-[#626970] tabular-nums">
                {indexed ? t("pagination.loadedCount", { count: list?.length ?? 0 }) : t("resultCount", { count: list?.length ?? 0 })}
              </p>
              {hasFilters ? (
                <button
                  className={`inline-flex min-h-10 items-center gap-1 rounded-sm px-2 text-sm font-semibold text-[#2f6bff] hover:text-[#2456c7] ${ADMIN_PRESS}`}
                  onClick={clearFilters}
                  type="button"
                >
                  <X aria-hidden className="size-4" />
                  {t("clearFilters")}
                </button>
              ) : null}
            </div>
            {list?.length === 0 ? (
              <div className="grid justify-items-center gap-1 border-t border-[#eef1f4] px-6 py-16 text-center">
                <p className="text-base font-semibold text-[#17191d]">
                  {exhausted ? t("empty") : t("pagination.moreMatches")}
                </p>
                <p className="max-w-sm text-sm text-[#626970]">
                  {exhausted ? t("emptyHint") : t("pagination.continueHint")}
                </p>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-[#eef1f4] border-t border-[#eef1f4] xl:hidden">
                  {visible.map((row) => (
                    <SiteVisitCard
                      key={row.assessmentId}
                      locale={locale}
                      onView={() => setSelectedId(row.assessmentId)}
                      row={row}
                    />
                  ))}
                </ul>
                <table className="hidden w-full table-fixed border-collapse text-left text-sm xl:table">
                  <thead className="border-y border-[#eef1f4] bg-[#fafbfc]">
                    <tr className="text-xs font-semibold text-[#8b919a]">
                      <th className="px-5 py-2.5 font-semibold" scope="col">
                        {t("columns.project")}
                      </th>
                      <th className="w-[18%] px-4 py-2.5 font-semibold" scope="col">
                        {t("partiesColumn")}
                      </th>
                      <th className="w-[16%] px-4 py-2.5 font-semibold" scope="col">
                        {t("columns.visitDate")}
                      </th>
                      <th
                        className="hidden w-[11%] px-4 py-2.5 font-semibold 2xl:table-cell"
                        scope="col"
                      >
                        {t("columns.assessmentStatus")}
                      </th>
                      <th className="w-[21%] px-4 py-2.5 font-semibold 2xl:w-[17%]" scope="col">
                        {t("columns.status")}
                      </th>
                      <th
                        className="w-[15%] px-4 py-2.5 font-semibold 2xl:w-[14%]"
                        scope="col"
                      >
                        {t("columns.finalQuote")}
                      </th>
                      <th className="w-12 py-2.5" scope="col">
                        <span className="sr-only">{t("columns.action")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef1f4]">
                    {visible.map((row) => (
                      // The whole row opens the sheet; the title button keeps it keyboard reachable.
                      <tr
                        className="group cursor-pointer transition-colors duration-150 hover:bg-[#f7f9fc]"
                        key={row.assessmentId}
                        onClick={() => setSelectedId(row.assessmentId)}
                      >
                        <td className="px-5 py-3.5">
                          <button
                            aria-label={t("viewAria", {
                              project: row.projectTitle,
                            })}
                            title={row.projectTitle}
                            className="block max-w-full cursor-pointer truncate text-left font-semibold text-[#17191d] group-hover:text-[#2456c7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff]"
                            type="button"
                          >
                            {row.projectTitle}
                          </button>
                          <span className="mt-0.5 flex items-start gap-1 text-xs text-[#8b919a] [overflow-wrap:anywhere]">
                            <MapPin aria-hidden className="size-3.5 shrink-0" />
                            {locationLabel(row)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="block truncate text-[#17191d]">
                            {row.companyName}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-[#8b919a]">
                            {row.clientName}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="block truncate text-[#17191d] tabular-nums">
                            {formatVisitDate(row, locale)}
                          </span>
                          {row.proposedBy ? (
                            <span className="mt-0.5 block truncate text-xs text-[#8b919a]">
                              {t("proposedByActor", {
                                actor: t(`actor.${row.proposedBy}`),
                              })}
                            </span>
                          ) : null}
                        </td>
                        <td className="hidden px-4 py-3.5 2xl:table-cell">
                          <StatusText status={row.assessmentStatus} />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusPill status={row.status} />
                            {row.riskSignal ? (
                              <RiskPill signal={row.riskSignal} />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <FinalQuoteText status={row.finalQuoteStatus} />
                        </td>
                        <td className="py-3.5 pr-4 text-right">
                          <ChevronRight
                            aria-hidden
                            className="inline size-4 text-[#c5cad1] transition-colors duration-150 group-hover:text-[#2f6bff]"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {remaining > 0 ? (
                  <div className="flex justify-center border-t border-[#eef1f4] p-4">
                    <button
                      className={SECONDARY}
                      onClick={() =>
                        setExpanded({
                          key: filterKey,
                          count: visibleCount + PAGE_SIZE,
                        })
                      }
                      type="button"
                    >
                      {t("showMore", {
                        count: Math.min(PAGE_SIZE, remaining),
                      })}
                    </button>
                  </div>
                ) : null}
              </>
            )}
            {indexed && (pager.status === "CanLoadMore" || pager.status === "LoadingMore") ? (
              <div className="flex justify-center border-t border-[#eef1f4] p-4">
                <button className={SECONDARY} disabled={pager.status === "LoadingMore"}
                  onClick={() => pager.loadMore(CURSOR_PAGE_SIZE)} type="button">
                  {pager.status === "LoadingMore" ? t("pagination.loadingMore") : t("pagination.loadMore")}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <SiteVisitDrawer
        assessmentId={selectedId}
        now={now}
        onClose={() => setSelectedId(null)}
      />
    </AdminPage>
  );
}

function FilterInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={FILTER_SHELL}>
      <Search aria-hidden className="size-4 shrink-0 text-[#8b919a]" />
      <span className="sr-only">{label}</span>
      <input
        className="h-10 w-full min-w-0 bg-transparent text-[#17191d] outline-none placeholder:text-[#8b919a]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <input
        className={`h-10 w-full min-w-[6.5rem] bg-transparent outline-none ${value ? "text-[#17191d]" : "text-[#8b919a]"}`}
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}

function SiteVisitCard({
  row,
  locale,
  onView,
}: {
  row: Row;
  locale: string;
  onView: () => void;
}) {
  const t = useTranslations("adminSiteVisits");
  const locationLabel = useAdminProjectLocationLabel();
  return (
    <li>
      <button
        aria-label={t("viewAria", { project: row.projectTitle })}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-4 text-left transition-colors duration-150 hover:bg-[#f7f9fc] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#2f6bff] sm:px-5"
        onClick={onView}
        type="button"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-semibold text-[#17191d]">
              {row.projectTitle}
            </span>
            <StatusPill status={row.status} />
          </span>
          <span className="mt-1 block truncate text-xs text-[#626970]">
            {row.companyName} · {row.clientName}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8b919a]">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CalendarDays aria-hidden className="size-3.5" />
              {formatVisitDate(row, locale)}
            </span>
            <span className="inline-flex min-w-0 max-w-full items-start gap-1 [overflow-wrap:anywhere]">
              <MapPin aria-hidden className="size-3.5 shrink-0" />
              {locationLabel(row)}
            </span>
            <FinalQuoteText status={row.finalQuoteStatus} />
          </span>
          {row.riskSignal ? (
            <span className="mt-2 block">
              <RiskPill signal={row.riskSignal} />
            </span>
          ) : null}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-[#c5cad1]" />
      </button>
    </li>
  );
}

function statusTone(status: Status): Tone {
  if (status === "completed") return "success";
  if (status === "cancelled" || status === "declined") return "danger";
  if (status === "confirmed" || status === "accepted") return "info";
  return "warning";
}

function finalQuoteTone(status: FinalQuoteStatus): Tone {
  if (status === "accepted") return "success";
  if (status === "declined" || status === "withdrawn") return "danger";
  if (status === "submitted") return "info";
  if (status === "not_available") return "neutral";
  return "warning";
}

function StatusPill({ status }: { status: Status }) {
  const t = useTranslations("adminSiteVisits");
  const tone = statusTone(status);
  return (
    <span className={`${PILL} ${TONE_PILL[tone]}`}>
      <span aria-hidden className={`size-1.5 rounded-sm ${TONE_DOT[tone]}`} />
      {t(`status.${status}`)}
    </span>
  );
}

function DotText({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[#626970]">
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-sm ${TONE_DOT[tone]}`}
      />
      <span className="truncate">{children}</span>
    </span>
  );
}

function StatusText({ status }: { status: Status }) {
  const t = useTranslations("adminSiteVisits");
  return <DotText tone={statusTone(status)}>{t(`status.${status}`)}</DotText>;
}

function FinalQuoteText({ status }: { status: FinalQuoteStatus }) {
  const t = useTranslations("adminSiteVisits");
  return (
    <DotText tone={finalQuoteTone(status)}>
      {t(`finalQuote.${status}` as "finalQuote.not_available")}
    </DotText>
  );
}

function RiskPill({ signal }: { signal: NonNullable<Row["riskSignal"]> }) {
  const t = useTranslations("adminSiteVisits");
  return (
    <span className={`${PILL} bg-[#fff0d8] text-[#9a6700]`}>
      <TriangleAlert aria-hidden className="size-3" />
      {t(`risk.${signal}`)}
    </span>
  );
}

function SiteVisitDrawer({
  assessmentId,
  now,
  onClose,
}: {
  assessmentId: Id<"siteAssessments"> | null;
  now: number;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={assessmentId !== null}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          // Focus the sheet itself so opening with the mouse does not ring the close button.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[640px] flex-col bg-white shadow-[-16px_0_48px_rgba(16,24,40,0.16)] outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
        >
          {assessmentId ? (
            <SiteVisitDrawerBody
              assessmentId={assessmentId}
              key={assessmentId}
              now={now}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SiteVisitDrawerBody({
  assessmentId,
  now,
}: {
  assessmentId: Id<"siteAssessments">;
  now: number;
}) {
  const locationLabel = useAdminProjectLocationLabel();
  const t = useTranslations("adminSiteVisits");
  const tWizard = useTranslations("projectWizard");
  const tUx = useTranslations("ux");
  const locale = useLocale();
  const fresh = useQuery(api.admin.siteVisits.getSiteVisitDetail, {
    assessmentId,
    now,
  });
  // Keep the last result on screen while the minute clock re-subscribes the query.
  const [last, setLast] = useState(fresh);
  if (fresh !== undefined && fresh !== last) setLast(fresh);
  const detail = fresh ?? last;

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-[#eef1f4] px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#8b919a]">
            {t("detailTitle")}
          </p>
          <Dialog.Title className="mt-1 text-xl font-semibold tracking-[-0.02em] text-balance text-[#17191d] [overflow-wrap:anywhere]">
            {detail?.project.title ?? t("loadingDetail")}
          </Dialog.Title>
          {detail ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-[#626970]">
              <span className="inline-flex min-w-0 max-w-full items-start gap-1 [overflow-wrap:anywhere]">
                <MapPin aria-hidden className="size-4 shrink-0 text-[#8b919a]" />
                {locationLabel(detail.project)}
              </span>
              {detail.project.category ? (
                <span>{categoryLabel(detail, tWizard)}</span>
              ) : null}
              {detail.riskSignal ? (
                <RiskPill signal={detail.riskSignal} />
              ) : null}
            </div>
          ) : null}
        </div>
        <Dialog.Close asChild>
          <button aria-label={t("close")} className={ICON_BUTTON} type="button">
            <X aria-hidden className="size-4" />
          </button>
        </Dialog.Close>
      </div>
      {detail === undefined ? (
        <div
          aria-busy="true"
          className="space-y-3 px-5 py-5 sm:px-6"
          role="status"
        >
          <span className="sr-only">{tUx("loading.dashboard")}</span>
          <div className="h-20 animate-pulse rounded-sm bg-[#f4f6f8]" />
          <div className="h-10 animate-pulse rounded-sm bg-[#f4f6f8]" />
          <div className="h-56 animate-pulse rounded-sm bg-[#f4f6f8]" />
        </div>
      ) : detail === null ? (
        <p className="px-5 py-10 text-center text-sm text-[#626970] sm:px-6">
          {t("notFound")}
        </p>
      ) : (
        <SiteVisitDetail detail={detail} locale={locale} />
      )}
    </>
  );
}

function SiteVisitDetail({ detail, locale }: { detail: Detail; locale: string }) {
  const locationLabel = useAdminProjectLocationLabel();
  const t = useTranslations("adminSiteVisits");
  const tProjects = useTranslations("adminProjects");
  const tWizard = useTranslations("projectWizard");
  const { assessment, visit, finalQuote } = detail;

  return (
    <Tabs.Root
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      defaultValue="overview"
    >
      <div className="grid grid-cols-1 gap-px border-b border-[#eef1f4] bg-[#eef1f4] sm:grid-cols-3">
        <SummaryTile label={t("sections.assessment")}>
          <StatusPill status={assessment.status} />
          <SummaryHint>
            {formatSiteVisitDateTime(assessment.invitedAt, locale)}
          </SummaryHint>
        </SummaryTile>
        <SummaryTile label={t("sections.visit")}>
          {visit ? (
            <>
              <SummaryValue>
                {formatVisitDay(visit.proposedDate, locale, false)} ·{" "}
                {visit.proposedTime}
              </SummaryValue>
              <StatusPill status={visit.status} />
            </>
          ) : (
            <SummaryHint>{t("noVisit")}</SummaryHint>
          )}
        </SummaryTile>
        <SummaryTile label={t("sections.finalQuote")}>
          {finalQuote && finalQuote.price !== null ? (
            <SummaryValue>{formatMoney(finalQuote.price, locale)}</SummaryValue>
          ) : null}
          <span className="text-sm">
            <FinalQuoteText status={detail.finalQuoteStatus} />
          </span>
        </SummaryTile>
      </div>

      <Tabs.List
        aria-label={t("detailTabs.label")}
        className="sticky top-0 z-10 flex gap-5 border-b border-[#eef1f4] bg-white px-5 sm:px-6"
      >
        <Tabs.Trigger className={DRAWER_TAB} value="overview">
          {t("detailTabs.overview")}
        </Tabs.Trigger>
        <Tabs.Trigger className={DRAWER_TAB} value="timeline">
          {t("sections.timeline")}
          <span className="rounded-sm bg-[#f2f4f7] px-2 py-0.5 text-xs font-semibold text-[#626970] tabular-nums">
            {detail.activity.length}
          </span>
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content
        className="px-5 outline-none sm:px-6"
        value="overview"
      >
        <div className="grid gap-3 py-5 sm:grid-cols-2">
          <PartyCard
            icon={<UserRound aria-hidden className="size-4" />}
            label={t("sections.client")}
            name={detail.client.displayName}
          >
            <span className="font-mono text-xs text-[#626970]">
              {detail.client.accountReference}
            </span>
          </PartyCard>
          <PartyCard
            icon={<Building2 aria-hidden className="size-4" />}
            label={t("sections.company")}
            name={detail.company.name}
          >
            <span className="text-xs text-[#626970]">
              {t(`verification.${detail.company.verificationStatus}`)}
            </span>
            {detail.company.slug ? (
              <Link
                className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#2f6bff] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff]"
                href={{
                  pathname: "/entreprises/[slug]",
                  params: { slug: detail.company.slug },
                }}
              >
                {t("openProfile")}
                <ExternalLink aria-hidden className="size-3.5" />
              </Link>
            ) : null}
          </PartyCard>
        </div>

        <div className="divide-y divide-[#eef1f4] border-t border-[#eef1f4]">
          <DetailSection title={t("sections.project")}>
            <Field
              label={t("fields.location")}
              value={locationLabel(detail.project)}
            />
            <Field
              label={t("fields.category")}
              value={
                detail.project.category ? categoryLabel(detail, tWizard) : null
              }
            />
            <Field
              label={t("fields.projectStatus")}
              value={tProjects(`status.${detail.project.status}`)}
            />
          </DetailSection>
          <DetailSection title={t("sections.initialQuote")}>
            <Field
              label={t("fields.estimatedPrice")}
              value={formatMoney(
                detail.initialQuote.estimatedPrice,
                locale,
                detail.initialQuote.currency,
              )}
            />
            <Field
              label={t("fields.duration")}
              value={t("durationDays", {
                count: detail.initialQuote.estimatedDuration,
              })}
            />
            <Field
              label={t("fields.quoteStatus")}
              value={t(`quoteStatus.${detail.initialQuote.status}`)}
            />
          </DetailSection>
          <DetailSection title={t("sections.discussion")}>
            <Field
              label={t("fields.openedAt")}
              value={formatSiteVisitDateTime(detail.discussion.openedAt, locale)}
            />
            <Field
              label={t("fields.conversationReference")}
              mono
              value={detail.discussion.reference}
            />
            <Field
              label={t("fields.conversationStatus")}
              value={t(`conversationStatus.${detail.discussion.status}`)}
            />
          </DetailSection>
          <DetailSection title={t("sections.assessment")}>
            <Field
              label={t("fields.invitedBy")}
              value={actorLabel(assessment.invitedBy, t)}
            />
            <Field
              label={t("fields.invitedAt")}
              value={formatSiteVisitDateTime(assessment.invitedAt, locale)}
            />
            <Field
              label={t("fields.acceptedAt")}
              value={formatOptionalDate(assessment.acceptedAt, locale)}
            />
            <Field
              label={t("fields.declinedAt")}
              value={formatOptionalDate(assessment.declinedAt, locale)}
            />
            <Field
              label={t("fields.cancelledAt")}
              value={formatOptionalDate(assessment.cancelledAt, locale)}
            />
            <Field
              label={t("fields.marketplaceAcknowledgement")}
              value={formatOptionalDate(
                assessment.marketplaceAcknowledgedAt,
                locale,
              )}
            />
          </DetailSection>
          <DetailSection title={t("sections.visit")}>
            {visit ? (
              <>
                <Field
                  label={t("fields.proposedDateTime")}
                  value={`${formatVisitDay(visit.proposedDate, locale)} · ${visit.proposedTime} · ${visit.timezone}`}
                  wide
                />
                <Field
                  label={t("fields.siteAddress")}
                  value={visit.siteAddress}
                  wide
                />
                <Field
                  label={t("fields.proposedBy")}
                  value={actorLabel(visit.proposedBy, t)}
                />
                <Field
                  label={t("fields.proposedAt")}
                  value={formatSiteVisitDateTime(visit.proposedAt, locale)}
                />
                <Field
                  label={t("fields.confirmedBy")}
                  value={optionalActor(visit.confirmedBy, t)}
                />
                <Field
                  label={t("fields.confirmedAt")}
                  value={formatOptionalDate(visit.confirmedAt, locale)}
                />
                <Field
                  label={t("fields.declinedBy")}
                  value={optionalActor(visit.declinedBy, t)}
                />
                <Field
                  label={t("fields.declinedAt")}
                  value={formatOptionalDate(visit.declinedAt, locale)}
                />
                <Field
                  label={t("fields.cancelledBy")}
                  value={optionalActor(visit.cancelledBy, t)}
                />
                <Field
                  label={t("fields.cancelledAt")}
                  value={formatOptionalDate(visit.cancelledAt, locale)}
                />
                <Field
                  label={t("fields.cancellationReason")}
                  value={visit.cancellationReason}
                  wide
                />
                <Field
                  label={t("fields.completedBy")}
                  value={optionalActor(visit.completedBy, t)}
                />
                <Field
                  label={t("fields.completedAt")}
                  value={formatOptionalDate(visit.completedAt, locale)}
                />
              </>
            ) : (
              <p className="text-sm text-[#8b919a] sm:col-span-2">
                {t("noVisit")}
              </p>
            )}
          </DetailSection>
          <DetailSection title={t("sections.finalQuote")}>
            <Field
              label={t("fields.finalQuoteStatus")}
              value={t(
                `finalQuote.${detail.finalQuoteStatus}` as "finalQuote.not_available",
              )}
            />
            {finalQuote ? (
              <>
                <Field
                  label={t("finalQuote.revisionLabel")}
                  value={
                    finalQuote.revisionNumber !== null
                      ? t("finalQuote.revision", {
                          number: finalQuote.revisionNumber,
                        })
                      : null
                  }
                />
                <Field
                  label={t("finalQuote.amount")}
                  value={
                    finalQuote.price !== null
                      ? formatMoney(finalQuote.price, locale)
                      : null
                  }
                />
                <Field
                  label={t("finalQuote.submittedAt")}
                  value={formatOptionalDate(finalQuote.submittedAt, locale)}
                />
                <Field
                  label={t("finalQuote.acceptedAt")}
                  value={formatOptionalDate(finalQuote.acceptedAt, locale)}
                />
                <Field
                  label={t("finalQuote.declinedAt")}
                  value={formatOptionalDate(finalQuote.declinedAt, locale)}
                />
                <Field
                  label={t("finalQuote.companySelected")}
                  value={
                    finalQuote.companySelected
                      ? t("finalQuote.yes")
                      : t("finalQuote.no")
                  }
                />
                <Field
                  label={t("finalQuote.changesReason")}
                  value={finalQuote.changesRequestReason ?? null}
                  wide
                />
              </>
            ) : null}
          </DetailSection>
        </div>
      </Tabs.Content>

      <Tabs.Content
        className="px-5 py-5 outline-none sm:px-6"
        value="timeline"
      >
        <ActivityTimeline detail={detail} locale={locale} />
      </Tabs.Content>
    </Tabs.Root>
  );
}

function SummaryTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5 bg-white px-5 py-4 sm:px-6">
      <p className="text-xs text-[#8b919a]">{label}</p>
      {children}
    </div>
  );
}

function SummaryValue({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm font-semibold text-[#17191d] tabular-nums">
      {children}
    </p>
  );
}

function SummaryHint({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-5 text-[#8b919a]">{children}</p>;
}

function PartyCard({
  icon,
  label,
  name,
  children,
}: {
  icon: ReactNode;
  label: string;
  name: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-sm bg-[#f7f9fc] p-4">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm bg-white text-[#626970] shadow-[0_0_0_1px_rgba(16,24,40,0.06),0_1px_2px_rgba(16,24,40,0.06)]">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col items-start gap-0.5">
        <p className="text-xs text-[#8b919a]">{label}</p>
        <p className="text-sm font-semibold text-[#17191d] [overflow-wrap:anywhere]">
          {name}
        </p>
        {children}
      </div>
    </div>
  );
}

function ActivityTimeline({
  detail,
  locale,
}: {
  detail: Detail;
  locale: string;
}) {
  const t = useTranslations("adminSiteVisits");
  if (detail.activity.length === 0)
    return (
      <p className="py-10 text-center text-sm text-[#8b919a]">
        {t("activity.empty")}
      </p>
    );
  return (
    <ol>
      {detail.activity.map((item, index) => (
        <li className="relative flex gap-3 pb-6 last:pb-0" key={item.activityId}>
          {index < detail.activity.length - 1 ? (
            <span
              aria-hidden
              className="absolute top-4 bottom-0 left-[4.5px] w-px bg-[#e7eaee]"
            />
          ) : null}
          <span
            aria-hidden
            className={`relative mt-1.5 size-2.5 shrink-0 rounded-sm ring-4 ring-white ${TONE_DOT[eventTone(item.eventType)]}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-sm font-semibold text-[#17191d]">
                {t(
                  `activity.events.${item.eventType}` as "activity.events.site_assessment_invited",
                )}
              </p>
              <time
                className="text-xs text-[#8b919a] tabular-nums"
                dateTime={new Date(item.createdAt).toISOString()}
              >
                {formatSiteVisitDateTime(item.createdAt, locale)}
              </time>
            </div>
            <p className="mt-0.5 text-xs text-[#626970]">
              {t("activity.byActor", {
                actor: item.actor.displayName,
                type: t(`actor.${item.actor.type}`),
              })}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 empty:hidden">
              {item.oldStatus && item.newStatus ? (
                <TimelineChip>
                  {t("activity.transition", {
                    from: t(`status.${item.oldStatus}` as "status.invited"),
                    to: t(`status.${item.newStatus}` as "status.accepted"),
                  })}
                </TimelineChip>
              ) : null}
              {item.metadata?.proposedDate && item.metadata?.proposedTime ? (
                <TimelineChip>
                  {t("activity.schedule", {
                    date: String(item.metadata.proposedDate),
                    time: String(item.metadata.proposedTime),
                  })}
                </TimelineChip>
              ) : null}
              {typeof item.metadata?.revisionNumber === "number" &&
              typeof item.metadata?.price === "number" ? (
                <TimelineChip>
                  {t("activity.finalQuoteRevision", {
                    number: item.metadata.revisionNumber,
                    amount: formatMoney(item.metadata.price, locale),
                  })}
                </TimelineChip>
              ) : null}
            </div>
            {item.reason ? (
              <p className="mt-2 rounded-[10px] bg-[#fff7ed] px-3 py-2 text-xs leading-5 text-[#9a6700] [overflow-wrap:anywhere]">
                {t("activity.reason", { reason: item.reason })}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function TimelineChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-[#f2f4f7] px-1.5 py-0.5 text-xs text-[#475467] tabular-nums">
      {children}
    </span>
  );
}

function eventTone(eventType: string): Tone {
  if (/(cancelled|declined|withdrawn)$/.test(eventType)) return "danger";
  if (/(completed|accepted|company_selected)$/.test(eventType)) return "success";
  if (/changes_requested$/.test(eventType)) return "warning";
  return "info";
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="py-5">
      <h3 className="text-sm font-semibold text-[#17191d]">{title}</h3>
      <dl className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

/** Empty values are skipped so the sheet only lists what actually happened. */
function Field({
  label,
  value,
  wide,
  mono,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
  mono?: boolean;
}) {
  if (value === null || value === "") return null;
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-[#8b919a]">{label}</dt>
      <dd
        className={`mt-0.5 text-sm leading-6 whitespace-pre-wrap text-[#17191d] [overflow-wrap:anywhere] ${mono ? "font-mono text-[0.8125rem]" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function SiteVisitSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="space-y-2 p-4 sm:p-5" role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          className="h-14 animate-pulse rounded-[10px] bg-[#f4f6f8]"
          key={index}
        />
      ))}
    </div>
  );
}

function formatVisitDate(row: Row, locale: string) {
  if (!row.visitDate || !row.visitTime) return "—";
  const date = new Date(`${row.visitDate}T00:00:00.000Z`);
  return `${date.toLocaleDateString(locale, { day: "2-digit", month: "short", timeZone: "UTC" })} · ${row.visitTime}`;
}

function formatVisitDay(isoDate: string, locale: string, weekday = true) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(locale, {
    weekday: weekday ? "short" : undefined,
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMoney(value: number, locale: string, currency = "MAD") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatOptionalDate(value: number | null, locale: string) {
  return value === null ? null : formatSiteVisitDateTime(value, locale);
}

function formatSiteVisitDateTime(value: number, locale: string) {
  return formatMarketplaceDateTime(value, locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function actorLabel(
  actor: { displayName: string; type: "client" | "company" },
  t: ReturnType<typeof useTranslations<"adminSiteVisits">>,
) {
  return `${actor.displayName} · ${t(`actor.${actor.type}`)}`;
}

function optionalActor(
  actor: { displayName: string; type: "client" | "company" } | null,
  t: ReturnType<typeof useTranslations<"adminSiteVisits">>,
) {
  return actor ? actorLabel(actor, t) : null;
}

function categoryLabel(
  detail: Detail,
  tWizard: ReturnType<typeof useTranslations<"projectWizard">>,
) {
  if (!detail.project.category) return "—";
  const label = tWizard(`categoryOptions.${detail.project.category}`);
  return detail.project.category === "other" &&
    detail.project.customCategoryText
    ? `${label} · ${detail.project.customCategoryText}`
    : label;
}
