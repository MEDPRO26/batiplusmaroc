"use client";

import { ApprovedCompanyLogo } from "@/features/companies/components/approved-company-logo";

import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, CalendarDays, Check, Clock3, ExternalLink, LockKeyhole, MapPin, MessageSquareText, RefreshCw, Star, WalletCards, X } from "lucide-react";
import { VerifiedBadge } from "@/features/companies/components/verified-badge";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Link } from "@/i18n/navigation";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { mapAppError } from "@/lib/errors";
import { routes } from "@/lib/routes";

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
    <section aria-labelledby="received-quotes-title" className="mt-8 scroll-mt-24" id="proposals">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="m-0 text-xl font-semibold tracking-[-0.025em] text-ink sm:text-2xl" id="received-quotes-title">{t("title")}</h2>
        <p className="m-0 text-sm text-muted">{t("count", { count: quotes.length })}</p>
      </div>
      {openError ? <p className="mt-4 rounded-xl border border-[#edc7c2] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2f28]" role="alert">{openError}</p> : null}
      {quotes.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-brand-border bg-white px-5 py-10 text-center">
          <h3 className="m-0 text-base font-semibold text-ink">{t("empty.title")}</h3>
          <p className="mx-auto mt-2 mb-0 max-w-[520px] text-sm leading-6 text-muted">{t("empty.description")}</p>
        </div>
      ) : (
        <ul className="mt-4 mb-0 list-none divide-y divide-brand-border overflow-hidden rounded-2xl border border-brand-border bg-white p-0">
          {quotes.map((quote) => <li key={quote.id}><ReceivedQuoteCard onOpen={() => void openQuote(quote)} quote={quote} /></li>)}
        </ul>
      )}
      {selectedId ? <QuoteReviewDialog key={selectedId} onClose={() => setSelectedId(null)} quoteId={selectedId} /> : null}
    </section>
  );
}

/** Real counters derived from the owner's received proposals, used as the project's "what next" summary. */
export function ProposalOverview({ projectId }: { projectId: Id<"projects"> }) {
  const t = useTranslations("receivedQuotes.overview");
  const quotes = useQuery(api.quotes.index.listReceivedInitialQuotes, { projectId });
  if (quotes === undefined) return <div aria-hidden className="h-40 animate-pulse rounded-2xl border border-brand-border bg-white" />;
  const count = (status: ReceivedQuote["status"]) => quotes.filter((quote) => quote.status === status).length;
  const stats = [
    { key: "received", value: quotes.length },
    { key: "new", value: count("submitted") },
    { key: "shortlisted", value: count("shortlisted") },
    { key: "discussions", value: count("discussion_open") },
  ] as const;
  return (
    <section aria-labelledby="proposal-overview-title" className="rounded-2xl border border-brand-border bg-white p-5">
      <h2 className="m-0 text-base font-semibold text-ink" id="proposal-overview-title">{t("title")}</h2>
      <dl className="mt-4 mb-0 grid grid-cols-2 gap-x-4 gap-y-4">
        {stats.map((stat) => <div className="flex flex-col-reverse" key={stat.key}><dt className="mt-0.5 text-xs text-muted">{t(stat.key)}</dt><dd className="m-0 text-xl font-semibold tracking-[-0.02em] text-ink tabular-nums">{stat.value}</dd></div>)}
      </dl>
      <p className="mt-4 mb-0 border-t border-brand-border pt-4 text-sm leading-6 text-muted">{quotes.length === 0 ? t("nextEmpty") : count("submitted") > 0 ? t("nextNew", { count: count("submitted") }) : t("nextReview")}</p>
      {quotes.length > 0 ? <a className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-sm bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand" href="#proposals">{t("review")}</a> : null}
    </section>
  );
}

export function ReceivedQuoteCard({ quote, onOpen }: { quote: ReceivedQuote; onOpen: () => void }) {
  const t = useTranslations("receivedQuotes");
  const format = useFormatter();
  const locale = useLocale();
  const inactive = quote.status === "declined" || quote.status === "withdrawn";
  return (
    <article className={`flex gap-3 px-4 py-5 sm:gap-4 sm:px-7 sm:py-6 ${inactive ? "bg-[#fbfcfc]" : ""}`}>
      <CompanyLogo alt={quote.company.name} url={quote.company.logoUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-col-reverse items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
          <CompanyIdentity company={quote.company} />
          <QuoteStatus status={quote.status} />
        </div>
        {quote.company.description ? <p className="mt-3 mb-0 line-clamp-2 text-sm leading-6 text-muted">{quote.company.description}</p> : null}
        <dl className="mt-4 mb-0 grid max-w-[620px] grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Metric label={t("price")} value={format.number(quote.estimatedPrice, { style: "currency", currency: "MAD", maximumFractionDigits: 0 })} />
          <Metric label={t("duration")} value={t("durationValue", { count: quote.estimatedDuration })} />
          <Metric label={t("availableStart")} value={formatStartDate(format, quote.availableStartDate)} />
        </dl>
        <p className="mt-4 mb-0 line-clamp-2 text-sm leading-6 break-words text-ink/85">{quote.message}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-xs text-muted">{t("submittedAt", { date: formatMarketplaceDateTime(quote.submittedAt, locale, { dateStyle: "medium" }) })}</p>
          <div className="flex flex-wrap items-center gap-2">
            {quote.company.slug ? <CompanyProfileLink slug={quote.company.slug} /> : null}
            <button className={`inline-flex min-h-11 items-center justify-center rounded-sm px-5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand ${inactive ? "border border-brand-border bg-white text-ink hover:bg-surface-muted" : "bg-brand text-white hover:bg-brand-hover"}`} onClick={onOpen} type="button">{t("openQuote")}</button>
          </div>
        </div>
      </div>
    </article>
  );
}

function QuoteReviewDialog({ quoteId, onClose }: { quoteId: Id<"projectQuotes">; onClose: () => void }) {
  const t = useTranslations("receivedQuotes");
  const tUx = useTranslations("ux");
  const quote = useQuery(api.quotes.index.getReceivedInitialQuote, { quoteId });
  const threads = useQuery(api.messages.index.listMyThreads);
  const review = useMutation(api.quotes.index.reviewInitialQuote);
  const recoverConversationMutation = useMutation(api.messages.index.recoverConversationForQuote);
  const [openedConversationId, setOpenedConversationId] = useState<Id<"conversations"> | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<"idle" | "pending" | "failed">("idle");
  const [pendingAction, setPendingAction] = useState<ReviewAction | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const automaticRecoveryQuoteRef = useRef<Id<"projectQuotes"> | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") trapFocus(event, dialogRef.current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [onClose]);

  const recoverConversation = useCallback(async () => {
    setRecoveryStatus("pending");
    setError(null);
    try {
      const result = await recoverConversationMutation({ quoteId });
      setOpenedConversationId(result.conversationId);
      setRecoveryStatus("idle");
    } catch {
      setRecoveryStatus("failed");
    }
  }, [quoteId, recoverConversationMutation]);

  const listedConversationId = threads?.find((thread) => thread.quoteId === quoteId)?.id ?? null;

  useEffect(() => {
    if (quote?.status !== "discussion_open" || threads === undefined || listedConversationId || openedConversationId || recoveryStatus !== "idle" || automaticRecoveryQuoteRef.current === quoteId) {
      return;
    }
    automaticRecoveryQuoteRef.current = quoteId;
    let cancelled = false;
    void recoverConversationMutation({ quoteId })
      .then((result) => {
        if (!cancelled) setOpenedConversationId(result.conversationId);
      })
      .catch(() => {
        if (!cancelled) setRecoveryStatus("failed");
      });
    return () => { cancelled = true; };
  }, [listedConversationId, openedConversationId, quote?.status, quoteId, recoverConversationMutation, recoveryStatus, threads]);

  async function runAction(action: ReviewAction) {
    setPendingAction(action);
    setError(null);
    setSuccess(null);
    try {
      const result = await review({ quoteId, action });
      setConfirmDecline(false);
      if (action === "open_discussion" && result.conversationId) {
        setOpenedConversationId(result.conversationId);
      } else {
        setSuccess(t(`success.${action}`));
      }
    } catch (cause) {
      setError(mapAppError(cause, (key) => tUx(key)));
    } finally {
      setPendingAction(null);
    }
  }

  const displayedQuote = quote && openedConversationId && quote.status !== "discussion_open"
    ? { ...quote, status: "discussion_open" as const }
    : quote;
  const locale = useLocale();

  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <button aria-label={t("close")} className="absolute inset-0 bg-ink/55" onClick={onClose} type="button" />
      <section aria-labelledby="quote-review-title" aria-modal="true" className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-[-18px_0_48px_rgb(23_61_99/0.18)] sm:w-[min(100%,680px)]" ref={dialogRef} role="dialog">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-brand-border bg-white px-5 py-4 sm:px-8">
          <div className="min-w-0">
            <p className="m-0 text-sm font-medium text-muted">{t("detail.eyebrow")}</p>
            <h2 className="mt-0.5 mb-0 truncate text-xl font-semibold tracking-[-0.02em] text-ink" id="quote-review-title">{quote?.company.name ?? t("detail.title")}</h2>
            {displayedQuote ? <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"><QuoteStatus status={displayedQuote.status} /><span className="text-xs text-muted">{t("submittedAt", { date: formatMarketplaceDateTime(displayedQuote.submittedAt, locale, { dateStyle: "medium" }) })}</span></div> : null}
          </div>
          <button ref={closeRef} aria-label={t("close")} className="grid size-11 shrink-0 place-items-center rounded-sm border border-brand-border text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" onClick={onClose} type="button"><X aria-hidden className="size-5" /></button>
        </header>
        {displayedQuote === undefined ? <QuoteDetailSkeleton label={t("loadingDetail")} /> : displayedQuote === null ? <p className="p-8 text-sm text-muted">{t("unavailable")}</p> : <QuoteReviewContent confirmDecline={confirmDecline} conversationId={openedConversationId ?? listedConversationId} conversationLookupPending={threads === undefined || (displayedQuote.status === "discussion_open" && !openedConversationId && !listedConversationId && recoveryStatus !== "failed")} conversationRecoveryPending={recoveryStatus === "pending"} error={error} onCancelDecline={() => setConfirmDecline(false)} onConfirmDecline={() => void runAction("decline")} onRecoverConversation={() => void recoverConversation()} onReview={(action) => action === "decline" ? setConfirmDecline(true) : void runAction(action)} pendingAction={pendingAction} quote={displayedQuote} success={success} />}
      </section>
    </div>
  );
}

/** Scrollable proposal body plus a footer that keeps the next action in reach. */
export function QuoteReviewContent({ quote, conversationId = null, conversationLookupPending = false, conversationRecoveryPending = false, onReview, onRecoverConversation, pendingAction, confirmDecline, onCancelDecline, onConfirmDecline, error, success }: { quote: ReceivedQuoteDetail; conversationId?: Id<"conversations"> | null; conversationLookupPending?: boolean; conversationRecoveryPending?: boolean; onReview: (action: ReviewAction) => void; onRecoverConversation?: () => void; pendingAction: ReviewAction | null; confirmDecline: boolean; onCancelDecline: () => void; onConfirmDecline: () => void; error: string | null; success: string | null }) {
  const t = useTranslations("receivedQuotes");
  const format = useFormatter();
  const canShortlist = quote.status === "submitted" || quote.status === "viewed";
  const canAct = canShortlist || quote.status === "shortlisted";
  const discussionOpen = quote.status === "discussion_open";
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <DrawerSection title={t("detail.companyTitle")}>
          <div className="flex items-start gap-3">
            <CompanyLogo alt={quote.company.name} url={quote.company.logoUrl} />
            <div className="min-w-0 flex-1"><CompanyIdentity company={quote.company} /></div>
          </div>
          {quote.company.description ? <p className="mt-4 mb-0 line-clamp-4 text-sm leading-6 text-ink/80">{quote.company.description}</p> : null}
          {quote.company.slug ? <div className="mt-2 -ml-2"><CompanyProfileLink slug={quote.company.slug} /></div> : null}
        </DrawerSection>
        <DrawerSection title={t("detail.proposalTitle")}>
          <dl className="m-0 grid gap-5 sm:grid-cols-3">
            <DetailMetric icon={<WalletCards />} label={t("price")} value={format.number(quote.estimatedPrice, { style: "currency", currency: "MAD", maximumFractionDigits: 0 })} />
            <DetailMetric icon={<Clock3 />} label={t("duration")} value={t("durationValue", { count: quote.estimatedDuration })} />
            <DetailMetric icon={<CalendarDays />} label={t("availableStart")} value={formatStartDate(format, quote.availableStartDate)} />
          </dl>
          <p className="mt-4 mb-0 text-xs leading-5 text-muted">{t("detail.estimateNote")}</p>
        </DrawerSection>
        <DrawerSection title={t("scope")}><p className="m-0 whitespace-pre-wrap break-words text-sm leading-7 text-ink/85">{quote.scope}</p></DrawerSection>
        <DrawerSection title={t("message")}><p className="m-0 whitespace-pre-wrap break-words text-sm leading-7 text-ink/85">{quote.message}</p></DrawerSection>
      </div>

      {canAct || discussionOpen || success || error || confirmDecline ? (
        <footer className="shrink-0 border-t border-brand-border bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8">
          {success ? <p aria-live="polite" className="mt-0 mb-3 flex items-center gap-2 text-sm font-semibold text-[#21633d]"><Check aria-hidden className="size-4 shrink-0" />{success}</p> : null}
          {error ? <p className="mt-0 mb-3 rounded-xl border border-[#edc7c2] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2f28]" role="alert">{error}</p> : null}
          {confirmDecline ? (
            <div aria-label={t("declineConfirm.title")} role="alertdialog">
              <h3 className="m-0 text-base font-semibold text-ink">{t("declineConfirm.title")}</h3>
              <p className="mt-1 mb-0 text-sm leading-6 text-muted">{t("declineConfirm.description")}</p>
              <div className="mt-4 flex flex-wrap gap-3"><button className="min-h-11 rounded-sm bg-[#9f3f35] px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={pendingAction !== null} onClick={onConfirmDecline} type="button">{pendingAction === "decline" ? t("actions.working") : t("declineConfirm.confirm")}</button><button className="min-h-11 rounded-sm border border-brand-border bg-white px-5 text-sm font-semibold text-ink" onClick={onCancelDecline} type="button">{t("declineConfirm.cancel")}</button></div>
            </div>
          ) : canAct ? (
            <>
              <p className="mt-0 mb-3 flex gap-2 text-xs leading-5 text-muted"><LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />{t("messagingNotice")}</p>
              <div className="flex flex-wrap items-center gap-3">
                <ActionButton disabled={pendingAction !== null} primary icon={<MessageSquareText aria-hidden className="size-4" />} label={t("actions.openDiscussion")} onClick={() => onReview("open_discussion")} pending={pendingAction === "open_discussion"} />
                {canShortlist ? <ActionButton disabled={pendingAction !== null} icon={<Star aria-hidden className="size-4" />} label={t("actions.shortlist")} onClick={() => onReview("shortlist")} pending={pendingAction === "shortlist"} /> : null}
                <button className="ml-auto inline-flex min-h-11 items-center rounded-sm px-3 text-sm font-semibold text-[#8a2f28] hover:bg-[#fff4f2] disabled:opacity-60" disabled={pendingAction !== null} onClick={() => onReview("decline")} type="button">{t("actions.decline")}</button>
              </div>
            </>
          ) : discussionOpen ? (
            <div aria-live="polite" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5"><span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-sm bg-[#e9f6ee] text-[#21633d]"><Check className="size-3.5" /></span><div><h3 className="m-0 text-sm font-semibold text-ink">{t("discussionOpenedTitle")}</h3><p className="mt-0.5 mb-0 text-sm leading-5 text-muted">{t("discussionOpenedNotice")}</p></div></div>
              {conversationId ? (
                <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-sm bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand" href={{ pathname: routes.messagesConversation, params: { conversationId } }}>
                  {t("continueInMessages")}<ArrowRight aria-hidden className="size-4" />
                </Link>
              ) : conversationLookupPending ? (
                <p className="m-0 text-sm text-muted" role="status">{t("conversationLoading")}</p>
              ) : (
                <div className="text-[#6e4b20]" role="alert">
                  <p className="m-0 text-sm font-semibold">{t("conversationUnavailableTitle")}</p>
                  <button className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-sm border border-[#bd8c52] bg-white px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-60" disabled={conversationRecoveryPending} onClick={onRecoverConversation} type="button"><RefreshCw aria-hidden className="size-4" />{conversationRecoveryPending ? t("actions.working") : t("retryConversation")}</button>
                </div>
              )}
            </div>
          ) : null}
        </footer>
      ) : null}
    </>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  const nodes = container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
  if (nodes.length === 0) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && (document.activeElement === first || !container?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function formatStartDate(format: ReturnType<typeof useFormatter>, isoDate: string) { return format.dateTime(new Date(`${isoDate}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }); }

function CompanyIdentity({ company }: { company: ReceivedQuote["company"] }) {
  const t = useTranslations("receivedQuotes");
  return (
    <div className="min-w-0">
      <h3 className="m-0 truncate text-base font-semibold text-ink">{company.name}</h3>
      <p className="mt-1 mb-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <VerifiedBadge isVerified={company.isVerified} label={t("verified")} />
        <span className="inline-flex items-center gap-1"><MapPin aria-hidden className="size-3.5" />{company.city ?? t("cityUnavailable")}</span>
      </p>
    </div>
  );
}

function CompanyProfileLink({ slug }: { slug: string }) {
  const t = useTranslations("receivedQuotes");
  return <Link className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-3 text-sm font-semibold text-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" href={{ pathname: "/entreprises/[slug]", params: { slug } }} target="_blank">{t("viewProfile")}<ExternalLink aria-hidden className="size-4" /><span className="sr-only">{t("opensInNewTab")}</span></Link>;
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-brand-border px-5 py-6 last:border-b-0 sm:px-8"><h3 className="mt-0 mb-4 text-sm font-semibold text-ink">{title}</h3>{children}</section>;
}

function CompanyLogo({ url, alt }: { url: string | null; alt: string }) { return <div className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-brand-border bg-brand-soft text-sm font-semibold text-brand"><ApprovedCompanyLogo alt={alt} className="object-cover" fill sizes="44px" url={url} /></div>; }
function QuoteStatus({ status }: { status: ReceivedQuote["status"] }) { const t = useTranslations("receivedQuotes.status"); const tone = status === "declined" ? "bg-[#fff1ef] text-[#8a2f28]" : status === "withdrawn" ? "bg-[#f0f2f3] text-muted" : status === "discussion_open" ? "bg-[#e9f6ee] text-[#21633d]" : status === "shortlisted" ? "bg-[#fff7df] text-[#72540a]" : "bg-brand-soft text-brand"; return <span className={`shrink-0 rounded-sm px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{t(status)}</span>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="flex min-w-0 flex-col-reverse"><dt className="mt-0.5 text-xs text-muted">{label}</dt><dd className="m-0 text-sm font-semibold text-ink">{value}</dd></div>; }
function DetailMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="flex gap-3"><span aria-hidden className="mt-0.5 text-muted [&>svg]:size-5">{icon}</span><div className="flex flex-col-reverse"><dt className="mt-0.5 text-xs text-muted">{label}</dt><dd className="m-0 text-sm font-semibold text-ink">{value}</dd></div></div>; }
function ActionButton({ label, icon, onClick, pending, disabled, primary = false }: { label: string; icon: React.ReactNode; onClick: () => void; pending: boolean; disabled: boolean; primary?: boolean }) { return <button className={`inline-flex min-h-11 items-center gap-2 rounded-sm px-5 text-sm font-semibold disabled:opacity-60 ${primary ? "bg-brand text-white" : "border border-brand-border bg-white text-ink"}`} disabled={disabled} onClick={onClick} type="button">{icon}{pending ? <span className="animate-pulse">…</span> : label}</button>; }
function ReceivedQuotesSkeleton({ label }: { label: string }) { return <section aria-busy="true" className="mt-8" role="status"><span className="sr-only">{label}</span><div className="h-7 w-48 animate-pulse rounded bg-[#dfe8ed]" /><div className="mt-4 divide-y divide-brand-border rounded-2xl border border-brand-border bg-white">{[0, 1].map((row) => <div className="flex animate-pulse gap-4 p-6" key={row}><div className="size-12 rounded-xl bg-[#e8eef2]" /><div className="flex-1 space-y-3"><div className="h-4 w-1/3 rounded bg-[#e8eef2]" /><div className="h-4 w-2/3 rounded bg-[#eef2f5]" /><div className="h-10 rounded bg-[#eef2f5]" /></div></div>)}</div></section>; }
function QuoteDetailSkeleton({ label }: { label: string }) { return <div aria-busy="true" className="animate-pulse p-8" role="status"><span className="sr-only">{label}</span><div className="h-8 w-32 rounded bg-[#dfe8ed]" /><div className="mt-6 h-24 rounded-xl bg-[#eef2f4]" /><div className="mt-6 h-44 rounded-xl bg-[#eef2f4]" /></div>; }
