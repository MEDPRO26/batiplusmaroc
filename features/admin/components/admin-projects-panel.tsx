"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AdminPage,
  ADMIN_PRESS,
} from "@/features/admin/components/admin-shell";
import { ProjectSiteAssessment } from "@/features/site-assessments/components/site-assessment-panel";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { findKnownCodeInText } from "@/lib/errors/codes";

type ListRow = FunctionReturnType<
  typeof api.admin.projects.listProjects
>[number];
type Review = NonNullable<
  FunctionReturnType<typeof api.admin.projects.getProjectReview>
>;
type ProjectStatus = Review["status"];
type ListStatus = ProjectStatus | "all";
type HistoryItem = Review["history"][number];
type ActivityItem = FunctionReturnType<
  typeof api.admin.projects.listProjectActivity
>[number];
type ProjectCity = NonNullable<ListRow["city"]>;

const TABS: ListStatus[] = [
  "pending_review",
  "published",
  "needs_changes",
  "cancelled",
  "all",
];
const FILTER_STATUSES: ListStatus[] = [
  "all",
  "draft",
  "pending_review",
  "needs_changes",
  "published",
  "in_discussion",
  "company_selected",
  "in_progress",
  "completed",
  "cancelled",
  "archived",
];
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

export function AdminProjectsPanel() {
  const t = useTranslations("adminProjects");
  const tUx = useTranslations("ux");
  const tWizard = useTranslations("projectWizard");
  const locale = useLocale();
  const [status, setStatus] = useState<ListStatus>("pending_review");
  const [search, setSearch] = useState("");
  const [city, setCity] = useState<ProjectCity | "">("");
  const [selectedId, setSelectedId] = useState<Id<"projects"> | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const list = useQuery(api.admin.projects.listProjects, {
    status,
    search: search.trim() || undefined,
    city: city || undefined,
  });

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  return (
    <AdminPage breadcrumb={t("title")} notice={notice} title={t("title")}>
      <p className="max-w-2xl text-sm leading-6 text-[#626970]">{t("lead")}</p>
      <section className="rounded-[20px] border border-[#e7eaee] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div
            className="flex flex-wrap gap-1"
            role="tablist"
            aria-label={t("tabsLabel")}
          >
            {TABS.map((item) => (
              <button
                aria-selected={status === item}
                className={`min-h-11 rounded-full px-4 text-sm font-semibold ${ADMIN_PRESS} ${
                  status === item
                    ? "bg-[#2f6bff] text-white"
                    : "bg-[#f4f6f8] text-[#626970]"
                }`}
                key={item}
                onClick={() => {
                  setStatus(item);
                  setSelectedId(null);
                  setError("");
                }}
                role="tab"
                type="button"
              >
                {tabLabel(t, item)}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_190px]">
            <label className="flex min-h-11 items-center rounded-full bg-[#f4f6f8] px-3 text-sm">
              <span className="sr-only">{t("searchLabel")}</span>
              <input
                className="h-11 w-full bg-transparent text-[#17191d] outline-none placeholder:text-[#8b919a]"
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchPlaceholder")}
                value={search}
              />
            </label>
            <label className="flex min-h-11 items-center rounded-full bg-[#f4f6f8] px-3 text-sm">
              <span className="sr-only">{t("cityLabel")}</span>
              <select
                className="h-11 w-full bg-transparent text-[#626970] outline-none"
                onChange={(event) =>
                  setCity(event.target.value as ProjectCity | "")
                }
                value={city}
              >
                <option value="">{t("allCities")}</option>
                {CITIES.map((item) => (
                  <option key={item} value={item}>
                    {tWizard(`cityOptions.${item}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-11 items-center rounded-full bg-[#f4f6f8] px-3 text-sm">
              <span className="sr-only">{t("statusFilterLabel")}</span>
              <select
                className="h-11 w-full bg-transparent text-[#626970] outline-none"
                onChange={(event) => {
                  setStatus(event.target.value as ListStatus);
                  setSelectedId(null);
                }}
                value={status}
              >
                {FILTER_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(t, item)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error ? (
          <p
            className="mt-4 rounded-[14px] bg-[#fdecec] px-4 py-3 text-sm text-[#b42318]"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {list === undefined ? (
          <ProjectListSkeleton label={tUx("loading.dashboard")} />
        ) : list.length === 0 ? (
          <p className="mt-8 py-10 text-center text-sm text-[#8b919a]">
            {t("empty")}
          </p>
        ) : (
          <>
            <div className="mt-5 grid gap-3 md:hidden">
              {list.map((row) => (
                <article
                  className="rounded-[14px] bg-[#f8fafb] p-4"
                  key={row.projectId}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-[#17191d]">
                        {row.title}
                      </h2>
                      <p className="mt-1 text-xs text-[#8b919a]">
                        {row.clientName}
                      </p>
                    </div>
                    <StatusPill status={row.status} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <CompactField
                      label={t("columns.city")}
                      value={
                        row.city ? tWizard(`cityOptions.${row.city}`) : "—"
                      }
                    />
                    <CompactField
                      label={t("columns.category")}
                      value={categoryLabel(
                        tWizard,
                        row.category,
                        row.customCategoryText,
                      )}
                    />
                    <CompactField
                      label={t("columns.budget")}
                      value={
                        row.budgetRange
                          ? tWizard(`budgetOptions.${row.budgetRange}`)
                          : "—"
                      }
                    />
                    <CompactField
                      label={t("columns.submitted")}
                      value={formatDate(row.submittedAt, locale)}
                    />
                  </dl>
                  <button
                    className={`mt-4 inline-flex min-h-10 items-center rounded-full border border-[#e6e9ee] bg-white px-3 text-sm font-semibold ${ADMIN_PRESS}`}
                    onClick={() => setSelectedId(row.projectId)}
                    type="button"
                  >
                    {t("review")}
                  </button>
                </article>
              ))}
            </div>
            <div className="mt-5 hidden overflow-x-auto md:block">
              <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className="text-[0.72rem] font-semibold tracking-[0.06em] text-[#a0a6ae] uppercase">
                    <th className="px-3 py-2 font-semibold">
                      {t("columns.project")}
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      {t("columns.client")}
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      {t("columns.city")}
                    </th>
                    <th className="hidden px-3 py-2 font-semibold lg:table-cell">
                      {t("columns.category")}
                    </th>
                    <th className="hidden px-3 py-2 font-semibold xl:table-cell">
                      {t("columns.budget")}
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      {t("columns.submitted")}
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      {t("columns.status")}
                    </th>
                    <th className="px-3 py-2 font-semibold">
                      {t("columns.action")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row: ListRow) => (
                    <tr className="bg-[#f8fafb]" key={row.projectId}>
                      <td className="rounded-l-[14px] px-3 py-3 font-semibold text-[#17191d]">
                        {row.title}
                      </td>
                      <td className="px-3 py-3 text-[#626970]">
                        {row.clientName}
                      </td>
                      <td className="px-3 py-3 text-[#626970]">
                        {row.city ? tWizard(`cityOptions.${row.city}`) : "—"}
                      </td>
                      <td className="hidden px-3 py-3 text-[#626970] lg:table-cell">
                        {categoryLabel(
                          tWizard,
                          row.category,
                          row.customCategoryText,
                        )}
                      </td>
                      <td className="hidden px-3 py-3 text-[#626970] xl:table-cell">
                        {row.budgetRange
                          ? tWizard(`budgetOptions.${row.budgetRange}`)
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-[#626970]">
                        {formatDate(row.submittedAt, locale)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={row.status} />
                      </td>
                      <td className="rounded-r-[14px] px-3 py-3">
                        <button
                          className={`inline-flex min-h-10 items-center rounded-full border border-[#e6e9ee] bg-white px-3 text-sm font-semibold ${ADMIN_PRESS}`}
                          onClick={() => setSelectedId(row.projectId)}
                          type="button"
                        >
                          {t("review")}
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
        <ProjectReviewDrawer
          projectId={selectedId}
          onClose={() => setSelectedId(null)}
          onError={(message) => setError(message)}
          onSuccess={(message) => {
            setNotice(message);
            setSelectedId(null);
          }}
        />
      ) : null}
    </AdminPage>
  );
}

export function ProjectReviewDrawer({
  projectId,
  onClose,
  onSuccess,
  onError,
}: {
  projectId: Id<"projects">;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations("adminProjects");
  const tUx = useTranslations("ux");
  const tWizard = useTranslations("projectWizard");
  const locale = useLocale();
  const titleId = useId();
  const review = useQuery(api.admin.projects.getProjectReview, { projectId });
  const activity = useQuery(api.admin.projects.listProjectActivity, {
    projectId,
  });
  const approve = useMutation(api.admin.projects.approveProject);
  const requestChanges = useMutation(api.admin.projects.requestProjectChanges);
  const cancelProject = useMutation(api.admin.projects.cancelProject);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<
    "approve" | "changes" | "cancel" | null
  >(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function runAction(action: "approve" | "changes" | "cancel") {
    setBusy(true);
    try {
      if (action === "approve") await approve({ projectId });
      else if (action === "changes")
        await requestChanges({ projectId, reason });
      else await cancelProject({ projectId, reason });
      onSuccess(
        t(
          action === "approve"
            ? "approved"
            : action === "changes"
              ? "changesRequested"
              : "cancelled",
        ),
      );
    } catch (error) {
      onError(resolveError(error, tUx));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45">
      <button
        aria-label={t("close")}
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative z-10 flex h-full w-full max-w-xl flex-col bg-white shadow-[-12px_0_40px_rgba(16,24,40,0.18)]"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#eef1f4] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.08em] text-[#8b919a] uppercase">
              {t("reviewTitle")}
            </p>
            <h2
              className="mt-1 truncate text-xl font-semibold tracking-[-0.02em]"
              id={titleId}
            >
              {review?.title ?? t("loadingReview")}
            </h2>
          </div>
          <button
            aria-label={t("close")}
            className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full ${ADMIN_PRESS}`}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {review === undefined ? (
            <div aria-busy="true" className="space-y-3" role="status">
              <span className="sr-only">{tUx("loading.dashboard")}</span>
              <div className="h-24 animate-pulse rounded-[16px] bg-[#f4f6f8]" />
              <div className="h-40 animate-pulse rounded-[16px] bg-[#f4f6f8]" />
            </div>
          ) : review === null ? (
            <p className="text-sm text-[#8b919a]">{t("notFound")}</p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={review.status} />
                {review.submittedAt ? (
                  <span className="text-sm text-[#8b919a]">
                    {t("submittedAt", {
                      date: formatMarketplaceDateTime(review.submittedAt, locale),
                    })}
                  </span>
                ) : null}
              </div>
              <Section title={t("sections.project")}>
                <Field label={t("fields.title")} value={review.title} />
                <Field
                  label={t("fields.client")}
                  value={review.client.displayName}
                />
                <Field
                  label={t("fields.category")}
                  value={categoryLabel(
                    tWizard,
                    review.category,
                    review.customCategoryText,
                  )}
                />
                <Field
                  label={t("fields.location")}
                  value={
                    [
                      review.city
                        ? tWizard(`cityOptions.${review.city}`)
                        : null,
                      review.neighborhood,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"
                  }
                />
                <Field
                  label={t("fields.propertyType")}
                  value={
                    review.propertyType
                      ? tWizard(`propertyTypeOptions.${review.propertyType}`)
                      : "—"
                  }
                />
                <Field
                  label={t("fields.surface")}
                  value={
                    review.surfaceUnknown
                      ? t("surfaceUnknown")
                      : review.surface
                        ? `${review.surface} m²`
                        : "—"
                  }
                />
                <Field
                  label={t("fields.description")}
                  value={review.description || "—"}
                />
                <Field
                  label={t("fields.budget")}
                  value={
                    review.budgetRange
                      ? tWizard(`budgetOptions.${review.budgetRange}`)
                      : "—"
                  }
                />
                <Field
                  label={t("fields.timeline")}
                  value={
                    review.timeline
                      ? tWizard(`timelineOptions.${review.timeline}`)
                      : "—"
                  }
                />
                <Field
                  label={t("fields.status")}
                  value={statusLabel(t, review.status)}
                />
              </Section>
              <ProjectSiteAssessment projectId={projectId} />
              <Section title={t("sections.history")}>
                {review.history.length === 0 ? (
                  <p className="text-sm text-[#8b919a]">{t("historyEmpty")}</p>
                ) : (
                  <ul className="space-y-3">
                    {review.history.map((item: HistoryItem) => (
                      <li
                        className="rounded-[12px] border border-[#eef1f4] px-3 py-3 text-sm"
                        key={item.historyId}
                      >
                        <p className="font-semibold text-[#17191d]">
                          {statusLabel(t, item.oldStatus)} →{" "}
                          {statusLabel(t, item.newStatus)}
                        </p>
                        <p className="mt-1 text-[#8b919a]">
                          {item.changedBy.displayName} ·{" "}
                          {formatMarketplaceDateTime(item.changedAt, locale)}
                        </p>
                        {item.reason ? (
                          <p className="mt-2 text-[#b42318]">{item.reason}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              <Section title={t("sections.timeline")}>
                {activity === undefined ? (
                  <div aria-busy="true" className="space-y-3" role="status">
                    <span className="sr-only">{t("activity.loading")}</span>
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div
                        className="h-16 animate-pulse rounded-[12px] bg-[#f4f6f8]"
                        key={index}
                      />
                    ))}
                  </div>
                ) : activity.length === 0 ? (
                  <p className="text-sm text-[#8b919a]">
                    {t("activity.empty")}
                  </p>
                ) : (
                  <ol className="relative space-y-0 before:absolute before:top-3 before:bottom-3 before:left-[7px] before:w-px before:bg-[#dce3ea]">
                    {activity.map((item: ActivityItem) => (
                      <li
                        className="relative grid grid-cols-[16px_1fr] gap-3 pb-5 last:pb-0"
                        key={item.activityId}
                      >
                        <span className="relative z-10 mt-1.5 size-[15px] rounded-full border-[4px] border-white bg-[#2f6bff] shadow-[0_0_0_1px_#cfd7e2]" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#17191d]">
                            {t(
                              `activity.events.${item.eventType}` as "activity.events.project_created",
                            )}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#8b919a]">
                            {t("activity.byActor", {
                              actor: item.actor.displayName,
                              type: t(
                                `activity.actorType.${item.actor.type}` as "activity.actorType.client",
                              ),
                            })}
                            {" · "}
                            {formatMarketplaceDateTime(item.createdAt, locale)}
                          </p>
                          {item.company ? (
                            <p className="mt-1 text-xs text-[#626970]">
                              {t("activity.company", {
                                company: item.company.name,
                              })}
                            </p>
                          ) : null}
                          {item.oldStatus && item.newStatus ? (
                            <p className="mt-1 text-xs text-[#626970]">
                              {t("activity.statusTransition", {
                                oldStatus: activityStatusLabel(
                                  t,
                                  item.oldStatus,
                                ),
                                newStatus: activityStatusLabel(
                                  t,
                                  item.newStatus,
                                ),
                              })}
                            </p>
                          ) : null}
                          {item.reason ? (
                            <p className="mt-2 rounded-[10px] bg-[#fff7ed] px-3 py-2 text-xs leading-5 text-[#9a6700]">
                              {t("activity.reason", { reason: item.reason })}
                            </p>
                          ) : null}
                          {item.metadata?.proposedDate &&
                          item.metadata?.proposedTime ? (
                            <p className="mt-2 rounded-[10px] bg-[#f4f7fb] px-3 py-2 text-xs leading-5 text-[#405064]">
                              {t("activity.visitSchedule", {
                                date: String(item.metadata.proposedDate),
                                time: String(item.metadata.proposedTime),
                                timezone: String(
                                  item.metadata.timezone ?? "Africa/Casablanca",
                                ),
                              })}
                            </p>
                          ) : null}
                          {item.metadata?.revisionNumber && item.metadata?.price ? (
                            <p className="mt-2 rounded-[10px] bg-[#f4f7fb] px-3 py-2 text-xs font-semibold leading-5 text-[#405064]">
                              {t("activity.finalQuoteSummary", {
                                revision: Number(item.metadata.revisionNumber),
                                price: new Intl.NumberFormat(locale).format(Number(item.metadata.price)),
                                currency: String(item.metadata.currency ?? "MAD"),
                              })}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>
              {review.status === "pending_review" ? (
                <Section title={t("sections.actions")}>
                  {confirm === "approve" ? (
                    <ConfirmApprove
                      busy={busy}
                      onCancel={() => setConfirm(null)}
                      onConfirm={() => void runAction("approve")}
                    />
                  ) : confirm === "changes" || confirm === "cancel" ? (
                    <ReasonAction
                      action={confirm}
                      busy={busy}
                      reason={reason}
                      setReason={setReason}
                      onCancel={() => setConfirm(null)}
                      onConfirm={() => void runAction(confirm)}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={`min-h-11 rounded-full bg-[#2f6bff] px-4 text-sm font-semibold text-white ${ADMIN_PRESS}`}
                        onClick={() => setConfirm("approve")}
                        type="button"
                      >
                        {t("approve")}
                      </button>
                      <button
                        className={`min-h-11 rounded-full border border-[#e6e9ee] px-4 text-sm font-semibold text-[#9a6700] ${ADMIN_PRESS}`}
                        onClick={() => {
                          setReason("");
                          setConfirm("changes");
                        }}
                        type="button"
                      >
                        {t("requestChanges")}
                      </button>
                      <button
                        className={`min-h-11 rounded-full border border-[#e6e9ee] px-4 text-sm font-semibold text-[#b42318] ${ADMIN_PRESS}`}
                        onClick={() => {
                          setReason("");
                          setConfirm("cancel");
                        }}
                        type="button"
                      >
                        {t("cancelProject")}
                      </button>
                    </div>
                  )}
                </Section>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function ConfirmApprove({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("adminProjects");
  return (
    <div className="space-y-3">
      <p className="text-sm text-[#626970]">{t("confirmApproveLead")}</p>
      <div className="flex flex-wrap gap-2">
        <button
          className={`min-h-11 rounded-full bg-[#157a3e] px-4 text-sm font-semibold text-white disabled:opacity-50 ${ADMIN_PRESS}`}
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {t("confirmApprove")}
        </button>
        <button
          className={`min-h-11 rounded-full border border-[#e6e9ee] px-4 text-sm font-semibold ${ADMIN_PRESS}`}
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

function ReasonAction({
  action,
  busy,
  reason,
  setReason,
  onCancel,
  onConfirm,
}: {
  action: "changes" | "cancel";
  busy: boolean;
  reason: string;
  setReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("adminProjects");
  const id = useId();
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium" htmlFor={id}>
        {t(action === "changes" ? "changesReason" : "cancelReason")}
      </label>
      <textarea
        className="min-h-28 w-full rounded-[14px] border border-[#e6e9ee] px-3 py-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff]"
        id={id}
        onChange={(event) => setReason(event.target.value)}
        value={reason}
      />
      <div className="flex flex-wrap gap-2">
        <button
          className={`min-h-11 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-50 ${action === "changes" ? "bg-[#9a6700]" : "bg-[#b42318]"} ${ADMIN_PRESS}`}
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {t(action === "changes" ? "confirmChanges" : "confirmCancelProject")}
        </button>
        <button
          className={`min-h-11 rounded-full border border-[#e6e9ee] px-4 text-sm font-semibold ${ADMIN_PRESS}`}
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

function ProjectListSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="mt-5 space-y-3" role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          className="h-14 animate-pulse rounded-[14px] bg-[#f4f6f8]"
          key={index}
        />
      ))}
    </div>
  );
}
function Section({
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
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#17191d]">
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

function StatusPill({ status }: { status: ProjectStatus }) {
  const t = useTranslations("adminProjects");
  const style =
    status === "pending_review"
      ? "bg-[#fff4df] text-[#9a6700]"
      : status === "published"
        ? "bg-[#e7f8ee] text-[#157a3e]"
        : status === "needs_changes"
          ? "bg-[#fff0d8] text-[#9a6700]"
          : status === "cancelled"
            ? "bg-[#fdecec] text-[#b42318]"
            : "bg-[#eef1f4] text-[#626970]";
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold ${style}`}
    >
      {statusLabel(t, status)}
    </span>
  );
}

function statusLabel(
  t: ReturnType<typeof useTranslations<"adminProjects">>,
  status: ListStatus,
) {
  return t(`status.${status}` as "status.all");
}
function tabLabel(
  t: ReturnType<typeof useTranslations<"adminProjects">>,
  status: (typeof TABS)[number],
) {
  return t(`tabs.${status}` as "tabs.all");
}
function categoryLabel(
  t: ReturnType<typeof useTranslations<"projectWizard">>,
  category: ListRow["category"],
  custom: string | null,
) {
  if (!category) return "—";
  const label = t(`categoryOptions.${category}`);
  return category === "other" && custom ? `${label} · ${custom}` : label;
}
function formatDate(value: number | null, locale: string) {
  return value
    ? formatMarketplaceDateTime(value, locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
}
function activityStatusLabel(
  t: ReturnType<typeof useTranslations<"adminProjects">>,
  status: string,
) {
  return t(`activity.status.${status}` as "activity.status.draft");
}
function resolveError(
  error: unknown,
  tUx: ReturnType<typeof useTranslations<"ux">>,
) {
  const message = error instanceof Error ? error.message : "";
  const code = findKnownCodeInText(message);
  if (code && code !== "UNKNOWN" && code !== "NETWORK") {
    try {
      return tUx(`error.codes.${code}` as "error.generic");
    } catch {
      return tUx("error.generic");
    }
  }
  return tUx("error.generic");
}
