"use client";

import { useProjectLocationLabel } from "../hooks/use-project-location-label";

import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { useFormatter, useLocale, useNow, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "@/convex/_generated/api";
import { projectCategories, type projectMarketplaceSortOptions } from "@/convex/projects/constants";
import { Link } from "@/i18n/navigation";
import { routes, type AppRoute } from "@/lib/routes";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { joinClassNames } from "@/lib/utils";
import { ProjectGeographicFilters, type ProjectGeographicSelection } from "./project-geographic-filters";

type PublicProject = FunctionReturnType<typeof api.projects.index.listPublicProjectsPaginated>["page"][number];
type Category = (typeof projectCategories)[number];
type SortBy = (typeof projectMarketplaceSortOptions)[number];
const PAGE_SIZE = 12;

export function PublicProjectBrowse({ initialSearch = "" }: { initialSearch?: string }) {
  const t = useTranslations("browseProjectsPage");
  const user = useQuery(api.users.currentUser);
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState<Category | "all">("all");
  const [geography, setGeography] = useState<ProjectGeographicSelection>({ regionCode: "", provinceCode: "" });
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 250);
  const searchActive = Boolean(debouncedSearch.trim());

  const queryArgs = useMemo(() => ({
    search: debouncedSearch.trim() || undefined,
    category: category === "all" ? undefined : category,
    regionCode: geography.regionCode || undefined,
    provinceCode: geography.provinceCode || undefined,
    sortBy,
  }), [category, debouncedSearch, geography, sortBy]);
  const { results: projects, status, loadMore } = usePaginatedQuery(
    api.projects.index.listPublicProjectsPaginated, queryArgs, { initialNumItems: PAGE_SIZE },
  );

  const selected = projects.find((project) => project.id === selectedId) ?? null;
  const activeFilterCount = (category !== "all" ? 1 : 0) + (geography.regionCode ? 1 : 0) + (geography.provinceCode ? 1 : 0);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const closePreview = useCallback(() => setSelectedId(null), []);

  function clearFilters() {
    setCategory("all");
    setGeography({ regionCode: "", provinceCode: "" });
    setSearch("");
    setFiltersOpen(false);
  }

  function onSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  const proposeHref =
    user?.accountType === "company"
      ? user.onboardingStatus === "completed"
        ? routes.companyProjects
        : routes.companyOnboarding
      : routes.signUpCompany;

  const isGuest = user === null || (user !== undefined && user.accountType !== "company");

  return (
    <div className="min-h-[70vh] bg-[#f2f4f5]">
      <header className="border-b border-brand-border bg-white">
        <div className="mx-auto w-[calc(100%-36px)] max-w-[1120px] py-6 sm:w-[calc(100%-48px)] sm:py-8">
          <p className="mb-2 text-[0.68rem] font-semibold tracking-[0.14em] text-brand uppercase">{t("eyebrow")}</p>
          <h1 className="mb-0 max-w-[640px] text-[1.35rem] leading-7 font-semibold tracking-[-0.03em] text-ink sm:text-[1.6rem] sm:leading-8">
            {t("title")}
          </h1>
          <p className="mt-1.5 mb-0 max-w-[640px] text-sm leading-6 text-muted">{t("lead")}</p>

          <form className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center" onSubmit={onSearchSubmit} role="search">
            <label className="sr-only" htmlFor="browse-projects-search">
              {t("searchLabel")}
            </label>
            <div className="flex min-h-11 max-w-[640px] flex-1 items-center gap-2 rounded-sm border border-brand-border bg-white px-4 focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]">
              <Search aria-hidden className="size-4 shrink-0 text-muted" strokeWidth={1.8} />
              <input
                className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-muted/70"
                id="browse-projects-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchPlaceholder")}
                type="search"
                value={search}
              />
              {search ? (
                <button
                  aria-label={t("clearSearch")}
                  className="grid size-8 place-items-center rounded-sm text-muted hover:bg-brand-soft hover:text-ink"
                  onClick={() => setSearch("")}
                  type="button"
                >
                  <X aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>
            <button
              aria-controls="public-project-mobile-filters"
              aria-expanded={filtersOpen}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold text-ink active:scale-[0.96] lg:hidden"
              onClick={() => setFiltersOpen(true)}
              type="button"
            >
              <SlidersHorizontal aria-hidden className="size-4" />
              {t("filters")}
              {activeFilterCount > 0 ? (
                <span className="grid min-w-5 place-items-center rounded-sm bg-brand px-1.5 text-[0.7rem] text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </form>

          {isGuest ? (
            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-brand-border bg-[#f7f9fb] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="m-0 text-sm leading-6 text-muted">{t("ctaGuestLead")}</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  className="inline-flex min-h-10 items-center justify-center rounded-sm bg-brand px-4 text-sm font-semibold text-white"
                  href={routes.signUpCompany}
                >
                  {t("ctaGuestAction")}
                </Link>
                <Link
                  className="inline-flex min-h-10 items-center justify-center rounded-sm border border-brand-border bg-white px-4 text-sm font-semibold text-ink"
                  href={routes.signIn}
                >
                  {t("ctaSignIn")}
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-[calc(100%-36px)] max-w-[1120px] py-6 sm:w-[calc(100%-48px)] sm:py-8">
        <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden self-start lg:sticky lg:top-24 lg:block">
            <FilterPanel
              category={category}
              geography={geography}
              idPrefix="browse-projects-desktop"
              onCategoryChange={setCategory}
              onGeographyChange={setGeography}
              onClear={clearFilters}
              showClear={activeFilterCount > 0 || search.length > 0}
            />
          </aside>

          <section aria-busy={status === "LoadingFirstPage" || status === "LoadingMore"} aria-label={t("resultsLabel")}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p aria-live="polite" className="m-0 text-sm text-muted">
                {status === "LoadingFirstPage"
                  ? t("loading")
                  : projects.length === 0 && status !== "Exhausted"
                    ? t("scanning")
                    : t("resultsCount", { count: projects.length })}
              </p>
              {searchActive ? <p aria-live="polite" className="m-0 text-sm font-semibold text-ink">{t("relevance")}</p> : (
                <label className="flex items-center gap-2 text-sm text-muted" htmlFor="browse-projects-sort">
                  <span className="sr-only">{t("sortLabel")}</span>
                  <select className="min-h-11 rounded-sm border border-brand-border bg-white px-3 text-sm text-ink focus-visible:ring-3 focus-visible:ring-brand/15"
                    id="browse-projects-sort" name="sortBy" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)}>
                    <option value="newest">{t("newest")}</option>
                    <option value="oldest">{t("oldest")}</option>
                  </select>
                </label>
              )}
              {activeFilterCount > 0 || search ? (
                <button
                  className="text-sm font-semibold text-brand hover:underline"
                  onClick={clearFilters}
                  type="button"
                >
                  {t("clearFilters")}
                </button>
              ) : null}
            </div>

            {status === "LoadingFirstPage" ? (
              <BrowseSkeleton label={t("loading")} />
            ) : projects.length === 0 && status === "Exhausted" ? (
              <div className="rounded-2xl border border-dashed border-brand-border bg-white px-5 py-12 text-center">
                <h2 className="m-0 text-lg font-semibold text-ink">{t("emptyTitle")}</h2>
                <p className="mt-2 mb-0 text-sm leading-6 text-muted">{t("emptyLead")}</p>
                {activeFilterCount > 0 || search ? (
                  <button
                    className="mt-5 inline-flex min-h-11 items-center justify-center rounded-sm border border-brand bg-white px-5 text-sm font-semibold text-brand"
                    onClick={clearFilters}
                    type="button"
                  >
                    {t("clearFilters")}
                  </button>
                ) : null}
              </div>
            ) : projects.length > 0 ? (
              <ul className="m-0 list-none divide-y divide-[#e4e8eb] overflow-hidden rounded-2xl border border-brand-border bg-white p-0">
                {projects.map((project) => (
                  <li key={project.id}>
                    <ProjectRow
                      onOpen={() => setSelectedId(project.id)}
                      project={project}
                      selected={selectedId === project.id}
                    />
                  </li>
                ))}
              </ul>
            ) : <p className="m-0 rounded-2xl border border-brand-border bg-white px-5 py-8 text-sm text-muted" role="status">{t("scanning")}</p>}
            {status === "CanLoadMore" || status === "LoadingMore" ? (
              <div className="mt-5 flex justify-center">
                <button className="min-h-11 rounded-sm border border-brand bg-white px-5 text-sm font-semibold text-brand focus-visible:ring-3 focus-visible:ring-brand/15 disabled:cursor-wait disabled:opacity-60"
                  disabled={status === "LoadingMore"} onClick={() => loadMore(PAGE_SIZE)} type="button">
                  {status === "LoadingMore" ? t("loadingMore") : t("loadMore")}
                </button>
              </div>
            ) : status === "Exhausted" && projects.length > 0 ? <p aria-live="polite" className="mt-5 mb-0 text-center text-sm text-muted">{t("exhausted")}</p> : null}
          </section>
        </div>
      </main>

      <FilterSheet onClose={closeFilters} open={filtersOpen} title={t("filters")}>
        <FilterPanel
          category={category}
          geography={geography}
          idPrefix="browse-projects-mobile"
          onCategoryChange={setCategory}
          onGeographyChange={setGeography}
          onClear={clearFilters}
          showClear={activeFilterCount > 0 || search.length > 0}
        />
      </FilterSheet>

      <ProjectPreviewSheet
        onClose={closePreview}
        project={selected}
        proposeHref={proposeHref}
        signedInCompany={user?.accountType === "company"}
      />
    </div>
  );
}

export function PublicProjectBrowseSkeleton({ label }: { label: string }) {
  return (
    <div className="min-h-[70vh] bg-[#f2f4f5]">
      <header className="border-b border-brand-border bg-white">
        <div className="mx-auto w-[calc(100%-36px)] max-w-[1120px] py-6 sm:w-[calc(100%-48px)] sm:py-8">
          <div className="h-3 w-24 animate-pulse rounded bg-[#e8eef3]" />
          <div className="mt-3 h-7 w-56 animate-pulse rounded bg-[#e8eef3] sm:w-72" />
          <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-[#e8eef3]" />
          <div className="mt-5 h-11 max-w-[640px] animate-pulse rounded-sm bg-[#e8eef3]" />
        </div>
      </header>
      <div className="mx-auto w-[calc(100%-36px)] max-w-[1120px] py-6 sm:w-[calc(100%-48px)] sm:py-8">
        <BrowseSkeleton label={label} />
      </div>
    </div>
  );
}

function ProjectRow({
  project,
  selected,
  onOpen,
}: {
  project: PublicProject;
  selected: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("browseProjectsPage");
  const tWizard = useTranslations("projectWizard");
  const format = useFormatter();
  const locationLabel = useProjectLocationLabel();
  const now = useNow({ updateInterval: 60_000 });

  return (
    <article
      className={joinClassNames(
        "group relative px-4 py-5 transition-colors sm:px-6 sm:py-6",
        selected ? "bg-[#f4f7fa]" : "hover:bg-[#f7f9fb]",
      )}
    >
      <button
        aria-label={t("openAria", { title: project.title })}
        className="absolute inset-0 z-10 cursor-pointer rounded-none outline-none focus-visible:ring-3 focus-visible:ring-brand focus-visible:ring-inset"
        onClick={onOpen}
        type="button"
      />
      <div className="pointer-events-none relative z-0">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden className="size-3.5" strokeWidth={1.8} />
            {locationLabel(project)}
          </span>
          <span aria-hidden>·</span>
          <span>{tWizard(`categoryOptions.${project.primaryCategory}`)}</span>
          {project.publishedAt ? (
            <>
              <span aria-hidden>·</span>
              <time dateTime={new Date(project.publishedAt).toISOString()}>
                {t("posted", {
                  date: format.relativeTime(new Date(project.publishedAt), now),
                })}
              </time>
            </>
          ) : null}
        </div>
        <h2 className="mt-2 mb-0 text-[1.1rem] leading-7 font-semibold tracking-[-0.025em] text-ink transition-colors group-hover:text-brand sm:text-[1.2rem]">
          {project.title}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {project.timeline ? (
            <span className="rounded-md bg-[#eef1f4] px-2.5 py-1 text-xs font-medium text-ink">
              {tWizard(`timelineOptions.${project.timeline}`)}
            </span>
          ) : null}
        </div>
        <p className="mt-3 mb-0 line-clamp-2 text-sm leading-6 text-ink/85">{project.description}</p>
        <p className="mt-4 mb-0 text-sm font-semibold text-brand">{t("viewProject")}</p>
      </div>
    </article>
  );
}

function FilterPanel({
  category,
  geography,
  idPrefix,
  onCategoryChange,
  onGeographyChange,
  onClear,
  showClear,
}: {
  category: Category | "all";
  geography: ProjectGeographicSelection;
  idPrefix: string;
  onCategoryChange: (value: Category | "all") => void;
  onGeographyChange: (value: ProjectGeographicSelection) => void;
  onClear: () => void;
  showClear: boolean;
}) {
  const t = useTranslations("browseProjectsPage");
  const tWizard = useTranslations("projectWizard");

  return (
    <div className="rounded-2xl border border-brand-border bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-sm font-semibold text-ink">{t("filters")}</h2>
        {showClear ? (
          <button className="text-xs font-semibold text-brand hover:underline" onClick={onClear} type="button">
            {t("clearFilters")}
          </button>
        ) : null}
      </div>

      <fieldset className="mt-5 border-0 p-0">
        <legend className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">{t("categoryFilter")}</legend>
        <div className="mt-3 grid gap-1.5">
          <FilterOption
            checked={category === "all"}
            label={t("allCategories")}
            name={`${idPrefix}-category`}
            onChange={() => onCategoryChange("all")}
          />
          {projectCategories.map((item) => (
            <FilterOption
              checked={category === item}
              key={item}
              label={tWizard(`categoryOptions.${item}`)}
              name={`${idPrefix}-category`}
              onChange={() => onCategoryChange(item)}
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-6 border-t border-[#e4e8eb] pt-6">
        <ProjectGeographicFilters className="grid gap-4" idPrefix={idPrefix} onChange={onGeographyChange} value={geography} />
      </div>
    </div>
  );
}

function FilterOption({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm text-ink hover:bg-[#f7f9fb] focus-within:ring-3 focus-within:ring-brand/15">
      <input
        checked={checked}
        className="size-3.5 accent-brand"
        name={name}
        onChange={onChange}
        type="radio"
      />
      <span>{label}</span>
    </label>
  );
}

function ProjectPreviewSheet({
  project,
  onClose,
  proposeHref,
  signedInCompany,
}: {
  project: PublicProject | null;
  onClose: () => void;
  proposeHref: AppRoute;
  signedInCompany: boolean;
}) {
  const t = useTranslations("browseProjectsPage");
  const tWizard = useTranslations("projectWizard");
  const locale = useLocale();
  const locationLabel = useProjectLocationLabel();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!project) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, project]);

  if (!project) return null;

  const sheet = (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <button aria-label={t("closePreview")} className="absolute inset-0 bg-ink/45" onClick={onClose} type="button" />
      <section
        aria-labelledby="browse-project-preview-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-[-16px_0_40px_rgb(23_61_99/0.16)] sm:w-[min(100%,520px)]"
        role="dialog"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e4e8eb] px-4 py-3">
          <button
            aria-label={t("closePreview")}
            className="grid size-11 place-items-center rounded-sm text-ink hover:bg-brand-soft"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden className="size-5" />
          </button>
          <p className="m-0 text-sm font-semibold text-ink">{t("previewTitle")}</p>
          <span className="size-11" aria-hidden />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
            <span>{locationLabel(project)}</span>
            <span aria-hidden>·</span>
            <span>{tWizard(`categoryOptions.${project.primaryCategory}`)}</span>
            {project.publishedAt ? (
              <>
                <span aria-hidden>·</span>
                <time dateTime={new Date(project.publishedAt).toISOString()}>
                  {formatMarketplaceDateTime(project.publishedAt, locale, { dateStyle: "medium" })}
                </time>
              </>
            ) : null}
          </div>
          <h2 className="mt-3 mb-0 text-2xl font-semibold tracking-[-0.03em] text-ink" id="browse-project-preview-title">
            {project.title}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {project.timeline ? (
              <span className="rounded-md bg-[#eef1f4] px-2.5 py-1 text-xs font-medium text-ink">
                {tWizard(`timelineOptions.${project.timeline}`)}
              </span>
            ) : null}
          </div>
          <p className="mt-5 mb-0 whitespace-pre-wrap text-sm leading-7 text-ink/90">{project.description}</p>

          <div className="mt-8 rounded-2xl border border-[#e4e8eb] bg-[#f7f9fb] p-4">
            <p className="m-0 text-sm font-semibold text-ink">{t("ctaTitle")}</p>
            <p className="mt-1.5 mb-0 text-sm leading-6 text-muted">
              {signedInCompany ? t("ctaCompanyLead") : t("ctaGuestLead")}
            </p>
            <div className="mt-4 grid gap-2">
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-sm bg-brand px-5 text-sm font-semibold text-white"
                href={proposeHref}
              >
                {signedInCompany ? t("ctaCompanyAction") : t("ctaGuestAction")}
              </Link>
              {!signedInCompany ? (
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-sm border border-[#d5d9dc] bg-white px-5 text-sm font-semibold text-ink"
                  href={routes.signIn}
                >
                  {t("ctaSignIn")}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  if (typeof document === "undefined") return sheet;
  return createPortal(sheet, document.body);
}

function FilterSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const t = useTranslations("browseProjectsPage");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
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
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, open]);
  if (!open) return null;
  const sheet = (
    <div aria-label={title} aria-modal="true" className="fixed inset-0 z-[70] lg:hidden" id="public-project-mobile-filters" role="dialog">
      <button aria-label={t("closeFilters")} className="absolute inset-0 bg-ink/45" onClick={onClose} type="button" />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-[0_-12px_40px_rgb(23_61_99/0.18)]" ref={panelRef}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 text-base font-semibold text-ink">{title}</h2>
          <button
            aria-label={t("closeFilters")}
            className="grid size-10 place-items-center rounded-sm hover:bg-brand-soft"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
  if (typeof document === "undefined") return sheet;
  return createPortal(sheet, document.body);
}

function BrowseSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="overflow-hidden rounded-2xl border border-brand-border bg-white" role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="animate-pulse border-b border-[#e4e8eb] px-5 py-6 last:border-b-0" key={index}>
          <div className="skeleton-block h-3 w-40 rounded bg-[#e8eef3]" />
          <div className="skeleton-block mt-3 h-5 w-[75%] rounded bg-[#e8eef3]" />
          <div className="skeleton-block mt-3 h-3 w-full rounded bg-[#e8eef3]" />
          <div className="skeleton-block mt-2 h-3 w-[83%] rounded bg-[#e8eef3]" />
        </div>
      ))}
    </div>
  );
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}
