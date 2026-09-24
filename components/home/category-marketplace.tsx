"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import {
  companiesForCategory,
  companyPath,
  marketplaceCategories,
  type MarketplaceCategory,
  type MarketplaceCompany,
} from "@/content/marketplace";
import { routes } from "@/lib/routes";
import { joinClassNames } from "@/lib/utils";

export function CategoryMarketplace() {
  const t = useTranslations("home.marketplace");
  const [selected, setSelected] = useState<MarketplaceCategory | null>(null);
  const browsing = selected !== null;
  const companies = useMemo(() => (selected ? companiesForCategory(selected) : []), [selected]);

  return (
    <section aria-labelledby="marketplace-title" className="bg-white py-16 sm:py-20 lg:py-28">
      <div className="mx-auto w-[calc(100%-36px)] max-w-[1280px] sm:w-[calc(100%-48px)] lg:w-[calc(100%-64px)]">
        <h2
          className={joinClassNames(
            "max-w-[18ch] text-[clamp(1.85rem,4.4vw,3.15rem)] leading-[1.04] font-semibold tracking-[-0.045em] text-ink!",
            browsing && "sr-only",
          )}
          id="marketplace-title"
        >
          {t("title")}
        </h2>

        <div
          aria-label={t("categoriesLabel")}
          className={
            browsing
              ? "flex flex-wrap gap-2.5 sm:gap-3"
              : "mt-8 grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:mt-10 lg:grid-cols-5 lg:gap-4"
          }
          role="radiogroup"
        >
          {marketplaceCategories.map((category) => {
            const isSelected = category === selected;

            return (
              <button
                aria-checked={isSelected}
                className={
                  browsing
                    ? joinClassNames(
                        "inline-flex min-h-11 cursor-pointer items-center rounded-[18px] border bg-white px-4 text-[0.88rem] font-medium tracking-[-0.015em] text-ink transition-[border-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] sm:min-h-12 sm:px-5",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.97]",
                        isSelected ? "border-brand shadow-[0_0_0_1px_rgb(5_79_132)]" : "border-brand-border hover:border-brand",
                      )
                    : joinClassNames(
                        "flex min-h-29 cursor-pointer flex-col items-start gap-3 rounded-md border border-brand-border bg-white p-4 text-left shadow-[0_8px_24px_rgb(23_61_99/0.05)] transition-[border-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] sm:min-h-30 sm:p-5",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.97] hover:border-brand",
                      )
                }
                key={category}
                onClick={() => setSelected((current) => (current === category ? null : category))}
                role="radio"
                type="button"
              >
                {browsing ? null : (
                  <span className="text-brand">
                    <CategoryIcon category={category} />
                  </span>
                )}
                <span className={browsing ? undefined : "text-[18px] leading-snug font-medium tracking-[-0.015em] text-ink"}>
                  {t(`categories.${category}`)}
                </span>
              </button>
            );
          })}
        </div>

        {selected ? (
          <div
            aria-live="polite"
            aria-labelledby="marketplace-results-title"
            className="mt-8 lg:mt-10"
            id="marketplace-results"
            role="region"
          >
            <h3 className="sr-only" id="marketplace-results-title">
              {t("resultsLabel", { category: t(`categories.${selected}`) })}
            </h3>

            {companies.length === 0 ? (
              <p className="text-base text-muted">{t("empty")}</p>
            ) : (
              <ul
                className="hero-panel-in -mx-1 flex list-none gap-4 overflow-x-auto px-1 pb-2 scrollbar-none snap-x snap-mandatory md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4 lg:gap-5 xl:grid-cols-5"
                key={selected}
              >
                {companies.map((company) => (
                  <li className="w-[min(78vw,280px)] shrink-0 snap-start md:w-auto" key={company.id}>
                    <CompanyCard company={company} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CompanyCard({ company }: { company: MarketplaceCompany }) {
  const t = useTranslations("home.marketplace");
  const services = company.services.map((service) => t(`categories.${service}`)).join(" · ");

  return (
    <article className="flex h-full flex-col">
      <div className="relative mb-8">
        <div className="relative aspect-4/5 overflow-hidden rounded-md bg-surface-muted ring-1 ring-black/10">
          <Image
            alt={t("imageAlt", { company: company.name, city: company.city })}
            className="object-cover"
            fill
            sizes="(max-width: 767px) 78vw, (max-width: 1023px) 30vw, (max-width: 1279px) 22vw, 220px"
            src={company.image}
          />
        </div>
        <div className="absolute -bottom-5 left-4 grid size-11 place-items-center overflow-hidden rounded-full bg-white shadow-[0_6px_16px_rgb(23_61_99/0.14)] ring-2 ring-white">
          {company.logo ? (
            <Image
              alt=""
              className="object-contain p-1.5"
              height={44}
              src={company.logo}
              width={44}
            />
          ) : (
            <span aria-hidden="true" className="text-[0.72rem] font-semibold tracking-tight text-brand">
              {company.initials}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[0.98rem] leading-tight font-semibold tracking-[-0.02em] text-ink">{company.name}</h3>
          {company.verified ? (
            <span className="inline-flex text-brand" title={t("verified")}>
              <span className="sr-only">{t("verified")}</span>
              <VerifiedIcon />
            </span>
          ) : null}
        </div>

        <p aria-label={t("rating", { rating: company.rating.toFixed(1) })} className="mt-1.5 flex items-center gap-1 text-[0.84rem] text-ink">
          <StarIcon />
          <span aria-hidden="true">{company.rating.toFixed(1)}</span>
        </p>
        <p className="mt-1 text-[0.84rem] text-muted">{company.city}</p>
        <p className="mt-1 text-[0.84rem] leading-snug text-ink">{services}</p>
        <p className="mt-1 text-[0.84rem] text-muted">{t("projects", { count: company.projectCount })}</p>

        <div className="mt-4 flex flex-col gap-2">
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-sm bg-brand px-3 text-[0.82rem] font-semibold text-white transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.97]"
            href={companyPath(company.slug)}
          >
            {t("viewProfile")}
          </Link>
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-sm border border-brand-border bg-white px-3 text-[0.82rem] font-semibold text-ink transition-[border-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.97]"
            href={routes.postProject}
          >
            {t("invite")}
          </Link>
        </div>
      </div>
    </article>
  );
}

const iconSvgProps = {
  "aria-hidden": true as const,
  className: "size-7",
  fill: "none",
  viewBox: "0 0 24 24",
};

function CategoryIcon({ category }: { category: MarketplaceCategory }) {
  const icons: Record<MarketplaceCategory, ReactNode> = {
    houseConstruction: (
      <svg {...iconSvgProps}>
        <path className="stroke-current" d="M4 11.2 12 4.5l8 6.7V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" strokeLinejoin="round" strokeWidth="1.5" />
        <path className="stroke-current" d="M10 21v-6h4v6" strokeLinejoin="round" strokeWidth="1.5" />
      </svg>
    ),
    renovation: (
      <svg {...iconSvgProps}>
        <path className="stroke-current" d="M4 19.5h9.5M8 16.5h10" strokeLinecap="round" strokeWidth="1.5" />
        <path className="stroke-current" d="M15.2 4.6c.9-.9 2.4-.9 3.3 0s.9 2.4 0 3.3L9.2 17.2 5 18.2l1-4.2z" strokeLinejoin="round" strokeWidth="1.5" />
      </svg>
    ),
    structural: (
      <svg {...iconSvgProps}>
        <path className="stroke-current" d="M5 20V9.5L12 4.5l7 5V20" strokeLinejoin="round" strokeWidth="1.5" />
        <path className="stroke-current" d="M9 20v-6h6v6M8 12h8M8 15.2h8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      </svg>
    ),
    finishing: (
      <svg {...iconSvgProps}>
        <rect className="stroke-current" height="14" rx="1.2" strokeWidth="1.5" width="14" x="5" y="5" />
        <path className="stroke-current" d="M5 10h14M10 5v14" strokeWidth="1.5" />
      </svg>
    ),
    architecture: (
      <svg {...iconSvgProps}>
        <path className="stroke-current" d="M12 4v16M7.5 7.5 12 4l4.5 3.5M5 20h14M8 20v-5h8v5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        <circle className="stroke-current" cx="12" cy="11.5" r="1.3" strokeWidth="1.5" />
      </svg>
    ),
    interior: (
      <svg {...iconSvgProps}>
        <path className="stroke-current" d="M5 19v-7l7-5 7 5v7" strokeLinejoin="round" strokeWidth="1.5" />
        <path className="stroke-current" d="M9 19v-5h6v5" strokeLinejoin="round" strokeWidth="1.5" />
        <path className="stroke-current" d="M7 12.5h10" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    ),
    electrical: (
      <svg {...iconSvgProps}>
        <path className="stroke-current" d="M13 3 6.5 13h5L11 21l6.5-10h-5z" strokeLinejoin="round" strokeWidth="1.5" />
      </svg>
    ),
    plumbing: (
      <svg {...iconSvgProps}>
        <path className="stroke-current" d="M8 5h5.5a3 3 0 0 1 3 3v2.5H20M8 5V3M8 5c-2 0-3 1.4-3 3.2S6 11.5 8 11.5h3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        <path className="stroke-current" d="M16.5 10.5V19M14 19h5" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    ),
    joinery: (
      <svg {...iconSvgProps}>
        <path className="stroke-current" d="M4 18.5h16M7 18.5 12 5l5 13.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        <path className="stroke-current" d="M9.2 12.5h5.6" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    ),
    pool: (
      <svg {...iconSvgProps}>
        <path className="stroke-current" d="M4 9.5h16v5.2c0 .8-.7 1.5-1.6 1.5H5.6c-.9 0-1.6-.7-1.6-1.5z" strokeLinejoin="round" strokeWidth="1.5" />
        <path className="stroke-current" d="M6.5 18c.8-.6 1.7-.6 2.5 0s1.7.6 2.5 0 1.7-.6 2.5 0 1.7.6 2.5 0 1.7-.6 2.5 0" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    ),
  };

  return icons[category];
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
