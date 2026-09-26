import type { FunctionReturnType } from "convex/server";
import { Check, ExternalLink, MapPin } from "lucide-react";
import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { api } from "@/convex/_generated/api";

type PublicCompany = NonNullable<FunctionReturnType<typeof api.portfolio.index.getPublicCompanyProfile>>;

export async function PublicCompanyProfile({ company }: { company: PublicCompany }) {
  const t = await getTranslations("publicCompany");
  const format = await getFormatter();
  const initials = company.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="min-h-[calc(100dvh-4.5rem)]">
      <div className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <article className="overflow-hidden rounded-2xl border border-[#d5d9dc] bg-white shadow-[0_1px_2px_rgb(23_61_99/0.04)]">
          {company.coverImageUrl ? (
            <div className="relative aspect-[3.2/1] min-h-[140px] bg-[#e8eef3] sm:min-h-[180px]">
              <Image
                alt={t("coverAlt", { name: company.name })}
                className="object-cover"
                fill
                priority
                sizes="(max-width: 1120px) 100vw, 1120px"
                src={company.coverImageUrl}
              />
            </div>
          ) : (
            <div className="relative aspect-[3.2/1] min-h-[120px] bg-[linear-gradient(135deg,rgb(5_79_132/0.18),rgb(5_79_132/0.04))] sm:min-h-[160px]" />
          )}

          <header className="relative border-b border-[#e4e8eb] px-4 pt-0 pb-5 sm:px-6 sm:pb-6 lg:px-8">
            <div className="flex flex-col py-5  gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 flex-1 gap-4 sm:gap-5 ">
                <div className="-mt-10 shrink-0 sm:-mt-12 ">
                  <div className="relative grid size-[88px] place-items-center overflow-hidden rounded-full border-[3px] border-white bg-brand-soft text-2xl font-semibold text-brand shadow-[0_2px_8px_rgb(10_25_38/0.12)] sm:size-[112px]">
                    {company.logoUrl ? (
                      <Image
                        alt={t("logoAlt", { name: company.name })}
                        className="object-cover"
                        fill
                        priority={!company.coverImageUrl}
                        sizes="112px"
                        src={company.logoUrl}
                      />
                    ) : (
                      <span aria-hidden>{initials || "?"}</span>
                    )}
                  </div>
                </div>

                <div className="min-w-0 flex-1 pt-3 sm:pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="m-0 text-[1.45rem] leading-8 font-semibold tracking-[-0.03em] text-ink sm:text-[1.75rem] sm:leading-9">
                      {company.name}
                    </h1>
                    {company.isVerified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">
                        <Check aria-hidden className="size-3.5" strokeWidth={2.4} />
                        {t("verified")}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 mb-0 flex flex-wrap items-center gap-2 text-sm text-muted">
                    <MapPin aria-hidden className="size-3.5 shrink-0" strokeWidth={1.8} />
                    <span>{company.city}</span>
                  </p>
                  <p className="mt-2 mb-0 text-sm font-semibold text-ink">
                    {company.rating === null ? t("reviewsNone") : <><span className="text-amber-600">★ {format.number(company.rating, { maximumFractionDigits: 1 })}</span> <span className="font-normal text-muted">{t("reviewCount", { count: company.reviewCount })}</span></>}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:min-w-[220px]">
                <button
                  className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white opacity-70"
                  disabled
                  type="button"
                >
                  {t("invite")}
                </button>
                <button
                  className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-full border border-[#c5c8cb] bg-white px-5 text-sm font-semibold text-ink opacity-70"
                  disabled
                  type="button"
                >
                  {t("quote")}
                </button>
                <p className="m-0 text-center text-xs leading-5 text-muted">{t("ctaSoon")}</p>
              </div>
            </div>
          </header>

          <div className="grid lg:grid-cols-[minmax(240px,28%)_minmax(0,1fr)]">
            <aside className="border-b border-[#e4e8eb] px-4 py-6 lg:border-r lg:border-b-0 sm:px-6 lg:px-6 lg:py-7">
              <SidebarBlock title={t("stats")}>
                <div className="grid grid-cols-3 divide-x divide-[#e4e8eb]">
                  <StatBox
                    label={t("statYears")}
                    value={
                      company.yearsExperience == null
                        ? "—"
                        : String(company.yearsExperience)
                    }
                  />
                  <StatBox
                    label={t("statFounded")}
                    value={company.foundedYear?.toString() ?? "—"}
                  />
                  <StatBox
                    label={t("statTeam")}
                    value={
                      company.companySize
                        ? t(`companySizeShort.${company.companySize}`)
                        : "—"
                    }
                  />
                </div>
              </SidebarBlock>

              <SidebarBlock title={t("languages")}>
                {company.languages.length > 0 ? (
                  <ul className="m-0 grid list-none gap-2 p-0">
                    {company.languages.map((language) => (
                      <li className="text-sm text-ink" key={language}>
                        {t(`language.${language}`)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-sm text-muted">{t("notSpecified")}</p>
                )}
              </SidebarBlock>

              <SidebarBlock title={t("verifications")}>
                <p className="m-0 flex items-center gap-2 text-sm text-ink">
                  {company.isVerified ? (
                    <Check aria-hidden className="size-4 text-brand" strokeWidth={2.4} />
                  ) : (
                    <span
                      aria-hidden
                      className="grid size-4 place-items-center rounded-full border border-[#c5c8cb] text-[0.6rem] text-muted"
                    >
                      !
                    </span>
                  )}
                  <span className="font-medium">
                    {company.isVerified ? t("verificationVerified") : t("verificationPending")}
                  </span>
                </p>
              </SidebarBlock>

              <SidebarBlock title={t("website")}>
                {company.website ? (
                  <a
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
                    href={company.website}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t("visitWebsite")}
                    <ExternalLink aria-hidden className="size-3.5" strokeWidth={1.8} />
                  </a>
                ) : (
                  <p className="m-0 text-sm text-muted">{t("notSpecified")}</p>
                )}
              </SidebarBlock>

              <SidebarBlock title={t("serviceAreas")}>
                {company.serviceAreas.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {company.serviceAreas.map((area) => (
                      <span
                        className="rounded-full bg-[#f7f9fb] px-2.5 py-1 text-xs font-medium text-ink"
                        key={area}
                      >
                        {t(`serviceArea.${area}`)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="m-0 text-sm text-muted">{t("notSpecified")}</p>
                )}
              </SidebarBlock>
            </aside>

            <div className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
              <MainSection title={t("overview")}>
                <p className="m-0 whitespace-pre-wrap text-[0.95rem] leading-7 text-ink/90">
                  {company.description}
                </p>
              </MainSection>

              <MainSection title={t("services")}>
                {company.services.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {company.services.map((service) => (
                      <span
                        className="rounded-full bg-[#eef1f4] px-3 py-1.5 text-sm font-medium text-ink"
                        key={service}
                      >
                        {t(`service.${service}`)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="m-0 text-sm text-muted">{t("notSpecified")}</p>
                )}
              </MainSection>

              <MainSection title={t("reviewsTitle", { count: company.reviewCount })}>
                {company.reviews.length === 0 ? <p className="m-0 text-sm text-muted">{t("reviewsEmpty")}</p> : (
                  <ul className="m-0 grid list-none gap-4 p-0">
                    {company.reviews.map((review, index) => (
                      <li className="rounded-xl border border-[#e4e8eb] p-4" key={`${review.createdAt}-${index}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2"><span aria-label={t("ratingOutOfFive", { rating: review.rating })} className="font-semibold text-amber-600">{"★".repeat(review.rating)}<span className="text-slate-300">{"★".repeat(5 - review.rating)}</span></span><time className="text-xs text-muted" dateTime={new Date(review.createdAt).toISOString()}>{format.dateTime(review.createdAt, { dateStyle: "medium", timeZone: "Africa/Casablanca" })}</time></div>
                        <p className="mt-3 mb-0 whitespace-pre-wrap text-sm leading-6 text-ink/90">{review.comment}</p>
                        <p className="mt-3 mb-0 text-xs font-medium text-muted">{t("reviewBy", { name: [review.reviewerFirstName, review.reviewerLastInitial ? `${review.reviewerLastInitial}.` : null].filter(Boolean).join(" ") || t("reviewerAnonymous") })}{review.projectTitle ? ` · ${review.projectTitle}` : ""}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </MainSection>

              <MainSection
                title={
                  company.portfolio.length > 0
                    ? t("portfolioTitleCount", { count: company.portfolio.length })
                    : t("portfolioTitle")
                }
              >
                {company.portfolio.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#d5d9dc] bg-[#fafbfc] px-4 py-10 text-center text-sm text-muted">
                    {t("portfolioEmpty")}
                  </div>
                ) : (
                  <ul className="m-0 grid list-none gap-x-4 gap-y-6 p-0 sm:grid-cols-2 xl:grid-cols-3">
                    {company.portfolio.map((project) => (
                      <li key={project.id}>
                        <article className="group">
                          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[#e8eef3] ring-1 ring-[#e4e8eb]">
                            <Image
                              alt={t("projectImageAlt", { title: project.title })}
                              className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                              fill
                              sizes="(max-width: 640px) 100vw, (max-width: 1120px) 50vw, 280px"
                              src={project.coverImageUrl}
                            />
                            <span className="absolute top-2.5 left-2.5 rounded-md bg-white/95 px-2 py-0.5 text-[0.65rem] font-semibold tracking-[0.04em] text-brand uppercase shadow-sm backdrop-blur-sm">
                              {t(`projectType.${project.projectType}`)}
                            </span>
                          </div>
                          <h3 className="mt-2.5 mb-0 text-[0.95rem] leading-5 font-semibold tracking-[-0.02em] text-ink">
                            {project.title}
                          </h3>
                          {(project.city || project.year) ? (
                            <p className="mt-1 mb-0 text-xs leading-4 text-muted">
                              {[project.city, project.year].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                        </article>
                      </li>
                    ))}
                  </ul>
                )}
              </MainSection>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

function SidebarBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-[#e4e8eb] py-5 first:pt-0 last:border-b-0 last:pb-0">
      <h2 className="m-0 text-[0.95rem] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function MainSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-[#e4e8eb] py-7 first:pt-0 last:border-b-0 last:pb-0">
      <h2 className="m-0 text-[1.15rem] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 text-center first:pl-0 last:pr-0">
      <p className="m-0 text-[1.15rem] leading-7 font-semibold tracking-[-0.03em] text-ink sm:text-[1.25rem]">
        {value}
      </p>
      <p className="mt-1 mb-0 text-[0.7rem] leading-4 text-muted">{label}</p>
    </div>
  );
}
