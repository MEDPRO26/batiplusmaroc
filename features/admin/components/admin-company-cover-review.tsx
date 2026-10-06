"use client";

import { useAuthToken } from "@convex-dev/auth/react";
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { Component, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PrivateCompanyCoverPreview } from "@/features/companies/components/private-company-cover-preview";
import { getErrorCode, mapConvexFailure } from "@/lib/errors";
import { ADMIN_PRESS } from "./admin-shell";

export type CoverReview = FunctionReturnType<typeof api.companyCovers.index.getAdminReview>;
type Action = "approve" | "reject" | "hide";
const CARD = "min-w-0 rounded-[14px] border border-[#e7eaee] bg-white p-4 sm:p-5";
const BUTTON_BASE = `min-h-11 rounded-full border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${ADMIN_PRESS}`;
const BUTTON = `${BUTTON_BASE} border-[#d9e1ef] bg-white`;
const PRIMARY_BUTTON = `${BUTTON_BASE} border-transparent bg-[#2f6bff] text-white`;

export function coverReviewFingerprint(review: CoverReview) {
  return JSON.stringify([review.image, review.company, review.currentSubmissionId, review.approved, review.isCurrentSubmission, review.isCurrentApproved]);
}
export function validCoverReason(reason: string) { const length = reason.trim().replace(/\s+/g, " ").length; return length >= 3 && length <= 500; }

/** Route protection remains in place; this gate also prevents private subscriptions during sign-out/account changes. */
function AdminCoverAccess({ children }: { children: (token: string) => ReactNode }) {
  const token = useAuthToken();
  const user = useQuery(api.users.currentUser);
  const t = useTranslations("adminCompanyCovers");
  if (token && user === undefined) return <Loading />;
  if (!token || user?.accountType !== "admin" || !user._id) return null;
  return <CoverBoundary key={`${user._id}:${token}`} errorCopy={t("loadError")} retryCopy={t("retry")}>{children(token)}</CoverBoundary>;
}

class CoverBoundary extends Component<{ children: ReactNode; errorCopy: string; retryCopy: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { console.error("Company cover review could not load"); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className={CARD}><p role="alert">{this.props.errorCopy}</p><button className={`${BUTTON} mt-3`} onClick={() => this.setState({ failed: false })} type="button">{this.props.retryCopy}</button></section>;
  }
}

export function AdminPendingCoverQueue() {
  return <AdminCoverAccess>{token => <PendingQueue sessionToken={token} />}</AdminCoverAccess>;
}

function PendingQueue({ sessionToken }: { sessionToken: string }) {
  const t = useTranslations("adminCompanyCovers");
  const locale = useLocale();
  const { results, status, loadMore } = usePaginatedQuery(api.companyCovers.index.listAdminCovers, { status: "pending" }, { initialNumItems: 20 });
  const [selected, setSelected] = useState<Id<"companyCoverImages"> | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  return <section className={`${CARD} mb-5`} aria-label={t("queueTitle")}>
    <h2 className="font-semibold" ref={heading} tabIndex={-1}>{t("queueTitle")}</h2>
    <p className="mt-2 text-sm leading-6 text-[#626970]">{t("queueLead")}</p>
    {status === "LoadingFirstPage" ? <Loading /> : results.length === 0 ? <p className="mt-4 text-sm text-[#626970]">{t("emptyQueue")}</p> :
      <ul className="mt-4 grid list-none gap-3 p-0">{results.map(row => <li className="flex min-w-0 flex-col gap-3 rounded-xl bg-[#f8fafb] p-3 sm:flex-row sm:items-center sm:justify-between" key={row.imageId}>
        <div className="min-w-0"><h3 className="break-words text-sm font-semibold">{row.companyName || t("companyFallback")}</h3>
          <p className="mt-1 text-xs text-[#626970]">{date(row.uploadedAt, locale)} · {t(row.isCurrentSubmission ? "status.pending" : "superseded")}</p></div>
        <button className={`${BUTTON} shrink-0`} aria-label={t("reviewCompany", { company: row.companyName || t("companyFallback") })} onClick={event => { trigger.current = event.currentTarget; setSelected(row.imageId); }} type="button">{t("review")}</button>
      </li>)}</ul>}
    <More status={status} onClick={() => loadMore(20)} />
    <Dialog.Root open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
      <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-[#101828]/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[16px] bg-[#f7f9fc] p-4 outline-none sm:p-6"
          onCloseAutoFocus={event => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus(); else heading.current?.focus(); }}>
          <div className="mb-4 flex items-center justify-between gap-3"><Dialog.Title className="text-lg font-semibold">{t("reviewTitle")}</Dialog.Title><Dialog.Close className={BUTTON}>{t("close")}</Dialog.Close></div>
          <Dialog.Description className="mb-4 text-sm text-[#626970]">{t("separateApproval")}</Dialog.Description>
          {selected ? <ReviewSelection key={selected} imageId={selected} onChoose={setSelected} sessionToken={sessionToken} /> : null}
        </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </section>;
}

export function AdminCompanyCoverSection({ submittedImageId, approvedImageId }: {
  submittedImageId: Id<"companyCoverImages"> | null; approvedImageId: Id<"companyCoverImages"> | null;
}) {
  return <AdminCoverAccess>{token => <CompanyCoverSection submittedImageId={submittedImageId} approvedImageId={approvedImageId} sessionToken={token} />}</AdminCoverAccess>;
}
function CompanyCoverSection({ submittedImageId, approvedImageId, sessionToken }: {
  submittedImageId: Id<"companyCoverImages"> | null; approvedImageId: Id<"companyCoverImages"> | null; sessionToken: string;
}) {
  const t = useTranslations("adminCompanyCovers");
  // A new submission never silently becomes the selected/reviewed file.
  const [selected, setSelected] = useState(submittedImageId ?? approvedImageId);
  return <div className="mt-5 grid min-w-0 gap-4">
    <div className={CARD}><h2 className="font-semibold">{t("reviewTitle")}</h2><p className="mt-2 text-sm text-[#626970]">{t("separateApproval")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {submittedImageId ? <button className={BUTTON} onClick={() => setSelected(submittedImageId)} type="button">{t("latest")}</button> : null}
        {approvedImageId && approvedImageId !== submittedImageId ? <button className={BUTTON} onClick={() => setSelected(approvedImageId)} type="button">{t("currentApproved")}</button> : null}
      </div>
    </div>
    {selected ? <ReviewSelection key={selected} imageId={selected} onChoose={setSelected} sessionToken={sessionToken} /> : <p className={CARD}>{t("noCover")}</p>}
  </div>;
}

function ReviewSelection({ imageId, onChoose, sessionToken }: { imageId: Id<"companyCoverImages">; onChoose: (id: Id<"companyCoverImages">) => void; sessionToken: string }) {
  const review = useQuery(api.companyCovers.index.getAdminReview, { imageId });
  if (review === undefined) return <Loading />;
  return <ReviewSession review={review} onChoose={onChoose} sessionToken={sessionToken} />;
}

function ReviewSession({ review, onChoose, sessionToken }: { review: CoverReview; onChoose: (id: Id<"companyCoverImages">) => void; sessionToken: string }) {
  const t = useTranslations("adminCompanyCovers"); const tUx = useTranslations("ux"); const locale = useLocale();
  const convex = useConvex();
  const approve = useMutation(api.companyCovers.index.approve); const reject = useMutation(api.companyCovers.index.reject); const hide = useMutation(api.companyCovers.index.hide);
  const fingerprint = coverReviewFingerprint(review);
  const [baseline, setBaseline] = useState(fingerprint);
  const [observed, setObserved] = useState(fingerprint);
  const [serverStale, setServerStale] = useState(false);
  const [readyIdentity, setReadyIdentity] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [confirmation, setConfirmation] = useState<{ action: Action; imageId: Id<"companyCoverImages">; expectedSha256: string; fingerprint: string } | null>(null);
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [reloading, setReloading] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const inFlight = useRef(false); const mounted = useRef(true); const trigger = useRef<HTMLButtonElement | null>(null); const reasonId = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const previewIdentity = `${fingerprint}:${previewVersion}`;
  const previewReady = readyIdentity === previewIdentity;
  const onReady = useCallback((ready: boolean) => setReadyIdentity(previous => ready ? previewIdentity : previous === previewIdentity ? null : previous), [previewIdentity]);
  // Match portfolio review: once changed, an older DTO cannot reopen a cancelled decision.
  if (observed !== fingerprint) {
    setObserved(fingerprint); setServerStale(true); setConfirmation(null); setReadyIdentity(null);
  }
  const fresh = baseline === fingerprint && !serverStale;
  const pending = review.isCurrentSubmission && review.image.moderationStatus === "pending";
  const approved = review.isCurrentApproved && review.image.moderationStatus === "approved";
  const open = confirmation !== null && fresh && confirmation.fingerprint === fingerprint;
  function begin(action: Action, button: HTMLButtonElement) {
    if (!fresh || inFlight.current || (action === "approve" && (!pending || !previewReady)) || (action === "reject" && !pending) || (action === "hide" && !approved)) return;
    trigger.current = button; setReason(""); setError("");
    setConfirmation({ action, imageId: review.image.imageId, expectedSha256: review.image.sha256, fingerprint });
  }
  async function reload() {
    if (inFlight.current || reloading) return;
    setReloading(true); setConfirmation(null); setReason(""); setReadyIdentity(null); setError("");
    try {
      const refreshed = await convex.query(api.companyCovers.index.getAdminReview, { imageId: review.image.imageId });
      if (!mounted.current) return;
      setBaseline(coverReviewFingerprint(refreshed)); setObserved(coverReviewFingerprint(refreshed)); setServerStale(false); setPreviewVersion(value => value + 1);
    } catch (caught) { if (mounted.current) setError(mapConvexFailure(caught, tUx).message); }
    finally { if (mounted.current) setReloading(false); }
  }
  async function decide() {
    const target = confirmation;
    if (!target || !fresh || target.fingerprint !== fingerprint || inFlight.current ||
      (target.action === "approve" && (!pending || !previewReady)) || (target.action === "reject" && !pending) ||
      (target.action === "hide" && !approved) || (target.action !== "approve" && !validCoverReason(reason))) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const args = { imageId: target.imageId, expectedSha256: target.expectedSha256 };
      if (target.action === "approve") await approve(args);
      else if (target.action === "reject") await reject({ ...args, reason: reason.trim().replace(/\s+/g, " ") });
      else await hide({ ...args, reason: reason.trim().replace(/\s+/g, " ") });
      if (mounted.current) { setConfirmation(null); setNotice(t(`success.${target.action}`)); }
    } catch (caught) {
      if (!mounted.current) return;
      if (getErrorCode(caught) === "COMPANY_COVER_REVIEW_STALE") { setServerStale(true); setConfirmation(null); setReadyIdentity(null); }
      else setError(mapConvexFailure(caught, tUx).message);
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const companyName = review.company.name || review.company.legalName || t("companyFallback");
  return <div className="grid min-w-0 gap-4" data-admin-cover-review>
    <section className={CARD}><h2 className="break-words text-lg font-semibold">{companyName}</h2>
      {review.company.legalName ? <p className="mt-1 break-words text-sm text-[#626970]">{review.company.legalName}</p> : null}
      <p className="mt-2 text-sm">{t(`status.${review.image.moderationStatus}`)} · {t("uploaded", { date: date(review.image.uploadedAt, locale) })}</p>
      {review.image.reason ? <p className="mt-2 break-words text-sm text-red-800">{t("reasonValue", { reason: review.image.reason })}</p> : null}
      {!fresh ? <div className="mt-4 rounded-xl bg-amber-50 p-3"><p className="text-sm text-amber-950" role="alert">{t("stale")}</p><button className={`${BUTTON} mt-3`} disabled={busy || reloading} onClick={() => void reload()} type="button">{reloading ? t("loading") : t("reviewAgain")}</button></div> : null}
      {!review.isCurrentSubmission && !review.isCurrentApproved ? <p className="mt-3 text-sm text-[#626970]">{t("superseded")}</p> : null}
      {review.currentSubmissionId && review.currentSubmissionId !== review.image.imageId ? <button className={`${BUTTON} mt-3`} disabled={busy} onClick={() => onChoose(review.currentSubmissionId!)} type="button">{t("latest")}</button> : null}
    </section>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
      <section className={CARD}><h3 className="font-semibold">{t("selectedImage")}</h3><div className="mt-4">
        {fresh && !reloading ? <PrivateCompanyCoverPreview key={previewVersion} imageId={review.image.imageId} sessionToken={sessionToken} alt={t("previewAlt")} large onReady={onReady} /> : <p className="text-sm text-[#626970]">{t("reviewAgain")}</p>}
      </div></section>
      <section className={CARD}><h3 className="font-semibold">{t("checklistTitle")}</h3><p className="mt-2 text-sm text-[#626970]">{t("checklistLead")}</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">{(["branding", "contact", "links", "qr", "watermark"] as const).map(key => <li key={key}>{t(`checklist.${key}`)}</li>)}</ul>
        <p className="mt-4 text-xs leading-5 text-[#626970]">{t("replacement")}</p>
      </section>
    </div>
    {review.approved && review.approved.imageId !== review.image.imageId ? <section className={CARD}><h3 className="font-semibold">{t("currentApproved")}</h3>
      {fresh ? <PrivateCompanyCoverPreview imageId={review.approved.imageId} sessionToken={sessionToken} alt={t("approvedAlt")} /> : null}
      <button className={`${BUTTON} mt-3`} disabled={busy} onClick={() => onChoose(review.approved!.imageId)} type="button">{t("reviewApproved")}</button>
    </section> : !review.approved ? <p className={CARD}>{t("noApproved")}</p> : null}
    <section className={CARD}><h3 className="font-semibold">{t("decision")}</h3><p className="mt-2 text-sm text-[#626970]">{t("approvalRequiresPreview")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={`${BUTTON} border-emerald-200 text-emerald-800`} disabled={!fresh || !pending || !previewReady || busy || reloading} onClick={event => begin("approve", event.currentTarget)} type="button">{t("approve")}</button>
        <button className={`${BUTTON} border-red-200 text-red-700`} disabled={!fresh || !pending || busy || reloading} onClick={event => begin("reject", event.currentTarget)} type="button">{t("reject")}</button>
        <button className={`${BUTTON} border-red-200 text-red-700`} disabled={!fresh || !approved || busy || reloading} onClick={event => begin("hide", event.currentTarget)} type="button">{t("hide")}</button>
      </div>
      {notice ? <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p> : null}
      {error && !open ? <p className="mt-3 text-sm text-red-800" role="alert">{error}</p> : null}
    </section>
    <CoverHistory key={review.image.imageId} imageId={review.image.imageId} />
    <Dialog.Root open={open} onOpenChange={value => { if (!value && !busy) setConfirmation(null); }}>
      <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[60] bg-[#101828]/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[16px] bg-white p-5 outline-none sm:p-6"
          onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}
          onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
          <Dialog.Title className="text-lg font-semibold">{t(`confirm.${confirmation?.action ?? "approve"}`)}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-[#626970]">{t(confirmation?.action === "hide" ? "hideLead" : "confirmLead", { company: companyName })}</Dialog.Description>
          {confirmation?.action !== "approve" ? <div className="mt-4"><label className="block text-sm font-semibold" htmlFor={reasonId}>{t("reason")}</label>
            <textarea className="mt-2 min-h-28 w-full rounded-xl border border-[#d9e1ef] p-3 text-sm" aria-describedby={`${reasonId}-help`} disabled={busy} id={reasonId} maxLength={500} onChange={event => setReason(event.target.value)} value={reason} />
            <p className="mt-1 text-xs text-[#626970]" id={`${reasonId}-help`}>{t("reasonHelp")}</p></div> : null}
          {error ? <p className="mt-3 text-sm text-red-800" role="alert">{error}</p> : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2"><Dialog.Close asChild><button className={BUTTON} disabled={busy} type="button">{t("cancel")}</button></Dialog.Close>
            <button className={PRIMARY_BUTTON} disabled={busy || !fresh || (confirmation?.action === "approve" ? !previewReady : !validCoverReason(reason))} onClick={() => void decide()} type="button">{busy ? t("saving") : t(`confirm.${confirmation?.action ?? "approve"}`)}</button></div>
        </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </div>;
}

function CoverHistory({ imageId }: { imageId: Id<"companyCoverImages"> }) {
  const t = useTranslations("adminCompanyCovers"); const locale = useLocale();
  const { results, status, loadMore } = usePaginatedQuery(api.companyCovers.index.getHistory, { imageId }, { initialNumItems: 10 });
  return <section className={CARD}><h3 className="font-semibold">{t("history")}</h3>
    {status === "LoadingFirstPage" ? <Loading /> : results.length === 0 ? <p className="mt-3 text-sm text-[#626970]">{t("emptyHistory")}</p> : <ol className="mt-4 grid list-none gap-3 p-0">{results.map(row => <li className="min-w-0 border-l-2 border-[#e7eaee] pl-3 text-sm" key={row.historyId}>
      <p className="font-semibold">{t(`historyActions.${row.action}`)}</p><time className="text-xs text-[#626970]" dateTime={new Date(row.changedAt).toISOString()}>{date(row.changedAt, locale)}</time>
      <p className="mt-1">{row.oldStatus ? `${t(`status.${row.oldStatus}`)} → ` : ""}{t(`status.${row.newStatus}`)}</p>
      {row.reason ? <p className="mt-2 break-words text-red-800">{t("reasonValue", { reason: row.reason })}</p> : null}
    </li>)}</ol>}<More status={status} onClick={() => loadMore(10)} />
  </section>;
}
function Loading() { const t = useTranslations("adminCompanyCovers"); return <div aria-busy="true" className={`${CARD} mt-3`} role="status"><span className="sr-only">{t("loading")}</span><div className="h-24 animate-pulse rounded-xl bg-[#f4f6f8]" /></div>; }
function More({ status, onClick }: { status: string; onClick: () => void }) { const t = useTranslations("adminCompanyCovers"); return status === "CanLoadMore" || status === "LoadingMore" ? <button className={`${BUTTON} mt-4 w-full`} disabled={status === "LoadingMore"} onClick={onClick} type="button">{t(status === "LoadingMore" ? "loading" : "loadMore")}</button> : null; }
function date(value: number, locale: string) { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Casablanca" }).format(value); }
