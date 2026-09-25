"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useFormatter, useLocale, useNow, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { projectBudgetRanges, projectCategories, projectCities } from "@/convex/projects/constants";
import { DashboardCardsSkeleton } from "@/features/shared/components/skeletons";
import { Link, useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { routes } from "@/lib/routes";
import { joinClassNames } from "@/lib/utils";

type VerificationStatus = "draft" | "pending" | "verified" | "rejected";
type Profile = NonNullable<FunctionReturnType<typeof api.companies.index.getOnboardingProfile>>;
type Project = FunctionReturnType<typeof api.projects.marketplace.listCompanyMarketplaceProjects>["page"][number];
type City = (typeof projectCities)[number];
type Category = (typeof projectCategories)[number];
type Budget = (typeof projectBudgetRanges)[number];

const PAGE_SIZE = 8;

const verificationHeadlineKey = {
  draft: "verificationHeadline.draft",
  pending: "verificationHeadline.pending",
  verified: "verificationHeadline.verified",
  rejected: "verificationHeadline.rejected",
} as const;

const verificationLeadKey = {
  draft: "verificationLead.draft",
  pending: "verificationLead.pending",
  verified: "verificationLead.verified",
  rejected: "verificationLead.rejected",
} as const;

const verificationStatusKey = {
  draft: "status.draft",
  pending: "status.pending",
  verified: "status.verified",
  rejected: "status.rejected",
} as const;

function asVerificationStatus(value: unknown): VerificationStatus | null {
  if (value === "draft" || value === "pending" || value === "verified" || value === "rejected") {
    return value;
  }
  return null;
}

function profileCompletion(profile: Profile) {
  const checks = [
    profile.name.trim().length > 0,
    profile.description.trim().length >= 20,
    profile.city.trim().length > 0,
    profile.phone.trim().length > 0,
    Boolean(profile.logoUrl),
    profile.services.length > 0,
    profile.yearsExperience !== null,
    profile.website.trim().length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function initials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return letters || "B";
}

export function CompanyDashboard() {
  const tUx = useTranslations("ux");
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "company" && user.onboardingStatus === "completed";
  const profile = useQuery(api.companies.index.getOnboardingProfile, canLoad ? {} : "skip");
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [city, setCity] = useState<City | "">("");
  const [category, setCategory] = useState<Category | "">("");
  const [budgetRange, setBudgetRange] = useState<Budget | "">("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 250);

  useEffect(() => {
    if (!user) return;
    if (user.accountType === "company" && user.onboardingStatus !== "completed") {
      router.replace(routes.companyOnboarding);
      return;
    }
    if (user.accountType !== "company") {
      router.replace(workspaceRouteForUser(user));
    }
  }, [router, user]);

  const queryArgs = useMemo(
    () =>
      canLoad
        ? {
            search: debouncedSearch.trim() || undefined,
            city: city || undefined,
            category: category || undefined,
            budgetRange: budgetRange || undefined,
          }
        : ("skip" as const),
    [budgetRange, canLoad, category, city, debouncedSearch],
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

  if (!user || !canLoad || profile == null) {
    return <DashboardCardsSkeleton label={tUx("loading.dashboard")} />;
  }

  const verification = asVerificationStatus(profile.verificationStatus);
  if (!verification) {
    return <DashboardCardsSkeleton label={tUx("loading.dashboard")} />;
  }

  return (
    <div className="min-h-[calc(100dvh-4.5rem)] bg-white">
      <div className="mx-auto grid w-full max-w-[1120px] items-start gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 lg:px-8">
        <ProjectFeed
          budgetRange={budgetRange}
          category={category}
          city={city}
          filtersOpen={filtersOpen}
          onBudgetChange={setBudgetRange}
          onCategoryChange={setCategory}
          onCityChange={setCity}
          onClearFilters={() => {
            setSearch("");
            setCity("");
            setCategory("");
            setBudgetRange("");
          }}
          onSearchChange={setSearch}
          onToggleFilters={() => setFiltersOpen((open) => !open)}
          projects={projects}
          search={search}
          status={status}
          verification={verification}
          onLoadMore={() => loadMore(PAGE_SIZE)}
        />
        <CompanySidebar profile={profile} verification={verification} />
      </div>
    </div>
  );
}

function ProjectFeed({
  search,
  onSearchChange,
  filtersOpen,
  onToggleFilters,
  city,
  category,
  budgetRange,
  onCityChange,
  onCategoryChange,
  onBudgetChange,
  onClearFilters,
  projects,
  status,
  onLoadMore,
  verification,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  city: City | "";
  category: Category | "";
  budgetRange: Budget | "";
  onCityChange: (value: City | "") => void;
  onCategoryChange: (value: Category | "") => void;
  onBudgetChange: (value: Budget | "") => void;
  onClearFilters: () => void;
  projects: Project[];
  status: "LoadingFirstPage" | "LoadingMore" | "CanLoadMore" | "Exhausted";
  onLoadMore: () => void;
  verification: VerificationStatus;
}) {
  const t = useTranslations("auth.companyDashboard");
  const tProjects = useTranslations("companyProjects");
  const now = useNow({ updateInterval: 60_000 });
  const [noticeOpen, setNoticeOpen] = useState(true);

  return (
    <section aria-label={t("feed.resultsLabel")} className="min-w-0 ">
      {noticeOpen ? (
        <div className="mb-4 flex items-center justify-center gap-3 rounded-lg bg-[#dff6df] px-4 py-3 text-sm leading-6 text-[#135c2b]">
          <p className="m-0 min-w-0 flex-1">
            {verification === "verified" ? t("feed.promoVerifiedLead") : t("feed.promoLead")}
            {verification !== "verified" ? (
              <>
                {" "}
                <Link className="font-semibold underline underline-offset-2" href={routes.companyVerification}>
                  {t("feed.promoAction")}
                </Link>
              </>
            ) : null}
          </p>
          <button
            aria-label={t("feed.dismiss")}
            className="grid size-8 shrink-0 place-items-center rounded-md text-[#135c2b] transition-transform duration-150 active:scale-[0.96]"
            onClick={() => setNoticeOpen(false)}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{tProjects("searchLabel")}</span>
          <SearchIcon />
          <input
            className="min-h-11 w-full rounded-full border border-[#d5ddd8] bg-white pr-4 pl-11 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted/80 focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("feed.searchPlaceholder")}
            type="search"
            value={search}
          />
        </label>
        <button
          aria-expanded={filtersOpen}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#cfd8d2] bg-white px-4 text-sm font-semibold text-ink transition-transform duration-150 active:scale-[0.96]"
          onClick={onToggleFilters}
          type="button"
        >
          <FilterIcon />
          {filtersOpen ? t("feed.hideFilters") : t("feed.filters")}
        </button>
      </div>

      {filtersOpen ? (
        <div className="mt-3 rounded-xl border border-[#e4ebe6] bg-white p-4">
          <FilterFields
            budgetRange={budgetRange}
            category={category}
            city={city}
            onBudgetChange={onBudgetChange}
            onCategoryChange={onCategoryChange}
            onCityChange={onCityChange}
            onClear={onClearFilters}
          />
        </div>
      ) : null}

      <div className="mt-5 border-b border-[#e4ebe6]">
        <p className="m-0 inline-flex border-b-2 border-[#B9563B] pb-3 text-sm font-semibold text-ink">
          {t("feed.tabRecent")}
        </p>
      </div>

      <div aria-busy={status === "LoadingFirstPage" || status === "LoadingMore"} className="mt-2 ">
        {status === "LoadingFirstPage" ? (
          <FeedSkeleton />
        ) : projects.length === 0 && status === "Exhausted" ? (
          <div className="px-1 py-14">
            <h2 className="m-0 text-lg font-semibold text-ink">{t("feed.emptyTitle")}</h2>
            <p className="mt-2 mb-0 max-w-md text-sm leading-6 text-muted">{t("feed.emptyLead")}</p>
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {projects.map((project) => (
              <li className="border-b border-[#e7eeea]" key={project.id}>
                <ProjectRow now={now} project={project} />
              </li>
            ))}
          </ul>
        )}
        {status === "LoadingMore" ? <FeedSkeleton /> : null}
        {status === "CanLoadMore" ? (
          <div className="flex justify-center py-6">
            <button
              className="min-h-11 rounded-full border border-brand bg-white px-5 text-sm font-semibold text-brand transition-[background-color,color,transform] duration-150 hover:bg-[#B9563B] hover:text-white active:scale-[0.96]"
              onClick={onLoadMore}
              type="button"
            >
              {tProjects("loadMore")}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProjectRow({ project, now }: { project: Project; now: Date }) {
  const t = useTranslations("auth.companyDashboard");
  const tProjects = useTranslations("companyProjects");
  const tWizard = useTranslations("projectWizard");
  const format = useFormatter();
  const locale = useLocale();
  const category =
    project.primaryCategory === "other" && project.customCategoryText
      ? project.customCategoryText
      : tWizard(`categoryOptions.${project.primaryCategory}`);
  const property = project.propertyType ? tWizard(`propertyTypeOptions.${project.propertyType}`) : null;
  const surface =
    project.surface !== null && !project.surfaceUnknown
      ? tProjects("card.surface", { value: format.number(project.surface) })
      : null;
  const href = { pathname: routes.companyProject, params: { projectId: project.id } } as const;

  return (
    <article className="group -mx-4 rounded-xl px-4 py-5 transition-[background-color] duration-150 hover:bg-[#f1f4f2] focus-within:bg-[#f1f4f2]">
      <p className="m-0 text-[13px] text-muted">
        {project.publishedAt ? (
          <time dateTime={new Date(project.publishedAt).toISOString()}>
            {t("feed.posted", { when: format.relativeTime(project.publishedAt, now) })}
          </time>
        ) : (
          tProjects("card.clientPrivate")
        )}
      </p>
      <h2 className="mt-1.5 mb-0 text-[1.22rem] leading-7 font-semibold tracking-[-0.02em] text-ink">
        <Link
          className="rounded-sm outline-none transition-colors duration-150  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          href={href}
        >
          {project.title}
        </Link>
      </h2>
      <p className="mt-1 mb-0 text-sm text-ink/80">
        {tWizard(`budgetOptions.${project.budgetRange}`)}
        <span aria-hidden> · </span>
        {tWizard(`timelineOptions.${project.timeline}`)}
        <span aria-hidden> · </span>
        {tWizard(`cityOptions.${project.city}`)}
      </p>
      <p className="mt-3 mb-0 line-clamp-3 text-sm leading-6 text-[#3d3d3d]">
        {project.description}{" "}
        <Link className="font-semibold " href={href}>
          {t("feed.more")}
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Tag>{category}</Tag>
        {property ? <Tag>{property}</Tag> : null}
        {surface ? <Tag>{surface}</Tag> : null}
      </div>
      <p className="mt-4 mb-0 text-[13px] text-muted">
        {project.client
          ? tProjects("card.client", {
              name: project.client.displayName,
              date: formatMarketplaceDateTime(project.client.joinedAt, locale, { month: "short", year: "numeric" }),
            })
          : tProjects("card.clientPrivate")}
        <span aria-hidden> · </span>
        {tWizard(`cityOptions.${project.city}`)}
      </p>
    </article>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-[#efefef] px-3 py-1 text-[13px] text-[#5e5e5e]">{children}</span>;
}

function CompanySidebar({ profile, verification }: { profile: Profile; verification: VerificationStatus }) {
  const t = useTranslations("auth.companyDashboard");
  const tServices = useTranslations("auth.companyOnboarding.services");
  const [reachOpen, setReachOpen] = useState(true);
  const completion = profileCompletion(profile);
  const serviceLine = profile.services
    .slice(0, 2)
    .map((service) => (tServices.has(service) ? tServices(service) : service))
    .join(" · ");
  const showVerificationCta = verification === "draft" || verification === "rejected";

  return (
    <aside className="grid gap-4 lg:sticky lg:top-24">
      <section className="rounded-2xl border border-[#e4ebe6] bg-white px-5 py-5">
        <div className="flex items-center gap-3">
          {profile.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="size-14 rounded-full object-cover outline outline-black/10"
              src={profile.logoUrl}
            />
          ) : (
            <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
              {initials(profile.name)}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="m-0 truncate text-base font-semibold text-ink">{profile.name}</h2>
            <p className="mt-0.5 mb-0 truncate text-sm text-muted">{serviceLine || profile.city}</p>
          </div>
        </div>

        <div className="mt-5 border-t border-[#eef2f0] pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-sm text-ink">{t("sidebar.profileVisibility")}</p>
            <Link
              aria-label={t("sidebar.editProfile")}
              className="grid size-8 place-items-center rounded-md text-muted hover:bg-[#f4f7f5] hover:text-ink"
              href={routes.companyProfileManagement}
            >
              <PencilIcon />
            </Link>
          </div>
          <p className="mt-2 mb-0 text-sm text-muted">{t(`sidebar.visibility.${verification}`)}</p>
        </div>

        <div className="mt-4 border-t border-[#eef2f0] pt-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="m-0 text-ink">{t("sidebar.completeProfile")}</p>
            <p className="m-0 font-semibold text-[#108a00]">{t("sidebar.progress", { value: completion })}</p>
          </div>
          <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e6eee8]">
            <div className="h-full rounded-full bg-[#108a00]" style={{ width: `${completion}%` }} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#e4ebe6] bg-white">
        <button
          aria-expanded={reachOpen}
          className="flex min-h-14 w-full items-center justify-between px-5 text-left text-[15px] font-semibold text-ink"
          onClick={() => setReachOpen((open) => !open)}
          type="button"
        >
          {t("sidebar.reachMore")}
          <ChevronIcon open={reachOpen} />
        </button>
        {reachOpen ? (
          <div className="border-t border-[#eef2f0] px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="m-0 text-sm font-medium text-ink">{t("sidebar.verificationBadge")}</p>
                <p className="mt-1 mb-0 text-sm text-muted">{t(verificationStatusKey[verification])}</p>
              </div>
              <Link
                aria-label={t(verificationHeadlineKey[verification])}
                className="grid size-8 place-items-center rounded-md text-muted hover:bg-[#f4f7f5] hover:text-ink"
                href={routes.companyVerification}
              >
                <PencilIcon />
              </Link>
            </div>
            <p className="mt-3 mb-0 text-sm leading-6 text-muted">{t(verificationLeadKey[verification])}</p>
            {showVerificationCta ? (
              <Link
                className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-brand hover:underline"
                href={routes.companyVerification}
              >
                {t(verification === "rejected" ? "resubmit" : "startVerification")}
              </Link>
            ) : null}
            <Link
              className="mt-4 flex items-center justify-between border-t border-[#eef2f0] pt-4 text-sm text-ink hover:text-[#B9563B]"
              href={routes.companyPortfolio}
            >
              <span>{t("sidebar.portfolio")}</span>
              <span className="text-muted">{t("portfolioAction")}</span>
            </Link>
          </div>
        ) : null}
      </section>

      <nav aria-label={t("sidebar.reachMore")} className="overflow-hidden rounded-2xl border border-[#e4ebe6] bg-white">
        <SidebarLink href={routes.messages} label={t("sidebar.messages")} />
        <SidebarLink href={routes.companyProjects} label={t("findWorkTitle")} />
        <SidebarLink href={routes.contact} label={t("sidebar.contact")} />
      </nav>
    </aside>
  );
}

function SidebarLink({
  href,
  label,
}: {
  href: typeof routes.messages | typeof routes.companyProjects | typeof routes.contact;
  label: string;
}) {
  return (
    <Link
      className="flex min-h-12 items-center justify-between border-b border-[#eef2f0] px-5 text-sm font-medium text-ink last:border-b-0 hover:bg-[#f7faf8]"
      href={href}
    >
      {label}
      <span aria-hidden className="text-muted">
        ›
      </span>
    </Link>
  );
}

function FilterFields({
  city,
  category,
  budgetRange,
  onCityChange,
  onCategoryChange,
  onBudgetChange,
  onClear,
}: {
  city: City | "";
  category: Category | "";
  budgetRange: Budget | "";
  onCityChange: (value: City | "") => void;
  onCategoryChange: (value: Category | "") => void;
  onBudgetChange: (value: Budget | "") => void;
  onClear: () => void;
}) {
  const t = useTranslations("companyProjects");
  const tWizard = useTranslations("projectWizard");

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button className="min-h-10 text-xs font-semibold text-brand" onClick={onClear} type="button">
          {t("clearFilters")}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FilterSelect id="company-feed-city" label={t("filters.city")} onChange={(value) => onCityChange(value as City | "")} value={city}>
          <option value="">{t("filters.allCities")}</option>
          {projectCities.map((item) => (
            <option key={item} value={item}>
              {tWizard(`cityOptions.${item}`)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="company-feed-category"
          label={t("filters.category")}
          onChange={(value) => onCategoryChange(value as Category | "")}
          value={category}
        >
          <option value="">{t("filters.allCategories")}</option>
          {projectCategories.map((item) => (
            <option key={item} value={item}>
              {tWizard(`categoryOptions.${item}`)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="company-feed-budget"
          label={t("filters.budget")}
          onChange={(value) => onBudgetChange(value as Budget | "")}
          value={budgetRange}
        >
          <option value="">{t("filters.allBudgets")}</option>
          {projectBudgetRanges.map((item) => (
            <option key={item} value={item}>
              {tWizard(`budgetOptions.${item}`)}
            </option>
          ))}
        </FilterSelect>
      </div>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-muted" htmlFor={id}>
      {label}
      <select
        className="min-h-11 rounded-lg border border-[#d5ddd8] bg-white px-3 text-sm font-normal text-ink outline-none focus:border-brand"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}

function FeedSkeleton() {
  return (
    <div className="grid gap-6 py-5">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="animate-pulse" key={index}>
          <div className="h-3 w-28 rounded bg-[#e6eee8]" />
          <div className="mt-3 h-6 w-4/5 rounded bg-[#e6eee8]" />
          <div className="mt-3 h-4 w-full rounded bg-[#eef3f0]" />
          <div className="mt-2 h-4 w-2/3 rounded bg-[#eef3f0]" />
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

function SearchIcon() {
  return (
    <svg aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" fill="none" viewBox="0 0 20 20">
      <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m12.5 12.5 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden className="size-4" fill="none" viewBox="0 0 16 16">
      <path d="M2 4h12M4.5 8h7M6.5 12h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden className="size-4" fill="none" viewBox="0 0 16 16">
      <path d="m4 4 8 8M12 4 4 12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden className="size-4" fill="none" viewBox="0 0 16 16">
      <path d="M9.2 3.2 12.8 6.8 5.5 14.1 2 14.9 2.8 11.4 9.2 3.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      className={joinClassNames("size-4 text-muted transition-transform duration-150", open && "rotate-180")}
      fill="none"
      viewBox="0 0 16 16"
    >
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}
