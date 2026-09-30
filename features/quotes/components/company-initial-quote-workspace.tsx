"use client";

import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, CalendarClock, CalendarDays, Check, Clock3, FolderOpen, LockKeyhole, MapPin, RefreshCw, WalletCards } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Link, useRouter } from "@/i18n/navigation";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { mapAppError } from "@/lib/errors";
import { parseMadInput } from "@/lib/money/mad";
import { routes } from "@/lib/routes";
import { resolveCompanyProjectsRedirect } from "@/features/projects/components/company-project-marketplace";

type Quote = NonNullable<FunctionReturnType<typeof api.quotes.index.getMyQuote>>;

export function CompanyInitialQuoteWorkspace({ projectId }: { projectId: string }) {
  const t = useTranslations("initialQuote");
  const user = useQuery(api.users.currentUser);
  const router = useRouter();
  const [submittedNow, setSubmittedNow] = useState(false);
  const canUseWorkspace = user?.accountType === "company" && user.onboardingStatus === "completed";
  const context = useQuery(
    api.quotes.index.getSubmissionContext,
    canUseWorkspace ? { projectId } : "skip",
  );
  const quote = useQuery(
    api.quotes.index.getMyQuote,
    context?.latestQuoteId ? { quoteId: context.latestQuoteId } : "skip",
  );

  useEffect(() => {
    const destination = resolveCompanyProjectsRedirect(user);
    if (destination) router.replace(destination);
  }, [router, user]);

  if (!canUseWorkspace || context === undefined || (context?.latestQuoteId && quote === undefined)) {
    return <QuoteWorkspaceSkeleton label={t("loading")} />;
  }
  if (context === null) return <UnavailableQuoteWorkspace projectId={projectId} />;

  return (
    <main className="min-h-[calc(100dvh-4.5rem)] bg-[#f7f9fb]">
      <div className="mx-auto w-[calc(100%-32px)] max-w-[1080px] py-6 sm:w-[calc(100%-48px)] sm:py-8">
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          href={{ pathname: routes.companyProject, params: { projectId } }}
        >
          <ArrowLeft aria-hidden className="size-4" />{t("backToProject")}
        </Link>
        <header className="mt-3">
          <h1 className="m-0 text-[1.6rem] leading-tight font-semibold tracking-[-0.035em] text-ink sm:text-[2rem]">{quote ? t("detail.title") : t("title")}</h1>
          <p className="mt-2 mb-0 max-w-[680px] text-sm leading-6 text-muted">{t("lead")}</p>
        </header>
        {submittedNow ? <p aria-live="polite" className="mt-6 flex items-center gap-2 rounded-xl border border-[#b9dac7] bg-[#eff8f2] px-4 py-3 text-sm font-semibold text-[#21633d]"><Check aria-hidden className="size-4 shrink-0" />{t("success")}</p> : null}

        <div className="mt-6 space-y-6">
          <ProjectSummary project={context.project} />
          {quote ? (
            <QuoteDetail quote={quote} />
          ) : !context.marketplaceWriteAllowed ? (
            <MarketplaceSuspended />
          ) : context.verificationStatus !== "verified" ? (
            <VerificationRequired />
          ) : (
            <InitialQuoteForm
              onSubmitted={() => {
                setSubmittedNow(true);
                router.replace({ pathname: routes.companyInitialQuote, params: { projectId } });
              }}
              projectId={context.project.id}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function InitialQuoteForm({ projectId, onSubmitted }: { projectId: Id<"projects">; onSubmitted: () => void }) {
  const t = useTranslations("initialQuote");
  const tUx = useTranslations("ux");
  const submitQuote = useMutation(api.quotes.index.submitInitialQuote);
  const [message, setMessage] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [availableStartDate, setAvailableStartDate] = useState("");
  const [scope, setScope] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const price = parseMadInput(estimatedPrice);
    const duration = Number(estimatedDuration);
    if (!message || !estimatedPrice || !estimatedDuration || !availableStartDate || !scope) {
      setError(t("validation.required"));
      return;
    }
    if (message.trim().length < 20) return setError(t("validation.message"));
    if (price === null) return setError(t("validation.price"));
    if (!Number.isInteger(duration) || duration <= 0) return setError(t("validation.duration"));
    if (scope.trim().length < 20) return setError(t("validation.scope"));

    setSubmitting(true);
    try {
      await submitQuote({
        projectId,
        message,
        estimatedPrice: price,
        estimatedDuration: duration,
        availableStartDate,
        scope,
      });
      onSubmitted();
    } catch (cause) {
      setError(mapAppError(cause, (key) => tUx(key)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-6" noValidate onSubmit={onSubmit}>
      <Card title={t("form.estimateSection")} lead={t("form.estimateLead")}>
        <div className="divide-y divide-brand-border">
          <TermRow hint={t("form.estimatedPriceHint")} htmlFor="quote-price" label={t("form.estimatedPrice")}>
            <SuffixInput id="quote-price" inputMode="decimal" onChange={setEstimatedPrice} placeholder="300000" suffix={t("form.currency")} type="text" value={estimatedPrice} />
          </TermRow>
          <TermRow hint={t("form.estimatedDurationHint")} htmlFor="quote-duration" label={t("form.estimatedDuration")}>
            <SuffixInput id="quote-duration" inputMode="numeric" min="1" onChange={setEstimatedDuration} step="1" suffix={t("form.durationUnit")} type="number" value={estimatedDuration} />
          </TermRow>
          <TermRow hint={t("form.availableStartDateHint")} htmlFor="quote-date" label={t("form.availableStartDate")}>
            <input className={inputClass} id="quote-date" onChange={(event) => setAvailableStartDate(event.target.value)} required type="date" value={availableStartDate} />
          </TermRow>
        </div>
      </Card>

      <Card title={t("form.detailsSection")}>
        <div className="space-y-6">
          <Field counter={message.length} label={t("form.message")} hint={t("form.messageHint")} htmlFor="quote-message">
            <textarea className={textAreaClass} id="quote-message" maxLength={TEXT_LIMIT} onChange={(event) => setMessage(event.target.value)} required rows={7} value={message} />
          </Field>
          <Field counter={scope.length} label={t("form.scope")} hint={t("form.scopeHint")} htmlFor="quote-scope">
            <textarea className={textAreaClass} id="quote-scope" maxLength={TEXT_LIMIT} onChange={(event) => setScope(event.target.value)} required rows={6} value={scope} />
          </Field>
        </div>
      </Card>

      {error ? <p className="m-0 rounded-xl border border-[#edc7c2] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2f28]" role="alert">{error}</p> : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <button className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-7 text-sm font-semibold text-white transition-[transform,background-color] duration-150 hover:bg-brand-hover active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60 sm:w-auto" disabled={submitting} type="submit">
          {submitting ? t("form.submitting") : t("form.submit")}
        </button>
        <Link className="inline-flex min-h-12 items-center justify-center rounded-full px-5 text-sm font-semibold text-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" href={{ pathname: routes.companyProject, params: { projectId } }}>{t("form.cancel")}</Link>
      </div>
    </form>
  );
}

function QuoteDetail({ quote }: { quote: Quote }) {
  const t = useTranslations("initialQuote");
  const tUx = useTranslations("ux");
  const format = useFormatter();
  const locale = useLocale();
  const withdraw = useMutation(api.quotes.index.withdrawInitialQuote);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onWithdraw() {
    setWithdrawing(true);
    setError(null);
    try {
      await withdraw({ quoteId: quote.id });
    } catch (cause) {
      setError(mapAppError(cause, (key) => tUx(key)));
    } finally {
      setWithdrawing(false);
    }
  }

  const startDate = new Date(`${quote.availableStartDate}T12:00:00Z`);
  return (
    <article className="overflow-hidden rounded-2xl border border-brand-border bg-white">
      <div className="border-b border-brand-border px-5 py-5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${quote.status === "withdrawn" ? "bg-[#f1f2f3] text-muted" : "bg-[#e9f6ee] text-[#21633d]"}`}>{t(`detail.${quote.status}`)}</span>
          <time className="text-xs text-muted" dateTime={new Date(quote.submittedAt).toISOString()}>{t("detail.submittedAt", { date: formatMarketplaceDateTime(quote.submittedAt, locale, { dateStyle: "medium" }) })}</time>
        </div>
      </div>
      <div className="p-5 sm:p-8">
        {quote.status === "withdrawn" ? <p className="mb-6 rounded-xl border border-brand-border bg-[#f5f7f8] px-4 py-3 text-sm text-muted">{t("detail.withdrawnNotice")}</p> : null}
        {error ? <p className="mb-6 rounded-xl border border-[#edc7c2] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2f28]" role="alert">{error}</p> : null}
        <dl className="m-0 grid gap-5 sm:grid-cols-3">
          <MetaItem icon={<WalletCards />} label={t("detail.estimatedPrice")} value={format.number(quote.estimatedPrice, { style: "currency", currency: "MAD", maximumFractionDigits: 0 })} />
          <MetaItem icon={<Clock3 />} label={t("detail.estimatedDuration")} value={t("detail.durationValue", { count: quote.estimatedDuration })} />
          <MetaItem icon={<CalendarDays />} label={t("detail.availability")} value={format.dateTime(startDate, { dateStyle: "medium", timeZone: "UTC" })} />
        </dl>
        <QuoteText label={t("detail.scope")} value={quote.scope} />
        <QuoteText label={t("detail.message")} value={quote.message} />
        {quote.status === "discussion_open" ? <CompanyConversationContinuation quoteId={quote.id} /> : <div className="mt-7 flex gap-3 rounded-xl border border-[#c9dbe8] bg-[#f1f7fb] p-4 text-sm leading-6 text-[#31546d]"><LockKeyhole aria-hidden className="mt-0.5 size-5 shrink-0" /><p className="m-0">{t("detail.messagingLocked")}</p></div>}
        {quote.status === "submitted" ? <button className="mt-7 inline-flex min-h-11 items-center rounded-full border border-[#c86458] px-5 text-sm font-semibold text-[#8a2f28] transition-colors hover:bg-[#fff4f2] disabled:opacity-60" disabled={withdrawing} onClick={onWithdraw} type="button">{withdrawing ? t("detail.withdrawing") : t("detail.withdraw")}</button> : null}
      </div>
    </article>
  );
}

function CompanyConversationContinuation({ quoteId }: { quoteId: Id<"projectQuotes"> }) {
  const threads = useQuery(api.messages.index.listMyThreads);
  const recoverConversationMutation = useMutation(api.messages.index.recoverConversationForQuote);
  const [recoveredConversationId, setRecoveredConversationId] = useState<Id<"conversations"> | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<"idle" | "pending" | "failed">("idle");
  const automaticRecoveryQuoteRef = useRef<Id<"projectQuotes"> | null>(null);
  const conversation = threads?.find((thread) => thread.quoteId === quoteId);

  const recoverConversation = useCallback(async () => {
    setRecoveryStatus("pending");
    try {
      const result = await recoverConversationMutation({ quoteId });
      setRecoveredConversationId(result.conversationId);
      setRecoveryStatus("idle");
    } catch {
      setRecoveryStatus("failed");
    }
  }, [quoteId, recoverConversationMutation]);

  useEffect(() => {
    if (threads === undefined || conversation || recoveredConversationId || recoveryStatus !== "idle" || automaticRecoveryQuoteRef.current === quoteId) {
      return;
    }
    automaticRecoveryQuoteRef.current = quoteId;
    let cancelled = false;
    void recoverConversationMutation({ quoteId })
      .then((result) => {
        if (!cancelled) setRecoveredConversationId(result.conversationId);
      })
      .catch(() => {
        if (!cancelled) setRecoveryStatus("failed");
      });
    return () => { cancelled = true; };
  }, [conversation, quoteId, recoveredConversationId, recoverConversationMutation, recoveryStatus, threads]);

  return <CompanyConversationPanel conversationId={recoveredConversationId ?? conversation?.id ?? null} lookupPending={threads === undefined || (!conversation && !recoveredConversationId && recoveryStatus !== "failed")} onRetry={() => void recoverConversation()} recoveryPending={recoveryStatus === "pending"} />;
}

export function CompanyConversationPanel({ conversationId, lookupPending, onRetry, recoveryPending }: { conversationId: Id<"conversations"> | null; lookupPending: boolean; onRetry: () => void; recoveryPending: boolean }) {
  const t = useTranslations("initialQuote");
  return (
    <section aria-live="polite" className="mt-7 rounded-2xl border border-[#b9dac7] bg-[#eff8f2] p-5 sm:p-6">
      <div className="flex items-start gap-3 text-[#21633d]"><Check aria-hidden className="mt-0.5 size-5 shrink-0" /><div><h2 className="m-0 text-base font-semibold">{t("detail.discussionOpenedTitle")}</h2><p className="mt-1 mb-0 text-sm leading-6">{t("detail.discussionPending")}</p></div></div>
      {conversationId ? (
        <Link className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgb(5_79_132/0.18)] transition-[transform,opacity] duration-150 hover:opacity-95 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:w-auto" href={{ pathname: routes.messagesConversation, params: { conversationId } }}>
          {t("detail.continueInMessages")}<ArrowRight aria-hidden className="size-4" />
        </Link>
      ) : lookupPending ? (
        <p className="mt-4 mb-0 text-sm text-[#31546d]" role="status">{t("detail.conversationLoading")}</p>
      ) : (
        <div className="mt-4 rounded-xl border border-[#e5c9a8] bg-[#fffaf2] p-4 text-[#6e4b20]" role="alert">
          <p className="m-0 text-sm font-semibold">{t("detail.conversationUnavailableTitle")}</p>
          <p className="mt-1 mb-0 text-sm leading-6">{t("detail.conversationUnavailableLead")}</p>
          <button className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#bd8c52] bg-white px-4 text-sm font-semibold transition-transform duration-150 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8b612f] disabled:cursor-wait disabled:opacity-60" disabled={recoveryPending} onClick={onRetry} type="button"><RefreshCw aria-hidden className="size-4" />{recoveryPending ? t("detail.conversationLoading") : t("detail.retryConversation")}</button>
        </div>
      )}
    </section>
  );
}

function ProjectSummary({ project }: { project: NonNullable<FunctionReturnType<typeof api.quotes.index.getSubmissionContext>>["project"] }) {
  const t = useTranslations("initialQuote");
  const tProject = useTranslations("companyProjects.detail");
  const tWizard = useTranslations("projectWizard");
  return (
    <Card title={t("projectSummary")}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_240px] md:gap-8">
        <div className="min-w-0">
          <p className="m-0 text-lg leading-7 font-semibold tracking-[-0.02em] break-words text-ink">{project.title}</p>
          <p className="mt-3 mb-0"><span className="inline-flex items-center gap-1.5 rounded-md bg-brand-soft px-2.5 py-1 text-[0.8rem] font-semibold text-brand-dark"><FolderOpen aria-hidden className="size-3.5" />{tWizard(`categoryOptions.${project.primaryCategory}`)}</span></p>
          <Link className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" href={{ pathname: routes.companyProject, params: { projectId: project.id } }}>{t("viewProject")}</Link>
        </div>
        <dl className="m-0 space-y-4 border-brand-border md:border-l md:pl-8">
          <MetaItem icon={<MapPin />} label={tProject("city")} value={tWizard(`cityOptions.${project.city}`)} />
          <MetaItem icon={<CalendarClock />} label={tProject("timeline")} value={tWizard(`timelineOptions.${project.timeline}`)} />
        </dl>
      </div>
    </Card>
  );
}

function VerificationRequired() {
  const t = useTranslations("initialQuote");
  return <section className="rounded-2xl border border-brand-border bg-white p-6 sm:p-8"><h2 className="m-0 text-xl font-semibold text-ink">{t("verificationTitle")}</h2><p className="mt-3 mb-0 text-sm leading-6 text-muted">{t("verificationLead")}</p><Link className="mt-6 inline-flex min-h-12 items-center rounded-full bg-brand px-6 text-sm font-semibold text-white" href={routes.companyVerification}>{t("verifyAction")}</Link></section>;
}

function MarketplaceSuspended() {
  const t = useTranslations("initialQuote");
  return <section className="rounded-2xl border border-brand-border bg-white p-6 sm:p-8"><h2 className="m-0 text-xl font-semibold text-ink">{t("suspendedTitle")}</h2><p className="mt-3 mb-0 text-sm leading-6 text-muted">{t("suspendedLead")}</p></section>;
}

function UnavailableQuoteWorkspace({ projectId }: { projectId: string }) {
  const t = useTranslations("initialQuote");
  return <main className="mx-auto flex min-h-[65vh] w-[calc(100%-36px)] max-w-[680px] items-center justify-center py-12 text-center"><div><h1 className="m-0 text-2xl font-semibold text-ink">{t("unavailableTitle")}</h1><p className="mt-3 mb-0 text-sm leading-6 text-muted">{t("unavailableLead")}</p><Link className="mt-6 inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white" href={{ pathname: routes.companyProject, params: { projectId } }}>{t("backToProject")}</Link></div></main>;
}

function QuoteWorkspaceSkeleton({ label }: { label: string }) {
  return <main aria-busy="true" className="min-h-[calc(100dvh-4.5rem)] bg-[#f7f9fb]" role="status"><span className="sr-only">{label}</span><div className="mx-auto w-[calc(100%-32px)] max-w-[1080px] animate-pulse py-8 sm:w-[calc(100%-48px)]"><div className="h-4 w-32 rounded bg-[#dfe8ed]" /><div className="mt-6 h-9 w-2/3 max-w-[420px] rounded bg-[#dfe8ed]" /><div className="mt-8 space-y-6"><div className="h-44 rounded-2xl border border-brand-border bg-white" /><div className="h-72 rounded-2xl border border-brand-border bg-white" /><div className="h-80 rounded-2xl border border-brand-border bg-white" /></div></div></main>;
}

function Card({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-brand-border bg-white px-5 py-6 sm:px-8 sm:py-7">
      <h2 className="m-0 text-xl font-semibold tracking-[-0.025em] text-ink">{title}</h2>
      {lead ? <p className="mt-2 mb-0 text-sm leading-6 text-muted">{lead}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** A label/hint on the left and a compact input on the right, stacked on mobile. */
function TermRow({ label, hint, htmlFor, children }: { label: string; hint: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 py-5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_260px] sm:items-center sm:gap-8">
      <div><label className="block text-sm font-semibold text-ink" htmlFor={htmlFor}>{label}</label><p className="mt-1 mb-0 text-sm leading-5 text-muted" id={`${htmlFor}-hint`}>{hint}</p></div>
      {children}
    </div>
  );
}

function SuffixInput({ id, suffix, value, onChange, ...props }: { id: string; suffix: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange">) {
  return (
    <div className="relative">
      <input {...props} aria-describedby={`${id}-hint`} autoComplete="off" className={`${inputClass} pr-16 text-right tabular-nums`} id={id} onChange={(event) => onChange(event.target.value)} required value={value} />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-semibold text-muted">{suffix}</span>
    </div>
  );
}

function Field({ label, hint, htmlFor, counter, children }: { label: string; hint?: string; htmlFor: string; counter?: number; children: React.ReactNode }) {
  const t = useTranslations("initialQuote");
  return (
    <div>
      <label className="block text-sm font-semibold text-ink" htmlFor={htmlFor}>{label}</label>
      {hint ? <p className="mt-1 mb-2 text-sm leading-5 text-muted">{hint}</p> : <div className="h-2" />}
      {children}
      {counter !== undefined ? <p aria-live="polite" className="mt-1.5 mb-0 text-right text-xs text-muted tabular-nums">{t("form.characterCount", { count: counter, max: TEXT_LIMIT })}</p> : null}
    </div>
  );
}

function QuoteText({ label, value }: { label: string; value: string }) {
  return <section className="mt-7 border-t border-brand-border pt-6"><h2 className="m-0 text-base font-semibold text-ink">{label}</h2><p className="mt-3 mb-0 whitespace-pre-wrap text-sm leading-7 text-ink/85">{value}</p></section>;
}

function MetaItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex gap-3"><span aria-hidden className="mt-0.5 text-muted [&>svg]:size-5">{icon}</span><div className="flex flex-col-reverse"><dt className="mt-0.5 text-xs text-muted">{label}</dt><dd className="m-0 text-sm font-semibold text-ink">{value}</dd></div></div>;
}

const TEXT_LIMIT = 2000;
const fieldClass = "min-h-12 w-full border border-brand-border bg-white px-4 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]";
const inputClass = `${fieldClass} rounded-xl`;
const textAreaClass = `${fieldClass} min-h-36 resize-y rounded-[14px] py-3 leading-6`;
