"use client";

import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { CalendarDays, Clock3, LockKeyhole, WalletCards } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Link, useRouter } from "@/i18n/navigation";
import { mapAppError } from "@/lib/errors";
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
    <main className="min-h-[calc(100dvh-4.5rem)] bg-[#f4f7f8]">
      <div className="mx-auto w-[calc(100%-36px)] max-w-[1120px] py-7 sm:w-[calc(100%-48px)] sm:py-10">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          href={{ pathname: routes.companyProject, params: { projectId } }}
        >
          ← {t("backToProject")}
        </Link>
        <header className="mt-4 max-w-[760px]">
          <p className="m-0 text-xs font-semibold tracking-[0.12em] text-brand uppercase">{t("eyebrow")}</p>
          <h1 className="mt-2 mb-0 text-[1.9rem] leading-tight font-semibold tracking-[-0.045em] text-ink sm:text-[2.5rem]">{quote ? t("detail.title") : t("title")}</h1>
          <p className="mt-3 mb-0 max-w-[680px] text-sm leading-6 text-muted sm:text-base">{t("lead")}</p>
        </header>
        {submittedNow ? <p aria-live="polite" className="mt-6 rounded-xl border border-[#b9dac7] bg-[#eff8f2] px-4 py-3 text-sm font-semibold text-[#21633d]">{t("success")}</p> : null}

        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          {quote ? (
            <QuoteDetail quote={quote} />
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
          <ProjectSummary project={context.project} />
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
    const price = Number(estimatedPrice);
    const duration = Number(estimatedDuration);
    if (!message || !estimatedPrice || !estimatedDuration || !availableStartDate || !scope) {
      setError(t("validation.required"));
      return;
    }
    if (message.trim().length < 20) return setError(t("validation.message"));
    if (!Number.isFinite(price) || price <= 0) return setError(t("validation.price"));
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
    <section className="rounded-2xl border border-brand-border bg-white p-5 shadow-[0_12px_36px_rgb(21_52_75/0.06)] sm:p-8">
      {error ? <p className="mb-5 rounded-xl border border-[#edc7c2] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2f28]" role="alert">{error}</p> : null}
      <form className="space-y-6" noValidate onSubmit={onSubmit}>
        <Field label={t("form.message")} hint={t("form.messageHint")} htmlFor="quote-message">
          <textarea className={textAreaClass} id="quote-message" maxLength={2000} onChange={(event) => setMessage(event.target.value)} required rows={6} value={message} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("form.estimatedPrice")} htmlFor="quote-price">
            <div className="relative">
              <input className={`${inputClass} pr-16`} id="quote-price" inputMode="decimal" min="1" onChange={(event) => setEstimatedPrice(event.target.value)} required step="0.01" type="number" value={estimatedPrice} />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-semibold text-muted">{t("form.currency")}</span>
            </div>
          </Field>
          <Field label={t("form.estimatedDuration")} htmlFor="quote-duration">
            <div className="relative">
              <input className={`${inputClass} pr-16`} id="quote-duration" inputMode="numeric" min="1" onChange={(event) => setEstimatedDuration(event.target.value)} required step="1" type="number" value={estimatedDuration} />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-semibold text-muted">{t("form.durationUnit")}</span>
            </div>
          </Field>
        </div>

        <Field label={t("form.availableStartDate")} htmlFor="quote-date">
          <input className={inputClass} id="quote-date" onChange={(event) => setAvailableStartDate(event.target.value)} required type="date" value={availableStartDate} />
        </Field>

        <Field label={t("form.scope")} hint={t("form.scopeHint")} htmlFor="quote-scope">
          <textarea className={textAreaClass} id="quote-scope" maxLength={2000} onChange={(event) => setScope(event.target.value)} required rows={6} value={scope} />
        </Field>

        <button className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-white transition-[transform,opacity] duration-150 hover:opacity-95 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 sm:w-auto" disabled={submitting} type="submit">
          {submitting ? t("form.submitting") : t("form.submit")}
        </button>
      </form>
    </section>
  );
}

function QuoteDetail({ quote }: { quote: Quote }) {
  const t = useTranslations("initialQuote");
  const tUx = useTranslations("ux");
  const format = useFormatter();
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
    <article className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-[0_12px_36px_rgb(21_52_75/0.06)]">
      <div className="border-b border-brand-border bg-[#fbfcfc] px-5 py-5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${quote.status === "withdrawn" ? "bg-[#f1f2f3] text-muted" : "bg-[#e9f6ee] text-[#21633d]"}`}>{t(`detail.${quote.status}`)}</span>
          <time className="text-xs text-muted" dateTime={new Date(quote.submittedAt).toISOString()}>{t("detail.submittedAt", { date: format.dateTime(quote.submittedAt, { dateStyle: "medium" }) })}</time>
        </div>
      </div>
      <div className="p-5 sm:p-8">
        {quote.status === "withdrawn" ? <p className="mb-6 rounded-xl border border-brand-border bg-[#f5f7f8] px-4 py-3 text-sm text-muted">{t("detail.withdrawnNotice")}</p> : null}
        {error ? <p className="mb-6 rounded-xl border border-[#edc7c2] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2f28]" role="alert">{error}</p> : null}
        <dl className="grid gap-4 sm:grid-cols-3">
          <QuoteMetric icon={<WalletCards aria-hidden className="size-5" />} label={t("detail.estimatedPrice")} value={format.number(quote.estimatedPrice, { style: "currency", currency: "MAD", maximumFractionDigits: 2 })} />
          <QuoteMetric icon={<Clock3 aria-hidden className="size-5" />} label={t("detail.estimatedDuration")} value={t("detail.durationValue", { count: quote.estimatedDuration })} />
          <QuoteMetric icon={<CalendarDays aria-hidden className="size-5" />} label={t("detail.availability")} value={format.dateTime(startDate, { dateStyle: "medium", timeZone: "UTC" })} />
        </dl>
        <QuoteText label={t("detail.scope")} value={quote.scope} />
        <QuoteText label={t("detail.message")} value={quote.message} />
        <div className="mt-7 flex gap-3 rounded-xl border border-[#c9dbe8] bg-[#f1f7fb] p-4 text-sm leading-6 text-[#31546d]"><LockKeyhole aria-hidden className="mt-0.5 size-5 shrink-0" /><p className="m-0">{quote.status === "discussion_open" ? t("detail.discussionPending") : t("detail.messagingLocked")}</p></div>
        {quote.status === "submitted" ? <button className="mt-7 inline-flex min-h-11 items-center rounded-full border border-[#c86458] px-5 text-sm font-semibold text-[#8a2f28] transition-colors hover:bg-[#fff4f2] disabled:opacity-60" disabled={withdrawing} onClick={onWithdraw} type="button">{withdrawing ? t("detail.withdrawing") : t("detail.withdraw")}</button> : null}
      </div>
    </article>
  );
}

function ProjectSummary({ project }: { project: NonNullable<FunctionReturnType<typeof api.quotes.index.getSubmissionContext>>["project"] }) {
  const t = useTranslations("initialQuote");
  const tProject = useTranslations("companyProjects.detail");
  const tWizard = useTranslations("projectWizard");
  return (
    <aside className="rounded-2xl border border-brand-border bg-white p-5 shadow-[0_8px_28px_rgb(23_61_99/0.05)] lg:sticky lg:top-24 sm:p-6">
      <h2 className="m-0 text-base font-semibold text-ink">{t("projectSummary")}</h2>
      <p className="mt-3 mb-0 text-lg leading-7 font-semibold tracking-[-0.025em] text-ink">{project.title}</p>
      <dl className="mt-5 space-y-4 text-sm">
        <SummaryRow label={tProject("city")} value={tWizard(`cityOptions.${project.city}`)} />
        <SummaryRow label={tProject("category")} value={tWizard(`categoryOptions.${project.primaryCategory}`)} />
        <SummaryRow label={tProject("budget")} value={tWizard(`budgetOptions.${project.budgetRange}`)} />
        <SummaryRow label={tProject("timeline")} value={tWizard(`timelineOptions.${project.timeline}`)} />
      </dl>
    </aside>
  );
}

function VerificationRequired() {
  const t = useTranslations("initialQuote");
  return <section className="rounded-2xl border border-brand-border bg-white p-6 shadow-[0_12px_36px_rgb(21_52_75/0.06)] sm:p-8"><h2 className="m-0 text-xl font-semibold text-ink">{t("verificationTitle")}</h2><p className="mt-3 mb-0 text-sm leading-6 text-muted">{t("verificationLead")}</p><Link className="mt-6 inline-flex min-h-12 items-center rounded-full bg-brand px-6 text-sm font-semibold text-white" href={routes.companyVerification}>{t("verifyAction")}</Link></section>;
}

function UnavailableQuoteWorkspace({ projectId }: { projectId: string }) {
  const t = useTranslations("initialQuote");
  return <main className="mx-auto flex min-h-[65vh] w-[calc(100%-36px)] max-w-[680px] items-center justify-center py-12 text-center"><div><h1 className="m-0 text-2xl font-semibold text-ink">{t("unavailableTitle")}</h1><p className="mt-3 mb-0 text-sm leading-6 text-muted">{t("unavailableLead")}</p><Link className="mt-6 inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white" href={{ pathname: routes.companyProject, params: { projectId } }}>{t("backToProject")}</Link></div></main>;
}

function QuoteWorkspaceSkeleton({ label }: { label: string }) {
  return <main aria-busy="true" className="min-h-[calc(100dvh-4.5rem)] bg-[#f4f7f8]" role="status"><span className="sr-only">{label}</span><div className="mx-auto w-[calc(100%-36px)] max-w-[1120px] animate-pulse py-10"><div className="h-4 w-32 rounded bg-[#dfe8ed]" /><div className="mt-6 h-10 w-2/3 max-w-[520px] rounded bg-[#dfe8ed]" /><div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="h-[560px] rounded-2xl bg-white" /><div className="h-72 rounded-2xl bg-white" /></div></div></main>;
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-semibold text-ink" htmlFor={htmlFor}>{label}</label>{hint ? <p className="mt-1 mb-2 text-xs leading-5 text-muted">{hint}</p> : <div className="h-2" />}{children}</div>;
}

function QuoteMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-xl bg-[#f4f7f8] p-4"><div className="flex items-center gap-2 text-brand">{icon}<dt className="text-xs font-semibold tracking-[0.04em] uppercase">{label}</dt></div><dd className="mt-2 text-sm font-semibold text-ink">{value}</dd></div>;
}

function QuoteText({ label, value }: { label: string; value: string }) {
  return <section className="mt-7 border-t border-brand-border pt-6"><h2 className="m-0 text-base font-semibold text-ink">{label}</h2><p className="mt-3 mb-0 whitespace-pre-wrap text-sm leading-7 text-ink/85">{value}</p></section>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">{label}</dt><dd className="mt-1 font-medium text-ink">{value}</dd></div>;
}

const inputClass = "min-h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]";
const textAreaClass = `${inputClass} min-h-36 resize-y py-3 leading-6`;
