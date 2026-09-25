"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { useFormatter, useLocale, useNow, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "@/convex/_generated/api";
import { projectCategories, projectCities } from "@/convex/projects/constants";
import { Link } from "@/i18n/navigation";
import { routes, type AppRoute } from "@/lib/routes";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { joinClassNames } from "@/lib/utils";

type PublicProject = FunctionReturnType<typeof api.projects.index.listPublicProjects>[number];
type Category = (typeof projectCategories)[number];
type City = (typeof projectCities)[number];

export function PublicProjectBrowse({ initialSearch = "" }: { initialSearch?: string }) {
  const t = useTranslations("browseProjectsPage");
  const tWizard = useTranslations("projectWizard");
  const projects = useQuery(api.projects.index.listPublicProjects);
  const user = useQuery(api.users.currentUser);
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState<Category | "all">("all");
  const [city, setCity] = useState<City | "all">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!projects) return [];
    const query = normalize(search);
    return projects.filter((project) => {
      if (category !== "all" && project.primaryCategory !== category) return false;
      if (city !== "all" && project.city !== city) return false;
      if (!query) return true;
      const haystack = normalize(
        [
          project.title,
          project.description,
          tWizard(`cityOptions.${project.city}`),
          tWizard(`categoryOptions.${project.primaryCategory}`),
        ].join(" "),
      );
      return haystack.includes(query);
    });
  }, [category, city, projects, search, tWizard]);

  const selected = filtered.find((project) => project.id === selectedId) ?? null;
  const activeFilterCount = (category !== "all" ? 1 : 0) + (city !== "all" ? 1 : 0);

  function clearFilters() {
    setCategory("all");
    setCity("all");
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
            <div className="flex min-h-11 max-w-[640px] flex-1 items-center gap-2 rounded-full border border-brand-border bg-white px-4 focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]">
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
                  className="grid size-8 place-items-center rounded-full text-muted hover:bg-brand-soft hover:text-ink"
                  onClick={() => setSearch("")}
                  type="button"
                >
                  <X aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold text-ink active:scale-[0.96] lg:hidden"
              onClick={() => setFiltersOpen(true)}
              type="button"
            >
              <SlidersHorizontal aria-hidden className="size-4" />
              {t("filters")}
              {activeFilterCount > 0 ? (
                <span className="grid min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[0.7rem] text-white">
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
                  className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand px-4 text-sm font-semibold text-white"
                  href={routes.signUpCompany}
                >
                  {t("ctaGuestAction")}
                </Link>
                <Link
                  className="inline-flex min-h-10 items-center justify-center rounded-full border border-brand-border bg-white px-4 text-sm font-semibold text-ink"
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
              city={city}
              onCategoryChange={setCategory}
              onCityChange={setCity}
              onClear={clearFilters}
              showClear={activeFilterCount > 0 || search.length > 0}
            />
          </aside>

          <section aria-busy={projects === undefined} aria-label={t("resultsLabel")}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p aria-live="polite" className="m-0 text-sm text-muted">
                {projects === undefined
                  ? t("loading")
                  : t("resultsCount", { count: filtered.length })}
              </p>
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

            {projects === undefined ? (
              <BrowseSkeleton label={t("loading")} />
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-brand-border bg-white px-5 py-12 text-center">
                <h2 className="m-0 text-lg font-semibold text-ink">{t("emptyTitle")}</h2>
                <p className="mt-2 mb-0 text-sm leading-6 text-muted">{t("emptyLead")}</p>
                {activeFilterCount > 0 || search ? (
                  <button
                    className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-brand bg-white px-5 text-sm font-semibold text-brand"
                    onClick={clearFilters}
                    type="button"
                  >
                    {t("clearFilters")}
                  </button>
                ) : null}
              </div>
            ) : (
              <ul className="m-0 list-none divide-y divide-[#e4e8eb] overflow-hidden rounded-2xl border border-brand-border bg-white p-0">
                {filtered.map((project) => (
                  <li key={project.id}>
                    <ProjectRow
                      onOpen={() => setSelectedId(project.id)}
                      project={project}
                      selected={selectedId === project.id}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <FilterSheet onClose={() => setFiltersOpen(false)} open={filtersOpen} title={t("filters")}>
        <FilterPanel
          category={category}
          city={city}
          onCategoryChange={setCategory}
          onCityChange={setCity}
          onClear={clearFilters}
          showClear={activeFilterCount > 0 || search.length > 0}
        />
      </FilterSheet>

      <ProjectPreviewSheet
        onClose={() => setSelectedId(null)}
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
          <div className="mt-5 h-11 max-w-[640px] animate-pulse rounded-full bg-[#e8eef3]" />
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
            {tWizard(`cityOptions.${project.city}`)}
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
          {project.budgetRange ? (
            <span className="rounded-md bg-[#eef1f4] px-2.5 py-1 text-xs font-medium text-ink">
              {tWizard(`budgetOptions.${project.budgetRange}`)}
            </span>
          ) : null}
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
  city,
  onCategoryChange,
  onCityChange,
  onClear,
  showClear,
}: {
  category: Category | "all";
  city: City | "all";
  onCategoryChange: (value: Category | "all") => void;
  onCityChange: (value: City | "all") => void;
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
            name="category"
            onChange={() => onCategoryChange("all")}
          />
          {projectCategories.map((item) => (
            <FilterOption
              checked={category === item}
              key={item}
              label={tWizard(`categoryOptions.${item}`)}
              name="category"
              onChange={() => onCategoryChange(item)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-6 border-0 border-t border-[#e4e8eb] p-0 pt-6">
        <legend className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">{t("cityFilter")}</legend>
        <div className="mt-3 grid max-h-64 gap-1.5 overflow-y-auto pr-1">
          <FilterOption
            checked={city === "all"}
            label={t("allCities")}
            name="city"
            onChange={() => onCityChange("all")}
          />
          {projectCities.map((item) => (
            <FilterOption
              checked={city === item}
              key={item}
              label={tWizard(`cityOptions.${item}`)}
              name="city"
              onChange={() => onCityChange(item)}
            />
          ))}
        </div>
      </fieldset>
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
    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-ink hover:bg-[#f7f9fb]">
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
            className="grid size-11 place-items-center rounded-full text-ink hover:bg-brand-soft"
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
            <span>{tWizard(`cityOptions.${project.city}`)}</span>
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
            {project.budgetRange ? (
              <span className="rounded-md bg-[#eef1f4] px-2.5 py-1 text-xs font-medium text-ink">
                {tWizard(`budgetOptions.${project.budgetRange}`)}
              </span>
            ) : null}
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
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white"
                href={proposeHref}
              >
                {signedInCompany ? t("ctaCompanyAction") : t("ctaGuestAction")}
              </Link>
              {!signedInCompany ? (
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#d5d9dc] bg-white px-5 text-sm font-semibold text-ink"
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
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  if (!open) return null;
  const sheet = (
    <div className="fixed inset-0 z-[70] lg:hidden" role="presentation">
      <button aria-label={t("closeFilters")} className="absolute inset-0 bg-ink/45" onClick={onClose} type="button" />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-[0_-12px_40px_rgb(23_61_99/0.18)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 text-base font-semibold text-ink">{title}</h2>
          <button
            aria-label={t("closeFilters")}
            className="grid size-10 place-items-center rounded-full hover:bg-brand-soft"
            onClick={onClose}
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

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").normalize("NFKC").toLowerCase();
}
