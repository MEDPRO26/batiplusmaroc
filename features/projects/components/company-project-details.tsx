"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { ProjectFeedSkeleton, resolveCompanyProjectsRedirect } from "./company-project-marketplace";
import { ProjectSiteAssessment } from "@/features/site-assessments/components/site-assessment-panel";

type Details = NonNullable<FunctionReturnType<typeof api.projects.marketplace.getCompanyMarketplaceProject>>;

export function CompanyProjectDetails({ projectId }: { projectId: string }) {
  const t = useTranslations("companyProjects");
  const user = useQuery(api.users.currentUser);
  const router = useRouter();
  const canBrowse = user?.accountType === "company" && user.onboardingStatus === "completed";
  const project = useQuery(api.projects.marketplace.getCompanyMarketplaceProject, canBrowse ? { projectId } : "skip");

  useEffect(() => {
    const destination = resolveCompanyProjectsRedirect(user);
    if (destination) router.replace(destination);
  }, [router, user]);

  if (!canBrowse || project === undefined) return <ProjectFeedSkeleton label={t("detail.loading")} />;
  if (project === null) return <UnavailableProject />;
  return <ProjectDetailsView project={project} />;
}

export function ProjectDetailsView({ project }: { project: Details }) {
  const t = useTranslations("companyProjects");
  const tWizard = useTranslations("projectWizard");
  const format = useFormatter();
  const locale = useLocale();
  const category = project.primaryCategory === "other" && project.customCategoryText ? project.customCategoryText : tWizard(`categoryOptions.${project.primaryCategory}`);
  return (
    <main className="min-h-[calc(100dvh-4.5rem)] bg-[#f7f9fb]">
      <div className="mx-auto w-[calc(100%-36px)] max-w-[1120px] py-7 sm:w-[calc(100%-48px)] sm:py-10">
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" href={routes.companyProjects}>← {t("detail.back")}</Link>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <article className="rounded-2xl border border-brand-border bg-white p-5 shadow-[0_1px_2px_rgb(23_61_99/0.04)] sm:p-8">
            <p className="m-0 text-xs font-semibold tracking-[0.08em] text-brand uppercase">{category}</p>
            <h1 className="mt-3 mb-0 text-[1.8rem] leading-9 font-semibold tracking-[-0.04em] text-ink sm:text-[2.25rem] sm:leading-[2.8rem]">{project.title}</h1>
            <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 text-sm text-muted"><span>{tWizard(`cityOptions.${project.city}`)}</span>{project.neighborhood ? <><span aria-hidden>·</span><span>{project.neighborhood}</span></> : null}{project.publishedAt ? <><span aria-hidden>·</span><time dateTime={new Date(project.publishedAt).toISOString()}>{t("card.published", { date: formatMarketplaceDateTime(project.publishedAt, locale, { dateStyle: "medium" }) })}</time></> : null}</div>
            <dl className="mt-7 grid gap-3 sm:grid-cols-2">
              <DetailField label={t("detail.budget")} value={tWizard(`budgetOptions.${project.budgetRange}`)} />
              <DetailField label={t("detail.timeline")} value={tWizard(`timelineOptions.${project.timeline}`)} />
              <DetailField label={t("detail.propertyType")} value={project.propertyType ? tWizard(`propertyTypeOptions.${project.propertyType}`) : t("notSpecified")} />
              <DetailField label={t("detail.surface")} value={project.surface !== null && !project.surfaceUnknown ? t("card.surface", { value: format.number(project.surface) }) : t("notSpecified")} />
            </dl>
            <section className="mt-8 border-t border-brand-border pt-7"><h2 className="m-0 text-lg font-semibold text-ink">{t("detail.description")}</h2><p className="mt-3 mb-0 whitespace-pre-wrap text-[0.95rem] leading-7 text-ink/80">{project.description}</p></section>
            <section className="mt-8 border-t border-brand-border pt-7"><h2 className="m-0 text-lg font-semibold text-ink">{t("detail.clientTitle")}</h2><p className="mt-3 mb-0 text-sm leading-6 text-ink">{project.client ? project.client.displayName : t("card.clientPrivate")}</p>{project.client ? <p className="mt-1 mb-0 text-xs text-muted">{t("detail.clientSince", { date: formatMarketplaceDateTime(project.client.joinedAt, locale, { month: "long", year: "numeric" }) })}</p> : null}</section>
          </article>
          <aside className="rounded-2xl border border-brand-border bg-white p-5 shadow-[0_8px_28px_rgb(23_61_99/0.06)] lg:sticky lg:top-24 sm:p-6">
            <div className="-mx-5 -mt-5 mb-5 overflow-hidden rounded-t-2xl sm:-mx-6 sm:-mt-6"><ProjectSiteAssessment projectId={project.id} /></div>
            <h2 className="m-0 text-lg font-semibold text-ink">{t("quote.title")}</h2>
            <p className="mt-2 mb-0 text-sm leading-6 text-muted">{t("quote.lead")}</p>
            {project.myQuoteId ? (
              <Link className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white" href={{ pathname: routes.companyInitialQuote, params: { projectId: project.id } }}>{t("quote.view")}</Link>
            ) : project.canSubmitQuote ? (
              <Link className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white" href={{ pathname: routes.companyInitialQuote, params: { projectId: project.id } }}>{t("quote.submit")}</Link>
            ) : (
              <button className="mt-5 inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white opacity-55" disabled type="button">{t("quote.submit")}</button>
            )}
            {!project.myQuoteId && !project.canSubmitQuote ? <><p className="mt-3 mb-0 text-sm leading-6 text-[#8a2f28]">{t("quote.verificationRequired")}</p><Link className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand" href={routes.companyVerification}>{t("quote.verifyAction")}</Link></> : null}
          </aside>
        </div>
      </div>
    </main>
  );
}

function DetailField({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[#f5f7f9] p-4"><dt className="text-xs font-semibold tracking-[0.05em] text-muted uppercase">{label}</dt><dd className="mt-1.5 text-sm font-semibold text-ink">{value}</dd></div>; }
function UnavailableProject() { const t = useTranslations("companyProjects"); return <main className="mx-auto flex min-h-[60vh] w-[calc(100%-36px)] max-w-[720px] items-center justify-center py-12 text-center"><div><h1 className="m-0 text-2xl font-semibold text-ink">{t("detail.unavailableTitle")}</h1><p className="mt-3 mb-0 text-sm leading-6 text-muted">{t("detail.unavailableLead")}</p><Link className="mt-6 inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white" href={routes.companyProjects}>{t("detail.back")}</Link></div></main>; }
