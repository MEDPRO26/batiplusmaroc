"use client";

import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, CalendarDays, Check, Clock3, ExternalLink, LockKeyhole, MessageSquareText, Star, WalletCards, X } from "lucide-react";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Link } from "@/i18n/navigation";
import { mapAppError } from "@/lib/errors";

export type ReceivedQuote = FunctionReturnType<typeof api.quotes.index.listReceivedInitialQuotes>[number];
export type ReceivedQuoteDetail = NonNullable<FunctionReturnType<typeof api.quotes.index.getReceivedInitialQuote>>;
type ReviewAction = "shortlist" | "decline" | "open_discussion";

export function ClientReceivedQuotes({ projectId }: { projectId: Id<"projects"> }) {
  const t = useTranslations("receivedQuotes");
  const quotes = useQuery(api.quotes.index.listReceivedInitialQuotes, { projectId });
  const markViewed = useMutation(api.quotes.index.markInitialQuoteViewed);
  const [selectedId, setSelectedId] = useState<Id<"projectQuotes"> | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const tUx = useTranslations("ux");

  async function openQuote(quote: ReceivedQuote) {
    setSelectedId(quote.id);
    setOpenError(null);
    if (quote.status !== "submitted") return;
    try {
      await markViewed({ quoteId: quote.id });
    } catch (cause) {
      setOpenError(mapAppError(cause, (key) => tUx(key)));
    }
  }

  if (quotes === undefined) return <ReceivedQuotesSkeleton label={t("loading")} />;
  return (
    <section aria-labelledby="received-quotes-title" className="mt-8 rounded-3xl border border-brand-border bg-[#f6f8f9] p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold tracking-[0.12em] text-brand uppercase">{t("eyebrow")}</p>
          <h2 className="mt-2 mb-0 text-2xl font-semibold tracking-[-0.035em] text-ink sm:text-3xl" id="received-quotes-title">{t("title")}</h2>
        </div>
        <span className="rounded-full border border-brand-border bg-white px-3 py-1.5 text-sm font-semibold text-ink">{t("count", { count: quotes.length })}</span>
      </div>
      {openError ? <p className="mt-4 rounded-xl border border-[#edc7c2] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2f28]" role="alert">{openError}</p> : null}
      {quotes.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-brand-border bg-white px-5 py-10 text-center">
          <h3 className="m-0 text-lg font-semibold text-ink">{t("empty.title")}</h3>
          <p className="mx-auto mt-2 mb-0 max-w-[520px] text-sm leading-6 text-muted">{t("empty.description")}</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {quotes.map((quote) => <ReceivedQuoteCard key={quote.id} onOpen={() => void openQuote(quote)} quote={quote} />)}
        </div>
      )}
      {selectedId ? <QuoteReviewDialog onClose={() => setSelectedId(null)} quoteId={selectedId} /> : null}
    </section>
  );
}

export function ReceivedQuoteCard({ quote, onOpen }: { quote: ReceivedQuote; onOpen: () => void }) {
  const t = useTranslations("receivedQuotes");
  const format = useFormatter();
  const initials = quote.company.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  return (
    <article className="flex h-full flex-col rounded-2xl border border-brand-border bg-white p-5 shadow-[0_8px_28px_rgb(23_61_99/0.045)] sm:p-6">
      <div className="flex items-start gap-3">
        <CompanyLogo alt={quote.company.name} initials={initials} url={quote.company.logoUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="m-0 truncate text-base font-semibold text-ink">{quote.company.name}</h3>
            {quote.company.isVerified ? <span aria-label={t("verified")} title={t("verified")}><BadgeCheck aria-hidden className="size-4 text-brand" /></span> : null}
          </div>
          <p className="mt-1 mb-0 text-xs text-muted">{quote.company.city ?? t("cityUnavailable")}</p>
        </div>
        <QuoteStatus status={quote.status} />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <CardMetric label={t("price")} value={format.number(quote.estimatedPrice, { style: "currency", currency: "MAD", maximumFractionDigits: 0 })} />
        <CardMetric label={t("duration")} value={t("durationValue", { count: quote.estimatedDuration })} />
        <CardMetric label={t("availableStart")} value={format.dateTime(new Date(`${quote.availableStartDate}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })} />
      </dl>
      <p className="mt-4 mb-0 line-clamp-2 text-sm leading-6 text-ink/80">{quote.scope}</p>
      <p className="mt-2 mb-0 line-clamp-2 text-sm leading-6 text-muted">{quote.message}</p>
      <p className="mt-4 mb-0 text-xs text-muted">{t("submittedAt", { date: format.dateTime(quote.submittedAt, { dateStyle: "medium" }) })}</p>
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
        <button className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90" onClick={onOpen} type="button">{t("openQuote")}</button>
        {quote.company.slug ? <Link className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-brand hover:underline" href={{ pathname: "/entreprises/[slug]", params: { slug: quote.company.slug } }} target="_blank">{t("viewProfile")}<ExternalLink aria-hidden className="size-4" /></Link> : null}
      </div>
    </article>
  );
}

function QuoteReviewDialog({ quoteId, onClose }: { quoteId: Id<"projectQuotes">; onClose: () => void }) {
  const t = useTranslations("receivedQuotes");
  const tUx = useTranslations("ux");
  const quote = useQuery(api.quotes.index.getReceivedInitialQuote, { quoteId });
  const review = useMutation(api.quotes.index.reviewInitialQuote);
  const [pendingAction, setPendingAction] = useState<ReviewAction | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [onClose]);

  async function runAction(action: ReviewAction) {
    setPendingAction(action);
    setError(null);
    setSuccess(null);
    try {
      await review({ quoteId, action });
      setConfirmDecline(false);
      setSuccess(t(`success.${action}`));
    } catch (cause) {
      setError(mapAppError(cause, (key) => tUx(key)));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <button aria-label={t("close")} className="absolute inset-0 bg-ink/55" onClick={onClose} type="button" />
      <section aria-labelledby="quote-review-title" aria-modal="true" className="absolute inset-y-0 right-0 flex w-full flex-col overflow-y-auto bg-white shadow-[-18px_0_48px_rgb(23_61_99/0.18)] sm:w-[min(100%,760px)]" role="dialog">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-brand-border bg-white px-4 py-3 sm:px-7">
          <div><p className="m-0 text-xs font-semibold tracking-[0.1em] text-brand uppercase">{t("detail.eyebrow")}</p><h2 className="mt-1 mb-0 text-lg font-semibold text-ink" id="quote-review-title">{quote?.company.name ?? t("detail.title")}</h2></div>
          <button ref={closeRef} aria-label={t("close")} className="grid size-11 shrink-0 place-items-center rounded-full border border-brand-border text-ink hover:bg-surface-muted" onClick={onClose} type="button"><X aria-hidden className="size-5" /></button>
        </header>
        {quote === undefined ? <QuoteDetailSkeleton label={t("loadingDetail")} /> : quote === null ? <p className="p-7 text-sm text-muted">{t("unavailable")}</p> : <QuoteReviewContent confirmDecline={confirmDecline} error={error} onCancelDecline={() => setConfirmDecline(false)} onConfirmDecline={() => void runAction("decline")} onReview={(action) => action === "decline" ? setConfirmDecline(true) : void runAction(action)} pendingAction={pendingAction} quote={quote} success={success} />}
      </section>
    </div>
  );
}

export function QuoteReviewContent({ quote, onReview, pendingAction, confirmDecline, onCancelDecline, onConfirmDecline, error, success }: { quote: ReceivedQuoteDetail; onReview: (action: ReviewAction) => void; pendingAction: ReviewAction | null; confirmDecline: boolean; onCancelDecline: () => void; onConfirmDecline: () => void; error: string | null; success: string | null }) {
  const t = useTranslations("receivedQuotes");
  const format = useFormatter();
  const canShortlist = quote.status === "submitted" || quote.status === "viewed";
  const canAct = canShortlist || quote.status === "shortlisted";
  const startDate = new Date(`${quote.availableStartDate}T12:00:00Z`);
  return (
    <div className="p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><QuoteStatus status={quote.status} /><time className="text-xs text-muted">{t("submittedAt", { date: format.dateTime(quote.submittedAt, { dateStyle: "medium" }) })}</time></div>
      <section className="mt-6 rounded-2xl border border-brand-border bg-[#fbfcfc] p-5">
        <div className="flex items-start gap-3">
          <CompanyLogo alt={quote.company.name} initials={quote.company.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")} url={quote.company.logoUrl} />
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><h3 className="m-0 text-base font-semibold text-ink">{quote.company.name}</h3>{quote.company.isVerified ? <BadgeCheck aria-label={t("verified")} className="size-4 text-brand" /> : null}</div><p className="mt-1 mb-0 text-xs text-muted">{quote.company.city ?? t("cityUnavailable")}</p></div>
          {quote.company.slug ? <Link className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline" href={{ pathname: "/entreprises/[slug]", params: { slug: quote.company.slug } }} target="_blank">{t("viewProfile")}<ExternalLink aria-hidden className="size-4" /></Link> : null}
        </div>
        {quote.company.description ? <div className="mt-4 border-t border-brand-border pt-4"><h4 className="m-0 text-xs font-semibold tracking-[0.05em] text-muted uppercase">{t("detail.aboutCompany")}</h4><p className="mt-2 mb-0 line-clamp-3 text-sm leading-6 text-ink/80">{quote.company.description}</p></div> : null}
      </section>
      {success ? <p aria-live="polite" className="mt-5 rounded-xl border border-[#b9dac7] bg-[#eff8f2] px-4 py-3 text-sm font-semibold text-[#21633d]">{success}</p> : null}
      {error ? <p className="mt-5 rounded-xl border border-[#edc7c2] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2f28]" role="alert">{error}</p> : null}
      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <DetailMetric icon={<WalletCards aria-hidden className="size-5" />} label={t("price")} value={format.number(quote.estimatedPrice, { style: "currency", currency: "MAD", maximumFractionDigits: 2 })} />
        <DetailMetric icon={<Clock3 aria-hidden className="size-5" />} label={t("duration")} value={t("durationValue", { count: quote.estimatedDuration })} />
        <DetailMetric icon={<CalendarDays aria-hidden className="size-5" />} label={t("availableStart")} value={format.dateTime(startDate, { dateStyle: "medium", timeZone: "UTC" })} />
      </dl>
      <QuoteText label={t("scope")} value={quote.scope} />
      <QuoteText label={t("message")} value={quote.message} />
      <div className="mt-7 flex gap-3 rounded-xl border border-[#c9dbe8] bg-[#f1f7fb] p-4 text-sm leading-6 text-[#31546d]"><LockKeyhole aria-hidden className="mt-0.5 size-5 shrink-0" /><p className="m-0">{t("messagingNotice")}</p></div>
      {confirmDecline ? <div className="mt-6 rounded-2xl border border-[#edc7c2] bg-[#fff8f7] p-5" role="alertdialog" aria-label={t("declineConfirm.title")}><h3 className="m-0 text-base font-semibold text-ink">{t("declineConfirm.title")}</h3><p className="mt-2 mb-0 text-sm leading-6 text-muted">{t("declineConfirm.description")}</p><div className="mt-4 flex flex-wrap gap-3"><button className="min-h-11 rounded-full bg-[#9f3f35] px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={pendingAction !== null} onClick={onConfirmDecline} type="button">{pendingAction === "decline" ? t("actions.working") : t("declineConfirm.confirm")}</button><button className="min-h-11 rounded-full border border-brand-border bg-white px-5 text-sm font-semibold text-ink" onClick={onCancelDecline} type="button">{t("declineConfirm.cancel")}</button></div></div> : null}
      {canAct && !confirmDecline ? <div className="mt-7 flex flex-wrap gap-3 border-t border-brand-border pt-6">{canShortlist ? <ActionButton disabled={pendingAction !== null} icon={<Star aria-hidden className="size-4" />} label={t("actions.shortlist")} onClick={() => onReview("shortlist")} pending={pendingAction === "shortlist"} /> : null}<ActionButton disabled={pendingAction !== null} primary icon={<MessageSquareText aria-hidden className="size-4" />} label={t("actions.openDiscussion")} onClick={() => onReview("open_discussion")} pending={pendingAction === "open_discussion"} /><button className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-[#8a2f28] disabled:opacity-60" disabled={pendingAction !== null} onClick={() => onReview("decline")} type="button">{t("actions.decline")}</button></div> : null}
      {quote.status === "discussion_open" ? <p className="mt-7 flex items-start gap-2 rounded-xl bg-[#eff8f2] p-4 text-sm leading-6 text-[#21633d]"><Check aria-hidden className="mt-0.5 size-5 shrink-0" />{t("discussionOpenedNotice")}</p> : null}
    </div>
  );
}

function CompanyLogo({ url, alt, initials }: { url: string | null; alt: string; initials: string }) { return <div className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-brand-border bg-brand-soft text-sm font-semibold text-brand">{url ? <Image alt={alt} className="object-cover" fill sizes="44px" src={url} /> : initials}</div>; }
function QuoteStatus({ status }: { status: ReceivedQuote["status"] }) { const t = useTranslations("receivedQuotes.status"); const tone = status === "declined" ? "bg-[#fff1ef] text-[#8a2f28]" : status === "withdrawn" ? "bg-[#f0f2f3] text-muted" : status === "discussion_open" ? "bg-[#e9f6ee] text-[#21633d]" : status === "shortlisted" ? "bg-[#fff7df] text-[#72540a]" : "bg-brand-soft text-brand"; return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{t(status)}</span>; }
function CardMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-surface-muted p-3"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 font-semibold text-ink">{value}</dd></div>; }
function DetailMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-xl bg-surface-muted p-4"><div className="flex items-center gap-2 text-brand">{icon}<dt className="text-xs font-semibold uppercase">{label}</dt></div><dd className="mt-2 text-sm font-semibold text-ink">{value}</dd></div>; }
function QuoteText({ label, value }: { label: string; value: string }) { return <section className="mt-7 border-t border-brand-border pt-6"><h3 className="m-0 text-base font-semibold text-ink">{label}</h3><p className="mt-3 mb-0 whitespace-pre-wrap text-sm leading-7 text-ink/85">{value}</p></section>; }
function ActionButton({ label, icon, onClick, pending, disabled, primary = false }: { label: string; icon: React.ReactNode; onClick: () => void; pending: boolean; disabled: boolean; primary?: boolean }) { return <button className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-60 ${primary ? "bg-brand text-white" : "border border-brand-border bg-white text-ink"}`} disabled={disabled} onClick={onClick} type="button">{icon}{pending ? <span className="animate-pulse">…</span> : label}</button>; }
function ReceivedQuotesSkeleton({ label }: { label: string }) { return <section aria-busy="true" className="mt-8 rounded-3xl border border-brand-border bg-[#f6f8f9] p-6" role="status"><span className="sr-only">{label}</span><div className="h-7 w-48 animate-pulse rounded bg-[#dfe8ed]" /><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="h-64 animate-pulse rounded-2xl bg-white" /><div className="h-64 animate-pulse rounded-2xl bg-white" /></div></section>; }
function QuoteDetailSkeleton({ label }: { label: string }) { return <div aria-busy="true" className="animate-pulse p-8" role="status"><span className="sr-only">{label}</span><div className="h-8 w-32 rounded bg-[#dfe8ed]" /><div className="mt-6 h-24 rounded-xl bg-[#eef2f4]" /><div className="mt-6 h-44 rounded-xl bg-[#eef2f4]" /></div>; }
