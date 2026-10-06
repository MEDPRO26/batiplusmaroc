"use client";

import { ApprovedCompanyLogo } from "@/features/companies/components/approved-company-logo";

import { ApprovedCompanyCover } from "@/features/companies/components/approved-company-cover";
import { useLocale, useTranslations } from "next-intl";
import { usePublicCompanyPreview } from "@/features/companies/hooks/use-public-company-preview";
import { CompanyDiscoveryCardSkeleton } from "@/features/companies/components/company-directory-skeleton";
import { serviceName } from "@/features/companies/lib/service-label";
import { companyPath } from "@/content/marketplace";
import { Link } from "@/i18n/navigation";

export function HiringCompanyPreviews() {
  const t = useTranslations("clientHowItWorks");
  const tCompany = useTranslations("home.marketplace");
  const tDirectory = useTranslations("companyDirectory");
  const locale = useLocale();
  const { companies, loading } = usePublicCompanyPreview({ limit: 2 });

  if (loading) return <div aria-busy="true" role="status"><span className="sr-only">{tDirectory("loading")}</span><CompanyDiscoveryCardSkeleton /></div>;
  if (companies.length === 0) return <p className="text-muted">{tDirectory("empty")}</p>;

  return companies.map(company => (
    <article className="overflow-hidden rounded-[22px] border border-brand-border bg-white" key={company.id}>
      <Link className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" href={companyPath(company.slug)}>
        <div className="relative aspect-[16/10] overflow-hidden bg-surface-muted">
          {company.coverImageUrl ? <ApprovedCompanyCover alt={tCompany("imageAlt", { company: company.name, city: company.city })} className="object-cover transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" fill sizes="(max-width: 1023px) calc(100vw - 2rem), 360px" url={company.coverImageUrl} /> : null}
        </div>
        <div className="px-5 py-4">
          <div className="mb-2 flex items-center gap-2"><span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft text-brand"><ApprovedCompanyLogo alt="" className="object-cover" fill sizes="36px" url={company.logoUrl} /></span><h3 className="mb-1 text-[1.05rem] leading-snug font-semibold tracking-[-0.02em] text-ink!">{company.name}</h3></div>
          <p className="mb-3 text-[0.92rem] leading-6 text-muted">
            {company.services[0] ? serviceName(company.services[0], company.serviceNames, locale, key => tCompany(`categories.${key}`)) : company.city}
            <span aria-hidden="true"> · </span>{company.city}
          </p>
          <span className="inline-flex min-h-11 items-center gap-2 text-[0.92rem] font-semibold text-brand">
            {t("ways.invite.profile")}
            <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 16 16">
              <path className="stroke-current" d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
          </span>
        </div>
      </Link>
    </article>
  ));
}
