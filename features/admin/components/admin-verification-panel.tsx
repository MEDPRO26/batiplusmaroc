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
import { findKnownCodeInText } from "@/lib/errors/codes";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";

type TabStatus = "pending" | "verified" | "rejected";
type HistoryStatus = "draft" | TabStatus;
type ListRow = FunctionReturnType<
  typeof api.admin.verification.listCompanyVerifications
>[number];
type Review = NonNullable<
  FunctionReturnType<typeof api.admin.verification.getCompanyVerificationReview>
>;
type ReviewDocument = Review["documents"][number];
type HistoryItem = Review["history"][number];
type DocumentType = ReviewDocument["documentType"];

export function AdminVerificationPanel() {
  const t = useTranslations("adminVerification");
  const tDash = useTranslations("adminDashboard");
  const tUx = useTranslations("ux");
  const locale = useLocale();
  const [tab, setTab] = useState<TabStatus>("pending");
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"companies"> | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const list = useQuery(api.admin.verification.listCompanyVerifications, {
    status: tab,
    search: search.trim() || undefined,
    city: city.trim() || undefined,
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex flex-wrap gap-1"
            role="tablist"
            aria-label={t("tabsLabel")}
          >
            {(["pending", "verified", "rejected"] as TabStatus[]).map(
              (status) => (
                <button
                  aria-selected={tab === status}
                  className={`min-h-11 rounded-full px-4 text-sm font-semibold ${ADMIN_PRESS} ${
                    tab === status
                      ? "bg-[#2f6bff] text-white"
                      : "bg-[#f4f6f8] text-[#626970]"
                  }`}
                  key={status}
                  onClick={() => {
                    setTab(status);
                    setSelectedId(null);
                    setError("");
                  }}
                  role="tab"
                  type="button"
                >
                  {t(`tabs.${status}`)}
                </button>
              ),
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex min-h-11 flex-1 items-center gap-2 rounded-full bg-[#f4f6f8] px-3 text-sm text-[#8b919a]">
              <span className="sr-only">{t("searchLabel")}</span>
              <input
                className="h-11 w-full bg-transparent text-[#17191d] outline-none placeholder:text-[#8b919a]"
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchPlaceholder")}
                value={search}
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-full bg-[#f4f6f8] px-3 text-sm text-[#8b919a] sm:w-44">
              <span className="sr-only">{t("cityLabel")}</span>
              <input
                className="h-11 w-full bg-transparent text-[#17191d] outline-none placeholder:text-[#8b919a]"
                onChange={(event) => setCity(event.target.value)}
                placeholder={t("cityPlaceholder")}
                value={city}
              />
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
          <div aria-busy="true" className="mt-5 space-y-3" role="status">
            <span className="sr-only">{tUx("loading.dashboard")}</span>
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                className="h-14 animate-pulse rounded-[14px] bg-[#f4f6f8]"
                key={index}
              />
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="mt-8 py-10 text-center text-sm text-[#8b919a]">
            {t("empty")}
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
              <thead>
                <tr className="text-[0.72rem] font-semibold tracking-[0.06em] text-[#a0a6ae] uppercase">
                  <th className="px-3 py-2 font-semibold">
                    {t("columns.company")}
                  </th>
                  <th className="px-3 py-2 font-semibold">
                    {t("columns.city")}
                  </th>
                  <th className="px-3 py-2 font-semibold">
                    {t("columns.ice")}
                  </th>
                  <th className="px-3 py-2 font-semibold">{t("columns.rc")}</th>
                  <th className="hidden px-3 py-2 font-semibold xl:table-cell">
                    {t("columns.representative")}
                  </th>
                  <th className="px-3 py-2 font-semibold">
                    {t("columns.submitted")}
                  </th>
                  <th className="px-3 py-2 font-semibold">
                    {t("columns.documents")}
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
                  <tr
                    className="rounded-[14px] bg-[#f8fafb]"
                    key={row.companyId}
                  >
                    <td className="rounded-l-[14px] px-3 py-3 font-semibold text-[#17191d]">
                      {row.companyName}
                    </td>
                    <td className="px-3 py-3 text-[#626970]">{row.city}</td>
                    <td className="px-3 py-3 tabular-nums text-[#626970]">
                      {row.ice || "—"}
                    </td>
                    <td className="px-3 py-3 text-[#626970]">
                      {row.rcNumber || "—"}
                    </td>
                    <td className="hidden px-3 py-3 text-[#626970] xl:table-cell">
                      {row.legalRepresentative || "—"}
                    </td>
                    <td className="px-3 py-3 text-[#626970]">
                      {row.submittedAt
                        ? formatMarketplaceDateTime(row.submittedAt, locale, {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-[#626970]">
                      {row.documentCount}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="rounded-r-[14px] px-3 py-3">
                      <button
                        className={`inline-flex min-h-10 items-center rounded-full border border-[#e6e9ee] bg-white px-3 text-sm font-semibold text-[#17191d] ${ADMIN_PRESS}`}
                        onClick={() => {
                          setSelectedId(row.companyId);
                          setError("");
                        }}
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
        )}
      </section>

      {selectedId ? (
        <ReviewDrawer
          companyId={selectedId}
          onClose={() => setSelectedId(null)}
          onError={(message) => setError(message)}
          onSuccess={(message) => {
            setNotice(message);
            setSelectedId(null);
          }}
        />
      ) : null}
      <span className="sr-only">{tDash("navVerification")}</span>
    </AdminPage>
  );
}

function StatusPill({ status }: { status: TabStatus }) {
  const t = useTranslations("adminVerification");
  const styles =
    status === "pending"
      ? "bg-[#fff4df] text-[#9a6700]"
      : status === "verified"
        ? "bg-[#e7f8ee] text-[#157a3e]"
        : "bg-[#fdecec] text-[#b42318]";
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold ${styles}`}
    >
      {t(`tabs.${status}`)}
    </span>
  );
}

function ReviewDrawer({
  companyId,
  onClose,
  onSuccess,
  onError,
}: {
  companyId: Id<"companies">;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations("adminVerification");
  const tUx = useTranslations("ux");
  const locale = useLocale();
  const titleId = useId();
  const review = useQuery(api.admin.verification.getCompanyVerificationReview, {
    companyId,
  });
  const approve = useMutation(
    api.admin.verification.approveCompanyVerification,
  );
  const reject = useMutation(api.admin.verification.rejectCompanyVerification);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function runApprove() {
    setBusy(true);
    try {
      await approve({ companyId });
      onSuccess(t("approved"));
    } catch (error) {
      onError(resolveError(error, tUx));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function runReject() {
    setBusy(true);
    try {
      await reject({ companyId, reason });
      onSuccess(t("rejected"));
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
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] text-[#8b919a] uppercase">
              {t("reviewTitle")}
            </p>
            <h2
              className="mt-1 text-xl font-semibold tracking-[-0.02em]"
              id={titleId}
            >
              {review?.companyName ?? t("loadingReview")}
            </h2>
          </div>
          <button
            aria-label={t("close")}
            className={`inline-flex size-11 items-center justify-center rounded-full ${ADMIN_PRESS}`}
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

              <Section title={t("sections.public")}>
                <Field label={t("fields.company")} value={review.companyName} />
                <Field label={t("fields.city")} value={review.city} />
                <Field
                  label={t("fields.description")}
                  value={review.description || "—"}
                />
                <Field
                  label={t("fields.publicPhone")}
                  value={review.publicPhone || "—"}
                />
              </Section>

              <Section title={t("sections.legal")}>
                <Field
                  label={t("fields.legalName")}
                  value={review.legalName || "—"}
                />
                <Field label={t("fields.ice")} value={review.ice || "—"} />
                <Field label={t("fields.rc")} value={review.rcNumber || "—"} />
                <Field
                  label={t("fields.representative")}
                  value={review.legalRepresentative || "—"}
                />
                <Field label={t("fields.phone")} value={review.phone || "—"} />
                <Field
                  label={t("fields.address")}
                  value={review.address || "—"}
                />
              </Section>

              <Section title={t("sections.documents")}>
                {review.documents.length === 0 ? (
                  <p className="text-sm text-[#8b919a]">{t("noDocuments")}</p>
                ) : (
                  <ul className="space-y-2">
                    {review.documents.map((document: ReviewDocument) => (
                      <li
                        className="flex items-center justify-between gap-3 rounded-[12px] border border-[#eef1f4] px-3 py-2"
                        key={document.documentId}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            {documentTypeLabel(t, document.documentType)}
                          </span>
                          <span className="block truncate text-xs text-[#8b919a]">
                            {document.fileName}
                          </span>
                        </span>
                        {document.downloadUrl ? (
                          <a
                            className={`inline-flex min-h-10 items-center rounded-full border border-[#e6e9ee] px-3 text-sm font-semibold ${ADMIN_PRESS}`}
                            href={document.downloadUrl}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            {t("openDocument")}
                          </a>
                        ) : (
                          <span className="text-xs text-[#8b919a]">
                            {t("documentUnavailable")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {review.latestRejectionReason ? (
                <Section title={t("sections.rejection")}>
                  <p className="text-sm text-[#b42318]">
                    {review.latestRejectionReason}
                  </p>
                </Section>
              ) : null}

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
                          {formatActor(item.changedBy)} ·{" "}
                          {formatMarketplaceDateTime(item.changedAt, locale)}
                        </p>
                        {item.rejectionReason ? (
                          <p className="mt-2 text-[#b42318]">
                            {item.rejectionReason}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {review.status === "pending" ? (
                <Section title={t("sections.actions")}>
                  {confirm === "reject" ? (
                    <div className="space-y-3">
                      <label
                        className="block text-sm font-medium"
                        htmlFor={`${titleId}-reason`}
                      >
                        {t("rejectReason")}
                      </label>
                      <textarea
                        className="min-h-28 w-full rounded-[14px] border border-[#e6e9ee] px-3 py-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff]"
                        id={`${titleId}-reason`}
                        onChange={(event) => setReason(event.target.value)}
                        value={reason}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={`min-h-11 rounded-full bg-[#b42318] px-4 text-sm font-semibold text-white disabled:opacity-50 ${ADMIN_PRESS}`}
                          disabled={busy}
                          onClick={() => void runReject()}
                          type="button"
                        >
                          {t("confirmReject")}
                        </button>
                        <button
                          className={`min-h-11 rounded-full border border-[#e6e9ee] px-4 text-sm font-semibold ${ADMIN_PRESS}`}
                          disabled={busy}
                          onClick={() => setConfirm(null)}
                          type="button"
                        >
                          {t("cancel")}
                        </button>
                      </div>
                    </div>
                  ) : confirm === "approve" ? (
                    <div className="space-y-3">
                      <p className="text-sm text-[#626970]">
                        {t("confirmApproveLead")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={`min-h-11 rounded-full bg-[#157a3e] px-4 text-sm font-semibold text-white disabled:opacity-50 ${ADMIN_PRESS}`}
                          disabled={busy}
                          onClick={() => void runApprove()}
                          type="button"
                        >
                          {t("confirmApprove")}
                        </button>
                        <button
                          className={`min-h-11 rounded-full border border-[#e6e9ee] px-4 text-sm font-semibold ${ADMIN_PRESS}`}
                          disabled={busy}
                          onClick={() => setConfirm(null)}
                          type="button"
                        >
                          {t("cancel")}
                        </button>
                      </div>
                    </div>
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
                        className={`min-h-11 rounded-full border border-[#e6e9ee] px-4 text-sm font-semibold text-[#b42318] ${ADMIN_PRESS}`}
                        onClick={() => setConfirm("reject")}
                        type="button"
                      >
                        {t("reject")}
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
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.04em] text-[#a0a6ae] uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm text-[#17191d]">{value}</p>
    </div>
  );
}

function formatActor(actor: {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(" ");
  return name || actor.email || "—";
}

function documentTypeLabel(
  t: ReturnType<typeof useTranslations<"adminVerification">>,
  type: DocumentType,
) {
  if (type === "rc") return t("documentTypes.rc");
  if (type === "ice") return t("documentTypes.ice");
  if (type === "insurance") return t("documentTypes.insurance");
  return t("documentTypes.other");
}

function statusLabel(
  t: ReturnType<typeof useTranslations<"adminVerification">>,
  status: HistoryStatus,
) {
  if (status === "draft") return t("status.draft");
  if (status === "pending") return t("status.pending");
  if (status === "verified") return t("status.verified");
  return t("status.rejected");
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
