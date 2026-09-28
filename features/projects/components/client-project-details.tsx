"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft, CalendarClock, ChevronDown, Clock3, FileText, FolderOpen, House, MapPin, Ruler } from "lucide-react";
import Image from "next/image";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StatusBadge } from "@/features/clients/components/client-dashboard";
import { ErrorState } from "@/features/shared/components/error-state";
import { PageSkeleton } from "@/features/shared/components/skeletons";
import { Link, useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { routes } from "@/lib/routes";
import { ClientReceivedQuotes, ProposalOverview } from "@/features/quotes/components/client-received-quotes";
import { ClientProjectCurrentStep } from "@/features/projects/components/client-project-current-step";
import { ReviewDialog, type ReviewDraft } from "@/features/projects/components/review-dialog";
import { ClientProjectInvitations } from "@/features/invitations/components/client-project-invitations";

export { ReviewDialog } from "@/features/projects/components/review-dialog";

export type ProjectDetails = NonNullable<FunctionReturnType<typeof api.projects.index.getMyProject>>;

export function ClientProjectDetails({ projectId }: { projectId: string }) {
  const t = useTranslations("clientProjects");
  const tUx = useTranslations("ux");
  const user = useQuery(api.users.currentUser);
  const canLoad =
    (user?.accountType === "client" && user.onboardingStatus === "completed") ||
    user?.accountType === "admin";
  const project = useQuery(api.projects.index.getMyProject, canLoad ? { projectId } : "skip");
  const router = useRouter();
  useEffect(() => {
    if (user === null) router.replace(routes.signIn);
    else if (user && user.accountType !== "admin" && !(user.accountType === "client" && user.onboardingStatus === "completed")) {
      router.replace(workspaceRouteForUser(user));
    }
  }, [router, user]);
  if (user === undefined || project === undefined) return <PageSkeleton label={t("loadingDetails")} />;
  if (!canLoad || project === null) return <ErrorState backHref={routes.clientDashboard} backLabel={t("backToProjects")} description={tUx("notFound.project")} retryLabel={tUx("retry")} title={t("notFoundTitle")} />;
  return <ClientProjectDetailsView project={project} quotesSlot={<ClientReceivedQuotes projectId={project.id} />} />;
}

/** Descriptions longer than this are collapsed behind "Show more". */
const DESCRIPTION_PREVIEW_CHARS = 600;

export function ClientProjectDetailsView({ project, quotesSlot }: { project: ProjectDetails; quotesSlot?: React.ReactNode }) {
  const t = useTranslations("clientProjects");
  const tWizard = useTranslations("projectWizard");
  const format = useFormatter();
  const locale = useLocale();
  const category = project.primaryCategory ? `${tWizard(`categoryOptions.${project.primaryCategory}`)}${project.primaryCategory === "other" && project.customCategoryText ? ` · ${project.customCategoryText}` : ""}` : null;
  const location = [project.city ? tWizard(`cityOptions.${project.city}`) : null, project.neighborhood].filter(Boolean).join(" · ") || null;
  const surface = project.surfaceUnknown ? t("surfaceUnknown") : project.surface ? `${format.number(project.surface)} m²` : null;
  // The project read model has no publishedAt; the immutable status history is the source of truth.
  const publishedAt = project.history.findLast((item) => item.newStatus === "published")?.changedAt ?? null;
  const formatDate = (value: number) => formatMarketplaceDateTime(value, locale, { dateStyle: "medium" });
  const isOwner = project.viewerRole === "owner";
  const resumeHref = {
    pathname: routes.postProjectWizard,
    query: { projectId: project.id },
  } as const;
  return (
    <main className="mx-auto w-[calc(100%-32px)] max-w-[1200px] flex-1 py-6 sm:w-[calc(100%-48px)] sm:py-8">
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" href={routes.clientDashboard}><ArrowLeft aria-hidden className="size-4" />{t("backToProjects")}</Link>
      <header className="mt-3">
        <p className="m-0 text-sm font-semibold text-muted">{t("detailsEyebrow")}</p>
        <div className="mt-1.5 flex flex-wrap items-start gap-x-4 gap-y-2">
          <h1 className="m-0 min-w-0 text-[1.6rem] leading-[1.2] font-semibold tracking-[-0.035em] break-words text-ink sm:text-[2rem]">{project.title ?? t("untitled")}</h1>
          <div className="pt-1.5 sm:pt-2.5"><StatusBadge status={project.status} /></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          {location ? <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden className="size-4" />{location}</span> : null}
          {category ? <span className="inline-flex items-center gap-1.5"><FolderOpen aria-hidden className="size-4" />{category}</span> : null}
          {surface && !project.surfaceUnknown ? <span className="inline-flex items-center gap-1.5"><Ruler aria-hidden className="size-4" />{surface}</span> : null}
          <span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden className="size-4" />{publishedAt ? t("publishedOn", { date: formatDate(publishedAt) }) : t("createdOn", { date: formatDate(project.createdAt) })}</span>
        </div>
      </header>
      <ClientProjectCurrentStep project={project} />
      {isOwner ? <ClientDealCompletion project={project} /> : null}
      {project.status === "pending_review" ? <p className="mt-6 rounded-xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900" role="status">{t("statusDescription.pending_review")}</p> : null}
      {project.status === "needs_changes" ? <p className="mt-6 rounded-xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900" role="status">{t("statusDescription.needs_changes")}</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
        <article aria-label={t("detailsEyebrow")} className="min-w-0 overflow-hidden rounded-2xl border border-brand-border bg-white">
          <ProjectSection title={t("description")}>
            <CollapsibleText emptyLabel={t("notProvided")} text={project.description} />
          </ProjectSection>
          <ProjectSection title={t("projectInformation")}>
            <dl className="m-0 grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
              <InfoItem icon={<FolderOpen />} label={t("category")} value={category} />
              <InfoItem icon={<MapPin />} label={t("location")} value={location} />
              <InfoItem icon={<House />} label={t("propertyType")} value={project.propertyType ? tWizard(`propertyTypeOptions.${project.propertyType}`) : null} />
              <InfoItem icon={<Ruler />} label={t("surface")} value={surface} />
              <InfoItem icon={<CalendarClock />} label={t("timeline")} value={project.timeline ? tWizard(`timelineOptions.${project.timeline}`) : null} />
            </dl>
          </ProjectSection>
          {project.images.length ? <ProjectSection title={t("images")}><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{project.images.map((image, index) => image.url ? <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-muted" key={image.id}><Image alt={t("imageAlt", { number: index + 1, title: project.title ?? t("untitled") })} className="object-cover" fill sizes="(min-width: 1024px) 240px, 45vw" src={image.url} /></div> : null)}</div></ProjectSection> : null}
          {project.attachments.length ? <ProjectSection title={t("documents")}><p className="mt-0 mb-3 text-sm text-muted">{t("documentsPrivate")}</p><ul className="m-0 grid list-none gap-2 p-0">{project.attachments.map((item) => <li className="flex items-center gap-2.5 text-sm text-ink" key={item.id}><FileText aria-hidden className="size-4 shrink-0 text-muted" /><span className="min-w-0 truncate">{item.fileName}</span><span className="shrink-0 text-muted">· {t("fileSizeKb", { count: format.number(Math.ceil(item.size / 1024)) })}</span></li>)}</ul></ProjectSection> : null}
        </article>

        <aside className="grid content-start gap-4 lg:sticky lg:top-24">
          {isOwner && project.status !== "draft" && project.status !== "pending_review" && project.status !== "needs_changes" ? <ProposalOverview projectId={project.id} /> : null}
          <section aria-labelledby="project-dates-title" className="rounded-2xl border border-brand-border bg-white p-5">
            <h2 className="m-0 text-base font-semibold text-ink" id="project-dates-title">{t("dates")}</h2>
            <dl className="mt-3 mb-0 grid gap-2 text-sm">
              <DateRow label={t("createdLabel")} value={formatDate(project.createdAt)} />
              {project.submittedAt ? <DateRow label={t("submittedLabel")} value={formatDate(project.submittedAt)} /> : null}
              {publishedAt ? <DateRow label={t("publishedLabel")} value={formatDate(publishedAt)} /> : null}
            </dl>
            {project.canResume ? <Link className="button button-primary mt-5 w-full" href={resumeHref}>{t("continueProject")}</Link> : null}
            {project.history.length ? (
              <details className="group mt-4 border-t border-brand-border pt-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
                  <span>{t("history.title")} <span className="font-normal text-muted">· {t("history.count", { count: project.history.length })}</span></span>
                  <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <ol className="mt-2 mb-0 grid list-none gap-3 border-l border-brand-border pl-4">
                  {project.history.map((item, index) => <li className="relative text-sm leading-5 text-ink before:absolute before:top-1.5 before:-left-[21px] before:size-2 before:rounded-full before:bg-brand-border" key={`${item.changedAt}-${index}`}><span className="font-medium">{t("history.transition", { from: t(`status.${item.oldStatus}`), to: t(`status.${item.newStatus}`) })}</span><span className="mt-0.5 block text-xs text-muted">{t("history.meta", { actor: t(`history.actor.${item.actor}`), date: formatMarketplaceDateTime(item.changedAt, locale, { dateStyle: "medium", timeStyle: "short" }) })}</span>{item.reason ? <span className="mt-2 block rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{item.reason}</span> : null}</li>)}
                </ol>
              </details>
            ) : null}
          </section>
        </aside>
      </div>
      {isOwner ? <ClientProjectInvitations projectId={project.id} /> : null}
      {quotesSlot}
    </main>
  );
}

function ProjectSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-brand-border px-5 py-6 last:border-b-0 sm:px-7"><h2 className="mt-0 mb-4 text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h2>{children}</section>;
}

function CollapsibleText({ text, emptyLabel }: { text: string | null; emptyLabel: string }) {
  const t = useTranslations("clientProjects");
  const [expanded, setExpanded] = useState(false);
  if (!text) return <p className="m-0 text-sm text-muted">{emptyLabel}</p>;
  const collapsible = text.length > DESCRIPTION_PREVIEW_CHARS;
  const visible = collapsible && !expanded ? `${text.slice(0, DESCRIPTION_PREVIEW_CHARS).trimEnd()}…` : text;
  return (
    <>
      <p className="m-0 max-w-[72ch] whitespace-pre-wrap break-words text-[0.95rem] leading-7 text-ink/90" id="project-description">{visible}</p>
      {collapsible ? <button aria-controls="project-description" aria-expanded={expanded} className="mt-2 inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" onClick={() => setExpanded((value) => !value)} type="button">{expanded ? t("showLess") : t("showMore")}</button> : null}
    </>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  const t = useTranslations("clientProjects");
  return (
    <div className="flex min-w-0 gap-3">
      <span aria-hidden className="mt-0.5 shrink-0 text-muted [&>svg]:size-5">{icon}</span>
      <div className="flex min-w-0 flex-col-reverse"><dt className="mt-0.5 text-xs text-muted">{label}</dt><dd className={`m-0 text-sm font-semibold break-words ${value ? "text-ink" : "text-muted"}`}>{value ?? t("notProvided")}</dd></div>
    </div>
  );
}

function DateRow({ label, value }: { label: string; value: string }) { return <div className="flex items-baseline justify-between gap-3"><dt className="text-muted">{label}</dt><dd className="m-0 font-medium text-ink">{value}</dd></div>; }

export function ClientDealCompletion({ project }: { project: ProjectDetails }) {
  const relevant = project.status === "company_selected" || project.status === "in_progress" || project.status === "completed";
  const deal = useQuery(api.deals.index.getByProject, relevant ? { projectId: project.id } : "skip");
  const completeDeal = useMutation(api.deals.index.completeDeal);
  const t = useTranslations("clientProjects.completion");
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!relevant || deal === null) return null;
  if (deal === undefined) {
    return <p className="mt-6 text-sm text-muted" role="status">{t("loading")}</p>;
  }
  const dealId = deal.id;

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await completeDeal({ dealId });
      setConfirming(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(message.includes("DEAL_ALREADY_COMPLETED") ? t("errors.alreadyCompleted") : message.includes("DEAL_NOT_COMPLETABLE") ? t("errors.notCompletable") : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const completed = deal.status === "completed";
  return (
    <section aria-labelledby="deal-completion-title" className="mt-6 rounded-2xl border border-brand-border bg-white p-5 sm:p-6">
      <p className="m-0 text-[11px] font-bold tracking-[0.12em] text-brand uppercase">{t("eyebrow")}</p>
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="m-0 text-lg font-semibold text-ink" id="deal-completion-title">{completed ? t("completedTitle") : t("activeTitle")}</h2>
          <p className="mt-1 mb-0 max-w-2xl text-sm leading-6 text-muted">
            {completed && deal.completedAt
              ? t("completedLead", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Africa/Casablanca" }).format(deal.completedAt) })
              : t("activeLead")}
          </p>
          {completed && deal.reviewEligible ? <p className="mt-2 mb-0 text-sm font-medium text-emerald-700">{t("reviewEligible")}</p> : null}
        </div>
        {!completed ? <button className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" onClick={() => { setError(""); setConfirming(true); }} type="button">{t("action")}</button> : null}
      </div>
      {error && !confirming ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
      {confirming ? <DealCompletionDialog busy={busy} error={error} onCancel={() => setConfirming(false)} onConfirm={() => void confirm()} /> : null}
      {completed && deal.reviewEligible ? <ClientReviewPanel dealId={dealId} /> : null}
    </section>
  );
}

export function ClientReviewPanel({ dealId }: { dealId: Id<"deals"> }) {
  const t = useTranslations("clientProjects.review");
  const locale = useLocale();
  const review = useQuery(api.reviews.index.getMyReviewForDeal, { dealId });
  const createReview = useMutation(api.reviews.index.createReview);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const closeReviewDialog = useCallback(() => setOpen(false), []);

  async function submit({ rating, comment }: ReviewDraft) {
    setBusy(true);
    setError("");
    try {
      await createReview({ dealId, rating, comment });
      setOpen(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(
        message.includes("REVIEW_ALREADY_EXISTS") ? t("errors.alreadyExists")
          : message.includes("INVALID_REVIEW_RATING") ? t("errors.rating")
            : message.includes("INVALID_REVIEW_COMMENT") ? t("errors.comment")
              : message.includes("REVIEW_NOT_ELIGIBLE") ? t("errors.notEligible")
                : t("errors.generic"),
      );
    } finally {
      setBusy(false);
    }
  }

  if (review === undefined) return <p className="mt-5 text-sm text-muted" role="status">{t("loading")}</p>;
  if (review) {
    return (
      <div className="mt-5 border-t border-brand-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-base font-semibold text-ink">{t("submittedTitle")}</h3>
          <span className="text-sm font-semibold text-amber-600" aria-label={t("ratingOutOfFive", { rating: review.rating })}>{"★".repeat(review.rating)}<span className="text-slate-300">{"★".repeat(5 - review.rating)}</span></span>
        </div>
        <p className="mt-2 mb-0 whitespace-pre-wrap text-sm leading-6 text-ink/85">{review.comment}</p>
        <p className="mt-2 mb-0 text-xs text-muted">
          {t("submittedMeta", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Africa/Casablanca" }).format(review.createdAt) })}
          {review.moderationStatus === "hidden" ? ` · ${t("hiddenStatus")}` : ""}
        </p>
      </div>
    );
  }
  return (
    <div className="mt-5 border-t border-brand-border pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="m-0 text-base font-semibold text-ink">{t("title")}</h3><p className="mt-1 mb-0 text-sm text-muted">{t("lead")}</p></div>
        <button className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-brand bg-white px-5 text-sm font-semibold text-brand hover:bg-brand-soft" onClick={() => { setError(""); setOpen(true); }} type="button">{t("action")}</button>
      </div>
      {open ? <ReviewDialog busy={busy} error={error} onCancel={closeReviewDialog} onSubmit={(draft) => void submit(draft)} /> : null}
    </div>
  );
}

export function DealCompletionDialog({ busy, error, onCancel, onConfirm }: { busy: boolean; error: string; onCancel: () => void; onConfirm: () => void }) {
  const t = useTranslations("clientProjects.completion");
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onCancel(); };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy, onCancel]);
  return <div className="fixed inset-0 z-[110] grid place-items-center bg-black/50 p-4"><button aria-label={t("cancel")} className="absolute inset-0" disabled={busy} onClick={onCancel} type="button" /><div aria-describedby="deal-completion-description" aria-labelledby="deal-completion-dialog-title" aria-modal="true" className="relative z-10 w-full max-w-md rounded-[20px] bg-white p-5 shadow-[0_24px_48px_rgba(16,24,40,0.18)] sm:p-6" role="dialog"><h2 className="m-0 text-lg font-semibold text-ink" id="deal-completion-dialog-title">{t("confirmTitle")}</h2><p className="mt-3 mb-0 text-sm leading-6 text-muted" id="deal-completion-description">{t("confirmLead")}</p>{error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button className="min-h-11 rounded-full px-5 text-sm font-semibold text-muted disabled:opacity-55" disabled={busy} onClick={onCancel} type="button">{t("cancel")}</button><button className="min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white disabled:opacity-55" disabled={busy} onClick={onConfirm} ref={confirmRef} type="button">{busy ? t("saving") : t("confirmAction")}</button></div></div></div>;
}
