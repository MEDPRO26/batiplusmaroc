"use client";

import { ApprovedCompanyCover } from "./approved-company-cover";
import { CompanyOwnerCoverManager } from "./company-owner-cover-manager";

import { ApprovedPortfolioImage } from "@/features/portfolio/components/approved-portfolio-image";

import { ApprovedCompanyLogo } from "@/features/companies/components/approved-company-logo";

import { VerifiedBadge } from "./verified-badge";
import { useQuery } from "convex/react";
import { ExternalLink, MapPin, Plus } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { serviceName } from "@/features/companies/lib/service-label";
import { headquartersLabel } from "@/features/companies/lib/headquarters-label";
import { ProfileSectionSkeleton } from "@/features/shared/components/skeletons";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { WorkspaceTabs, workspaceButton } from "@/features/shared/components/workspace-page";
import { Link, useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { routes } from "@/lib/routes";
import type { ProfileManager } from "./profile/profile-editing";
import { CompanyOwnerLogoManager } from "./company-owner-logo-manager";
import {
  AboutEditor,
  CompanyInfoEditor,
  ContactEditor,
  IdentityEditor,
  LanguagesEditor,
  ServicesEditor,
} from "./profile/profile-editors";
import { CompanyServiceAreas } from "./profile/geographic-coverage-editor";

/**
 * The company's own profile: it reads like the public profile, and each section
 * carries a small edit control that opens a focused dialog.
 */
export function CompanyProfileEditor() {
  const t = useTranslations("companyProfileManager");
  const tUx = useTranslations("ux");
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "company" && user.onboardingStatus === "completed";
  const access = useQuery(api.companyVerification.index.getVerificationStatus, canLoad ? {} : "skip");
  const profile = useQuery(api.companies.index.getProfileManager, canLoad && access?.canManageDocuments ? {} : "skip");
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    if (!(user.accountType === "company" && user.onboardingStatus === "completed")) {
      router.replace(workspaceRouteForUser(user));
    }
  }, [router, user]);

  if (canLoad && access?.canManageDocuments === false) {
    return <div className="mx-auto max-w-[1240px] p-6"><FriendlyAlert>{tUx("error.codes.COMPANY_OWNER_REQUIRED")}</FriendlyAlert></div>;
  }
  if (!user || !canLoad || profile === undefined) {
    return <CompanyProfileEditorSkeleton label={t("loading")} />;
  }
  return <CompanyProfileView key={user._id} profile={profile} />;
}

export function CompanyProfileView({ profile }: { profile: ProfileManager }) {
  const t = useTranslations("companyProfileManager");
  const locale = useLocale();
  const tPublic = useTranslations("publicCompany");
  const isVerified = profile.legal.verificationStatus === "verified";

  return (
    <main className="min-h-[calc(100dvh-4.5rem)] bg-[#f7f9fb] pb-16">
      <div className="mx-auto w-full max-w-[1240px] px-4 pt-6 sm:px-6 sm:pt-8">
        <article className="overflow-hidden rounded-2xl border border-brand-border bg-white">
          <ProfileHeader isVerified={isVerified} profile={profile} />
          <div className="border-b border-brand-border px-5 py-6 sm:px-7"><CompanyOwnerCoverManager /></div>
          <div className="border-b border-brand-border px-5 py-6 sm:px-7"><CompanyOwnerLogoManager /></div>

          <div className="grid lg:grid-cols-[minmax(260px,30%)_minmax(0,1fr)]">
            <div className="order-1 min-w-0 px-5 py-6 sm:px-7 lg:order-2 lg:py-7">
              <MainSection action={<AboutEditor profile={profile} />} title={t("profileView.about")}>
                <ExpandableText text={profile.description} />
              </MainSection>

              <MainSection action={<ServicesEditor profile={profile} />} title={t("services.title")}>
                <ChipList empty={t("profileView.notSpecified")} items={profile.services.map((service) => serviceName(service, profile.catalogServices, locale, key => t(`serviceOptions.${key}`)))} />
              </MainSection>

              <PortfolioShowcase />

              {profile.slug ? <ReviewsSection slug={profile.slug} /> : null}
            </div>

            <aside className="order-2 border-t border-brand-border px-5 py-6 sm:px-7 lg:order-1 lg:border-t-0 lg:border-r lg:py-7">
              <SidebarSection action={<CompanyInfoEditor profile={profile} />} title={t("profileView.companyInfo")}>
                <dl className="m-0 grid grid-cols-3 gap-2">
                  <Stat label={t("sidebar.years")} value={profile.yearsExperience == null ? "—" : String(profile.yearsExperience)} />
                  <Stat label={t("sidebar.founded")} value={profile.foundedYear ? String(profile.foundedYear) : "—"} />
                  <Stat label={t("sidebar.team")} value={profile.companySize ? tPublic(`companySizeShort.${profile.companySize}`) : "—"} />
                </dl>
              </SidebarSection>

              <SidebarSection title={t("sidebar.verifications")}>
                <div>{isVerified ? <VerifiedBadge label={t("badge.verified")} isVerified={isVerified} /> : <span className="text-sm text-muted">{t(`verificationStatus.${profile.legal.verificationStatus}`)}</span>}</div>
                <Link className="mt-2 inline-flex min-h-9 items-center text-sm font-semibold text-brand hover:underline" href={{ pathname: routes.companySettings, query: { section: "verification" } }}>
                  {isVerified ? t("profileView.verificationDetails") : t("sidebar.verifyAction")}
                </Link>
              </SidebarSection>

              <CompanyServiceAreas frame="sidebar" profile={profile} />

              <SidebarSection action={<LanguagesEditor profile={profile} />} title={t("fields.languages")}>
                {profile.languages.length > 0 ? (
                  <ul className="m-0 grid list-none gap-1.5 p-0 text-sm text-ink">
                    {profile.languages.map((language) => <li key={language}>{t(`languages.${language}`)}</li>)}
                  </ul>
                ) : <p className="m-0 text-sm text-muted">{t("profileView.notSpecified")}</p>}
              </SidebarSection>

              <SidebarSection action={<ContactEditor profile={profile} />} title={t("sidebar.contact")}>
                <dl className="m-0 grid gap-3 text-sm">
                  <div><dt className="text-xs text-muted">{t("fields.phone")}</dt><dd className="m-0 mt-0.5 text-ink">{profile.phone || "—"}</dd></div>
                  <div><dt className="text-xs text-muted">{t("fields.website")}</dt><dd className="m-0 mt-0.5 break-all text-ink">{profile.website || "—"}</dd></div>
                </dl>
              </SidebarSection>
            </aside>
          </div>
        </article>
      </div>
    </main>
  );
}

function ProfileHeader({ profile, isVerified }: { profile: ProfileManager; isVerified: boolean }) {
  const t = useTranslations("companyProfileManager");
  const locale = useLocale();
  const logoUrl = profile.logoUrl;

  return (
    <header>
      <div className="relative aspect-[16/5] min-h-[150px] bg-brand-soft sm:min-h-[200px]">
        {profile.coverImageUrl ? (
          <ApprovedCompanyCover alt={t("branding.coverAlt")} className="object-cover" fill priority sizes="(max-width: 1240px) 100vw, 1240px" url={profile.coverImageUrl} />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgb(5_79_132/0.20),rgb(5_79_132/0.04))]" />
        )}
      </div>

      <div className="flex flex-col gap-5 border-b border-brand-border px-5 pb-6 sm:flex-row sm:items-end sm:justify-between sm:px-7">
        <div className="flex min-w-0 gap-4 sm:gap-5">
          <div className="relative -mt-11 shrink-0 sm:-mt-14">
            <div className="relative grid size-[92px] place-items-center overflow-hidden rounded-sm border-4 border-white bg-brand-soft text-2xl font-semibold text-brand shadow-[0_2px_10px_rgb(10_25_38/0.14)] sm:size-[120px]">
              <ApprovedCompanyLogo alt={t("branding.logoAlt")} className="object-cover" fill sizes="120px" url={logoUrl} />
            </div>
          </div>
          <div className="min-w-0 pt-3 sm:pt-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="m-0 text-[1.5rem] leading-8 font-semibold tracking-[-0.03em] text-ink sm:text-[1.9rem] sm:leading-10">{profile.name}</h1>
              <VerifiedBadge label={t("badge.verified")} isVerified={isVerified} />
              <IdentityEditor profile={profile} />
            </div>
            <p className="mt-1.5 mb-0 flex items-center gap-1.5 text-sm text-muted">
              <MapPin aria-hidden className="size-3.5 shrink-0" strokeWidth={1.8} />
              <span className="min-w-0 break-words">{t("headquartersLocation", { location: headquartersLabel(profile.city, profile.headquarters, locale) })}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {profile.slug ? (
            <Link className={workspaceButton.secondary} href={{ pathname: "/entreprises/[slug]", params: { slug: profile.slug } }}>
              {t("viewPublicProfile")}
              <ExternalLink aria-hidden className="size-3.5" strokeWidth={1.8} />
            </Link>
          ) : null}
          <Link className={workspaceButton.primary} href={routes.companySettings}>{t("profileView.settings")}</Link>
        </div>
      </div>
    </header>
  );
}

function PortfolioShowcase() {
  const t = useTranslations("companyProfileManager");
  const tPortfolio = useTranslations("portfolioManager");
  const data = useQuery(api.portfolio.index.getPortfolioManager);
  const [tab, setTab] = useState<"published" | "drafts">("published");
  const published = data?.projects.filter((project) => project.status === "published") ?? [];
  const drafts = data?.projects.filter((project) => project.status === "draft") ?? [];
  const visible = (tab === "published" ? published : drafts).slice(0, 6);
  const total = tab === "published" ? published.length : drafts.length;

  return (
    <MainSection
      action={
        <Link aria-label={tPortfolio("add")} className="grid size-9 place-items-center rounded-sm border border-brand-border bg-white text-brand transition-colors hover:border-brand/50 hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" href={routes.companyPortfolio} title={tPortfolio("add")}>
          <Plus aria-hidden className="size-4" />
        </Link>
      }
      title={t("portfolio.title")}
    >
      <WorkspaceTabs
        label={t("portfolio.title")}
        onChange={setTab}
        tabs={[
          { value: "published", label: t("profileView.published"), count: data ? published.length : undefined },
          { value: "drafts", label: t("profileView.drafts"), count: data ? drafts.length : undefined },
        ]}
        value={tab}
      />
      {data === undefined ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <div className="skeleton-block aspect-[4/3] rounded-sm" key={item} />)}</div>
      ) : visible.length === 0 ? (
        <div className="mt-5 rounded-sm border border-dashed border-brand-border bg-[#f7f9fb] px-5 py-10 text-center">
          <p className="m-0 text-sm text-muted">{tab === "published" ? t("profileView.portfolioEmpty") : t("profileView.draftsEmpty")}</p>
          <Link className={`${workspaceButton.secondary} mt-4`} href={routes.companyPortfolio}>{t("portfolio.manage")}</Link>
        </div>
      ) : (
        <>
          <ul className="m-0 mt-5 grid list-none gap-x-4 gap-y-6 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((project) => (
              <li key={project.id}>
                <article className="group">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-brand-soft ring-1 ring-brand-border">
                    <ApprovedPortfolioImage alt={tPortfolio("imageAlt", { title: project.title })} className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" fill sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 280px" url={project.coverImageUrl} />
                  </div>
                  <h3 className="mt-2.5 mb-0 line-clamp-1 text-[0.95rem] font-semibold tracking-[-0.01em] text-ink">{project.title}</h3>
                  <p className="mt-0.5 mb-0 text-xs text-muted">{[project.city, project.year].filter(Boolean).join(" · ")}</p>
                </article>
              </li>
            ))}
          </ul>
          <Link className={`${workspaceButton.ghost} mt-4 px-0`} href={routes.companyPortfolio}>
            {total > visible.length ? t("profileView.viewAllPortfolio", { count: total }) : t("portfolio.manage")}
          </Link>
        </>
      )}
    </MainSection>
  );
}

function ReviewsSection({ slug }: { slug: string }) {
  const t = useTranslations("companyProfileManager");
  const tPublic = useTranslations("publicCompany");
  const format = useFormatter();
  const company = useQuery(api.portfolio.index.getPublicCompanyProfile, { slug });
  if (!company) return null;

  return (
    <MainSection title={t("profileView.reviews")}>
      {company.reviews.length === 0 ? (
        <p className="m-0 text-sm leading-6 text-muted">{t("profileView.reviewsEmpty")}</p>
      ) : (
        <>
          {company.rating !== null ? (
            <p className="m-0 mb-4 text-sm font-semibold text-ink">
              <span className="text-amber-600">★ {format.number(company.rating, { maximumFractionDigits: 1 })}</span>{" "}
              <span className="font-normal text-muted">{tPublic("reviewCount", { count: company.reviewCount })}</span>
            </p>
          ) : null}
          <ul className="m-0 grid list-none divide-y divide-brand-border p-0">
            {company.reviews.slice(0, 5).map((review, index) => (
              <li className="py-4 first:pt-0" key={`${review.createdAt}-${index}`}>
                {review.projectTitle ? <h3 className="m-0 text-[0.95rem] font-semibold text-ink">{review.projectTitle}</h3> : null}
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                  <span aria-label={tPublic("ratingOutOfFive", { rating: review.rating })} className="text-amber-600">{"★".repeat(review.rating)}<span className="text-slate-300">{"★".repeat(5 - review.rating)}</span></span>
                  <time className="text-xs text-muted" dateTime={new Date(review.createdAt).toISOString()}>{format.dateTime(review.createdAt, { dateStyle: "medium", timeZone: "Africa/Casablanca" })}</time>
                </div>
                <p className="mt-2 mb-0 text-sm leading-6 whitespace-pre-wrap text-ink/90">{review.comment}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </MainSection>
  );
}

function ExpandableText({ text }: { text: string }) {
  const t = useTranslations("companyProfileManager");
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 320;
  return (
    <div>
      <p className={`m-0 text-[0.95rem] leading-7 whitespace-pre-wrap text-ink/90 ${long && !expanded ? "line-clamp-4" : ""}`}>{text}</p>
      {long ? (
        <button aria-expanded={expanded} className={`${workspaceButton.ghost} mt-1 px-0`} onClick={() => setExpanded((value) => !value)} type="button">
          {expanded ? t("profileView.showLess") : t("profileView.showMore")}
        </button>
      ) : null}
    </div>
  );
}

function ChipList({ items, empty, compact = false }: { items: string[]; empty: string; compact?: boolean }) {
  if (items.length === 0) return <p className="m-0 text-sm text-muted">{empty}</p>;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {items.map((item) => (
        <li className={`rounded-sm bg-[#eef2f5] font-medium text-ink ${compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"}`} key={item}>{item}</li>
      ))}
    </ul>
  );
}

function SidebarSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-brand-border py-5 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h2 className="m-0 text-[0.95rem] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {action}
      </div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function MainSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-brand-border py-7 first:pt-0 last:border-b-0 last:pb-0">
      <div className="mb-4 flex min-h-9 items-center justify-between gap-3">
        <h2 className="m-0 text-[1.2rem] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="text-[0.7rem] leading-4 text-muted">{label}</dt>
      <dd className="m-0 truncate text-[1.05rem] leading-7 font-semibold tracking-[-0.02em] text-ink">{value}</dd>
    </div>
  );
}

export function CompanyProfileEditorSkeleton({ label }: { label: string }) {
  return (
    <main aria-busy="true" aria-live="polite" className="min-h-[calc(100dvh-4.5rem)] bg-[#f7f9fb]" role="status">
      <span className="sr-only">{label}</span>
      <div className="mx-auto grid w-full max-w-[1240px] gap-5 px-4 pt-6 sm:px-6 sm:pt-8">
        <div className="overflow-hidden rounded-2xl border border-brand-border bg-white">
          <div className="aspect-[16/5] min-h-[150px] animate-pulse bg-[#e6eef3]" />
          <div className="grid gap-5 p-6 lg:grid-cols-[30%_1fr]">
            <ProfileSectionSkeleton />
            <ProfileSectionSkeleton />
          </div>
        </div>
      </div>
    </main>
  );
}
