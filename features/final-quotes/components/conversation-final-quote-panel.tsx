"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { mapAppError } from "@/lib/errors/map-app-error";

type ConversationFinalQuoteResult = FunctionReturnType<
  typeof api.finalQuotes.index.getForConversation
>;
type Quote = NonNullable<ConversationFinalQuoteResult["finalQuote"]>;
type Revision = Quote["revisions"][number];

export function ConversationFinalQuotePanel({ conversationId }: { conversationId: Id<"conversations"> }) {
  const t = useTranslations("finalQuote");
  const tUx = useTranslations("ux");
  const format = useFormatter();
  const data = useQuery(api.finalQuotes.index.getForConversation, { conversationId });
  const requestQuote = useMutation(api.finalQuotes.index.request);
  const prepareAfterVisit = useMutation(api.finalQuotes.index.prepareAfterSiteVisit);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function request() {
    setBusy(true); setError("");
    try { await requestQuote({ conversationId }); setNotice(t("successRequested")); }
    catch (cause) { setError(mapAppError(cause, (key) => tUx(key))); }
    finally { setBusy(false); }
  }

  async function prepare() {
    setBusy(true); setError("");
    try { await prepareAfterVisit({ conversationId }); setOpen(true); }
    catch (cause) { setError(mapAppError(cause, (key) => tUx(key))); }
    finally { setBusy(false); }
  }

  if (data === undefined) return <section aria-busy="true" className="border-b border-brand-border bg-[#f7f9fb] px-4 py-3" role="status"><span className="sr-only">{t("loading")}</span><div className="mx-auto h-20 max-w-3xl animate-pulse rounded-2xl bg-white" /></section>;
  const quote = data.finalQuote;
  const latest = quote?.revisions.at(-1) ?? null;
  const canCompanyAct =
    data.viewerType === "company" && ((quote?.canSubmit ?? false) || data.canPrepare);
  const canClientRequest = data.viewerType === "client" && !quote && data.canRequest;
  const canClientReview = data.viewerType === "client" && quote?.status === "submitted";
  const primaryLabel = canClientRequest
    ? t("request")
    : data.viewerType === "company" && !quote && data.canPrepare
      ? t("prepare")
      : data.viewerType === "company" && quote?.status === "draft" && quote.canSubmit
        ? t("prepare")
        : data.viewerType === "company" && quote?.status === "changes_requested" && quote.canSubmit
          ? t("revise")
          : canClientReview
            ? t("review")
            : null;
  const secondaryLabel = quote ? (quote.status === "submitted" ? t("review") : t("view")) : null;
  const busyLabel =
    data.viewerType === "company" || Boolean(quote) ? t("preparing") : t("requesting");
  const lead = !quote
    ? t("requestLead")
    : quote.status === "accepted"
      ? t("acceptedLead")
      : quote.status === "declined"
        ? t("declinedLead")
        : quote.status === "withdrawn"
          ? t("withdrawnLead")
          : quote.status === "changes_requested"
            ? t("changesLead")
            : quote.status === "submitted" && latest
              ? `${t("revision", { number: latest.revisionNumber })} · ${format.number(latest.price, { style: "currency", currency: "MAD", maximumFractionDigits: 0 })}`
              : quote.status === "draft"
                ? t("requestedLead")
                : latest
                  ? `${t("revision", { number: latest.revisionNumber })} · ${format.number(latest.price, { style: "currency", currency: "MAD", maximumFractionDigits: 0 })}`
                  : t("requestedLead");

  return <section className="border-b border-brand-border bg-[#f7f9fb] px-4 py-3 sm:px-7" aria-labelledby="final-quote-heading">
    <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-brand-border bg-white p-4 shadow-[0_1px_2px_rgb(23_61_99/0.04)] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="m-0 text-[11px] font-bold tracking-[0.12em] text-brand uppercase">{t("eyebrow")}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-base font-semibold text-ink" id="final-quote-heading">
            {t("title")}
          </h3>
          {quote ? (
            <span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-semibold text-brand-dark">
              {t(`status.${quote.status}` as "status.submitted")}
            </span>
          ) : null}
        </div>
        <p className="mt-1 mb-0 break-words text-sm text-muted">{lead}</p>
        {quote?.changesRequestReason ? <p className="mt-2 mb-0 text-sm text-[#9a6700]">{t("changesRequested", { reason: quote.changesRequestReason })}</p> : null}
        {notice ? <p className="mt-2 mb-0 text-sm text-emerald-700" aria-live="polite">{notice}</p> : null}
        {error ? <p className="mt-2 mb-0 text-sm text-[#8a2f28]" role="alert">{error}</p> : null}
      </div>
      {primaryLabel && (canClientRequest || canClientReview || canCompanyAct) ? (
        <button
          className="min-h-11 shrink-0 rounded-full bg-brand px-5 text-sm font-semibold text-white disabled:opacity-55"
          disabled={busy}
          onClick={() => {
            if (!quote) void (data.viewerType === "client" ? request() : prepare());
            else setOpen(true);
          }}
          type="button"
        >
          {busy ? busyLabel : primaryLabel}
        </button>
      ) : secondaryLabel ? (
        <button
          className="min-h-11 shrink-0 rounded-full border border-brand-border px-5 text-sm font-semibold text-brand"
          onClick={() => setOpen(true)}
          type="button"
        >
          {secondaryLabel}
        </button>
      ) : null}
    </div>
    {open && quote ? <FinalQuoteSheet conversationId={conversationId} onClose={() => setOpen(false)} quote={quote} viewerType={data.viewerType} /> : null}
  </section>;
}

function FinalQuoteSheet({
  conversationId,
  onClose,
  quote,
  viewerType,
}: {
  conversationId: Id<"conversations">;
  onClose: () => void;
  quote: Quote;
  viewerType: ConversationFinalQuoteResult["viewerType"];
}) {
  const t = useTranslations("finalQuote");
  const tUx = useTranslations("ux");
  const format = useFormatter();
  const submitRevision = useMutation(api.finalQuotes.index.submitRevision);
  const review = useMutation(api.finalQuotes.index.review);
  const withdraw = useMutation(api.finalQuotes.index.withdraw);
  const generateUpload = useMutation(api.finalQuotes.index.generatePdfUploadUrl);
  const latest = quote.revisions.at(-1) ?? null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"details" | "changes" | "decline">("details");
  const [reason, setReason] = useState("");
  const [confirmAccept, setConfirmAccept] = useState(false);
  useEffect(() => {
    if (confirmAccept) return;
    closeRef.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [confirmAccept, onClose]);
  async function act(action: "accept" | "request_changes" | "decline") {
    if (!latest) return;
    setBusy(true);
    setError("");
    try {
      await review({
        finalQuoteId: quote.id,
        revisionId: latest.id,
        action,
        reason: reason.trim() || undefined,
      });
      setConfirmAccept(false);
      if (action !== "request_changes") onClose();
      else setMode("details");
    } catch (cause) {
      setError(mapAppError(cause, (key) => tUx(key)));
      setConfirmAccept(false);
    } finally {
      setBusy(false);
    }
  }
  async function withdrawQuote() {
    setBusy(true);
    setError("");
    try {
      await withdraw({ finalQuoteId: quote.id });
      onClose();
    } catch (cause) {
      setError(mapAppError(cause, (key) => tUx(key)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-100 flex justify-end bg-black/45" role="presentation">
      <button aria-label={t("close")} className="absolute inset-0" onClick={onClose} type="button" />
      <aside
        aria-labelledby="final-quote-sheet-title"
        aria-modal="true"
        className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-[-12px_0_40px_rgb(16_24_40/0.18)]"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-3 border-b border-brand-border px-5 py-4 sm:px-7">
          <div>
            <p className="m-0 text-xs font-bold tracking-[0.12em] text-brand uppercase">{t("eyebrow")}</p>
            <h2 className="mt-1 mb-0 text-xl font-semibold text-ink" id="final-quote-sheet-title">
              {t("title")}
            </h2>
          </div>
          <button
            aria-label={t("close")}
            className="grid size-11 place-items-center rounded-full border border-brand-border text-xl"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="min-w-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {error ? (
            <p className="mb-4 rounded-xl bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2f28]" role="alert">
              {error}
            </p>
          ) : null}
          {viewerType === "company" && quote.canSubmit ? (
            <CompanyQuoteForm
              conversationId={conversationId}
              finalQuoteId={quote.id}
              generateUpload={generateUpload}
              latest={latest}
              onError={setError}
              onSubmitted={onClose}
              submitRevision={submitRevision}
            />
          ) : latest ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="m-0 text-sm font-semibold text-brand">
                    {t("revision", { number: latest.revisionNumber })}
                  </p>
                  <p className="mt-1 mb-0 text-xs text-muted">
                    {format.dateTime(latest.submittedAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <p className="m-0 text-2xl font-semibold tracking-[-0.03em] text-ink">
                  {format.number(latest.price, {
                    style: "currency",
                    currency: "MAD",
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>
              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field label={t("duration")} value={String(latest.duration)} />
                <Field label={t("plannedStartDate")} value={latest.plannedStartDate} />
                <Field label={t("validUntil")} value={latest.validUntil} />
              </dl>
              <div className="mt-6 grid gap-5">
                <TextField label={t("scope")} value={latest.scope} />
                <TextField label={t("inclusions")} value={latest.inclusions} />
                <TextField label={t("exclusions")} value={latest.exclusions} />
                <TextField label={t("paymentTerms")} value={latest.paymentTerms} />
                {latest.companyNote ? (
                  <TextField label={t("companyNote")} value={latest.companyNote} />
                ) : null}
                {latest.hasPdf ? <PdfLink revisionId={latest.id} /> : null}
              </div>
              {quote.revisions.length > 1 ? (
                <details className="mt-6 rounded-xl border border-brand-border p-4">
                  <summary className="cursor-pointer font-semibold text-ink">
                    {t("history", { count: quote.revisions.length })}
                  </summary>
                  <ol className="mt-4 grid gap-3 pl-5">
                    {[...quote.revisions].reverse().map((revision) => (
                      <li className="text-sm text-ink" key={revision.id}>
                        {t("revision", { number: revision.revisionNumber })} ·{" "}
                        {format.number(revision.price, {
                          style: "currency",
                          currency: "MAD",
                          maximumFractionDigits: 0,
                        })}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
              {viewerType === "client" && quote.canReview ? (
                mode === "details" ? (
                  <div className="mt-7 grid gap-2 sm:grid-cols-3">
                    <button
                      className="min-h-12 rounded-full bg-brand px-4 text-sm font-semibold text-white"
                      disabled={busy}
                      onClick={() => setConfirmAccept(true)}
                      type="button"
                    >
                      {t("accept")}
                    </button>
                    <button
                      className="min-h-12 rounded-full border border-brand-border px-4 text-sm font-semibold text-brand"
                      onClick={() => setMode("changes")}
                      type="button"
                    >
                      {t("requestChanges")}
                    </button>
                    <button
                      className="min-h-12 rounded-full px-4 text-sm font-semibold text-[#8a2f28]"
                      onClick={() => setMode("decline")}
                      type="button"
                    >
                      {t("decline")}
                    </button>
                  </div>
                ) : (
                  <div className="mt-7 rounded-2xl bg-surface-muted p-4">
                    <label className="text-sm font-semibold text-ink" htmlFor="final-quote-reason">
                      {t("reason")}
                    </label>
                    <textarea
                      className="mt-2 min-h-28 w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-sm"
                      id="final-quote-reason"
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={t("reasonPlaceholder")}
                      required={mode === "changes"}
                      value={reason}
                    />
                    <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        className="min-h-11 px-4 text-sm font-semibold text-muted"
                        onClick={() => setMode("details")}
                        type="button"
                      >
                        {t("close")}
                      </button>
                      <button
                        className="min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={busy || (mode === "changes" && reason.trim().length < 3)}
                        onClick={() => void act(mode === "changes" ? "request_changes" : "decline")}
                        type="button"
                      >
                        {mode === "changes" ? t("sendChanges") : t("confirmDecline")}
                      </button>
                    </div>
                  </div>
                )
              ) : null}
              {viewerType === "company" && quote.canWithdraw ? (
                <button
                  className="mt-7 min-h-11 text-sm font-semibold text-[#8a2f28]"
                  disabled={busy}
                  onClick={() => void withdrawQuote()}
                  type="button"
                >
                  {t("withdraw")}
                </button>
              ) : null}
            </>
          ) : (
            <p className="mt-1 mb-0 text-sm text-muted">
              {quote.status === "draft"
                ? t("requestedLead")
                : quote.status === "changes_requested"
                  ? t("changesLead")
                  : t(`status.${quote.status}` as "status.accepted")}
            </p>
          )}
        </div>
      </aside>
      {confirmAccept ? (
        <AcceptFinalQuoteDialog
          busy={busy}
          onCancel={() => setConfirmAccept(false)}
          onConfirm={() => void act("accept")}
        />
      ) : null}
    </div>
  );
}

function AcceptFinalQuoteDialog({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("finalQuote");
  const titleId = "final-quote-accept-title";
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/50 p-4">
      <button aria-label={t("acceptConfirmCancel")} className="absolute inset-0" onClick={onCancel} type="button" />
      <div
        aria-describedby="final-quote-accept-description"
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-[20px] bg-white p-5 shadow-[0_24px_48px_rgba(16,24,40,0.18)] sm:p-6"
        role="dialog"
      >
        <h2 className="m-0 text-lg font-semibold tracking-[-0.02em] text-ink" id={titleId}>
          {t("acceptConfirmTitle")}
        </h2>
        <p className="mt-3 mb-0 text-sm leading-6 text-muted" id="final-quote-accept-description">
          {t("acceptConfirm")}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-muted transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-55"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            {t("acceptConfirmCancel")}
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white transition-[transform,background-color] duration-150 hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.96] disabled:opacity-55"
            disabled={busy}
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            {t("acceptConfirmAction")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompanyQuoteForm({
  conversationId,
  finalQuoteId,
  generateUpload,
  latest,
  onError,
  onSubmitted,
  submitRevision,
}: {
  conversationId: Id<"conversations">;
  finalQuoteId: Id<"finalQuotes">;
  generateUpload: (args: { finalQuoteId: Id<"finalQuotes"> }) => Promise<{
    uploadUrl: string;
    uploadToken: string;
  }>;
  latest: Revision | null;
  onError: (value: string) => void;
  onSubmitted: () => void;
  submitRevision: (args: {
    conversationId: Id<"conversations">;
    price: number;
    duration: number;
    plannedStartDate: string;
    validUntil: string;
    scope: string;
    inclusions: string;
    exclusions: string;
    paymentTerms: string;
    companyNote?: string;
    pdf?: { storageId: Id<"_storage">; uploadToken: string; fileName: string };
  }) => Promise<unknown>;
}) {
  const t = useTranslations("finalQuote"); const tUx = useTranslations("ux"); const [busy, setBusy] = useState(false); const [file, setFile] = useState<File | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (busy) return; setBusy(true); onError(""); const data = new FormData(event.currentTarget);
    try { let pdf: { storageId: Id<"_storage">; uploadToken: string; fileName: string } | undefined;
      if (file) { if (file.type !== "application/pdf" || file.size < 1 || file.size > 15 * 1024 * 1024) throw new Error("INVALID_FINAL_QUOTE_PDF"); const intent = await generateUpload({ finalQuoteId }); const response = await fetch(intent.uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file }); if (!response.ok) throw new Error("INVALID_FINAL_QUOTE_PDF"); const uploaded = await response.json() as { storageId: Id<"_storage"> }; pdf = { storageId: uploaded.storageId, uploadToken: intent.uploadToken, fileName: file.name }; }
      await submitRevision({ conversationId, price: Number(data.get("price")), duration: Number(data.get("duration")), plannedStartDate: String(data.get("plannedStartDate")), validUntil: String(data.get("validUntil")), scope: String(data.get("scope")), inclusions: String(data.get("inclusions")), exclusions: String(data.get("exclusions")), paymentTerms: String(data.get("paymentTerms")), companyNote: String(data.get("companyNote") || "") || undefined, pdf }); onSubmitted();
    } catch (cause) { onError(mapAppError(cause, (key) => tUx(key))); } finally { setBusy(false); } }
  return <form className="grid gap-4" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><Input defaultValue={latest?.price} label={t("price")} min="1" name="price" required type="number" /><Input defaultValue={latest?.duration} label={t("duration")} min="1" name="duration" required type="number" /><Input defaultValue={latest?.plannedStartDate} label={t("plannedStartDate")} name="plannedStartDate" required type="date" /><Input defaultValue={latest?.validUntil} label={t("validUntil")} name="validUntil" required type="date" /></div><Area defaultValue={latest?.scope} label={t("scope")} name="scope" /><Area defaultValue={latest?.inclusions} label={t("inclusions")} name="inclusions" /><Area defaultValue={latest?.exclusions} label={t("exclusions")} name="exclusions" /><Area defaultValue={latest?.paymentTerms} label={t("paymentTerms")} name="paymentTerms" /><Area defaultValue={latest?.companyNote ?? ""} label={t("companyNote")} name="companyNote" required={false} /><label className="grid gap-1.5 text-sm font-semibold text-ink">{t("pdf")}<input accept="application/pdf" className="min-h-11 rounded-xl border border-brand-border px-3 py-2 font-normal" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" /></label><button className="mt-2 min-h-12 rounded-full bg-brand px-5 text-sm font-semibold text-white disabled:opacity-55" disabled={busy} type="submit">{busy ? t("submitting") : latest ? t("submitRevision") : t("submit")}</button></form>;
}

function PdfLink({ revisionId }: { revisionId: Id<"finalQuoteRevisions"> }) {
  const t = useTranslations("finalQuote");
  const getUrl = useQuery(api.finalQuotes.index.getPdfDownloadUrl, { revisionId });
  return getUrl ? (
    <a
      className="inline-flex min-h-11 items-center font-semibold text-brand underline"
      href={getUrl}
      rel="noreferrer"
      target="_blank"
    >
      {t("downloadPdf")}
    </a>
  ) : null;
}
function Field({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold tracking-[0.05em] text-muted uppercase">{label}</dt><dd className="mt-1 text-sm font-semibold text-ink">{value}</dd></div>; }
function TextField({ label, value }: { label: string; value: string }) { return <section><h3 className="m-0 text-sm font-semibold text-ink">{label}</h3><p className="mt-1 mb-0 whitespace-pre-wrap break-words text-sm leading-6 text-ink/80">{value}</p></section>; }
function Input({ defaultValue, label, ...props }: { defaultValue?: string | number; label: string } & React.InputHTMLAttributes<HTMLInputElement>) { return <label className="grid gap-1.5 text-sm font-semibold text-ink">{label}<input className="min-h-11 rounded-xl border border-brand-border px-3 font-normal" defaultValue={defaultValue} {...props} /></label>; }
function Area({ defaultValue, label, name, required = true }: { defaultValue?: string; label: string; name: string; required?: boolean }) { return <label className="grid gap-1.5 text-sm font-semibold text-ink">{label}<textarea className="min-h-24 rounded-xl border border-brand-border px-3 py-2 font-normal" defaultValue={defaultValue} name={name} required={required} /></label>; }
