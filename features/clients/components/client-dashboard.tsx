"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { DashboardCardsSkeleton } from "@/features/shared/components/skeletons";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export type Project = FunctionReturnType<typeof api.projects.index.getMyProjects>[number];
export type ClientDashboardProfile = NonNullable<FunctionReturnType<typeof api.clients.getMyProfile>>;
type DashboardUser = {
  accountType: "client" | "company" | "admin" | null;
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
  if (user.accountType === "company") {
    return user.onboardingStatus === "completed" ? routes.companyDashboard : routes.companyOnboarding;
  }
  if (user.accountType === "client" && user.onboardingStatus !== "completed") {
    return routes.clientOnboarding;
  }
  if (user.accountType !== "client") return routes.home;
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
  return (
    <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-[18px] py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
      <header className="flex flex-col gap-6 border-b border-brand-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-3 text-[0.68rem] font-bold tracking-[0.18em] text-brand uppercase">{t("eyebrow")}</p>
          <h1 className="m-0 text-[clamp(2rem,5vw,3.25rem)] leading-[1.04] font-semibold tracking-[-0.045em] text-ink">
            {t(`greeting.${greeting}`, { name: firstName || t("fallbackName") })}
          </h1>
          <p className="mt-4 mb-0 max-w-2xl text-base leading-7 text-muted">{t("lead")}</p>
        </div>
        <Link className="button button-primary shrink-0 self-start sm:self-auto" href={routes.postProjectWizard}>
          <PlusIcon />
          {t("postProject")}
        </Link>
      </header>

      <section aria-labelledby="account-readiness-title" className="pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-[0.12em] text-brand uppercase">{t("setup.eyebrow")}</p>
            <h2 className="m-0 text-[1.35rem] font-semibold tracking-[-0.03em] text-ink" id="account-readiness-title">{t("setup.title")}</h2>
          </div>
          <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-brand focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand" href={routes.clientProfile}>{t("setup.manage")}</Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {profile.firstName && profile.lastName && profile.city ? <SetupCard description={t("setup.profile.description")} title={t("setup.profile.title")} /> : null}
          {profile.phone ? <SetupCard description={t("setup.phone.description")} title={t("setup.phone.title")} /> : null}
        </div>
      </section>

      <section aria-labelledby="project-overview-title" className="pt-11">
        <ClientProjectsView projects={projects} />
      </section>
    </main>
  );
}

export function ClientProjectsView({ projects }: { projects: Project[] }) {
  const t = useTranslations("clientDashboard");
  const tProjects = useTranslations("clientProjects");
  const [view, setView] = useState<"grid" | "list">("grid");
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  function updateScrollState() {
    const node = scrollerRef.current;
    if (!node) return;
    const max = node.scrollWidth - node.clientWidth;
    setCanPrev(node.scrollLeft > 8);
    setCanNext(max - node.scrollLeft > 8);
  }

  useEffect(() => {
    if (view !== "grid") return;
    const node = scrollerRef.current;
    if (!node) return;
    updateScrollState();
    const onScroll = () => updateScrollState();
    node.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      node.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [view, projects.length]);

  function scrollByPage(direction: -1 | 1) {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.max(280, node.clientWidth * 0.72), behavior: "smooth" });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-[1.7rem] font-semibold tracking-[-0.04em] text-ink" id="project-overview-title">
          {t("overview.title")}
        </h2>
        <div className="inline-flex rounded-full border border-brand-border bg-white p-1" role="group">
          <ViewToggleButton active={view === "grid"} label={tProjects("gridView")} onClick={() => setView("grid")}>
            <GridIcon />
          </ViewToggleButton>
          <ViewToggleButton active={view === "list"} label={tProjects("listView")} onClick={() => setView("list")}>
            <ListIcon />
          </ViewToggleButton>
        </div>
      </div>

      {view === "grid" ? (
        <div className="relative mt-5">
          <button
            aria-label={tProjects("previousProjects")}
            className="absolute top-1/2 -left-4 z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-brand-border bg-white text-ink shadow-[0_8px_24px_rgb(23_61_99_/_0.1)] transition-[opacity,transform] duration-150 hover:-translate-y-[calc(50%+2px)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-0 md:inline-flex"
            disabled={!canPrev}
            onClick={() => scrollByPage(-1)}
            type="button"
          >
            <ChevronIcon direction="left" />
          </button>
          <ul
            aria-label={tProjects("carouselLabel")}
            className="m-0 flex list-none snap-x snap-mandatory gap-4 overflow-x-auto p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            ref={scrollerRef}
          >
            {projects.map((project) => (
              <li className="w-[min(100%,340px)] shrink-0 snap-start lg:w-[calc((100%-2rem)/3)]" key={project.id}>
                <ClientProjectCard layout="grid" project={project} />
              </li>
            ))}
            <li className="w-[min(100%,340px)] shrink-0 snap-start lg:w-[calc((100%-2rem)/3)]">
              <PostProjectCard />
            </li>
          </ul>
          <button
            aria-label={tProjects("nextProjects")}
            className="absolute top-1/2 -right-4 z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-brand-border bg-white text-ink shadow-[0_8px_24px_rgb(23_61_99_/_0.1)] transition-[opacity,transform] duration-150 hover:-translate-y-[calc(50%+2px)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-0 md:inline-flex"
            disabled={!canNext}
            onClick={() => scrollByPage(1)}
            type="button"
          >
            <ChevronIcon direction="right" />
          </button>
        </div>
      ) : (
        <ul aria-label={tProjects("carouselLabel")} className="mt-5 m-0 list-none overflow-hidden rounded-[24px] border border-brand-border bg-white p-0">
          {projects.length === 0 ? (
            <li className="p-2"><PostProjectCard compact /></li>
          ) : (
            projects.map((project) => (
              <li className="border-b border-brand-border last:border-b-0" key={project.id}>
                <ClientProjectCard layout="list" project={project} />
              </li>
            ))
          )}
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
  const isDraft = project.status === "draft" || project.canResume;
  const title = project.title ?? t("untitled");
  const actionHref = isDraft
    ? ({ pathname: routes.postProjectWizard, query: { projectId: project.id } } as const)
    : ({ pathname: routes.clientProject, params: { projectId: project.id } } as const);
  const actionLabel = isDraft ? t("fillDraft") : t("viewProject");
  const hint = isDraft
    ? t("draftHint")
    : project.status === "pending_review"
      ? t("reviewHint")
      : t(`status.${project.status}`);

  if (layout === "list") {
    return (
      <article className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
            <ProjectIcon />
          </span>
          <h3 className="m-0 truncate text-base font-semibold tracking-[-0.02em] text-ink">{title}</h3>
        </div>
        <StatusBadge status={project.status} />
        <p className="m-0 min-w-0 flex-1 text-sm text-muted sm:truncate">{hint}</p>
        <div className="flex items-center gap-2">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-brand px-5 text-sm font-semibold text-brand transition-[transform,background-color] duration-150 hover:bg-brand-soft active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand"
            href={actionHref}
          >
            {actionLabel}
          </Link>
          <ProjectCardMenu actionHref={actionHref} actionLabel={actionLabel} title={title} />
        </div>
      </article>
    );
  }

  return (
    <article className="flex h-full min-h-[220px] min-w-0 flex-col rounded-[24px] border border-brand-border bg-white p-6 shadow-[0_10px_30px_rgb(23_61_99_/_0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
            <ProjectIcon />
          </span>
          <h3 className="m-0 line-clamp-2 text-base font-semibold tracking-[-0.02em] text-ink">{title}</h3>
        </div>
        <ProjectCardMenu actionHref={actionHref} actionLabel={actionLabel} title={title} />
      </div>
      <div className="mt-5">
        <StatusBadge status={project.status} />
      </div>
      <p className="mt-4 mb-0 line-clamp-2 text-sm leading-6 text-muted">{hint}</p>
      <div className="mt-auto flex justify-end pt-6">
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-brand px-5 text-sm font-semibold text-brand transition-[transform,background-color] duration-150 hover:bg-brand-soft active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand"
          href={actionHref}
        >
          {actionLabel}
        </Link>
      </div>
    </article>
  );
}

export function PostProjectCard({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("clientDashboard");
  return (
    <Link
      className={`group flex min-h-[220px] flex-col items-center justify-center rounded-[24px] border border-brand-border bg-white text-center text-ink transition-[border-color,background-color,transform] duration-150 hover:border-brand hover:bg-brand-soft/30 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand ${compact ? "min-h-24 rounded-[18px]" : "h-full"}`}
      href={routes.postProjectWizard}
    >
      <span className="inline-flex items-center gap-2 text-base font-medium text-muted">
        <PlusIcon />
        {t("postCard.title")}
      </span>
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

function SetupCard({ title, description }: { title: string; description: string }) {
  return (
    <article className="flex items-start gap-4 rounded-[16px] border border-brand-border bg-white p-5">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"><CheckIcon /></span>
      <div><h3 className="m-0 text-sm font-semibold text-ink">{title}</h3><p className="mt-1 mb-0 text-sm leading-6 text-muted">{description}</p></div>
    </article>
  );
}

export function greetingPeriod(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function casablancaHour(locale: string) {
  const value = new Intl.DateTimeFormat(locale, { hour: "2-digit", hourCycle: "h23", timeZone: "Africa/Casablanca" }).format(new Date());
  return Number.parseInt(value, 10);
}

function PlusIcon() {
  return <svg aria-hidden className="size-5" fill="none" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>;
}

function ProjectIcon() {
  return <svg aria-hidden className="size-5" fill="none" viewBox="0 0 24 24"><path d="M7 4.5h8l3 3V20H7V4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" /><path d="M15 4.5V8h3M10 12h5M10 15.5h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></svg>;
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
      className={`grid size-9 place-items-center rounded-full border-0 transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${active ? "bg-brand-soft text-ink" : "bg-transparent text-muted hover:text-ink"}`}
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
        className="grid size-9 shrink-0 place-items-center rounded-full border-0 bg-transparent text-muted transition-colors hover:bg-brand-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
          className="flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-ink hover:bg-brand-soft/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden className="size-4" fill="none" viewBox="0 0 16 16">
      <path
        d={direction === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
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
