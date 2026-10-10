"use client";

import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { resolveClientDashboardRedirect, type Project } from "@/features/clients/components/client-dashboard";
import { WorkspacePage, workspaceButton } from "@/features/shared/components/workspace-page";
import { Link, useRouter } from "@/i18n/navigation";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { routes } from "@/lib/routes";
import { MAD_AMOUNT_FORMAT } from "@/lib/money/mad";

export type ClientWorkTab = "projects" | "contracts";
const TABS: ClientWorkTab[] = ["projects", "contracts"];
/** A contract (Deal) can only exist once a Company has been selected. */
const CONTRACT_STATUSES: readonly Project["status"][] = ["company_selected", "in_progress", "completed"];

const TAB =
  "-mb-px inline-flex min-h-12 cursor-pointer items-center border-0 border-b-2 border-transparent bg-transparent px-0.5 text-lg font-medium whitespace-nowrap text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand aria-selected:border-ink aria-selected:text-ink";
const ROW_ACTION =
  "inline-flex min-h-10 shrink-0 items-center justify-center rounded-sm border border-brand-border bg-white px-4 text-sm font-semibold text-brand transition-[background-color,border-color,scale] duration-150 hover:border-brand/40 hover:bg-brand-soft/60 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand";

/** Client "Manage work": every project and every contract, as two tabs of one page. */
export function ClientWork({ initialTab }: { initialTab: ClientWorkTab }) {
  const t = useTranslations("clientWork");
  const router = useRouter();
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "client" && user.onboardingStatus === "completed";
  const projects = useQuery(api.projects.index.getMyProjects, canLoad ? {} : "skip");
  const [tab, setTab] = useState(initialTab);
  const [linkedTab, setLinkedTab] = useState(initialTab);
  const [search, setSearch] = useState("");
  // Follow navbar links that change the query while this page stays mounted.
  if (linkedTab !== initialTab) {
    setLinkedTab(initialTab);
    setTab(initialTab);
  }

  useEffect(() => {
    const destination = resolveClientDashboardRedirect(user);
    if (destination) router.replace(destination);
  }, [router, user]);

  function selectTab(next: ClientWorkTab) {
    setTab(next);
    setSearch("");
    router.replace({ pathname: routes.clientWork, query: next === "contracts" ? { tab: next } : {} }, { scroll: false });
  }

  function onTabKey(event: React.KeyboardEvent, current: ClientWorkTab) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(current) + 1) % TABS.length];
    selectTab(next);
    document.getElementById(`client-work-tab-${next}`)?.focus();
  }

  if (!canLoad || projects === undefined) {
    return (
      <WorkspacePage busy label={t("loading")}>
        <div className="skeleton-block h-10 w-64 rounded-sm" />
        <div className="skeleton-block mt-6 h-11 w-full max-w-xl rounded-sm" />
        <div className="skeleton-block mt-6 h-72 rounded-sm" />
      </WorkspacePage>
    );
  }

  const needle = search.trim().toLocaleLowerCase();
  const matches = (project: Project) => !needle || (project.title ?? "").toLocaleLowerCase().includes(needle);
  const visibleProjects = projects.filter(matches);
  const contractProjects = projects.filter((project) => CONTRACT_STATUSES.includes(project.status));
  const visibleContracts = contractProjects.filter(matches);

  return (
    <WorkspacePage label={t("label")}>
      <div aria-label={t("tabsLabel")} className="flex gap-6 overflow-x-auto border-b border-brand-border" role="tablist">
        {TABS.map((item) => (
          <button
            aria-controls="client-work-panel"
            aria-selected={tab === item}
            className={TAB}
            id={`client-work-tab-${item}`}
            key={item}
            onClick={() => selectTab(item)}
            onKeyDown={(event) => onTabKey(event, item)}
            role="tab"
            tabIndex={tab === item ? 0 : -1}
            type="button"
          >
            {t(`tabs.${item}`)}
          </button>
        ))}
      </div>

      <div aria-labelledby={`client-work-tab-${tab}`} id="client-work-panel" role="tabpanel">
        <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="m-0 text-[1.75rem] leading-tight font-semibold tracking-[-0.03em] text-balance text-ink sm:text-[2.25rem]">
            {t(`tabs.${tab}`)}
          </h1>
          {tab === "projects" ? (
            <Link className={`${workspaceButton.primary} shrink-0 self-start sm:self-auto`} href={routes.postProjectWizard}>
              {t("postProject")}
            </Link>
          ) : null}
        </header>

        <label className="mt-5 flex min-h-11 w-full max-w-2xl items-center gap-2.5 rounded-sm border border-brand-border bg-white px-3.5 text-sm transition-[border-color,box-shadow] duration-150 focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]">
          <Search aria-hidden className="size-[18px] shrink-0 text-muted" />
          <span className="sr-only">{t(tab === "projects" ? "searchProjects" : "searchContracts")}</span>
          <input
            className="h-11 w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-muted/75"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t(tab === "projects" ? "searchProjects" : "searchContracts")}
            type="search"
            value={search}
          />
        </label>

        {tab === "projects" ? (
          projects.length === 0 ? (
            <EmptyState lead={t("noProjectsLead")} title={t("noProjectsTitle")}>
              <Link className={workspaceButton.primary} href={routes.postProjectWizard}>{t("postProject")}</Link>
            </EmptyState>
          ) : visibleProjects.length === 0 ? (
            <p className="mt-8 mb-0 text-sm text-muted" role="status">{t("noResults")}</p>
          ) : (
            <>
              <ul className="mt-6 mb-0 list-none divide-y divide-brand-border border-y border-brand-border p-0">
                {visibleProjects.map((project) => <ProjectRow key={project.id} project={project} />)}
              </ul>
              <p className="mt-4 mb-0 text-sm text-muted tabular-nums">{t("projectCount", { count: visibleProjects.length })}</p>
            </>
          )
        ) : contractProjects.length === 0 ? (
          <EmptyState lead={t("noContractsLead")} title={t("noContractsTitle")}>
            <Link className={workspaceButton.primary} href={routes.postProjectWizard}>{t("postProject")}</Link>
            <button className={workspaceButton.secondary} onClick={() => selectTab("projects")} type="button">{t("reviewProjects")}</button>
          </EmptyState>
        ) : visibleContracts.length === 0 ? (
          <p className="mt-8 mb-0 text-sm text-muted" role="status">{t("noResults")}</p>
        ) : (
          <ul className="mt-6 mb-0 list-none divide-y divide-brand-border border-y border-brand-border p-0 empty:hidden">
            {visibleContracts.map((project) => <ContractRow key={project.id} project={project} />)}
          </ul>
        )}
      </div>
    </WorkspacePage>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const t = useTranslations("clientWork");
  const tProjects = useTranslations("clientProjects");
  const locale = useLocale();
  const isDraft = project.status === "draft" || project.canResume;
  const href = isDraft
    ? ({ pathname: routes.postProjectWizard, query: { projectId: project.id } } as const)
    : ({ pathname: routes.clientProject, params: { projectId: project.id } } as const);
  return (
    <li className="flex flex-col gap-3 px-1 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <h2 className="m-0 text-xl font-medium tracking-[-0.02em] break-words text-ink">{project.title ?? tProjects("untitled")}</h2>
        <p className="mt-1 mb-0 text-sm text-muted tabular-nums">
          {t("created", { date: formatMarketplaceDateTime(project.createdAt, locale, { dateStyle: "medium" }) })}
        </p>
        <p className="mt-2.5 mb-0 text-sm font-medium text-ink">
          {project.status === "draft" ? tProjects("draftBadge") : tProjects(`status.${project.status}`)}
        </p>
      </div>
      <Link className={`${ROW_ACTION} self-start sm:self-auto`} href={href}>
        {isDraft ? tProjects("fillDraft") : tProjects("viewProject")}
      </Link>
    </li>
  );
}

/** One contract row; reads the Deal through the existing owner-checked query. */
function ContractRow({ project }: { project: Project }) {
  const t = useTranslations("clientWork");
  const tProjects = useTranslations("clientProjects");
  const format = useFormatter();
  const locale = useLocale();
  const deal = useQuery(api.deals.index.getByProject, { projectId: project.id });
  // A selected project without a Deal record has no contract to show.
  if (deal === null) return null;
  const date = (value: number) => formatMarketplaceDateTime(value, locale, { dateStyle: "medium" });
  return (
    <li className="flex flex-col gap-3 px-1 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <h2 className="m-0 text-xl font-medium tracking-[-0.02em] break-words text-ink">{project.title ?? tProjects("untitled")}</h2>
        {deal === undefined ? (
          <p className="mt-1 mb-0 text-sm text-muted" role="status">{t("contract.loading")}</p>
        ) : (
          <>
            <dl className="mt-1.5 mb-0 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {deal.companyName ? <Meta label={t("contract.company")}>{deal.companyName}</Meta> : null}
              <Meta label={t("contract.amount")}>
                {format.number(deal.agreedAmountMad, MAD_AMOUNT_FORMAT)}
              </Meta>
            </dl>
            <p className="mt-2.5 mb-0 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted tabular-nums">
              <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${deal.status === "completed" ? "bg-emerald-50 text-emerald-800" : deal.status === "cancelled" ? "bg-slate-100 text-slate-700" : "bg-brand-soft text-brand-dark"}`}>
                {t(`contract.status.${deal.status}`)}
              </span>
              {t("contract.started", { date: date(deal.createdAt) })}
              {deal.completedAt !== null ? <span>· {t("contract.completed", { date: date(deal.completedAt) })}</span> : null}
            </p>
          </>
        )}
      </div>
      <Link className={`${ROW_ACTION} self-start sm:self-auto`} href={{ pathname: routes.clientProject, params: { projectId: project.id } }}>
        {t("contract.viewProject")}
      </Link>
    </li>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 min-w-0 font-medium break-words text-ink">{children}</dd>
    </div>
  );
}

function EmptyState({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className="mt-6 rounded-sm bg-white px-5 py-14 text-center sm:px-8">
      <h2 className="m-0 text-xl font-semibold tracking-[-0.02em] text-balance text-ink">{title}</h2>
      <p className="mx-auto mt-2 mb-0 max-w-xl text-sm leading-6 text-pretty text-muted">{lead}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2.5">{children}</div>
    </div>
  );
}
