"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ChevronDown, Check as CheckIcon, ExternalLink, Search as SearchIconLucide } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "@/convex/_generated/api";
import { projectBudgetRanges, projectCategories, projectCities, projectPostedWindows, projectPropertyTypes, projectSurfaceRanges, projectTimelines } from "@/convex/projects/constants";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { routes } from "@/lib/routes";
import { joinClassNames } from "@/lib/utils";

type User = FunctionReturnType<typeof api.users.currentUser> | undefined;
type Project = FunctionReturnType<typeof api.projects.marketplace.listCompanyMarketplaceProjects>["page"][number];
type Details = NonNullable<FunctionReturnType<typeof api.projects.marketplace.getCompanyMarketplaceProject>>;
type Category = (typeof projectCategories)[number];
type Budget = (typeof projectBudgetRanges)[number];
type Timeline = (typeof projectTimelines)[number];
type PropertyType = (typeof projectPropertyTypes)[number];
type SurfaceRange = (typeof projectSurfaceRanges)[number];
type PostedWindow = (typeof projectPostedWindows)[number];
type SortOption = "newest" | "oldest" | "budget_high" | "budget_low";

const PAGE_SIZE = 10;
const SORT_OPTIONS: SortOption[] = ["newest", "oldest", "budget_high", "budget_low"];

export function resolveCompanyProjectsRedirect(user: User) {
  if (user === undefined) return null;
  if (user === null) return routes.signIn;
  if (user.accountType !== "company") return workspaceRouteForUser(user);
  if (user.onboardingStatus !== "completed") return routes.companyOnboarding;
  return null;
}

export function CompanyProjectMarketplace({ initialSearch = "" }: { initialSearch?: string }) {
  const t = useTranslations("companyProjects");
  const tWizard = useTranslations("projectWizard");
  const user = useQuery(api.users.currentUser);
  const router = useRouter();
  const canBrowse = user?.accountType === "company" && user.onboardingStatus === "completed";
  const [search, setSearch] = useState(initialSearch);
  const [citySearch, setCitySearch] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgetRanges, setBudgetRanges] = useState<Budget[]>([]);
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [surfaceRanges, setSurfaceRanges] = useState<SurfaceRange[]>([]);
  const [postedWindows, setPostedWindows] = useState<PostedWindow[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const debouncedSearch = useDebouncedValue(search, 250);
  const debouncedCitySearch = useDebouncedValue(citySearch, 250);
  const [postedNow, setPostedNow] = useState<number | undefined>(undefined);

  useEffect(() => {
    const destination = resolveCompanyProjectsRedirect(user);
    if (destination) router.replace(destination);
  }, [router, user]);

  const matchingCities = useMemo(() => {
    const query = normalizeFilterSearch(debouncedCitySearch);
    if (!query) return undefined;
    return projectCities.filter((item) =>
      normalizeFilterSearch(tWizard(`cityOptions.${item}`)).includes(query),
    );
  }, [debouncedCitySearch, tWizard]);

  const queryArgs = useMemo(
    () => {
      if (!canBrowse) return "skip" as const;
      if (postedWindows.length > 0 && postedNow === undefined) return "skip" as const;
      return {
        search: debouncedSearch.trim() || undefined,
        cities: matchingCities,
        categories: categories.length > 0 ? categories : undefined,
        budgetRanges: budgetRanges.length > 0 ? budgetRanges : undefined,
        timelines: timelines.length > 0 ? timelines : undefined,
        propertyTypes: propertyTypes.length > 0 ? propertyTypes : undefined,
        surfaceRanges: surfaceRanges.length > 0 ? surfaceRanges : undefined,
        postedWindows: postedWindows.length > 0 ? postedWindows : undefined,
        sortBy,
        now: postedNow,
      };
    },
    [
      budgetRanges,
      canBrowse,
      categories,
      debouncedSearch,
      matchingCities,
      postedNow,
      postedWindows,
      propertyTypes,
      sortBy,
      surfaceRanges,
      timelines,
    ],
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.projects.marketplace.listCompanyMarketplaceProjects,
    queryArgs,
    { initialNumItems: PAGE_SIZE },
  );
  const projects = useMemo(
    () => Array.from(new Map(results.map((project) => [project.id, project])).values()),
    [results],
  );
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const clearFilters = useCallback(() => {
    setCitySearch("");
    setCategories([]);
    setBudgetRanges([]);
    setTimelines([]);
    setPropertyTypes([]);
    setSurfaceRanges([]);
    setPostedWindows([]);
    setPostedNow(undefined);
    setFiltersOpen(false);
  }, []);

  const onPostedWindowsChange = useCallback((value: PostedWindow[]) => {
    setPostedWindows(value);
    setPostedNow(value.length > 0 ? Date.now() : undefined);
  }, []);

  if (!canBrowse) return <ProjectFeedSkeleton label={t("loading")} />;

  const filterProps = {
    citySearch,
    categories,
    budgetRanges,
    timelines,
    propertyTypes,
    surfaceRanges,
    postedWindows,
    onCitySearchChange: setCitySearch,
    onCategoriesChange: setCategories,
    onBudgetRangesChange: setBudgetRanges,
    onTimelinesChange: setTimelines,
    onPropertyTypesChange: setPropertyTypes,
    onSurfaceRangesChange: setSurfaceRanges,
    onPostedWindowsChange,
    onClear: clearFilters,
  };

  return (
    <main className="min-h-[calc(100dvh-4.5rem)] bg-white">
      <header className="bg-white">
        <div className="mx-auto w-[calc(100%-36px)] max-w-[1120px] py-6 sm:w-[calc(100%-48px)] sm:py-8">
          <p className="m-0 text-[0.68rem] font-semibold tracking-[0.14em] text-brand uppercase">{t("eyebrow")}</p>
          <h1 className="mt-2 mb-0 max-w-[680px] text-[1.65rem] leading-9 font-semibold tracking-[-0.04em] text-ink sm:text-[2rem]">{t("title")}</h1>
          <p className="mt-2 mb-0 max-w-[680px] text-sm leading-6 text-muted sm:text-[0.98rem]">{t("lead")}</p>
          <label className="relative mt-6 block max-w-[680px]" htmlFor="project-marketplace-search">
            <span className="sr-only">{t("searchLabel")}</span>
            <SearchIcon />
            <input
              className="min-h-12 w-full rounded-full border border-brand-border bg-white pr-4 pl-11 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]"
              id="project-marketplace-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchPlaceholder")}
              type="search"
              value={search}
            />
          </label>
        </div>
      </header>

      <div className="mx-auto w-[calc(100%-36px)] max-w-[1120px] py-6 sm:w-[calc(100%-48px)] sm:py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 lg:pl-[268px]">
          <div className="flex items-center gap-3">
            <button
              aria-controls="project-mobile-filters"
              aria-expanded={filtersOpen}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold text-ink transition-transform duration-150 active:scale-[0.96] lg:hidden"
              onClick={() => setFiltersOpen(true)}
              type="button"
            >
              <FilterIcon />
              {t("filters.title")}
            </button>
            {status !== "LoadingFirstPage" ? <p aria-live="polite" className="m-0 text-sm text-muted">{t("loadedCount", { count: projects.length })}</p> : null}
          </div>
          <SortDropdown onChange={setSortBy} value={sortBy} />
        </div>

        <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-7">
          <aside className="hidden self-start lg:sticky lg:top-24 lg:block">
            <FilterFields {...filterProps} idPrefix="desktop" />
          </aside>

          <section aria-busy={status === "LoadingFirstPage" || status === "LoadingMore"} aria-label={t("resultsLabel")}>
            {status === "LoadingFirstPage" ? (
              <ProjectFeedSkeleton compact label={t("loading")} />
            ) : projects.length === 0 && status === "Exhausted" ? (
              <EmptyProjects onClear={clearFilters} />
            ) : (
              <>
                <ul className="m-0 list-none p-0">
                  {projects.map((project) => (
                    <li key={project.id}>
                      <ProjectCard
                        onOpen={() => setSelectedProjectId(project.id)}
                        project={project}
                        selected={selectedProjectId === project.id}
                      />
                    </li>
                  ))}
                </ul>
                {status === "LoadingMore" ? <ProjectFeedSkeleton compact label={t("loadingMore")} /> : null}
                {status === "CanLoadMore" ? (
                  <div className="mt-7 flex justify-center">
                    <button
                      className="inline-flex min-h-12 items-center justify-center rounded-xl border border-brand bg-white px-6 text-sm font-semibold text-brand transition-[background-color,color,transform] duration-150 hover:bg-brand hover:text-white active:scale-[0.96]"
                      onClick={() => loadMore(PAGE_SIZE)}
                      type="button"
                    >
                      {t("loadMore")}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      </div>

      <FilterSheet onClose={closeFilters} open={filtersOpen} title={t("filters.title")}>
        <FilterFields {...filterProps} idPrefix="mobile" showHeading={false} />
      </FilterSheet>
      <ProjectDetailsSheet onClose={() => setSelectedProjectId(null)} projectId={selectedProjectId} />
    </main>
  );
}

function ProjectCard({ project, selected, onOpen }: { project: Project; selected: boolean; onOpen: () => void }) {
  const t = useTranslations("companyProjects");
  const tWizard = useTranslations("projectWizard");
  const format = useFormatter();
  const category = project.primaryCategory === "other" && project.customCategoryText
    ? project.customCategoryText
    : tWizard(`categoryOptions.${project.primaryCategory}`);
  const property = project.propertyType ? tWizard(`propertyTypeOptions.${project.propertyType}`) : null;
  const surface = project.surface !== null && !project.surfaceUnknown
    ? t("card.surface", { value: format.number(project.surface) })
    : null;
  return (
    <article className={joinClassNames("group relative -mx-2 rounded-xl px-2 py-6 transition-[background-color] duration-150 ease-out focus-within:bg-[#f4f7fa] hover:bg-[#f4f7fa] sm:-mx-3 sm:px-3", selected && "bg-[#f4f7fa]")}>
      <button
        aria-label={t("card.openAria", { title: project.title })}
        className="absolute inset-0 z-10 cursor-pointer rounded-none outline-none focus-visible:ring-3 focus-visible:ring-brand focus-visible:ring-inset"
        onClick={onOpen}
        type="button"
      />
      <div className="pointer-events-none relative z-0">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
          <span>{tWizard(`cityOptions.${project.city}`)}</span><span aria-hidden>·</span><span>{category}</span>
          {project.publishedAt ? <><span aria-hidden>·</span><time dateTime={new Date(project.publishedAt).toISOString()}>{t("card.published", { date: format.dateTime(project.publishedAt, { dateStyle: "medium" }) })}</time></> : null}
        </div>
        <h2 className="mt-2 mb-0 text-[1.18rem] leading-7 font-semibold tracking-[-0.025em] text-ink transition-colors duration-150 group-hover:text-brand">
          {project.title}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <MetaPill>{tWizard(`budgetOptions.${project.budgetRange}`)}</MetaPill>
          <MetaPill>{tWizard(`timelineOptions.${project.timeline}`)}</MetaPill>
          {property ? <MetaPill>{property}</MetaPill> : null}
          {surface ? <MetaPill>{surface}</MetaPill> : null}
        </div>
        <p className="mt-3 mb-0 line-clamp-2 text-sm leading-6 text-ink/90">{project.description}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-xs leading-5 text-muted">
            {project.client ? t("card.client", { name: project.client.displayName, date: format.dateTime(project.client.joinedAt, { month: "short", year: "numeric" }) }) : t("card.clientPrivate")}
          </p>
          <span className="text-sm font-semibold text-brand">{t("viewProject")}</span>
        </div>
      </div>
    </article>
  );
}

export function ProjectDetailsSheet({ projectId, onClose }: { projectId: string | null; onClose: () => void }) {
  const t = useTranslations("companyProjects");
  const project = useQuery(
    api.projects.marketplace.getCompanyMarketplaceProject,
    projectId ? { projectId } : "skip",
  );
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!projectId) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, projectId]);

  if (!projectId) return null;
  const projectHref = { pathname: routes.companyProject, params: { projectId } } as const;
  const sheet = (
    <div className="fixed inset-0 z-[90]" role="presentation">
      <button
        aria-label={t("detail.close")}
        className="absolute inset-0 cursor-default bg-ink/50"
        onClick={onClose}
        type="button"
      />
      <section
        aria-label={project === null ? t("detail.unavailableTitle") : project?.title ?? t("detail.loading")}
        aria-modal="true"
        className="sheet-panel absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-[-20px_0_48px_rgb(10_25_38/0.18)] sm:w-[min(92vw,720px)] lg:w-[min(62vw,1040px)]"
        data-testid="project-detail-sheet"
        ref={panelRef}
        role="dialog"
      >
        <header className="sticky top-0 z-20 flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-[#e4e8eb] bg-white px-3 sm:min-h-16 sm:px-5">
          <button
            aria-label={t("detail.close")}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink transition-[background-color,transform] duration-150 hover:bg-[#f4f7fa] active:scale-[0.96]"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <BackIcon />
          </button>
          <Link
            className="inline-flex min-h-11 items-center gap-2 text-right text-sm font-semibold text-brand transition-colors duration-150 hover:text-ink"
            href={projectHref}
            target="_blank"
            rel="noreferrer"
          >
            <span>{t("detail.openFullPage")}</span>
            <ExternalLink aria-hidden className="size-4 shrink-0" strokeWidth={1.8} />
          </Link>
        </header>

        <div className="min-h-0 flex-1">
          {project === undefined ? (
            <div className="h-full overflow-y-auto overscroll-contain">
              <ProjectSheetSkeleton label={t("detail.loading")} />
            </div>
          ) : project === null ? (
            <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-16 text-center sm:px-10">
              <h2 className="m-0 text-2xl font-semibold tracking-[-0.03em] text-ink" id="project-detail-sheet-title">
                {t("detail.unavailableTitle")}
              </h2>
              <p className="mx-auto mt-3 mb-0 max-w-md text-sm leading-6 text-muted">{t("detail.unavailableLead")}</p>
              <button
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-brand px-5 text-sm font-semibold text-brand transition-transform duration-150 active:scale-[0.96]"
                onClick={onClose}
                type="button"
              >
                {t("detail.back")}
              </button>
            </div>
          ) : (
            <ProjectSheetContent project={project} />
          )}
        </div>
      </section>
    </div>
  );
  return typeof document === "undefined" ? sheet : createPortal(sheet, document.body);
}

function ProjectSheetContent({ project }: { project: Details }) {
  const t = useTranslations("companyProjects");
  const tWizard = useTranslations("projectWizard");
  const format = useFormatter();
  const category = project.primaryCategory === "other" && project.customCategoryText
    ? project.customCategoryText
    : tWizard(`categoryOptions.${project.primaryCategory}`);
  const surfaceValue = project.surface !== null && !project.surfaceUnknown
    ? t("card.surface", { value: format.number(project.surface) })
    : t("notSpecified");

  return (
    <div className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,30%)]">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="border-b border-[#e4e8eb] px-5 py-6 sm:px-8 sm:py-8">
          <p className="m-0 text-[0.7rem] font-semibold tracking-[0.12em] text-brand uppercase">{category}</p>
          <h2
            className="mt-3 mb-0 max-w-[40rem] text-[1.75rem] leading-9 font-semibold tracking-[-0.04em] text-ink sm:text-[2.1rem] sm:leading-[2.55rem]"
            id="project-detail-sheet-title"
          >
            {project.title}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span>{tWizard(`cityOptions.${project.city}`)}</span>
            {project.publishedAt ? (
              <>
                <span aria-hidden>·</span>
                <time dateTime={new Date(project.publishedAt).toISOString()}>
                  {t("card.published", { date: format.dateTime(project.publishedAt, { dateStyle: "medium" }) })}
                </time>
              </>
            ) : null}
          </div>
        </div>

        <div className="border-b border-[#e4e8eb] px-5 py-6 lg:hidden sm:px-8">
          <QuoteActionRail project={project} />
        </div>

        <article className="px-5 py-7 sm:px-8 sm:py-8">
          <section>
            <h3 className="m-0 text-[1.05rem] font-semibold tracking-[-0.02em] text-ink">{t("detail.description")}</h3>
            <p className="mt-3 mb-0 max-w-[40rem] whitespace-pre-wrap text-[0.98rem] leading-7 text-ink/90">
              {project.description}
            </p>
          </section>

          <section className="mt-9 border-t border-[#e4e8eb] pt-8">
            <h3 className="m-0 text-[1.05rem] font-semibold tracking-[-0.02em] text-ink">{t("detail.projectDetails")}</h3>
            <dl className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              <SheetDetail label={t("detail.budget")} value={tWizard(`budgetOptions.${project.budgetRange}`)} />
              <SheetDetail label={t("detail.timeline")} value={tWizard(`timelineOptions.${project.timeline}`)} />
              <SheetDetail
                label={t("detail.propertyType")}
                value={project.propertyType ? tWizard(`propertyTypeOptions.${project.propertyType}`) : t("notSpecified")}
              />
              <SheetDetail label={t("detail.surface")} value={surfaceValue} />
              <SheetDetail label={t("detail.category")} value={category} />
              <SheetDetail label={t("detail.city")} value={tWizard(`cityOptions.${project.city}`)} />
            </dl>
          </section>
        </article>

        <div className="border-t border-[#e4e8eb] px-5 py-7 lg:hidden sm:px-8">
          <ClientInfoBlock project={project} />
        </div>
      </div>

      <aside className="hidden min-h-0 overflow-y-auto overscroll-contain border-l border-[#e4e8eb] bg-white lg:block lg:px-6 lg:py-8">
        <QuoteActionRail project={project} />
        <ClientInfoBlock project={project} />
      </aside>
    </div>
  );
}

function QuoteActionRail({ project }: { project: Details }) {
  const t = useTranslations("companyProjects");
  const quoteHref = {
    pathname: routes.companyInitialQuote,
    params: { projectId: project.id },
  } as const;
  return (
    <section>
      <h3 className="m-0 text-[1.05rem] font-semibold tracking-[-0.02em] text-ink">{t("quote.title")}</h3>
      <p className="mt-2 mb-0 text-sm leading-6 text-muted">{t("quote.lead")}</p>
      {project.myQuoteId ? (
        <Link className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.98]" href={quoteHref}>{t("quote.view")}</Link>
      ) : project.canSubmitQuote ? (
        <Link className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.98]" href={quoteHref}>{t("quote.submit")}</Link>
      ) : (
        <>
          <button className="mt-5 inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white opacity-55" disabled type="button">{t("quote.submit")}</button>
          <p className="mt-3 mb-0 text-sm leading-6 text-[#8a2f28]">{t("quote.verificationRequired")}</p>
          <Link
            className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
            href={routes.companyVerification}
          >
            {t("quote.verifyAction")}
          </Link>
        </>
      )}
    </section>
  );
}

function ClientInfoBlock({ project }: { project: Details }) {
  const t = useTranslations("companyProjects");
  const format = useFormatter();
  const client = project.client;
  return (
    <section className="mt-8 border-t border-[#e4e8eb] pt-7 lg:mt-8">
      <h3 className="m-0 text-[1.05rem] font-semibold tracking-[-0.02em] text-ink">{t("detail.clientTitle")}</h3>
      {client ? (
        <div className="mt-4 space-y-2.5">
          <p className="m-0 text-sm font-semibold text-ink">{client.displayName}</p>
          {client.city ? <p className="m-0 text-sm text-muted">{client.city}</p> : null}
          <p className="m-0 text-sm text-muted">
            {t("detail.clientSince", {
              date: format.dateTime(client.joinedAt, { month: "long", year: "numeric" }),
            })}
          </p>
          <p className="m-0 text-sm text-muted">
            {t("detail.clientProjectsPosted", { count: client.projectsPostedCount })}
          </p>
          {client.projectsCompletedCount > 0 ? (
            <p className="m-0 text-sm text-muted">
              {t("detail.clientProjectsCompleted", { count: client.projectsCompletedCount })}
            </p>
          ) : null}
          {(client.emailVerified || client.phoneVerified) ? (
            <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
              {client.emailVerified ? (
                <li className="flex items-center gap-2 text-sm text-ink">
                  <VerifiedIcon />
                  <span>{t("detail.clientEmailVerified")}</span>
                </li>
              ) : null}
              {client.phoneVerified ? (
                <li className="flex items-center gap-2 text-sm text-ink">
                  <VerifiedIcon />
                  <span>{t("detail.clientPhoneVerified")}</span>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 mb-0 text-sm font-semibold text-ink">{t("card.clientPrivate")}</p>
      )}
      <p className="mt-4 mb-0 text-xs leading-5 text-muted">{t("detail.clientPrivacy")}</p>
    </section>
  );
}

function SheetDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.68rem] font-semibold tracking-[0.08em] text-muted uppercase">{label}</dt>
      <dd className="mt-1.5 text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

function ProjectSheetSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="lg:grid lg:min-h-full lg:grid-cols-[minmax(0,1fr)_minmax(260px,30%)]" role="status">
      <span className="sr-only">{label}</span>
      <div className="animate-pulse">
        <div className="border-b border-[#e4e8eb] px-5 py-6 sm:px-8 sm:py-8">
          <div className="h-3 w-28 rounded bg-[#e6eef3]" />
          <div className="mt-4 h-8 w-4/5 max-w-md rounded bg-[#e6eef3]" />
          <div className="mt-3 h-4 w-2/5 rounded bg-[#eef3f6]" />
        </div>
        <div className="px-5 py-7 sm:px-8 sm:py-8">
          <div className="h-5 w-40 rounded bg-[#e6eef3]" />
          <div className="mt-4 h-4 w-full rounded bg-[#eef3f6]" />
          <div className="mt-2 h-4 w-full rounded bg-[#eef3f6]" />
          <div className="mt-2 h-4 w-3/4 rounded bg-[#eef3f6]" />
          <div className="mt-10 h-5 w-36 rounded bg-[#e6eef3]" />
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            <div className="h-10 rounded bg-[#eef3f6]" />
            <div className="h-10 rounded bg-[#eef3f6]" />
            <div className="h-10 rounded bg-[#eef3f6]" />
            <div className="h-10 rounded bg-[#eef3f6]" />
          </div>
        </div>
      </div>
      <aside className="hidden animate-pulse border-l border-[#e4e8eb] px-6 py-8 lg:block">
        <div className="h-5 w-44 rounded bg-[#e6eef3]" />
        <div className="mt-3 h-4 w-full rounded bg-[#eef3f6]" />
        <div className="mt-5 h-12 w-full rounded-full bg-[#e6eef3]" />
        <div className="mt-10 h-5 w-36 rounded bg-[#e6eef3]" />
        <div className="mt-4 h-4 w-28 rounded bg-[#eef3f6]" />
        <div className="mt-2 h-4 w-40 rounded bg-[#eef3f6]" />
      </aside>
    </div>
  );
}

function MetaPill({ children }: { children: ReactNode }) {
  return <span className="rounded-md bg-[#eef3f7] px-2.5 py-1.5 text-xs font-medium text-ink/85">{children}</span>;
}

function sortOptionLabelKey(option: SortOption) {
  if (option === "budget_high") return "sort.options.budgetHigh" as const;
  if (option === "budget_low") return "sort.options.budgetLow" as const;
  if (option === "oldest") return "sort.options.oldest" as const;
  return "sort.options.newest" as const;
}

function SortDropdown({ value, onChange }: { value: SortOption; onChange: (value: SortOption) => void }) {
  const t = useTranslations("companyProjects");
  const selectedLabel = t(sortOptionLabelKey(value));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t("sort.triggerAria", { option: selectedLabel })}
          className="group/sort inline-flex min-h-10 items-center gap-2 rounded-full border border-[#c5c8cb] bg-white px-3.5 text-sm text-ink transition-[border-color,background-color,transform] duration-150 hover:border-[#9aa3ab] data-[state=open]:border-ink active:scale-[0.96]"
          type="button"
        >
          <span>
            <span className="text-muted">{t("sort.label")}: </span>
            <span className="font-semibold">{selectedLabel}</span>
          </span>
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-ink transition-transform duration-150 group-data-[state=open]/sort:rotate-180"
            strokeWidth={1.8}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[220px] rounded-xl border border-[#e4e8eb] bg-white p-1.5 shadow-[0_10px_30px_rgb(23_61_99/0.12)]"
      >
        {SORT_OPTIONS.map((option) => {
          const selected = option === value;
          return (
            <DropdownMenuItem
              className="min-h-10 cursor-pointer rounded-lg px-2.5 text-sm text-ink focus:bg-[#f4f7fa] focus:text-ink"
              key={option}
              onSelect={() => onChange(option)}
            >
              <span className="grid size-4 shrink-0 place-items-center" aria-hidden>
                {selected ? <CheckIcon className="size-4 text-ink" strokeWidth={2.2} /> : null}
              </span>
              <span className={joinClassNames(selected ? "font-semibold" : "font-normal")}>
                {t(sortOptionLabelKey(option))}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type FilterProps = {
  citySearch: string;
  categories: Category[];
  budgetRanges: Budget[];
  timelines: Timeline[];
  propertyTypes: PropertyType[];
  surfaceRanges: SurfaceRange[];
  postedWindows: PostedWindow[];
  onCitySearchChange: (value: string) => void;
  onCategoriesChange: (value: Category[]) => void;
  onBudgetRangesChange: (value: Budget[]) => void;
  onTimelinesChange: (value: Timeline[]) => void;
  onPropertyTypesChange: (value: PropertyType[]) => void;
  onSurfaceRangesChange: (value: SurfaceRange[]) => void;
  onPostedWindowsChange: (value: PostedWindow[]) => void;
  onClear: () => void;
};

function FilterFields({
  citySearch,
  categories,
  budgetRanges,
  timelines,
  propertyTypes,
  surfaceRanges,
  postedWindows,
  onCitySearchChange,
  onCategoriesChange,
  onBudgetRangesChange,
  onTimelinesChange,
  onPropertyTypesChange,
  onSurfaceRangesChange,
  onPostedWindowsChange,
  onClear,
  idPrefix,
  showHeading = true,
}: FilterProps & { idPrefix: string; showHeading?: boolean }) {
  const t = useTranslations("companyProjects");
  const tWizard = useTranslations("projectWizard");
  const hasActiveFilters = Boolean(
    citySearch.trim() ||
      categories.length ||
      budgetRanges.length ||
      timelines.length ||
      propertyTypes.length ||
      surfaceRanges.length ||
      postedWindows.length,
  );
  const categoryLabel =
    categories.length === 0
      ? t("filters.selectCategories")
      : categories.length === 1
        ? tWizard(`categoryOptions.${categories[0]}`)
        : t("filters.selectedCount", { count: categories.length });

  return (
    <nav aria-label={t("filters.title")}>
      {showHeading ? <h2 className="sr-only">{t("filters.title")}</h2> : null}
      {hasActiveFilters ? (
        <div className="mb-1 flex items-center justify-between gap-3 border-b border-[#e4e8eb] pb-3">
          <p className="m-0 text-sm font-semibold text-ink">{t("filters.active")}</p>
          <button
            className="min-h-9 text-sm font-semibold text-[#108a00] transition-colors duration-150 hover:text-ink"
            onClick={onClear}
            type="button"
          >
            {t("clearFilters")}
          </button>
        </div>
      ) : null}

      <FilterSection defaultOpen label={t("filters.city")}>
        <div className="relative">
          <SearchIconLucide
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            strokeWidth={1.8}
          />
          <Input
            aria-label={t("filters.city")}
            className="h-10 rounded-lg border-[#c5c8cb] bg-white pr-3 pl-9 text-sm text-ink shadow-none placeholder:text-muted focus-visible:border-brand focus-visible:ring-brand/15"
            id={`${idPrefix}-city`}
            onChange={(event) => onCitySearchChange(event.target.value)}
            placeholder={t("filters.cityPlaceholder")}
            type="search"
            value={citySearch}
          />
        </div>
      </FilterSection>

      <FilterSection defaultOpen label={t("filters.category")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("filters.category")}
              className="h-10 w-full justify-between rounded-lg border-[#c5c8cb] bg-white px-3 text-sm font-normal text-ink shadow-none hover:border-[#9aa3ab] hover:bg-white hover:text-ink"
              id={`${idPrefix}-category`}
              variant="outline"
            >
              <span
                className={joinClassNames(
                  "min-w-0 truncate text-left",
                  categories.length === 0 ? "text-muted" : "text-ink",
                )}
              >
                {categoryLabel}
              </span>
              <ChevronDown aria-hidden className="size-4 shrink-0 text-ink" strokeWidth={1.8} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-80 rounded-xl border-[#d7dde2] p-1.5 shadow-[0_8px_28px_rgb(23_61_99/0.12)]">
            {projectCategories.map((item) => (
              <DropdownMenuCheckboxItem
                checked={categories.includes(item)}
                className="min-h-10 cursor-pointer rounded-lg py-2 pr-2 pl-8 text-sm"
                key={item}
                onCheckedChange={() => onCategoriesChange(toggleSelection(categories, item))}
                onSelect={(event) => event.preventDefault()}
              >
                {tWizard(`categoryOptions.${item}`)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </FilterSection>

      <FilterSection defaultOpen label={t("filters.budget")}>
        <FilterCheckboxList
          idPrefix={`${idPrefix}-budget`}
          items={projectBudgetRanges}
          labelFor={(item) => tWizard(`budgetOptions.${item}`)}
          onChange={onBudgetRangesChange}
          values={budgetRanges}
        />
      </FilterSection>

      <FilterSection defaultOpen label={t("filters.timeline")}>
        <FilterCheckboxList
          idPrefix={`${idPrefix}-timeline`}
          items={projectTimelines}
          labelFor={(item) => tWizard(`timelineOptions.${item}`)}
          onChange={onTimelinesChange}
          values={timelines}
        />
      </FilterSection>

      <FilterSection defaultOpen label={t("filters.propertyType")}>
        <FilterCheckboxList
          idPrefix={`${idPrefix}-property`}
          items={projectPropertyTypes}
          labelFor={(item) => tWizard(`propertyTypeOptions.${item}`)}
          onChange={onPropertyTypesChange}
          values={propertyTypes}
        />
      </FilterSection>

      <FilterSection defaultOpen label={t("filters.surface")}>
        <FilterCheckboxList
          idPrefix={`${idPrefix}-surface`}
          items={projectSurfaceRanges}
          labelFor={(item) => t(`filters.surfaceOptions.${item}`)}
          onChange={onSurfaceRangesChange}
          values={surfaceRanges}
        />
      </FilterSection>

      <FilterSection defaultOpen label={t("filters.posted")}>
        <FilterCheckboxList
          idPrefix={`${idPrefix}-posted`}
          items={projectPostedWindows}
          labelFor={(item) => t(`filters.postedOptions.${item}`)}
          onChange={onPostedWindowsChange}
          values={postedWindows}
        />
      </FilterSection>
    </nav>
  );
}

function FilterCheckboxList<T extends string>({
  idPrefix,
  items,
  values,
  onChange,
  labelFor,
}: {
  idPrefix: string;
  items: readonly T[];
  values: T[];
  onChange: (value: T[]) => void;
  labelFor: (item: T) => string;
}) {
  return (
    <ul className="m-0 grid list-none gap-0.5 p-0">
      {items.map((item) => {
        const checked = values.includes(item);
        return (
          <li key={item}>
            <label
              className="group flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-0.5 text-sm leading-5 text-ink transition-colors duration-150 hover:text-brand"
              htmlFor={`${idPrefix}-${item}`}
            >
              <Checkbox
                checked={checked}
                className="size-[18px] rounded-[4px] border-[#6b7785] shadow-none data-checked:border-[#108a00] data-checked:bg-[#108a00]"
                id={`${idPrefix}-${item}`}
                onCheckedChange={() => onChange(toggleSelection(values, item))}
              />
              <span>{labelFor(item)}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function FilterSection({
  label,
  children,
  defaultOpen = true,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="group border-b border-[#e4e8eb] last:border-b-0"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[0.95rem] font-semibold tracking-[-0.01em] text-ink outline-none transition-colors duration-150 hover:text-brand focus-visible:text-brand [&::-webkit-details-marker]:hidden">
        <span>{label}</span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-ink transition-transform duration-150 [transition-timing-function:cubic-bezier(0.2,0,0,1)] group-open:rotate-180"
          strokeWidth={1.8}
        />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

function toggleSelection<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function FilterSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const t = useTranslations("companyProjects");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href]');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, open]);
  if (!open) return null;
  const sheet = <div aria-label={title} aria-modal="true" className="fixed inset-0 z-[80] lg:hidden" id="project-mobile-filters" role="dialog"><button aria-label={t("filters.close")} className="absolute inset-0 bg-ink/45" onClick={onClose} type="button" /><div className="absolute inset-y-0 right-0 w-[min(88vw,360px)] overflow-y-auto bg-white p-5 shadow-[-20px_0_50px_rgb(23_61_99/0.15)]" ref={panelRef}><div className="mb-7 flex items-center justify-between border-b border-brand-border pb-4"><h2 className="m-0 text-lg font-semibold text-ink">{title}</h2><button aria-label={t("filters.close")} className="grid size-11 place-items-center rounded-full border border-brand-border text-ink" onClick={onClose} ref={closeRef} type="button"><CloseIcon /></button></div>{children}</div></div>;
  return typeof document === "undefined" ? sheet : createPortal(sheet, document.body);
}

function EmptyProjects({ onClear }: { onClear: () => void }) {
  const t = useTranslations("companyProjects");
  return <div className="rounded-2xl border border-dashed border-brand-border bg-white px-5 py-14 text-center"><div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft text-brand"><SearchIcon staticPosition /></div><h2 className="mt-4 mb-0 text-lg font-semibold text-ink">{t("empty.title")}</h2><p className="mx-auto mt-2 mb-0 max-w-md text-sm leading-6 text-muted">{t("empty.lead")}</p><button className="mt-5 min-h-11 rounded-full border border-brand px-5 text-sm font-semibold text-brand active:scale-[0.96]" onClick={onClear} type="button">{t("clearFilters")}</button></div>;
}

export function ProjectFeedSkeleton({ label, compact = false }: { label: string; compact?: boolean }) {
  return <div aria-busy="true" className={compact ? "mt-4 grid gap-4" : "mx-auto w-[calc(100%-36px)] max-w-[1120px] py-10"} role="status"><span className="sr-only">{label}</span>{Array.from({ length: compact ? 2 : 4 }, (_, index) => <div className="animate-pulse rounded-2xl border border-brand-border bg-white p-6" key={index}><div className="h-3 w-48 rounded bg-[#e9edf1]" /><div className="mt-4 h-7 w-3/4 rounded bg-[#e9edf1]" /><div className="mt-4 h-4 w-full rounded bg-[#eef1f4]" /><div className="mt-2 h-4 w-2/3 rounded bg-[#eef1f4]" /><div className="mt-6 h-11 w-32 rounded-full bg-[#e9edf1]" /></div>)}</div>;
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [delay, value]);
  return debounced;
}

function normalizeFilterSearch(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function SearchIcon({ staticPosition = false }: { staticPosition?: boolean }) { return <svg aria-hidden className={staticPosition ? "size-5" : "pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"} fill="none" viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" /><path d="m12.5 12.5 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" /></svg>; }
function FilterIcon() { return <svg aria-hidden className="size-4" fill="none" viewBox="0 0 16 16"><path d="M2.5 4h11M4.5 8h7M6.5 12h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" /></svg>; }
function CloseIcon() { return <svg aria-hidden className="size-5" fill="none" viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>; }
function BackIcon() { return <svg aria-hidden className="size-5" fill="none" viewBox="0 0 20 20"><path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>; }
function VerifiedIcon() { return <svg aria-hidden className="size-4 shrink-0 text-brand" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.4" /><path d="m5.2 8.1 1.8 1.8 3.8-3.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg>; }
