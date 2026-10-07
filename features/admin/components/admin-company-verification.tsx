"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { useId, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { VerifiedBadge } from "@/features/companies/components/verified-badge";
import { VerificationDocumentDownload } from "@/features/companies/components/verification-document-download";
import { VerificationPill } from "./admin-companies-panel";
import { ADMIN_PRESS } from "./admin-shell";

type Review = NonNullable<FunctionReturnType<typeof api.admin.verification.getCompanyVerificationReview>>;
const CARD = "min-w-0 rounded-[14px] border border-[#e7eaee] bg-white p-5";
const BUTTON = `min-h-11 rounded-sm px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${ADMIN_PRESS}`;
const OPTIONAL_TYPES = ["rc", "ice", "insurance", "other"] as const;

/** This tab consumes only the Admin-authorized DTO; all decisions remain backend-authorized. */
export function AdminCompanyVerification({ companyId, companyName }: { companyId: Id<"companies">; companyName: string }) {
  const t = useTranslations("adminCompanies.verification");
  const review = useQuery(api.admin.verification.getCompanyVerificationReview, { companyId });
  if (review === undefined) return <div aria-busy="true" className={CARD} role="status">{t("loading")}</div>;
  if (review === null) return <p className={CARD}>{t("notFound")}</p>;
  // A reactive status change closes stale decision dialogs, including changes made by another Admin.
  return <VerificationReview key={`${companyId}:${review.status}`} companyName={companyName} review={review} />;
}

function VerificationReview({ companyName, review }: { companyName: string; review: Review }) {
  const t = useTranslations("adminCompanies.verification");
  const tAdmin = useTranslations("adminVerification");
  const tStatus = useTranslations("adminCompanies.status.verification");
  const locale = useLocale();
  const approve = useMutation(api.admin.verification.approveCompanyVerification);
  const reject = useMutation(api.admin.verification.rejectCompanyVerification);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const trigger = useRef<HTMLButtonElement | null>(null);
  const reasonId = useId();
  const hasTax = review.documents.some(document => document.documentType === "tax_compliance");
  const formatDate = (value: number) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Casablanca" }).format(value);

  function close() { setAction(null); setReason(""); setError(""); }
  async function decide() {
    if (!action || busy || review.status !== "pending" || (action === "approve" && !hasTax) || (action === "reject" && reason.trim().length < 3)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (action === "approve") await approve({ companyId: review.companyId });
      else await reject({ companyId: review.companyId, reason: reason.trim() });
      setNotice(t(`${action}Success`)); close();
    } catch { setError(t("actionError")); }
    finally { setBusy(false); }
  }

  function documentCard(type: Review["documents"][number]["documentType"]) {
    const document = review.documents.find(item => item.documentType === type);
    return <li className="min-w-0 rounded-sm border border-[#e7eaee] p-4" key={type}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="min-w-0 break-words text-sm font-semibold">{t(`documentTypes.${type}`)}</h4>
        <span className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${type === "tax_compliance" ? "bg-blue-50 text-[#2456c7]" : "bg-[#f3f5f7] text-[#626970]"}`}>{t(type === "tax_compliance" ? "required" : "optional")}</span>
      </div>
      {document ? <>
        <p className="mt-2 break-all text-sm text-[#626970]">{document.fileName}</p>
        <p className="mt-1 text-xs text-[#8b919a]">{t("uploaded", { date: formatDate(document.uploadedAt) })}</p>
        {document.downloadUrl ? <div className="mt-3"><VerificationDocumentDownload className={`${BUTTON} border border-[#d9e1ef] text-[#2456c7]`} url={document.downloadUrl} fileName={document.fileName} label={t("viewDocument")} /></div> : <p className="mt-3 text-sm text-[#8b919a]">{tAdmin("documentUnavailable")}</p>}
      </> : <p className="mt-3 text-sm text-[#8b919a]">{t("notUploaded")}</p>}
    </li>;
  }

  return <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
    <div className="grid min-w-0 content-start gap-4">
      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{t("title")}</h2><VerificationPill value={review.status} /></div>
        <p className="mt-3 text-sm text-[#626970]">{t(`state.${review.status}`)}</p>
        {review.status === "verified" ? <div className="mt-4"><VerifiedBadge label={tStatus("verified")} verificationStatus={review.status} /></div> : null}
        {review.status === "rejected" && review.latestRejectionReason ? <div className="mt-4 rounded-sm bg-red-50 p-4 text-sm text-red-800"><h3 className="font-semibold">{t("reason")}</h3><p className="mt-1 whitespace-pre-wrap break-words">{review.latestRejectionReason}</p></div> : null}
        <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {(["legalName", "ice", "rc", "representative", "phone", "address"] as const).map((field) => {
            const value = { legalName: review.legalName, ice: review.ice, rc: review.rcNumber, representative: review.legalRepresentative, phone: review.phone, address: review.address }[field];
            return <div className="min-w-0" key={field}><dt className="text-xs text-[#8b919a]">{tAdmin(`fields.${field}`)}</dt><dd className="mt-1 break-words text-sm font-medium">{value || t("notProvided")}</dd></div>;
          })}
        </dl>
        {review.submittedAt !== null ? <p className="mt-4 text-xs text-[#8b919a]">{t("submitted", { date: formatDate(review.submittedAt) })}</p> : null}
        {review.status === "pending" ? <div className="mt-5 border-t border-[#eef1f4] pt-5">
          <h3 className="text-sm font-semibold">{t("decision")}</h3>
          {!hasTax ? <p className="mt-2 text-sm text-red-800" role="alert">{t("missingRequired")}</p> : null}
          <Dialog.Root open={action !== null} onOpenChange={open => { if (!open && !busy) close(); }}>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["approve", "reject"] as const).map(value => <Dialog.Trigger asChild key={value}><button className={`${BUTTON} ${value === "approve" ? "bg-emerald-700 text-white" : "border border-red-200 text-red-700"}`} disabled={busy || (value === "approve" && !hasTax)} onClick={event => { trigger.current = event.currentTarget; setAction(value); setError(""); }} type="button">{tAdmin(value)}</button></Dialog.Trigger>)}
            </div>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/40" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[16px] bg-white p-5 shadow-xl outline-none sm:p-6" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
                <Dialog.Title className="text-lg font-semibold">{tAdmin(action === "approve" ? "confirmApprove" : "confirmReject")}</Dialog.Title>
                <Dialog.Description className="mt-2 break-words text-sm text-[#626970]">{t(action === "approve" ? "confirmApproveLead" : "confirmRejectLead", { company: companyName })}</Dialog.Description>
                {action === "reject" ? <div className="mt-4">
                  <label className="block text-sm font-semibold" htmlFor={reasonId}>{t("reason")}</label>
                  <textarea aria-describedby={`${reasonId}-help`} className="mt-2 min-h-28 w-full rounded-sm border border-[#d9e1ef] p-3 text-sm focus-visible:outline-2 focus-visible:outline-[#2f6bff]" disabled={busy} id={reasonId} maxLength={500} required onChange={event => setReason(event.target.value)} value={reason} />
                  <p className="mt-1 text-xs text-[#626970]" id={`${reasonId}-help`}>{t("reasonHelp")}</p>
                </div> : null}
                {error ? <p className="mt-4 break-words text-sm text-red-800" role="alert">{error}</p> : null}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <Dialog.Close asChild><button className={`${BUTTON} border border-[#d9e1ef]`} disabled={busy} type="button">{tAdmin("cancel")}</button></Dialog.Close>
                  <button className={`${BUTTON} text-white ${action === "approve" ? "bg-emerald-700" : "bg-red-700"}`} disabled={busy || (action === "reject" && reason.trim().length < 3)} onClick={() => void decide()} type="button">{busy ? t("saving") : tAdmin(action === "approve" ? "confirmApprove" : "confirmReject")}</button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div> : null}
        {notice ? <p className="mt-4 rounded-sm bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p> : null}
      </section>
      <section className={CARD}>
        <h2 className="font-semibold">{t("documents")}</h2>
        <p className="mt-2 text-sm text-[#626970]">{t("privateDocuments")}</p>
        <h3 className="mb-3 mt-5 text-sm font-semibold">{t("requiredDocuments")}</h3>
        <ul>{documentCard("tax_compliance")}</ul>
        <h3 className="mb-3 mt-5 text-sm font-semibold">{t("optionalDocuments")}</h3>
        <ul className="grid min-w-0 gap-3 sm:grid-cols-2">{OPTIONAL_TYPES.map(documentCard)}</ul>
      </section>
    </div>
    <section className={`${CARD} self-start`}>
      <h2 className="font-semibold">{t("history")}</h2>
      {review.history.length ? <ol className="mt-4 grid gap-4">{review.history.map(item => {
        const actor = [item.changedBy.firstName, item.changedBy.lastName].filter(Boolean).join(" ") || item.changedBy.email || t("unknownActor");
        return <li className="min-w-0 border-l-2 border-[#e7eaee] pl-3 text-sm" key={item.historyId}>
          <h3 className="font-semibold">{t(`actions.${item.action ?? "status_changed"}`)}</h3>
          <p className="mt-1 text-[#626970]">{tStatus(item.oldStatus)} → {tStatus(item.newStatus)}</p>
          <p className="mt-1 break-all text-xs text-[#626970]">{t("actor", { actor })}</p>
          <time className="mt-1 block text-xs text-[#8b919a]" dateTime={new Date(item.changedAt).toISOString()}>{formatDate(item.changedAt)}</time>
          {item.rejectionReason ? <p className="mt-2 whitespace-pre-wrap break-words rounded-sm bg-red-50 p-2 text-red-800">{t("historyReason", { reason: item.rejectionReason })}</p> : null}
        </li>;
      })}</ol> : <p className="mt-3 text-sm text-[#8b919a]">{t("noHistory")}</p>}
    </section>
  </div>;
}
