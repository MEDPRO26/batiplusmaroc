"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Image from "next/image";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { StatusBadge } from "@/features/clients/components/client-dashboard";
import { ErrorState } from "@/features/shared/components/error-state";
import { PageSkeleton } from "@/features/shared/components/skeletons";
import { Link, useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { routes } from "@/lib/routes";
import { ClientReceivedQuotes } from "@/features/quotes/components/client-received-quotes";
import { ClientProjectCurrentStep } from "@/features/projects/components/client-project-current-step";

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

export function ClientProjectDetailsView({ project, quotesSlot }: { project: ProjectDetails; quotesSlot?: React.ReactNode }) {
  const t = useTranslations("clientProjects");
  const tWizard = useTranslations("projectWizard");
  const format = useFormatter();
  const locale = useLocale();
  const category = project.primaryCategory ? `${tWizard(`categoryOptions.${project.primaryCategory}`)}${project.primaryCategory === "other" && project.customCategoryText ? ` · ${project.customCategoryText}` : ""}` : t("notProvided");
  const resumeHref = {
    pathname: routes.postProjectWizard,
    query: { projectId: project.id },
  } as const;
  return (
    <main className="mx-auto w-full max-w-[960px] flex-1 px-5 py-10 sm:px-8 sm:py-14">
      <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-brand" href={routes.clientDashboard}>← {t("backToProjects")}</Link>
      <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-2 text-xs font-bold tracking-[0.16em] text-brand uppercase">{t("detailsEyebrow")}</p><h1 className="m-0 text-[clamp(2rem,5vw,3.4rem)] leading-[1.03] font-semibold tracking-[-0.045em] text-ink">{project.title ?? t("untitled")}</h1></div>
        <StatusBadge status={project.status} />
      </header>
      <ClientProjectCurrentStep project={project} />
      {project.status === "pending_review" ? <p className="mt-7 rounded-2xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900" role="status">{t("statusDescription.pending_review")}</p> : null}
      {project.status === "needs_changes" ? <p className="mt-7 rounded-2xl bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900" role="status">{t("statusDescription.needs_changes")}</p> : null}
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-6">
          {project.images.length ? <section aria-labelledby="project-images"><h2 className="sr-only" id="project-images">{t("images")}</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{project.images.map((image, index) => image.url ? <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-muted" key={image.id}><Image alt={t("imageAlt", { number: index + 1, title: project.title ?? t("untitled") })} className="object-cover" fill sizes="(min-width: 1024px) 210px, 45vw" src={image.url} /></div> : null)}</div></section> : null}
          <section className="rounded-2xl border border-brand-border bg-white p-5 sm:p-7"><h2 className="m-0 text-lg font-semibold text-ink">{t("description")}</h2><p className="mt-4 mb-0 whitespace-pre-wrap text-sm leading-7 text-ink/85">{project.description ?? t("notProvided")}</p></section>
          {project.attachments.length ? <section className="rounded-2xl border border-brand-border bg-white p-5 sm:p-7"><h2 className="m-0 text-lg font-semibold text-ink">{t("documents")}</h2><p className="mt-2 text-sm text-muted">{t("documentsPrivate")}</p><ul className="mt-4 grid list-none gap-2 p-0">{project.attachments.map((item) => <li className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-ink" key={item.id}>{item.fileName} <span className="text-muted">· {t("fileSizeKb", { count: format.number(Math.ceil(item.size / 1024)) })}</span></li>)}</ul></section> : null}
        </div>
        <aside className="grid content-start gap-6">
          <section className="rounded-2xl border border-brand-border bg-white p-5"><h2 className="m-0 text-base font-semibold text-ink">{t("summary")}</h2><dl className="mt-4 grid gap-4 text-sm"><Detail label={t("category")} value={category} /><Detail label={t("location")} value={[project.city ? tWizard(`cityOptions.${project.city}`) : null, project.neighborhood].filter(Boolean).join(" · ") || t("notProvided")} /><Detail label={t("propertyType")} value={project.propertyType ? tWizard(`propertyTypeOptions.${project.propertyType}`) : t("notProvided")} /><Detail label={t("surface")} value={project.surfaceUnknown ? t("surfaceUnknown") : project.surface ? `${project.surface} m²` : t("notProvided")} /><Detail label={t("budget")} value={project.budgetRange ? tWizard(`budgetOptions.${project.budgetRange}`) : t("notProvided")} /><Detail label={t("timeline")} value={project.timeline ? tWizard(`timelineOptions.${project.timeline}`) : t("notProvided")} /><Detail label={t("createdLabel")} value={formatMarketplaceDateTime(project.createdAt, locale, { dateStyle: "medium" })} />{project.submittedAt ? <Detail label={t("submittedLabel")} value={formatMarketplaceDateTime(project.submittedAt, locale, { dateStyle: "medium" })} /> : null}</dl>{project.canResume ? <Link className="button button-primary mt-6 w-full" href={resumeHref}>{t("continueProject")}</Link> : null}</section>
          {project.history.length ? <section className="rounded-2xl border border-brand-border bg-white p-5"><h2 className="m-0 text-base font-semibold text-ink">{t("history.title")}</h2><ol className="mt-4 grid gap-4 pl-5">{project.history.map((item, index) => <li className="text-sm leading-5 text-ink" key={`${item.changedAt}-${index}`}><span className="font-medium">{t("history.transition", { from: t(`status.${item.oldStatus}`), to: t(`status.${item.newStatus}`) })}</span><span className="mt-1 block text-xs text-muted">{t("history.meta", { actor: t(`history.actor.${item.actor}`), date: formatMarketplaceDateTime(item.changedAt, locale, { dateStyle: "medium", timeStyle: "short" }) })}</span>{item.reason ? <span className="mt-2 block rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{item.reason}</span> : null}</li>)}</ol></section> : null}
        </aside>
      </div>
      {quotesSlot}
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-muted">{label}</dt><dd className="mt-1 font-medium text-ink">{value}</dd></div>; }
