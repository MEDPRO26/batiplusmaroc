"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  companyPath,
  featuredMarketplaceCompanies,
  marketplaceOpenProjects,
  type MarketplaceCompany,
  type MarketplaceOpenProject,
} from "@/content/marketplace";
import { routes } from "@/lib/routes";
import { joinClassNames } from "@/lib/utils";
import { outfit } from "@/components/shared/outfit";

type Feed = "projects" | "companies";

export function MarketplaceFeed() {
  const t = useTranslations("home.feed");
  const [feed, setFeed] = useState<Feed>("projects");
  const companies = featuredMarketplaceCompanies();

  return (
    <section
      aria-labelledby="marketplace-feed-title"
      className={`${outfit.className} bg-bg py-16 text-start sm:py-22 lg:py-30`}
    >
      <div className="mx-auto w-[calc(100%-36px)] max-w-7xl sm:w-[calc(100%-64px)] lg:w-[calc(100%-80px)]">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
          <header className="max-w-160 text-start">
            <p className="mb-3 text-[0.8rem] font-medium tracking-[-0.01em] text-brand">{t("eyebrow")}</p>
            <h2
              className="mb-0 text-[clamp(1.85rem,4.4vw,3.15rem)] leading-[1.04] font-semibold tracking-[-0.045em] text-ink!"
              id="marketplace-feed-title"
            >
              {t(`${feed}.title`)}
            </h2>
            <p className="mt-4 max-w-136 text-[1rem] leading-7 text-muted sm:mt-5 sm:text-[1.05rem] sm:leading-7">
              {t(`${feed}.description`)}
            </p>
          </header>

          <div
            aria-label={t("feedLabel")}
            className="how-it-works-audience flex w-full max-w-full shrink-0 rounded-full border border-brand-border bg-white p-1 sm:w-fit"
            role="radiogroup"
          >
            {(["projects", "companies"] as const).map((value) => {
              const selected = feed === value;

              return (
                <button
                  aria-checked={selected}
                  className={joinClassNames(
                    "min-h-11 flex-1 cursor-pointer appearance-none rounded-full px-4 py-2 text-[0.88rem] font-medium tracking-[-0.015em] transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] sm:min-h-12 sm:flex-none sm:px-5",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.96]",
                  )}
                  key={value}
                  onClick={() => setFeed(value)}
                  role="radio"
                  type="button"
                >
                  {t(`${value}.tab`)}
                </button>
              );
            })}
          </div>
        </div>

        {feed === "projects" ? (
          <ul className="mt-10 grid list-none grid-cols-1 gap-4 p-0 sm:mt-12 lg:grid-cols-2 lg:gap-5">
            {marketplaceOpenProjects.map((project) => (
              <li key={project.id}>
                <OpenProjectCard project={project} />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-10 grid list-none grid-cols-1 gap-4 p-0 sm:mt-12 lg:grid-cols-2 lg:gap-5">
            {companies.map((company) => (
              <li key={company.id}>
                <FeaturedCompanyCard company={company} />
              </li>
            ))}
          </ul>
        )}

        <div className="mt-10 sm:mt-12">
          <Link
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 text-[0.92rem] font-semibold text-white! transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-brand-hover hover:text-white! active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            href={feed === "projects" ? routes.browseProjects : routes.companies}
          >
            {t(`${feed}.cta`)}
          </Link>
        </div>
      </div>
    </section>
  );
}

function OpenProjectCard({ project }: { project: MarketplaceOpenProject }) {
  const t = useTranslations("home.feed");
  const tMarket = useTranslations("home.marketplace");
  const title = t(`projects.${project.id}.title` as Parameters<typeof t>[0]);

  return (
    <article className="h-full rounded-md border border-brand-border bg-white p-5 shadow-[0_8px_24px_rgb(23_61_99/0.05)] transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:border-brand hover:shadow-[0_12px_32px_rgb(23_61_99/0.08)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mb-0 text-[0.78rem] font-medium text-muted">
          {t("posted", { days: project.postedDays })}
          <span aria-hidden="true"> · </span>
          {project.city}
        </p>
        {project.verifiedClient ? (
          <p className="mb-0 inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-brand">
            <VerifiedIcon />
            {t("verifiedClient")}
          </p>
        ) : null}
      </div>

      <h3 className="mt-3 mb-0 text-[1.15rem] leading-snug font-semibold tracking-[-0.03em] text-ink sm:text-[1.25rem]">
        <Link
          className="text-ink! hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          href={routes.browseProjects}
        >
          {title}
        </Link>
      </h3>

      <p className="mt-2 mb-0 line-clamp-2 text-[0.92rem] leading-6 text-muted">{t(`projects.${project.id}.text` as Parameters<typeof t>[0])}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-brand-soft px-3 py-1 text-[0.78rem] font-medium text-brand">
          {tMarket(`categories.${project.category}`)}
        </span>
        <span className="rounded-full bg-surface-muted px-3 py-1 text-[0.78rem] font-medium text-ink">
          {t(`projects.${project.id}.budget` as Parameters<typeof t>[0])}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-brand-border pt-4">
        <p className="mb-0 text-[0.84rem] text-muted">{t("proposals", { count: project.proposals })}</p>
        <Link
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand px-4 text-[0.82rem] font-semibold text-white! hover:bg-brand-hover hover:text-white! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          href={routes.browseProjects}
        >
          {t("viewProject")}
        </Link>
      </div>
    </article>
  );
}

function FeaturedCompanyCard({ company }: { company: MarketplaceCompany }) {
  const t = useTranslations("home.feed");
  const tMarket = useTranslations("home.marketplace");
  const services = company.services.map((service) => tMarket(`categories.${service}`)).join(" · ");

  return (
    <article className="flex h-full flex-col gap-5 rounded-md border border-brand-border bg-white p-5 shadow-[0_8px_24px_rgb(23_61_99/0.05)] transition-[border-color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:border-brand hover:shadow-[0_12px_32px_rgb(23_61_99/0.08)] sm:flex-row sm:p-6">
      <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden rounded-md bg-surface-muted outline-1 outline-black/10 sm:aspect-auto sm:h-auto sm:w-[148px]">
        <Image
          alt={tMarket("imageAlt", { company: company.name, city: company.city })}
          className="object-cover"
          fill
          sizes="(max-width: 639px) 100vw, 148px"
          src={company.image}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <h3 className="mb-0 text-[1.05rem] leading-tight font-semibold tracking-[-0.02em] text-ink">{company.name}</h3>
          {company.verified ? (
            <span className="inline-flex text-brand" title={tMarket("verified")}>
              <span className="sr-only">{tMarket("verified")}</span>
              <VerifiedIcon />
            </span>
          ) : null}
        </div>

        <p className="mt-1 mb-0 text-[0.84rem] font-medium text-ink">{t(`companies.${company.id}.headline` as Parameters<typeof t>[0])}</p>
        <p
          aria-label={tMarket("rating", { rating: company.rating.toFixed(1) })}
          className="mt-2 mb-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.84rem] text-ink"
        >
          <span className="inline-flex items-center gap-1">
            <StarIcon />
            <span aria-hidden="true">{company.rating.toFixed(1)}</span>
          </span>
          <span className="text-muted">{company.city}</span>
          <span className="text-muted">{tMarket("projects", { count: company.projectCount })}</span>
        </p>
        <p className="mt-2 mb-0 line-clamp-2 text-[0.88rem] leading-6 text-muted">{t(`companies.${company.id}.pitch` as Parameters<typeof t>[0])}</p>
        <p className="mt-2 mb-0 text-[0.82rem] text-ink">{services}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand px-4 text-[0.82rem] font-semibold text-white! hover:bg-brand-hover hover:text-white! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            href={companyPath(company.slug)}
          >
            {tMarket("viewProfile")}
          </Link>
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-brand-border bg-white px-4 text-[0.82rem] font-semibold text-ink hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            href={routes.postProject}
          >
            {tMarket("invite")}
          </Link>
        </div>
      </div>
    </article>
  );
}

function VerifiedIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 16 16">
      <circle className="fill-brand" cx="8" cy="8" r="7" />
      <path className="stroke-white" d="m5 8.1 2 2 4-4.2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg aria-hidden="true" className="size-3.5 text-brand" viewBox="0 0 16 16">
      <path
        className="fill-current"
        d="M8 1.6 9.7 5.3l4 .3-3 2.8.9 3.9L8 10.4 4.4 12.3l.9-3.9-3-2.8 4-.3z"
      />
    </svg>
  );
}
