"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft, BadgeCheck, CalendarClock, Clock3, FolderOpen, House, LockKeyhole, MapPin, Ruler, UserRound } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { resolveCompanyProjectsRedirect } from "./company-project-marketplace";
import { ProjectSiteAssessment } from "@/features/site-assessments/components/site-assessment-panel";
import { useProjectLocationLabel } from "../hooks/use-project-location-label";

type Details = NonNullable<FunctionReturnType<typeof api.projects.marketplace.getCompanyMarketplaceProject>>;

/** Descriptions longer than this are collapsed behind "Show more". */
const DESCRIPTION_PREVIEW_CHARS = 480;

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

  if (!canBrowse || project === undefined) return <ProjectDetailsSkeleton label={t("detail.loading")} />;
  if (project === null) return <UnavailableProject />;
  return <ProjectDetailsView project={project} />;
}

export function ProjectDetailsView({ project }: { project: Details }) {
  const locationLabel = useProjectLocationLabel();
  const t = useTranslations("companyProjects");
  const tWizard = useTranslations("projectWizard");
  const format = useFormatter();
  const locale = useLocale();
  const category = project.primaryCategory === "other" && project.customCategoryText ? project.customCategoryText : tWizard(`categoryOptions.${project.primaryCategory}`);
  const location = locationLabel(project);
  const surface = project.surface !== null && !project.surfaceUnknown ? t("card.surface", { value: format.number(project.surface) }) : null;
  const propertyType = project.propertyType ? tWizard(`propertyTypeOptions.${project.propertyType}`) : null;

  return (
    <main className="min-h-[calc(100dvh-4.5rem)] bg-[#f7f9fb] pb-28 lg:pb-0">
      <div className="mx-auto w-[calc(100%-32px)] max-w-[1200px] py-6 sm:w-[calc(100%-48px)] sm:py-8">
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" href={routes.companyProjects}>
          <ArrowLeft aria-hidden className="size-4" />{t("detail.back")}
        </Link>
        <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
          <article aria-labelledby="project-title" className="min-w-0 rounded-2xl border border-brand-border bg-white">
            <header className="px-5 pt-6 pb-6 sm:px-8 sm:pt-8">
              <p className="m-0 text-sm font-semibold text-muted">{t("detail.projectDetails")}</p>
              <h1 className="mt-2 mb-0 text-[1.5rem] leading-[1.25] font-semibold tracking-[-0.03em] break-words text-ink sm:text-[1.75rem]" id="project-title">{project.title}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                <span className="rounded-md bg-brand-soft px-2.5 py-1 text-[0.8rem] font-semibold text-brand-dark">{category}</span>
                {project.publishedAt ? (
                  <span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden className="size-4" /><time dateTime={new Date(project.publishedAt).toISOString()}>{t("card.published", { date: formatMarketplaceDateTime(project.publishedAt, locale, { dateStyle: "medium" }) })}</time></span>
                ) : null}
                <span className="inline-flex min-w-0 max-w-full items-start gap-1.5"><MapPin aria-hidden className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{location}</span></span>
              </div>
            </header>

            <DetailSection>
              <ProjectDescription text={project.description} />
            </DetailSection>

            <DetailSection title={t("detail.projectInformation")}>
              <dl className="m-0 grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
                <InfoItem icon={<CalendarClock />} label={t("detail.timeline")} value={tWizard(`timelineOptions.${project.timeline}`)} />
                <InfoItem icon={<House />} label={t("detail.propertyType")} value={propertyType} />
                <InfoItem icon={<Ruler />} label={t("detail.surface")} value={surface} />
                <InfoItem icon={<MapPin />} label={t("detail.location")} value={location} />
              </dl>
            </DetailSection>

            <DetailSection title={t("detail.servicesTitle")}>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                <li className="inline-flex min-h-8 items-center gap-1.5 rounded-sm bg-[#eef1f4] px-3.5 text-sm font-medium text-ink"><FolderOpen aria-hidden className="size-3.5 text-muted" />{category}</li>
              </ul>
            </DetailSection>

            <DetailSection title={t("detail.clientTitle")}>
              <ClientDetails client={project.client} />
            </DetailSection>
          </article>

          <aside aria-label={t("quote.title")} className="lg:sticky lg:top-24">
            <div className="overflow-hidden rounded-2xl border border-brand-border bg-white">
              <ProjectSiteAssessment projectId={project.id} />
              <div className="p-5 sm:p-6">
                <h2 className="m-0 text-lg font-semibold tracking-[-0.02em] text-ink">{t("quote.title")}</h2>
                <p className="mt-2 mb-0 text-sm leading-6 text-muted">{t("quote.lead")}</p>
                <ProposalAction className="mt-5" project={project} />
                <p className="mt-5 mb-0 flex gap-2.5 border-t border-brand-border pt-4 text-xs leading-5 text-muted"><LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />{t("quote.messagingRule")}</p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-border bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(23_61_99/0.08)] backdrop-blur lg:hidden">
        <ProposalAction compact project={project} />
      </div>
    </main>
  );
}

/** The single proposal CTA, rendered in the sidebar and in the mobile action bar. */
function ProposalAction({ project, className = "", compact = false }: { project: Details; className?: string; compact?: boolean }) {
  const t = useTranslations("companyProjects");
  const href = { pathname: routes.companyInitialQuote, params: { projectId: project.id } } as const;
  const buttonClass = "inline-flex min-h-12 w-full items-center justify-center rounded-sm px-5 text-sm font-semibold transition-[transform,background-color] duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand";

  if (project.myQuoteId) {
    return (
      <div className={className}>
        {compact ? null : <p className="mt-0 mb-3 flex items-center gap-2 text-sm font-semibold text-[#21633d]"><BadgeCheck aria-hidden className="size-4" />{t("quote.alreadySubmitted")}</p>}
        <Link className={`${buttonClass} border border-brand bg-white text-brand hover:bg-brand-soft`} href={href}>{t("quote.view")}</Link>
      </div>
    );
  }
  if (project.canSubmitQuote) {
    return <div className={className}><Link className={`${buttonClass} bg-brand text-white hover:bg-brand-hover`} href={href}>{t("quote.submit")}</Link></div>;
  }
  if (compact) {
    return <Link className={`${buttonClass} border border-brand bg-white text-brand`} href={routes.companyVerification}>{t("quote.verifyAction")}</Link>;
  }
  return (
    <div className={className}>
      <button aria-describedby="proposal-verification-note" className={`${buttonClass} cursor-not-allowed bg-brand text-white opacity-55`} disabled type="button">{t("quote.submit")}</button>
      <p className="mt-3 mb-0 text-sm leading-6 text-[#8a2f28]" id="proposal-verification-note">{t("quote.verificationRequired")}</p>
      <Link className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline" href={routes.companyVerification}>{t("quote.verifyAction")}</Link>
    </div>
  );
}

function ProjectDescription({ text }: { text: string }) {
  const t = useTranslations("companyProjects");
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const collapsible = text.length > DESCRIPTION_PREVIEW_CHARS;
  const visible = collapsible && !expanded ? `${text.slice(0, DESCRIPTION_PREVIEW_CHARS).trimEnd()}…` : text;
  return (
    <>
      <h2 className="sr-only">{t("detail.description")}</h2>
      <p className="m-0 max-w-[68ch] whitespace-pre-wrap break-words text-[0.98rem] leading-7 text-ink/90" id={id}>{visible}</p>
      {collapsible ? (
        <button aria-controls={id} aria-expanded={expanded} className="mt-2 inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" onClick={() => setExpanded((value) => !value)} type="button">
          {expanded ? t("detail.showLess") : t("detail.showMore")}
        </button>
      ) : null}
    </>
  );
}

function ClientDetails({ client }: { client: Details["client"] }) {
  const t = useTranslations("companyProjects");
  const locale = useLocale();
  if (!client) {
    return <p className="m-0 text-sm font-semibold text-ink">{t("card.clientPrivate")}</p>;
  }
  const verifications = [client.emailVerified ? t("detail.clientEmailVerified") : null, client.phoneVerified ? t("detail.clientPhoneVerified") : null].filter((value): value is string => value !== null);
  return (
    <div>
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-sm bg-brand-soft text-brand"><UserRound className="size-5" /></span>
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-semibold text-ink">{client.displayName}</p>
          <p className="mt-0.5 mb-0 text-xs text-muted">{t("detail.clientSince", { date: formatMarketplaceDateTime(client.joinedAt, locale, { month: "long", year: "numeric" }) })}</p>
        </div>
      </div>
      <ul className="mt-4 mb-0 grid list-none gap-x-6 gap-y-2 p-0 text-sm text-muted sm:grid-cols-2">
        {client.city ? <li className="flex items-center gap-2"><MapPin aria-hidden className="size-4 shrink-0" />{client.city}</li> : null}
        <li className="flex items-center gap-2"><FolderOpen aria-hidden className="size-4 shrink-0" />{t("detail.clientProjectsPosted", { count: client.projectsPostedCount })}</li>
        {client.projectsCompletedCount > 0 ? <li className="flex items-center gap-2"><BadgeCheck aria-hidden className="size-4 shrink-0" />{t("detail.clientProjectsCompleted", { count: client.projectsCompletedCount })}</li> : null}
        {verifications.map((label) => <li className="flex items-center gap-2 text-ink" key={label}><BadgeCheck aria-hidden className="size-4 shrink-0 text-[#21633d]" />{label}</li>)}
      </ul>
      <p className="mt-4 mb-0 text-xs leading-5 text-muted">{t("detail.clientPrivacy")}</p>
    </div>
  );
}

function DetailSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="border-t border-brand-border px-5 py-6 sm:px-8 sm:py-7">
      {title ? <h2 className="mt-0 mb-4 text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h2> : null}
      {children}
    </section>
  );
}

function InfoItem({ icon, label, value }: { icon: ReactNode; label: string; value: string | null }) {
  const t = useTranslations("companyProjects");
  return (
    <div className="flex min-w-0 gap-3">
      <span aria-hidden className="mt-0.5 shrink-0 text-muted [&>svg]:size-5">{icon}</span>
      <div className="flex min-w-0 flex-col-reverse">
        <dt className="mt-0.5 text-xs text-muted">{label}</dt>
        <dd className={`m-0 text-sm font-semibold break-words ${value ? "text-ink" : "text-muted"}`}>{value ?? t("notSpecified")}</dd>
      </div>
    </div>
  );
}

function ProjectDetailsSkeleton({ label }: { label: string }) {
  return (
    <main aria-busy="true" className="min-h-[calc(100dvh-4.5rem)] bg-[#f7f9fb]" role="status">
      <span className="sr-only">{label}</span>
      <div className="mx-auto w-[calc(100%-32px)] max-w-[1200px] animate-pulse py-6 sm:w-[calc(100%-48px)] sm:py-8">
        <div className="h-5 w-36 rounded bg-[#dfe8ed]" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <div className="rounded-2xl border border-brand-border bg-white p-8">
            <div className="h-4 w-28 rounded bg-[#e8eef2]" />
            <div className="mt-3 h-8 w-3/4 rounded bg-[#dfe8ed]" />
            <div className="mt-4 h-4 w-1/2 rounded bg-[#e8eef2]" />
            <div className="mt-10 space-y-3">{[0, 1, 2, 3].map((row) => <div className="h-4 rounded bg-[#eef2f5]" key={row} />)}</div>
            <div className="mt-10 grid gap-5 sm:grid-cols-4">{[0, 1, 2, 3].map((cell) => <div className="h-10 rounded bg-[#eef2f5]" key={cell} />)}</div>
          </div>
          <div className="h-56 rounded-2xl border border-brand-border bg-white" />
        </div>
      </div>
    </main>
  );
}

function UnavailableProject() { const t = useTranslations("companyProjects"); return <main className="mx-auto flex min-h-[60vh] w-[calc(100%-36px)] max-w-[720px] items-center justify-center py-12 text-center"><div><h1 className="m-0 text-2xl font-semibold text-ink">{t("detail.unavailableTitle")}</h1><p className="mt-3 mb-0 text-sm leading-6 text-muted">{t("detail.unavailableLead")}</p><Link className="mt-6 inline-flex min-h-11 items-center rounded-sm bg-brand px-5 text-sm font-semibold text-white" href={routes.companyProjects}>{t("detail.back")}</Link></div></main>; }
