"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { DashboardCardsSkeleton } from "@/features/shared/components/skeletons";
import { Link, useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { routes } from "@/lib/routes";

export type Project = FunctionReturnType<typeof api.projects.index.getMyProjects>[number];
export type ClientDashboardProfile = NonNullable<FunctionReturnType<typeof api.clients.getMyProfile>>;
type DashboardUser = {
  accountType: "client" | "company" | "admin" | "seo_team" | null;
  onboardingStatus: "pending" | "completed" | null;
} | null | undefined;

export function ClientDashboard() {
  const tUx = useTranslations("ux");
  const locale = useLocale();
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "client" && user.onboardingStatus === "completed";
  const projects = useQuery(api.projects.index.getMyProjects, canLoad ? {} : "skip");
  const profile = useQuery(api.clients.getMyProfile, canLoad ? {} : "skip");
  const router = useRouter();

  useEffect(() => {
    const destination = resolveClientDashboardRedirect(user);
    if (destination) router.replace(destination);
  }, [router, user]);

  if (
    user === undefined ||
    user === null ||
    user.accountType !== "client" ||
    user.onboardingStatus !== "completed" ||
    projects === undefined ||
    profile === undefined ||
    profile === null
  ) {
    return <DashboardCardsSkeleton label={tUx("loading.dashboard")} />;
  }

  return (
    <ClientDashboardView
      firstName={user.firstName || profile.firstName}
      hour={casablancaHour(locale)}
      profile={profile}
      projects={projects}
    />
  );
}

export function resolveClientDashboardRedirect(user: DashboardUser) {
  if (user === undefined) return null;
  if (user === null) return routes.signIn;
  if (user.accountType === "client" && user.onboardingStatus !== "completed") {
    return routes.clientOnboarding;
  }
  if (user.accountType !== "client") return workspaceRouteForUser(user);
  return null;
}

export function ClientDashboardView({
  firstName,
  hour,
  profile,
  projects,
}: {
  firstName: string;
  hour: number;
  profile: ClientDashboardProfile;
  projects: Project[];
}) {
  const t = useTranslations("clientDashboard");
  const greeting = greetingPeriod(hour);
  const readiness = [
    profile.firstName && profile.lastName && profile.city ? t("setup.profile.title") : null,
    profile.phone ? t("setup.phone.title") : null,
  ].filter((item) => item !== null);
  return (
    <main className="mx-auto w-[calc(100%-32px)] max-w-[1200px] flex-1 py-6 sm:w-[calc(100%-48px)] sm:py-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="m-0 text-sm font-semibold text-muted">{t("eyebrow")}</p>
          <h1 className="mt-1.5 mb-0 text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.035em] text-balance break-words text-ink sm:text-[2.25rem]">
            {t(`greeting.${greeting}`, { name: firstName || t("fallbackName") })}
          </h1>
          <p className="mt-2 mb-0 max-w-2xl text-[0.95rem] leading-6 text-pretty text-muted">{t("lead")}</p>
        </div>
        <Link className={`${PRIMARY_ACTION} shrink-0 self-start sm:self-auto`} href={routes.postProjectWizard}>
          <PlusIcon />
          {t("postProject")}
        </Link>
      </header>

      <section
        aria-labelledby="account-readiness-title"
        className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-brand-border bg-white px-4 py-2.5 sm:px-5"
      >
        <h2 className="m-0 inline-flex items-center gap-2.5 text-sm font-semibold text-ink" id="account-readiness-title">
          <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-sm bg-emerald-50 text-emerald-700"><CheckIcon /></span>
          {t("setup.title")}
        </h2>
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm text-muted">
          {readiness.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <Link className="ml-auto inline-flex min-h-10 items-center rounded-md text-sm font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" href={routes.clientProfile}>{t("setup.manage")}</Link>
      </section>

      <section aria-labelledby="project-overview-title" className="mt-9">
        <ClientProjectsView projects={projects} />
      </section>
    </main>
  );
}

const PRIMARY_ACTION =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-brand px-5 text-sm font-semibold text-white! transition-[background-color,scale] duration-150 hover:bg-brand-hover active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand";
const CARD_ACTION =
  "inline-flex min-h-10 items-center justify-center rounded-sm border border-brand-border bg-white px-4 text-sm font-semibold text-brand transition-[background-color,border-color,scale] duration-150 hover:border-brand/40 hover:bg-brand-soft/60 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand";

/** One card per view on phones, two on tablets, three on desktop; the rest scroll sideways. */
const CAROUSEL_ITEM =
  "w-[min(86%,340px)] shrink-0 snap-start sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]";

const STAT_GROUPS = {
  drafts: ["draft"],
  review: ["pending_review", "needs_changes"],
  active: ["published", "in_discussion", "company_selected", "in_progress"],
  completed: ["completed"],
} as const satisfies Record<string, readonly Project["status"][]>;
const STATS = Object.keys(STAT_GROUPS) as (keyof typeof STAT_GROUPS)[];

export function ClientProjectsView({ projects }: { projects: Project[] }) {
  const t = useTranslations("clientDashboard");
  const tProjects = useTranslations("clientProjects");
  const [view, setView] = useState<"grid" | "list">("grid");
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    const node = scrollerRef.current;
    if (view !== "grid" || !node) return;
    const update = () => {
      setCanPrev(node.scrollLeft > 8);
      setCanNext(node.scrollWidth - node.clientWidth - node.scrollLeft > 8);
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      node.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [view, projects.length]);

  function scrollByPage(direction: -1 | 1) {
    const node = scrollerRef.current;
    node?.scrollBy({ left: direction * Math.max(280, node.clientWidth * 0.72), behavior: "smooth" });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-xl font-semibold tracking-[-0.025em] text-ink sm:text-2xl" id="project-overview-title">
            {t("overview.title")}
          </h2>
          <p className="mt-1 mb-0 text-sm text-muted">
            {projects.length ? t("overview.count", { count: projects.length }) : t("overview.empty")}
          </p>
        </div>
        <div className="inline-flex rounded-sm border border-brand-border bg-white p-1" role="group">
          <ViewToggleButton active={view === "grid"} label={tProjects("gridView")} onClick={() => setView("grid")}>
            <GridIcon />
          </ViewToggleButton>
          <ViewToggleButton active={view === "list"} label={tProjects("listView")} onClick={() => setView("list")}>
            <ListIcon />
          </ViewToggleButton>
        </div>
      </div>

      {projects.length ? (
        <dl aria-label={t("stats.label")} className="mt-5 mb-0 grid grid-cols-2 overflow-hidden rounded-2xl border border-brand-border bg-brand-border gap-px sm:grid-cols-4">
          {STATS.map((stat) => (
            <div className="flex flex-col-reverse bg-white px-4 py-3.5 sm:px-5" key={stat}>
              <dt className="mt-0.5 text-sm text-muted">{t(`stats.${stat}`)}</dt>
              <dd className="m-0 text-2xl font-semibold tracking-[-0.02em] text-ink tabular-nums">
                {projects.filter((project) => (STAT_GROUPS[stat] as readonly string[]).includes(project.status)).length}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {view === "grid" ? (
        <div className="relative mt-4">
          <CarouselButton direction="left" disabled={!canPrev} label={tProjects("previousProjects")} onClick={() => scrollByPage(-1)} />
          {/* Negative margin plus padding keeps card hover shadows from being clipped by the scroller. */}
          <ul
            aria-label={tProjects("carouselLabel")}
            className="-mx-1 mb-0 flex list-none snap-x snap-mandatory scroll-px-1 gap-4 overflow-x-auto overscroll-x-contain px-1 pt-1 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            ref={scrollerRef}
          >
            {projects.map((project) => (
              <li className={CAROUSEL_ITEM} key={project.id}>
                <ClientProjectCard layout="grid" project={project} />
              </li>
            ))}
            <li className={CAROUSEL_ITEM}>
              <PostProjectCard />
            </li>
          </ul>
          <CarouselButton direction="right" disabled={!canNext} label={tProjects("nextProjects")} onClick={() => scrollByPage(1)} />
        </div>
      ) : (
        <ul aria-label={tProjects("carouselLabel")} className="mt-4 mb-0 list-none overflow-hidden rounded-2xl border border-brand-border bg-white p-0">
          {projects.map((project) => (
            <li className="border-b border-brand-border" key={project.id}>
              <ClientProjectCard layout="list" project={project} />
            </li>
          ))}
          <li className="p-2"><PostProjectCard compact /></li>
        </ul>
      )}
    </div>
  );
}

export function ClientProjectCard({
  project,
  layout = "grid",
}: {
  project: Project;
  layout?: "grid" | "list";
}) {
  const t = useTranslations("clientProjects");
  const tWizard = useTranslations("projectWizard");
  const locale = useLocale();
  const isDraft = project.status === "draft" || project.canResume;
  const title = project.title ?? t("untitled");
  const actionHref = isDraft
    ? ({ pathname: routes.postProjectWizard, query: { projectId: project.id } } as const)
    : ({ pathname: routes.clientProject, params: { projectId: project.id } } as const);
  const actionLabel = isDraft ? t("fillDraft") : t("viewProject");
  // Other statuses are already stated by the badge; only these add guidance.
  const hint = isDraft ? t("draftHint") : project.status === "pending_review" ? t("reviewHint") : null;
  const place = [
    project.city ? tWizard(`cityOptions.${project.city}`) : null,
    project.primaryCategory ? tWizard(`categoryOptions.${project.primaryCategory}`) : null,
  ].filter(Boolean).join(" · ");
  const created = t("createdOn", { date: formatMarketplaceDateTime(project.createdAt, locale, { dateStyle: "medium" }) });
  const meta = [place, created].filter(Boolean).join(" · ");

  if (layout === "list") {
    return (
      <article className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="m-0 min-w-0 truncate text-[0.95rem] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
            <StatusBadge status={project.status} />
          </div>
          <p className="mt-1 mb-0 truncate text-sm text-muted">{hint ? `${hint} · ${meta}` : meta}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link className={CARD_ACTION} href={actionHref}>{actionLabel}</Link>
          <ProjectCardMenu actionHref={actionHref} actionLabel={actionLabel} title={title} />
        </div>
      </article>
    );
  }

  return (
    <article className="flex h-full min-w-0 flex-col rounded-2xl border border-brand-border bg-white p-5 transition-[border-color,box-shadow] duration-150 hover:border-brand/30 hover:shadow-[0_8px_24px_rgb(23_61_99_/_0.06)]">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge status={project.status} />
        <ProjectCardMenu actionHref={actionHref} actionLabel={actionLabel} title={title} />
      </div>
      <h3 className="mt-3 mb-0 truncate text-[1.05rem] leading-6 font-semibold tracking-[-0.02em] text-ink" title={title}>{title}</h3>
      {place ? <p className="mt-1.5 mb-0 truncate text-sm leading-5 text-muted">{place}</p> : null}
      <p className={`${place ? "mt-0.5" : "mt-1.5"} mb-0 truncate text-sm leading-5 text-muted tabular-nums`}>{created}</p>
      {hint ? <p className="mt-3 mb-0 line-clamp-2 border-t border-brand-border pt-3 text-sm leading-5 text-ink/80">{hint}</p> : null}
      <div className="mt-auto pt-5">
        <Link className={`${CARD_ACTION} w-full`} href={actionHref}>{actionLabel}</Link>
      </div>
    </article>
  );
}

export function PostProjectCard({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("clientDashboard");
  return (
    <Link
      className={`group flex flex-col items-center justify-center gap-1.5 border border-dashed border-[#c3d0d9] px-5 text-center transition-[border-color,background-color,scale] duration-150 hover:border-brand hover:bg-brand-soft/40 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand ${compact ? "min-h-16 rounded-sm py-3" : "h-full min-h-44 rounded-2xl py-6"}`}
      href={routes.postProjectWizard}
    >
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
        <PlusIcon />
        {t("postCard.title")}
      </span>
      {compact ? null : <span className="max-w-[26ch] text-sm leading-5 text-pretty text-muted">{t("postCard.description")}</span>}
    </Link>
  );
}

export function StatusBadge({ status }: { status: Project["status"] }) {
  const t = useTranslations("clientProjects");
  const label = status === "draft" ? t("draftBadge") : t(`status.${status}`);
  const tone =
    status === "pending_review"
      ? "bg-amber-50 text-amber-800"
      : status === "draft"
        ? "bg-brand-soft text-brand-dark"
        : status === "completed"
          ? "bg-emerald-50 text-emerald-800"
          : "bg-slate-100 text-slate-700";
  return (
    <span
      aria-label={t("statusAccessible", { status: t(`status.${status}`) })}
      className={`inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

export function greetingPeriod(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function casablancaHour(locale: string) {
  const value = formatMarketplaceDateTime(new Date(), locale, { hour: "2-digit", hourCycle: "h23" });
  return Number.parseInt(value, 10);
}

function PlusIcon() {
  return <svg aria-hidden className="size-5" fill="none" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>;
}

function CheckIcon() {
  return <svg aria-hidden className="size-4" fill="none" viewBox="0 0 20 20"><path d="m5.5 10 3 3 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>;
}

function ViewToggleButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`grid size-9 place-items-center rounded-sm border-0 transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${active ? "bg-brand-soft text-ink" : "bg-transparent text-muted hover:text-ink"}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ProjectCardMenu({
  title,
  actionHref,
  actionLabel,
}: {
  title: string;
  actionHref:
    | { pathname: typeof routes.postProjectWizard; query: { projectId: string } }
    | { pathname: typeof routes.clientProject; params: { projectId: string } };
  actionLabel: string;
}) {
  const t = useTranslations("clientProjects");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("openCardMenu")}
        className="grid size-9 shrink-0 place-items-center rounded-sm border-0 bg-transparent text-muted transition-colors hover:bg-brand-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <MoreIcon />
      </button>
      <div
        className={
          open
            ? "absolute top-[calc(100%+6px)] right-0 z-20 w-44 rounded-xl border border-brand-border bg-white p-1 shadow-[0_16px_40px_rgb(23_61_99_/_0.12)]"
            : "hidden"
        }
        id={menuId}
        role="menu"
      >
        <Link
          className="flex min-h-10 items-center rounded-sm px-3 text-sm font-medium text-ink hover:bg-brand-soft/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          href={actionHref}
          onClick={() => setOpen(false)}
          role="menuitem"
        >
          {actionLabel}
        </Link>
        <p className="sr-only">{title}</p>
      </div>
    </div>
  );
}

function GridIcon() {
  return (
    <svg aria-hidden className="size-4" fill="none" viewBox="0 0 16 16">
      <rect height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" width="6" x="1.5" y="1.5" />
      <rect height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" width="6" x="8.5" y="1.5" />
      <rect height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" width="6" x="1.5" y="8.5" />
      <rect height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" width="6" x="8.5" y="8.5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg aria-hidden className="size-4" fill="none" viewBox="0 0 16 16">
      <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function CarouselButton({
  direction,
  disabled,
  label,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`absolute top-1/2 z-10 hidden size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm border border-brand-border bg-white text-ink shadow-[0_8px_24px_rgb(23_61_99_/_0.12)] transition-[opacity,scale,background-color] duration-150 hover:bg-brand-soft active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-0 md:inline-flex ${direction === "left" ? "-left-5" : "-right-5"}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <svg aria-hidden className="size-4" fill="none" viewBox="0 0 16 16">
        <path d={direction === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    </button>
  );
}

function MoreIcon() {
  return (
    <svg aria-hidden className="size-5" fill="currentColor" viewBox="0 0 20 20">
      <circle cx="10" cy="4.5" r="1.4" />
      <circle cx="10" cy="10" r="1.4" />
      <circle cx="10" cy="15.5" r="1.4" />
    </svg>
  );
}
