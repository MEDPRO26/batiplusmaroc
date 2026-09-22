import { fetchQuery } from "convex/nextjs";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { cache } from "react";
import { api } from "@/convex/_generated/api";
import { localizedPageMetadata, resolveLocale } from "@/lib/page-meta";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return localizedPageMetadata(params, "/entreprises/[slug]", "companyProfile", { params: { slug } });
}

const getCompany = cache((slug: string) => fetchQuery(api.portfolio.index.getPublicCompanyProfile, { slug }));

export default async function CompanyProfilePage({ params }: Props) {
  const locale = await resolveLocale(params);
  const { slug } = await params;
  setRequestLocale(locale);
  const [company, t] = await Promise.all([getCompany(slug), getTranslations({ locale, namespace: "publicCompany" })]);
  if (!company) notFound();

  return (
    <div className="bg-white">
      <section className="bg-white">
        <div className="mx-auto w-full max-w-[1120px] px-5 py-10 sm:px-8 sm:py-14 lg:py-18">
          {company.coverImageUrl ? (
            <div className="relative mb-8 aspect-[16/5] min-h-44 overflow-hidden rounded-2xl bg-brand-soft outline outline-1 outline-black/10">
              <Image alt={t("coverAlt", { name: company.name })} className="object-cover" fill priority sizes="(max-width: 1120px) 100vw, 1120px" src={company.coverImageUrl} />
            </div>
          ) : null}
          <div className="grid gap-8 lg:grid-cols-[1fr_300px] lg:items-start">
            <div className="flex min-w-0 flex-col gap-6 sm:flex-row sm:items-start">
              <div className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-soft text-3xl font-semibold text-brand outline outline-1 outline-black/10 sm:size-28">
                {company.logoUrl ? <Image alt={t("logoAlt", { name: company.name })} className="object-cover" fill priority={!company.coverImageUrl} sizes="112px" src={company.logoUrl} /> : <span aria-hidden>{company.name.slice(0, 1).toUpperCase()}</span>}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="m-0 text-[1.75rem] leading-8 font-semibold tracking-[-0.03em] text-ink sm:text-[2rem]">{company.name}</h1>
                  {company.isVerified ? <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand"><VerifiedIcon />{t("verified")}</span> : null}
                </div>
                <p className="mt-3 mb-0 flex items-center gap-2 text-sm font-medium text-muted"><LocationIcon />{company.city}</p>
                <p className="mt-5 mb-0 max-w-[680px] text-[1rem] leading-7 text-muted">{company.description}</p>
              </div>
            </div>
            <aside className="rounded-2xl border border-brand-border bg-[#f7f9fb] p-5 shadow-[0_1px_2px_rgb(23_61_99/0.04)]">
              <button className="button button-primary w-full cursor-not-allowed opacity-70" disabled type="button">{t("invite")}</button>
              <button className="button mt-3 w-full cursor-not-allowed border border-brand-border bg-white text-ink opacity-70" disabled type="button">{t("quote")}</button>
              <p className="mt-3 mb-0 text-center text-xs leading-5 text-muted">{t("ctaSoon")}</p>
            </aside>
          </div>
        </div>
      </section>
      <main className="mx-auto w-full max-w-[1120px] px-5 py-12 sm:px-8 sm:py-16">
        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <article className="rounded-2xl border border-brand-border bg-white p-5">
            <h2 className="m-0 text-base font-semibold tracking-[-0.02em]">{t("services")}</h2>
            <div className="mt-4 flex flex-wrap gap-2">{company.services.map((service) => <span className="rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-dark" key={service}>{t(`service.${service}`)}</span>)}</div>
          </article>
          <article className="rounded-2xl border border-brand-border bg-white p-5">
            <h2 className="m-0 text-base font-semibold tracking-[-0.02em]">{t("experience")}</h2>
            <p className="mt-4 mb-0 text-2xl font-semibold tracking-[-0.03em] text-ink">{company.yearsExperience == null ? t("notSpecified") : t("years", { count: company.yearsExperience })}</p>
          </article>
          <article className="rounded-2xl border border-brand-border bg-white p-5">
            <h2 className="m-0 text-base font-semibold tracking-[-0.02em]">{t("website")}</h2>
            {company.website ? <a className="mt-4 inline-flex break-all text-sm font-semibold text-brand underline decoration-brand/30 underline-offset-4 hover:text-brand-hover" href={company.website} rel="noopener noreferrer" target="_blank">{t("visitWebsite")}</a> : <p className="mt-4 mb-0 text-sm text-muted">{t("notSpecified")}</p>}
          </article>
          <article className="rounded-2xl border border-brand-border bg-white p-5">
            <h2 className="m-0 text-base font-semibold tracking-[-0.02em]">{t("serviceAreas")}</h2>
            <div className="mt-4 flex flex-wrap gap-2">{company.serviceAreas.length > 0 ? company.serviceAreas.map((area) => <span className="rounded-full bg-[#f7f9fb] px-3 py-1.5 text-xs font-semibold text-ink" key={area}>{t(`serviceArea.${area}`)}</span>) : <span className="text-sm text-muted">{t("notSpecified")}</span>}</div>
          </article>
          <article className="rounded-2xl border border-brand-border bg-white p-5">
            <h2 className="m-0 text-base font-semibold tracking-[-0.02em]">{t("languages")}</h2>
            <div className="mt-4 flex flex-wrap gap-2">{company.languages.length > 0 ? company.languages.map((language) => <span className="rounded-full bg-[#f7f9fb] px-3 py-1.5 text-xs font-semibold text-ink" key={language}>{t(`language.${language}`)}</span>) : <span className="text-sm text-muted">{t("notSpecified")}</span>}</div>
          </article>
          <article className="rounded-2xl border border-brand-border bg-white p-5">
            <h2 className="m-0 text-base font-semibold tracking-[-0.02em]">{t("companySizeLabel")}</h2>
            <p className="mt-4 mb-0 text-sm font-semibold text-ink">{company.companySize ? t(`companySize.${company.companySize}`) : t("notSpecified")}</p>
          </article>
          <article className="rounded-2xl border border-brand-border bg-white p-5">
            <h2 className="m-0 text-base font-semibold tracking-[-0.02em]">{t("foundedYear")}</h2>
            <p className="mt-4 mb-0 text-sm font-semibold text-ink">{company.foundedYear ?? t("notSpecified")}</p>
          </article>
          <article className="rounded-2xl border border-brand-border bg-white p-5">
            <h2 className="m-0 text-base font-semibold tracking-[-0.02em]">{t("publicPhone")}</h2>
            {company.phone ? <a className="mt-4 inline-flex text-sm font-semibold text-brand underline decoration-brand/30 underline-offset-4 hover:text-brand-hover" href={`tel:${company.phone.replace(/\s+/g, "")}`}>{company.phone}</a> : <p className="mt-4 mb-0 text-sm text-muted">{t("notSpecified")}</p>}
          </article>
        </section>
        <section aria-labelledby="portfolio-heading" className="mt-14">
          <p className="m-0 text-xs font-semibold tracking-[0.16em] text-brand uppercase">{t("portfolioEyebrow")}</p>
          <h2 className="mt-2 mb-6 text-lg leading-6 font-semibold tracking-[-0.02em] text-ink sm:text-xl" id="portfolio-heading">{t("portfolioTitle")}</h2>
          {company.portfolio.length === 0 ? <div className="rounded-2xl border border-dashed border-brand-border bg-white px-5 py-10 text-center text-muted">{t("portfolioEmpty")}</div> : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{company.portfolio.map((project) => (
              <article className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-[0_1px_2px_rgb(23_61_99/0.04)]" key={project.id}>
                <div className="relative aspect-[4/3] bg-brand-soft outline outline-1 outline-black/10"><Image alt={t("projectImageAlt", { title: project.title })} className="object-cover" fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" src={project.coverImageUrl} /></div>
                <div className="p-5">
                  <p className="m-0 text-xs font-semibold tracking-[0.08em] text-brand uppercase">{t(`projectType.${project.projectType}`)}</p>
                  <h3 className="mt-2 mb-0 text-lg font-semibold tracking-[-0.025em] text-ink">{project.title}</h3>
                  <p className="mt-2 mb-0 line-clamp-3 text-sm leading-6 text-muted">{project.description}</p>
                  <p className="mt-4 mb-0 text-xs font-medium text-muted">{[project.city, project.year].filter(Boolean).join(" · ")}</p>
                </div>
              </article>
            ))}</div>
          )}
        </section>
      </main>
    </div>
  );
}

function VerifiedIcon() {
  return <svg aria-hidden fill="none" height="14" viewBox="0 0 20 20" width="14"><path d="m5 10 3 3 7-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" /></svg>;
}

function LocationIcon() {
  return <svg aria-hidden fill="none" height="16" viewBox="0 0 20 20" width="16"><path d="M15 8c0 3.5-5 8-5 8S5 11.5 5 8a5 5 0 1 1 10 0Z" stroke="currentColor" strokeWidth="1.7" /><circle cx="10" cy="8" fill="currentColor" r="1.5" /></svg>;
}
