"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AdminPage,
  ADMIN_PRESS,
} from "@/features/admin/components/admin-shell";
import { Link } from "@/i18n/navigation";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";

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

type Tab = (typeof TABS)[number];
type City = (typeof CITIES)[number];
type Row = FunctionReturnType<
  typeof api.admin.siteVisits.listSiteVisits
>[number];
type Detail = NonNullable<
  FunctionReturnType<typeof api.admin.siteVisits.getSiteVisitDetail>
>;
type Status = Row["status"];

export function AdminSiteVisitsPanel() {
  const t = useTranslations("adminSiteVisits");
  const tWizard = useTranslations("projectWizard");
  const tUx = useTranslations("ux");
  const locale = useLocale();
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
  const invalidDateRange =
    dateFrom !== "" && dateTo !== "" && dateFrom > dateTo;
  const closeDrawer = useCallback(() => setSelectedId(null), []);

  useEffect(() => {
    const updateClock = () => setNow(Date.now());
    const initialTimer = window.setTimeout(updateClock, 0);
    const interval = window.setInterval(updateClock, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  const list = useQuery(
    api.admin.siteVisits.listSiteVisits,
    now === 0 || invalidDateRange
      ? "skip"
      : {
          status: tab,
          projectSearch: projectSearch.trim() || undefined,
          companySearch: companySearch.trim() || undefined,
          city: city || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          now,
        },
  );

  return (
    <AdminPage breadcrumb={t("title")} title={t("title")}>
      <p className="max-w-3xl text-sm leading-6 text-[#626970]">{t("lead")}</p>

      <section className="rounded-[20px] border border-[#e7eaee] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-5">
        <div className="overflow-x-auto pb-1" aria-label={t("tabsLabel")}>
          <div className="flex min-w-max gap-1">
            {TABS.map((status) => (
              <button
                aria-pressed={tab === status}
                className={`min-h-11 rounded-full px-4 text-sm font-semibold ${ADMIN_PRESS} ${
                  tab === status
                    ? "bg-[#2f6bff] text-white"
                    : "bg-[#f4f6f8] text-[#626970]"
                }`}
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
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
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
          <label className="flex min-h-11 items-center rounded-full bg-[#f4f6f8] px-3 text-sm">
            <span className="sr-only">{t("filters.cityLabel")}</span>
            <select
              className="h-11 w-full bg-transparent text-[#626970] outline-none"
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
          </label>
          <DateInput
            label={t("filters.dateFrom")}
            onChange={setDateFrom}
            value={dateFrom}
          />
          <DateInput
            label={t("filters.dateTo")}
            onChange={setDateTo}
            value={dateTo}
          />
        </div>
        {invalidDateRange ? (
          <p
            className="mt-3 rounded-xl bg-[#fff4f2] px-3 py-2 text-sm text-[#8a2f28]"
            role="alert"
          >
            {t("filters.invalidRange")}
          </p>
        ) : null}

        {invalidDateRange ? null : list === undefined ? (
          <SiteVisitSkeleton label={tUx("loading.dashboard")} />
        ) : list.length === 0 ? (
          <p className="mt-8 py-10 text-center text-sm text-[#8b919a]">
            {t("empty")}
          </p>
        ) : (
          <>
            <div className="mt-5 grid gap-3 lg:hidden">
              {list.map((row) => (
                <SiteVisitCard
                  key={row.assessmentId}
                  locale={locale}
                  onView={() => setSelectedId(row.assessmentId)}
                  row={row}
                />
              ))}
            </div>
            <div className="mt-5 hidden overflow-x-auto lg:block">
              <table className="w-full min-w-full table-fixed border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className="text-[0.72rem] font-semibold tracking-[0.06em] text-[#a0a6ae] uppercase">
                    <th className="w-[12%] px-3 py-2 font-semibold">
                      {t("columns.project")}
                    </th>
                    <th className="w-[10%] px-3 py-2 font-semibold">
                      {t("columns.client")}
                    </th>
                    <th className="w-[10%] px-3 py-2 font-semibold">
                      {t("columns.company")}
                    </th>
                    <th className="w-[11%] px-3 py-2 font-semibold">
                      {t("columns.assessmentStatus")}
                    </th>
                    <th className="w-[12%] px-3 py-2 font-semibold">
                      {t("columns.visitDate")}
                    </th>
                    <th className="w-[9%] px-3 py-2 font-semibold">
                      {t("columns.city")}
                    </th>
                    <th className="w-[9%] px-3 py-2 font-semibold">
                      {t("columns.proposedBy")}
                    </th>
                    <th className="w-[10%] px-3 py-2 font-semibold">
                      {t("columns.status")}
                    </th>
                    <th className="w-[10%] px-3 py-2 font-semibold">
                      {t("columns.finalQuote")}
                    </th>
                    <th className="w-[7%] px-3 py-2 font-semibold">
                      {t("columns.action")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr className="bg-[#f8fafb]" key={row.assessmentId}>
                      <td className="truncate rounded-l-[14px] px-3 py-3 font-semibold text-[#17191d]">
                        {row.projectTitle}
                      </td>
                      <td className="truncate px-3 py-3 text-[#626970]">
                        {row.clientName}
                      </td>
                      <td className="truncate px-3 py-3 text-[#626970]">
                        {row.companyName}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={row.assessmentStatus} />
                      </td>
                      <td className="truncate px-3 py-3 text-[#626970]">
                        {formatVisitDate(row, locale)}
                      </td>
                      <td className="truncate px-3 py-3 text-[#626970]">
                        {row.city ? tWizard(`cityOptions.${row.city}`) : "—"}
                      </td>
                      <td className="truncate px-3 py-3 text-[#626970]">
                        {row.proposedBy ? t(`actor.${row.proposedBy}`) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={row.status} />
                        {row.riskSignal ? (
                          <RiskPill signal={row.riskSignal} />
                        ) : null}
                      </td>
                      <td className="truncate px-3 py-3 text-[#626970]">
                        {t(
                          `finalQuote.${row.finalQuoteStatus}` as "finalQuote.not_available",
                        )}
                      </td>
                      <td className="rounded-r-[14px] px-3 py-3">
                        <button
                          className={`inline-flex min-h-10 items-center rounded-full border border-[#e6e9ee] bg-white px-3 text-sm font-semibold ${ADMIN_PRESS}`}
                          onClick={() => setSelectedId(row.assessmentId)}
                          type="button"
                        >
                          {t("view")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {selectedId ? (
        <SiteVisitDrawer
          assessmentId={selectedId}
          now={now}
          onClose={closeDrawer}
        />
      ) : null}
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
    <label className="flex min-h-11 items-center rounded-full bg-[#f4f6f8] px-3 text-sm">
      <span className="sr-only">{label}</span>
      <input
        className="h-11 w-full bg-transparent text-[#17191d] outline-none placeholder:text-[#8b919a]"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
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
    <label className="flex min-h-11 items-center gap-2 rounded-full bg-[#f4f6f8] px-3 text-xs text-[#626970]">
      <span>{label}</span>
      <input
        className="h-11 min-w-0 flex-1 bg-transparent text-[#17191d] outline-none"
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
  const tWizard = useTranslations("projectWizard");
  return (
    <article className="rounded-[14px] bg-[#f8fafb] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[#17191d]">
            {row.projectTitle}
          </h2>
          <p className="mt-1 text-xs text-[#8b919a]">
            {row.companyName} · {row.clientName}
          </p>
        </div>
        <StatusPill status={row.status} />
      </div>
      {row.riskSignal ? <RiskPill signal={row.riskSignal} /> : null}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <CompactField
          label={t("columns.assessmentStatus")}
          value={t(`status.${row.assessmentStatus}`)}
        />
        <CompactField
          label={t("columns.visitDate")}
          value={formatVisitDate(row, locale)}
        />
        <CompactField
          label={t("columns.city")}
          value={row.city ? tWizard(`cityOptions.${row.city}`) : "—"}
        />
        <CompactField
          label={t("columns.finalQuote")}
          value={t(
            `finalQuote.${row.finalQuoteStatus}` as "finalQuote.not_available",
          )}
        />
      </dl>
      <button
        className={`mt-4 inline-flex min-h-10 items-center rounded-full border border-[#e6e9ee] bg-white px-3 text-sm font-semibold ${ADMIN_PRESS}`}
        onClick={onView}
        type="button"
      >
        {t("view")}
      </button>
    </article>
  );
}

function StatusPill({ status }: { status: Status }) {
  const t = useTranslations("adminSiteVisits");
  const style =
    status === "completed"
      ? "bg-[#e7f8ee] text-[#157a3e]"
      : status === "cancelled" || status === "declined"
        ? "bg-[#fdecec] text-[#b42318]"
        : status === "confirmed" || status === "accepted"
          ? "bg-[#e8f0ff] text-[#2755c8]"
          : "bg-[#fff4df] text-[#9a6700]";
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold ${style}`}
    >
      {t(`status.${status}`)}
    </span>
  );
}

function RiskPill({ signal }: { signal: NonNullable<Row["riskSignal"]> }) {
  const t = useTranslations("adminSiteVisits");
  return (
    <span className="mt-1 block w-fit rounded-full bg-[#fff0d8] px-2.5 py-1 text-xs font-semibold text-[#9a6700]">
      {t(`risk.${signal}`)}
    </span>
  );
}

function SiteVisitDrawer({
  assessmentId,
  now,
  onClose,
}: {
  assessmentId: Id<"siteAssessments">;
  now: number;
  onClose: () => void;
}) {
  const t = useTranslations("adminSiteVisits");
  const tWizard = useTranslations("projectWizard");
  const tProjects = useTranslations("adminProjects");
  const tUx = useTranslations("ux");
  const locale = useLocale();
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const detail = useQuery(api.admin.siteVisits.getSiteVisitDetail, {
    assessmentId,
    now,
  });

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      ];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45">
      <button
        aria-label={t("close")}
        className="absolute inset-0"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative z-10 flex h-full w-full flex-col bg-white shadow-[-12px_0_40px_rgba(16,24,40,0.18)] md:w-[70%]"
        ref={dialogRef}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#eef1f4] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.08em] text-[#8b919a] uppercase">
              {t("detailTitle")}
            </p>
            <h2
              className="mt-1 truncate text-xl font-semibold tracking-[-0.02em]"
              id={titleId}
            >
              {detail?.project.title ?? t("loadingDetail")}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            aria-label={t("close")}
            className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full ${ADMIN_PRESS}`}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {detail === undefined ? (
            <div aria-busy="true" className="space-y-3" role="status">
              <span className="sr-only">{tUx("loading.dashboard")}</span>
              <div className="h-24 animate-pulse rounded-[16px] bg-[#f4f6f8]" />
              <div className="h-40 animate-pulse rounded-[16px] bg-[#f4f6f8]" />
            </div>
          ) : detail === null ? (
            <p className="text-sm text-[#8b919a]">{t("notFound")}</p>
          ) : (
            <div className="space-y-5">
              {detail.riskSignal ? (
                <RiskPill signal={detail.riskSignal} />
              ) : null}
              <DetailSection title={t("sections.project")}>
                <Field
                  label={t("fields.projectTitle")}
                  value={detail.project.title}
                />
                <Field
                  label={t("fields.city")}
                  value={
                    detail.project.city
                      ? tWizard(`cityOptions.${detail.project.city}`)
                      : "—"
                  }
                />
                <Field
                  label={t("fields.category")}
                  value={categoryLabel(detail, tWizard)}
                />
                <Field
                  label={t("fields.projectStatus")}
                  value={tProjects(`status.${detail.project.status}`)}
                />
              </DetailSection>
              <DetailSection title={t("sections.client")}>
                <Field
                  label={t("fields.safeIdentity")}
                  value={detail.client.displayName}
                />
                <Field
                  label={t("fields.accountReference")}
                  value={detail.client.accountReference}
                />
              </DetailSection>
              <DetailSection title={t("sections.company")}>
                <Field
                  label={t("fields.companyName")}
                  value={detail.company.name}
                />
                <Field
                  label={t("fields.verificationStatus")}
                  value={t(`verification.${detail.company.verificationStatus}`)}
                />
                {detail.company.slug ? (
                  <div>
                    <p className="text-xs font-semibold tracking-[0.04em] text-[#a0a6ae] uppercase">
                      {t("fields.publicProfile")}
                    </p>
                    <Link
                      className="mt-1 inline-flex min-h-10 items-center text-sm font-semibold text-[#2f6bff] underline-offset-4 hover:underline"
                      href={{
                        pathname: "/entreprises/[slug]",
                        params: { slug: detail.company.slug },
                      }}
                    >
                      {t("openProfile")}
                    </Link>
                  </div>
                ) : (
                  <Field label={t("fields.publicProfile")} value="—" />
                )}
              </DetailSection>
              <DetailSection title={t("sections.initialQuote")}>
                <Field
                  label={t("fields.estimatedPrice")}
                  value={new Intl.NumberFormat(locale, {
                    style: "currency",
                    currency: detail.initialQuote.currency,
                    maximumFractionDigits: 0,
                  }).format(detail.initialQuote.estimatedPrice)}
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
                  value={actorLabel(detail.assessment.invitedBy, t)}
                />
                <Field
                  label={t("fields.invitedAt")}
                  value={formatSiteVisitDateTime(detail.assessment.invitedAt, locale)}
                />
                <Field
                  label={t("fields.assessmentStatus")}
                  value={t(`status.${detail.assessment.status}`)}
                />
                <Field
                  label={t("fields.acceptedAt")}
                  value={formatOptionalDate(
                    detail.assessment.acceptedAt,
                    locale,
                  )}
                />
                <Field
                  label={t("fields.declinedAt")}
                  value={formatOptionalDate(
                    detail.assessment.declinedAt,
                    locale,
                  )}
                />
                <Field
                  label={t("fields.cancelledAt")}
                  value={formatOptionalDate(
                    detail.assessment.cancelledAt,
                    locale,
                  )}
                />
                <Field
                  label={t("fields.marketplaceAcknowledgement")}
                  value={formatOptionalDate(
                    detail.assessment.marketplaceAcknowledgedAt,
                    locale,
                  )}
                />
              </DetailSection>
              <DetailSection title={t("sections.visit")}>
                {detail.visit ? (
                  <VisitFields detail={detail} locale={locale} />
                ) : (
                  <p className="text-sm text-[#8b919a]">{t("noVisit")}</p>
                )}
              </DetailSection>
              <DetailSection title={t("sections.timeline")}>
                <ActivityTimeline detail={detail} locale={locale} />
              </DetailSection>
              <DetailSection title={t("sections.finalQuote")}>
                {detail.finalQuote ? (
                  <>
                    <Field
                      label={t("fields.finalQuoteStatus")}
                      value={t(
                        `finalQuote.${detail.finalQuote.status}` as "finalQuote.accepted",
                      )}
                    />
                    <Field
                      label={t("finalQuote.revisionLabel")}
                      value={
                        detail.finalQuote.revisionNumber !== null
                          ? t("finalQuote.revision", {
                              number: detail.finalQuote.revisionNumber,
                            })
                          : "—"
                      }
                    />
                    <Field
                      label={t("finalQuote.amount")}
                      value={
                        detail.finalQuote.price !== null
                          ? new Intl.NumberFormat(locale, {
                              style: "currency",
                              currency: "MAD",
                              maximumFractionDigits: 0,
                            }).format(detail.finalQuote.price)
                          : "—"
                      }
                    />
                    <Field
                      label={t("finalQuote.submittedAt")}
                      value={formatOptionalDate(
                        detail.finalQuote.submittedAt,
                        locale,
                      )}
                    />
                    <Field
                      label={t("finalQuote.acceptedAt")}
                      value={formatOptionalDate(
                        detail.finalQuote.acceptedAt,
                        locale,
                      )}
                    />
                    <Field
                      label={t("finalQuote.declinedAt")}
                      value={formatOptionalDate(
                        detail.finalQuote.declinedAt,
                        locale,
                      )}
                    />
                    {detail.finalQuote.changesRequestReason ? (
                      <Field
                        label={t("finalQuote.changesReason")}
                        value={detail.finalQuote.changesRequestReason}
                      />
                    ) : null}
                    <Field
                      label={t("finalQuote.companySelected")}
                      value={
                        detail.finalQuote.companySelected
                          ? t("finalQuote.yes")
                          : t("finalQuote.no")
                      }
                    />
                  </>
                ) : (
                  <Field
                    label={t("fields.finalQuoteStatus")}
                    value={t("finalQuote.not_available")}
                  />
                )}
              </DetailSection>
            </div>
          )}
        </div>
      </aside>
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
    return <p className="text-sm text-[#8b919a]">{t("activity.empty")}</p>;
  return (
    <ol className="space-y-4">
      {detail.activity.map((item) => (
        <li
          className="relative border-l-2 border-[#dbe5ff] pl-4"
          key={item.activityId}
        >
          <span
            aria-hidden
            className="absolute -left-[5px] top-1.5 size-2 rounded-full bg-[#2f6bff]"
          />
          <p className="text-sm font-semibold text-[#17191d]">
            {t(
              `activity.events.${item.eventType}` as "activity.events.site_assessment_invited",
            )}
          </p>
          <p className="mt-1 text-xs text-[#626970]">
            {t("activity.byActor", {
              actor: item.actor.displayName,
              type: t(`actor.${item.actor.type}`),
            })}{" "}
            · {formatSiteVisitDateTime(item.createdAt, locale)}
          </p>
          {item.oldStatus && item.newStatus ? (
            <p className="mt-1 text-xs text-[#626970]">
              {t("activity.transition", {
                from: t(`status.${item.oldStatus}` as "status.invited"),
                to: t(`status.${item.newStatus}` as "status.accepted"),
              })}
            </p>
          ) : null}
          {item.metadata?.proposedDate && item.metadata?.proposedTime ? (
            <p className="mt-1 text-xs text-[#626970]">
              {t("activity.schedule", {
                date: String(item.metadata.proposedDate),
                time: String(item.metadata.proposedTime),
              })}
            </p>
          ) : null}
          {typeof item.metadata?.revisionNumber === "number" &&
          typeof item.metadata?.price === "number" ? (
            <p className="mt-1 text-xs text-[#626970]">
              {t("activity.finalQuoteRevision", {
                number: item.metadata.revisionNumber,
                amount: new Intl.NumberFormat(locale, {
                  style: "currency",
                  currency: "MAD",
                  maximumFractionDigits: 0,
                }).format(item.metadata.price),
              })}
            </p>
          ) : null}
          {item.reason ? (
            <p className="mt-2 break-words rounded-lg bg-[#fff7ed] px-3 py-2 text-xs leading-5 text-[#9a6700]">
              {t("activity.reason", { reason: item.reason })}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function VisitFields({ detail, locale }: { detail: Detail; locale: string }) {
  const t = useTranslations("adminSiteVisits");
  if (!detail.visit) return null;
  return (
    <>
      <Field
        label={t("fields.proposedBy")}
        value={actorLabel(detail.visit.proposedBy, t)}
      />
      <Field
        label={t("fields.proposedAt")}
        value={formatSiteVisitDateTime(detail.visit.proposedAt, locale)}
      />
      <Field
        label={t("fields.proposedDateTime")}
        value={`${detail.visit.proposedDate} · ${detail.visit.proposedTime} · ${detail.visit.timezone}`}
      />
      <Field
        label={t("fields.confirmedBy")}
        value={
          detail.visit.confirmedBy
            ? actorLabel(detail.visit.confirmedBy, t)
            : "—"
        }
      />
      <Field
        label={t("fields.confirmedAt")}
        value={formatOptionalDate(detail.visit.confirmedAt, locale)}
      />
      <Field label={t("fields.siteAddress")} value={detail.visit.siteAddress} />
      <Field
        label={t("fields.visitStatus")}
        value={t(`status.${detail.visit.status}`)}
      />
      <Field
        label={t("fields.declinedBy")}
        value={
          detail.visit.declinedBy ? actorLabel(detail.visit.declinedBy, t) : "—"
        }
      />
      <Field
        label={t("fields.declinedAt")}
        value={formatOptionalDate(detail.visit.declinedAt, locale)}
      />
      <Field
        label={t("fields.cancellationReason")}
        value={detail.visit.cancellationReason ?? "—"}
      />
      <Field
        label={t("fields.cancelledBy")}
        value={
          detail.visit.cancelledBy
            ? actorLabel(detail.visit.cancelledBy, t)
            : "—"
        }
      />
      <Field
        label={t("fields.cancelledAt")}
        value={formatOptionalDate(detail.visit.cancelledAt, locale)}
      />
      <Field
        label={t("fields.completedBy")}
        value={
          detail.visit.completedBy
            ? actorLabel(detail.visit.completedBy, t)
            : "—"
        }
      />
      <Field
        label={t("fields.completedAt")}
        value={formatOptionalDate(detail.visit.completedAt, locale)}
      />
    </>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[16px] border border-[#eef1f4] p-4">
      <h3 className="text-sm font-semibold text-[#17191d]">{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.04em] text-[#a0a6ae] uppercase">
        {label}
      </p>
      <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-6 text-[#17191d] [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}

function CompactField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[#8b919a]">{label}</dt>
      <dd className="mt-1 text-[#17191d]">{value}</dd>
    </div>
  );
}

function SiteVisitSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="mt-5 space-y-3" role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          className="h-14 animate-pulse rounded-[14px] bg-[#f4f6f8]"
          key={index}
        />
      ))}
    </div>
  );
}

function formatVisitDate(row: Row, locale: string) {
  if (!row.visitDate || !row.visitTime) return "—";
  const date = new Date(`${row.visitDate}T00:00:00.000Z`);
  return `${date.toLocaleDateString(locale, { day: "2-digit", month: "short" })} · ${row.visitTime}`;
}

function formatOptionalDate(value: number | null, locale: string) {
  return value === null ? "—" : formatSiteVisitDateTime(value, locale);
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
