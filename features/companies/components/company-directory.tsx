"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "@/convex/_generated/api";
import { getPathname } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { CompanyDiscoveryCardSkeleton } from "./company-directory-skeleton";

const services = [
  "houseConstruction",
  "renovation",
  "structural",
  "finishing",
  "architecture",
  "interior",
  "electrical",
  "plumbing",
  "joinery",
  "pool",
] as const;

type Service = (typeof services)[number];
type Sort = "newest" | "oldest";
type CompanyResult = FunctionReturnType<
  typeof api.companies.directory.listPublicCompanies
>["page"][number];
const COMPANY_PAGE_SIZE = 12;

export function CompanyDirectory() {
  const t = useTranslations("companyDirectory");
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [service, setService] = useState<Service | "">("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 250);
  const debouncedCity = useDebouncedValue(city, 250);
  const isSearchMode = Boolean(debouncedSearch.trim() || debouncedCity.trim() || service);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);

  const queryArgs = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      city: debouncedCity.trim() || undefined,
      service: service || undefined,
      verifiedOnly,
      sort: isSearchMode ? ("relevance" as const) : sort,
    }),
    [debouncedCity, debouncedSearch, isSearchMode, service, sort, verifiedOnly],
  );

  const { results, status, loadMore } = usePaginatedQuery(
    api.companies.directory.listPublicCompanies,
    queryArgs,
    { initialNumItems: COMPANY_PAGE_SIZE },
  );
  const companies = useMemo(
    () => Array.from(new Map(results.map((company) => [company.id, company])).values()),
    [results],
  );

  const clearFilters = () => {
    setSearch("");
    setCity("");
    setService("");
    setVerifiedOnly(false);
    setSort("newest");
    setFiltersOpen(false);
  };

  const filterProps = {
    city,
    service,
    verifiedOnly,
    onCityChange: setCity,
    onServiceChange: setService,
    onVerifiedChange: setVerifiedOnly,
    onClear: clearFilters,
  };

  return (
    <div className="min-h-[70vh] bg-white">
      <header className=" bg-white">
        <div className="mx-auto w-[calc(100%-36px)] max-w-[1120px] py-6 sm:w-[calc(100%-48px)] sm:py-8">
          <p className="mb-2 text-[0.68rem] font-semibold tracking-[0.14em] text-brand uppercase">{t("eyebrow")}</p>
          <h1 className="mb-0 max-w-[640px] text-[1.35rem] leading-7 font-semibold tracking-[-0.03em] text-ink sm:text-[1.6rem] sm:leading-8">{t("title")}</h1>
          <p className="mt-1.5 mb-0 max-w-[640px] text-sm leading-6 text-muted">{t("lead")}</p>
          <label className="relative mt-5 block max-w-[640px]" htmlFor="company-search">
            <span className="sr-only">{t("searchLabel")}</span>
            <SearchIcon />
            <input
              className="min-h-11 w-full rounded-full border border-brand-border bg-white pr-4 pl-11 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted/70 focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]"
              id="company-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchPlaceholder")}
              type="search"
              value={search}
            />
          </label>
        </div>
      </header>

      <main className="mx-auto w-[calc(100%-36px)] max-w-[1120px] py-6 sm:w-[calc(100%-48px)] sm:py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 lg:pl-[232px]">
          <div className="flex items-center gap-3">
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold text-ink active:scale-[0.96] lg:hidden"
              onClick={() => setFiltersOpen(true)}
              type="button"
            >
              <FilterIcon />
              {t("filters")}
            </button>
            {status !== "LoadingFirstPage" ? (
              <p aria-live="polite" className="m-0 text-sm text-muted">{t("loadedCount", { count: companies.length })}</p>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-ink" htmlFor="company-sort">
            <span>{t("sort.label")}</span>
            <select
              className="min-h-11 rounded-xl border border-brand-border bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
              disabled={isSearchMode}
              id="company-sort"
              onChange={(event) => setSort(event.target.value as Sort)}
              value={isSearchMode ? "relevance" : sort}
            >
              {isSearchMode ? <option value="relevance">{t("sort.relevance")}</option> : null}
              <option value="newest">{t("sort.newest")}</option>
              <option value="oldest">{t("sort.oldest")}</option>
            </select>
          </label>
        </div>

        <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden self-start lg:sticky lg:top-24 lg:block">
            <FilterFields {...filterProps} idPrefix="desktop" />
          </aside>

          <section aria-busy={status === "LoadingFirstPage" || status === "LoadingMore"} aria-label={t("resultsLabel")}>
            {status === "LoadingFirstPage" ? (
              <CompanyResultsSkeleton label={t("loading")} />
            ) : companies.length === 0 && status === "Exhausted" ? (
              <EmptyCompanies onClear={clearFilters} />
            ) : (
              <>
                <ul className="m-0 list-none p-0">
                  {companies.map((company) => (
                    <li className="" key={company.id}>
                      <CompanyCard company={company} onViewProfile={() => setPreviewSlug(company.slug)} />
                    </li>
                  ))}
                </ul>
                {status === "LoadingMore" ? <CompanyResultsSkeleton compact label={t("loadingMore")} /> : null}
                {status === "CanLoadMore" ? (
                  <div className="mt-8 flex justify-center">
                    <button
                      className="inline-flex min-h-12 items-center justify-center rounded-xl border border-brand px-6 text-sm font-semibold text-brand transition-[background-color,color,transform] duration-150 hover:bg-brand hover:text-white active:scale-[0.96]"
                      onClick={() => loadMore(COMPANY_PAGE_SIZE)}
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
      </main>

      <FilterSheet onClose={closeFilters} open={filtersOpen} title={t("filters")}>
        <FilterFields {...filterProps} idPrefix="mobile" showHeading={false} />
      </FilterSheet>
      {previewSlug ? <CompanyProfileSheet onClose={() => setPreviewSlug(null)} slug={previewSlug} /> : null}
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

function FilterFields({
  city,
  service,
  verifiedOnly,
  onCityChange,
  onServiceChange,
  onVerifiedChange,
  onClear,
  idPrefix,
  showHeading = true,
}: {
  city: string;
  service: Service | "";
  verifiedOnly: boolean;
  onCityChange: (value: string) => void;
  onServiceChange: (value: Service | "") => void;
  onVerifiedChange: (value: boolean) => void;
  onClear: () => void;
  idPrefix: string;
  showHeading?: boolean;
}) {
  const t = useTranslations("companyDirectory");
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        {showHeading ? <h2 className="m-0 text-sm font-semibold text-ink">{t("filters")}</h2> : <span />}
        <button className="min-h-11 text-xs font-semibold text-brand" onClick={onClear} type="button">{t("clear")}</button>
      </div>
      <div className="mt-4 grid gap-6">
        <label className="grid gap-2 text-sm font-medium text-ink" htmlFor={`${idPrefix}-city`}>
          {t("city.label")}
          <input
            className="min-h-11 rounded-lg border border-brand-border bg-white px-3 text-sm font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            id={`${idPrefix}-city`}
            onChange={(event) => onCityChange(event.target.value)}
            placeholder={t("city.placeholder")}
            value={city}
          />
        </label>
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className="mb-1 text-sm font-medium text-ink">{t("service.label")}</legend>
          <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm font-normal text-ink" htmlFor={`${idPrefix}-service-all`}>
            <input checked={service === ""} className="size-4 accent-brand" id={`${idPrefix}-service-all`} name={`${idPrefix}-service`} onChange={() => onServiceChange("")} type="radio" />
            {t("service.all")}
          </label>
          {services.map((item) => (
            <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm font-normal text-ink" htmlFor={`${idPrefix}-service-${item}`} key={item}>
              <input checked={service === item} className="size-4 accent-brand" id={`${idPrefix}-service-${item}`} name={`${idPrefix}-service`} onChange={() => onServiceChange(item)} type="radio" />
              {t(`service.options.${item}`)}
            </label>
          ))}
        </fieldset>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-ink" htmlFor={`${idPrefix}-verified`}>
          <input checked={verifiedOnly} className="size-4 accent-brand" id={`${idPrefix}-verified`} onChange={(event) => onVerifiedChange(event.target.checked)} type="checkbox" />
          {t("verifiedOnly")}
        </label>
      </div>
    </div>
  );
}

function FilterSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const t = useTranslations("companyDirectory");
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);
  if (!open) return null;
  return (
    <div aria-label={title} aria-modal="true" className="fixed inset-0 z-[70] lg:hidden" role="dialog">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/45" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-[min(88vw,360px)] overflow-y-auto bg-white p-5 shadow-[-20px_0_50px_rgb(23_61_99/0.15)]">
        <div className="mb-7 flex items-center justify-between border-b border-brand-border pb-4">
          <h2 className="m-0 text-lg font-semibold text-ink">{title}</h2>
          <button ref={closeRef} aria-label={t("closeFilters")} className="grid size-11 place-items-center rounded-full border border-brand-border text-ink" onClick={onClose} type="button"><CloseIcon /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CompanyProfileSheet({ slug, onClose }: { slug: string; onClose: () => void }) {
  const t = useTranslations("companyDirectory");
  const tProfile = useTranslations("publicCompany");
  const locale = useLocale();
  const profile = useQuery(api.portfolio.index.getPublicCompanyProfile, { slug });
  const closeRef = useRef<HTMLButtonElement>(null);
  const profileHref = getPathname({
    locale: isAppLocale(locale) ? locale : routing.defaultLocale,
    href: { pathname: "/entreprises/[slug]", params: { slug } },
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const initials = profile?.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") ?? "";
  const sheet = (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <button aria-label={t("closeProfile")} className="absolute inset-0 bg-ink/45" onClick={onClose} type="button" />
      <section
        aria-labelledby="company-profile-sheet-title"
        aria-modal="true"
        className="sheet-panel absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-[-16px_0_40px_rgb(23_61_99/0.16)] sm:w-[min(100%,720px)]"
        role="dialog"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-brand-border bg-white px-3 py-2.5 sm:px-4">
          <button
            aria-label={t("closeProfile")}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink transition-colors duration-150 hover:bg-brand-soft"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <BackIcon />
          </button>
          <a
            className="inline-flex min-h-11 max-w-[70%] items-center justify-end gap-1.5 text-right text-sm font-semibold text-brand"
            href={profileHref}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span>{t("openInNewWindow")}</span>
            <ExternalIcon />
          </a>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {profile === undefined ? (
            <p className="m-0 px-5 py-6 text-sm text-muted sm:px-6" role="status">{t("profileLoading")}</p>
          ) : profile === null ? (
            <p className="m-0 px-5 py-6 text-sm text-muted sm:px-6">{t("empty")}</p>
          ) : (
            <>
              <div className=" px-5 py-6 sm:px-6">
                <div className="flex items-start gap-4">
                  <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft text-lg font-semibold text-brand outline outline-1 outline-black/10 sm:size-20">
                    {profile.logoUrl ? <Image alt={t("logoAlt", { name: profile.name })} className="object-cover" fill sizes="80px" src={profile.logoUrl} /> : <span aria-hidden>{initials}</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="m-0 text-xl leading-7 font-semibold tracking-[-0.03em] text-ink sm:text-2xl" id="company-profile-sheet-title">{profile.name}</h2>
                      {profile.isVerified ? <span className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">{tProfile("verified")}</span> : null}
                    </div>
                    <p className="mt-1.5 mb-0 text-sm leading-5 text-muted">{profile.city}</p>
                    {profile.yearsExperience !== null ? <p className="mt-1 mb-0 text-sm leading-5 text-ink">{tProfile("years", { count: profile.yearsExperience })}</p> : null}
                  </div>
                </div>
                <p className="mt-5 mb-0 text-sm leading-6 text-ink/85">{profile.description}</p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <button className="button button-primary w-full cursor-not-allowed opacity-70" disabled type="button">{tProfile("invite")}</button>
                  <button className="button w-full cursor-not-allowed border border-brand-border bg-white text-ink opacity-70" disabled type="button">{tProfile("quote")}</button>
                </div>
                <p className="mt-2 mb-0 text-center text-xs leading-5 text-muted">{tProfile("ctaSoon")}</p>
              </div>

              <div className="grid gap-8 px-5 py-6 sm:px-6">
                <section>
                  <h3 className="m-0 text-base font-semibold text-ink">{tProfile("services")}</h3>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {profile.services.filter(isService).map((item) => (
                      <span className="rounded-full bg-[#eef1f4] px-2.5 py-1 text-xs font-medium text-ink" key={item}>{t(`service.options.${item}`)}</span>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="m-0 text-base font-semibold text-ink">{tProfile("experience")}</h3>
                  <p className="mt-2 mb-0 text-sm leading-6 text-ink">{profile.yearsExperience === null ? tProfile("notSpecified") : tProfile("years", { count: profile.yearsExperience })}</p>
                </section>

                <section>
                  <h3 className="m-0 text-base font-semibold text-ink">{tProfile("website")}</h3>
                  {profile.website ? (
                    <a className="mt-2 inline-flex text-sm font-semibold text-brand underline decoration-brand/30 underline-offset-4" href={profile.website} rel="noopener noreferrer" target="_blank">{tProfile("visitWebsite")}</a>
                  ) : (
                    <p className="mt-2 mb-0 text-sm text-muted">{tProfile("notSpecified")}</p>
                  )}
                </section>

                <section>
                  <h3 className="m-0 text-base font-semibold text-ink">{tProfile("portfolioTitle")}</h3>
                  {profile.portfolio.length === 0 ? (
                    <p className="mt-2 mb-0 text-sm text-muted">{tProfile("portfolioEmpty")}</p>
                  ) : (
                    <ul className="m-0 mt-3 grid list-none gap-3 p-0">
                      {profile.portfolio.map((project) => (
                        <li className="overflow-hidden rounded-xl border border-brand-border" key={project.id}>
                          <div className="relative aspect-[16/9] bg-brand-soft outline outline-1 outline-black/10">
                            <Image alt={tProfile("projectImageAlt", { title: project.title })} className="object-cover" fill sizes="(max-width: 720px) 100vw, 720px" src={project.coverImageUrl} />
                          </div>
                          <div className="p-4">
                            <p className="m-0 text-[0.68rem] font-semibold tracking-[0.06em] text-brand uppercase">{tProfile(`projectType.${project.projectType}`)}</p>
                            <p className="mt-1 mb-0 text-sm font-semibold text-ink">{project.title}</p>
                            <p className="mt-1 mb-0 text-sm leading-6 text-muted">{project.description}</p>
                            <p className="mt-3 mb-0 text-xs font-medium text-muted">{[project.city, project.year].filter(Boolean).join(" · ")}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );

  if (typeof document === "undefined") return sheet;
  return createPortal(sheet, document.body);
}

function isAppLocale(value: string): value is AppLocale {
  return routing.locales.includes(value as AppLocale);
}

function isService(value: string): value is Service {
  return (services as readonly string[]).includes(value);
}

function BackIcon() {
  return (
    <svg aria-hidden className="size-5" fill="none" viewBox="0 0 20 20">
      <path d="M12.5 4.5 7 10l5.5 5.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg aria-hidden className="size-4 shrink-0" fill="none" viewBox="0 0 16 16">
      <path d="M6.5 3.5H3.75A1.25 1.25 0 0 0 2.5 4.75v7.5c0 .69.56 1.25 1.25 1.25h7.5c.69 0 1.25-.56 1.25-1.25V9.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <path d="M8.5 2.5h5v5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
      <path d="M13.5 2.5 7.5 8.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

function CompanyCard({ company, onViewProfile }: { company: CompanyResult; onViewProfile: () => void }) {
  const t = useTranslations("companyDirectory");
  const initials = company.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  const meta = [
    company.city,
    company.yearsExperience !== null ? t("years", { count: company.yearsExperience }) : null,
  ].filter(Boolean);
  return (
    <article className="-mx-2 flex gap-4 rounded-xl px-2 py-6 transition-[background-color] duration-150 ease-out hover:bg-[#f4f7fa] sm:-mx-3 sm:gap-5 sm:px-3">
      <div className="relative mt-0.5 grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft text-sm font-semibold text-brand ring-1 ring-black/5 sm:size-14">
        {company.logoUrl ? <Image alt={t("logoAlt", { name: company.name })} className="object-cover" fill sizes="56px" src={company.logoUrl} /> : <span aria-hidden>{initials}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="m-0 text-[1.05rem] leading-6 font-semibold tracking-[-0.025em] text-ink sm:text-[1.125rem]">{company.name}</h2>
              {company.isVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[0.7rem] font-semibold tracking-[0.01em] text-brand">
                  <VerifiedIcon />
                  {t("verified")}
                </span>
              ) : null}
            </div>
            {meta.length > 0 ? <p className="mt-1 mb-0 text-sm leading-5 text-muted">{meta.join(" · ")}</p> : null}
          </div>
          <button
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-full border border-brand/80 bg-white px-3.5 text-sm font-semibold text-brand shadow-[0_0_0_0_transparent] transition-[background-color,border-color,color,box-shadow,transform] duration-150 hover:border-brand hover:bg-brand hover:text-white hover:shadow-[0_6px_16px_rgb(5_79_132/0.18)] active:scale-[0.96]"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onViewProfile();
            }}
            type="button"
          >
            {t("viewProfile")}
          </button>
        </div>
        <p className="mt-2.5 mb-0 line-clamp-2 max-w-[54rem] text-sm leading-6 text-ink/75">{company.description}</p>
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {company.services.slice(0, 6).map((item) => (
            <span className="rounded-md bg-[#eef1f4] px-2.5 py-1 text-xs font-medium text-ink/90" key={item}>{t(`service.options.${item}`)}</span>
          ))}
        </div>
        {company.portfolio.length > 0 ? (
          <div className="mt-3.5 flex items-center gap-2">
            <span className="sr-only">{t("portfolioPreview")}</span>
            {company.portfolio.slice(0, 3).map((item) => (
              <div className="relative size-12 overflow-hidden rounded-lg bg-surface-muted ring-1 ring-black/5" key={`${item.title}-${item.url}`}>
                <Image alt={t("portfolioAlt", { title: item.title })} className="object-cover" fill sizes="48px" src={item.url} />
              </div>
            ))}
            <span className="text-xs text-muted">{t("portfolioCount", { count: company.portfolio.length })}</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function EmptyCompanies({ onClear }: { onClear: () => void }) {
  const t = useTranslations("companyDirectory");
  return (
    <div className="rounded-2xl border border-dashed border-brand-border bg-white px-5 py-14 text-center sm:px-8">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft text-brand"><SearchIcon staticPosition /></div>
      <h2 className="mt-5 mb-0 text-xl font-semibold text-ink">{t("empty")}</h2>
      <p className="mx-auto mt-3 mb-0 max-w-md text-sm leading-6 text-muted">{t("emptyLead")}</p>
      <button className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-white active:scale-[0.96]" onClick={onClear} type="button">{t("clear")}</button>
    </div>
  );
}

function CompanyResultsSkeleton({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite" className={compact ? "mt-2 border-t border-[#e4eaf0]" : "border-t border-[#e4eaf0]"} role="status">
      <span className="sr-only">{label}</span>
      {(compact ? [0] : [0, 1, 2]).map((index) => (
        <div className="border-b border-[#e4eaf0]" key={index}>
          <CompanyDiscoveryCardSkeleton />
        </div>
      ))}
    </div>
  );
}

function SearchIcon({ staticPosition = false }: { staticPosition?: boolean }) { return <svg aria-hidden className={staticPosition ? "size-5" : "pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted"} fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>; }
function FilterIcon() { return <svg aria-hidden className="size-4" fill="none" viewBox="0 0 16 16"><path d="M2 4h12M4 8h8m-6 4h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" /></svg>; }
function CloseIcon() { return <svg aria-hidden className="size-4" fill="none" viewBox="0 0 16 16"><path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" /></svg>; }
function VerifiedIcon() {
  return (
    <svg aria-hidden className="size-3" fill="none" viewBox="0 0 12 12">
      <path d="M2.5 6.2 4.7 8.4 9.5 3.6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}
