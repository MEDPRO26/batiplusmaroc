"use client";

import { useQuery } from "convex/react";
import { Check, ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { serviceName } from "@/features/companies/lib/service-label";
import { useEffect, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { StatusBadge, workspaceButton, type BadgeTone } from "@/features/shared/components/workspace-page";
import { Link, useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { routes } from "@/lib/routes";
import { CompanyProfileEditorSkeleton } from "../company-profile-editor";
import type { ProfileManager } from "./profile-editing";
import {
  AboutEditor,
  CompanyInfoEditor,
  ContactEditor,
  IdentityEditor,
  LanguagesEditor,
  ServicesEditor,
} from "./profile-editors";
import { CompanyServiceAreas } from "./geographic-coverage-editor";

import { SETTINGS_SECTIONS, type SettingsSection } from "@/features/companies/lib/settings-sections";

const VERIFICATION_TONE: Record<ProfileManager["legal"]["verificationStatus"], BadgeTone> = {
  verified: "success",
  pending: "warning",
  rejected: "danger",
  draft: "neutral",
};

export function CompanySettings({ section }: { section: SettingsSection }) {
  const t = useTranslations("companyProfileManager");
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "company" && user.onboardingStatus === "completed";
  const profile = useQuery(api.companies.index.getProfileManager, canLoad ? {} : "skip");
  const router = useRouter();

  useEffect(() => {
    if (user === null) router.replace(routes.signIn);
    else if (user && !canLoad) router.replace(workspaceRouteForUser(user));
  }, [canLoad, router, user]);

  if (!user || !canLoad || profile === undefined) return <CompanyProfileEditorSkeleton label={t("loading")} />;

  return (
    <main className="min-h-[calc(100dvh-4.5rem)] bg-[#f7f9fb] pb-16">
      <div className="mx-auto grid w-full max-w-[1240px] grid-cols-[minmax(0,1fr)] gap-6 px-4 pt-8 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12 lg:pt-10">
        <div className="min-w-0">
          <h1 className="m-0 text-[1.9rem] font-semibold tracking-[-0.03em] text-ink">{t("settings.title")}</h1>
          <nav aria-label={t("settings.navLabel")} className="mt-4 lg:mt-6">
            <ul className="m-0 flex list-none gap-1 overflow-x-auto border-b border-brand-border p-0 lg:flex-col lg:gap-0.5 lg:border-b-0 lg:border-l">
              {SETTINGS_SECTIONS.map((item) => {
                const current = item === section;
                return (
                  <li key={item}>
                    <Link
                      aria-current={current ? "page" : undefined}
                      className="-mb-px flex min-h-11 items-center border-b-2 border-transparent px-3 text-sm whitespace-nowrap text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand aria-[current=page]:border-brand aria-[current=page]:font-semibold aria-[current=page]:text-ink lg:mb-0 lg:-ml-px lg:border-b-0 lg:border-l-2 lg:px-4"
                      href={item === "profile" ? routes.companySettings : { pathname: routes.companySettings, query: { section: item } }}
                    >
                      {t(`settings.${item}`)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="grid min-w-0 gap-5">
          {section === "profile" ? <ProfileSettings profile={profile} /> : null}
          {section === "contact" ? <ContactSettings email={user.email ?? null} profile={profile} /> : null}
          {section === "verification" ? <VerificationSettings profile={profile} /> : null}
        </div>
      </div>
    </main>
  );
}

function ProfileSettings({ profile }: { profile: ProfileManager }) {
  const t = useTranslations("companyProfileManager");
  const locale = useLocale();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-xl font-semibold tracking-[-0.02em] text-ink">{t("settings.profile")}</h2>
        <div className="flex flex-wrap gap-3">
          <Link className={workspaceButton.ghost} href={routes.companyProfileManagement}>{t("settings.openProfile")}</Link>
          {profile.slug ? (
            <Link className={workspaceButton.ghost} href={{ pathname: "/entreprises/[slug]", params: { slug: profile.slug } }}>
              {t("settings.viewAsClients")}
              <ExternalLink aria-hidden className="size-3.5" />
            </Link>
          ) : null}
        </div>
      </div>

      <SettingsCard action={<IdentityEditor profile={profile} />} title={t("dialogs.identityTitle")}>
        <Facts rows={[[t("fields.name"), profile.name], [t("fields.city"), profile.city]]} />
      </SettingsCard>

      <SettingsCard action={<AboutEditor profile={profile} />} title={t("profileView.about")}>
        <p className="m-0 line-clamp-4 text-sm leading-6 whitespace-pre-wrap text-ink/90">{profile.description}</p>
      </SettingsCard>

      <SettingsCard action={<CompanyInfoEditor profile={profile} />} title={t("profileView.companyInfo")}>
        <Facts
          rows={[
            [t("fields.yearsExperience"), profile.yearsExperience == null ? "—" : String(profile.yearsExperience)],
            [t("fields.foundedYear"), profile.foundedYear ? String(profile.foundedYear) : "—"],
            [t("fields.companySize"), profile.companySize ? t(`companySize.${profile.companySize}`) : "—"],
          ]}
        />
      </SettingsCard>

      <SettingsCard action={<ServicesEditor profile={profile} />} title={t("services.title")}>
        <Chips items={profile.services.map((service) => serviceName(service, profile.catalogServices, locale, key => t(`serviceOptions.${key}`)))} />
      </SettingsCard>

      <CompanyServiceAreas frame="settings" profile={profile} />

      <SettingsCard action={<LanguagesEditor profile={profile} />} title={t("fields.languages")}>
        <Chips items={profile.languages.map((language) => t(`languages.${language}`))} />
      </SettingsCard>

      <SettingsCard title={t("portfolio.title")}>
        <p className="m-0 text-sm leading-6 text-muted">{t("portfolio.body")}</p>
        <Link className={`${workspaceButton.secondary} mt-4`} href={routes.companyPortfolio}>{t("portfolio.manage")}</Link>
      </SettingsCard>
    </>
  );
}

function ContactSettings({ profile, email }: { profile: ProfileManager; email: string | null }) {
  const t = useTranslations("companyProfileManager");
  return (
    <>
      <h2 className="m-0 text-xl font-semibold tracking-[-0.02em] text-ink">{t("settings.contact")}</h2>
      <SettingsCard action={<ContactEditor profile={profile} />} lead={t("settings.businessContactLead")} title={t("settings.businessContact")}>
        <Facts rows={[[t("fields.phone"), profile.phone || "—"], [t("fields.website"), profile.website || "—"]]} />
      </SettingsCard>
      <SettingsCard lead={t("settings.accountLead")} title={t("settings.account")}>
        <Facts rows={[[t("settings.email"), email ?? "—"]]} />
      </SettingsCard>
    </>
  );
}

function VerificationSettings({ profile }: { profile: ProfileManager }) {
  const t = useTranslations("companyProfileManager");
  const status = profile.legal.verificationStatus;
  const canSubmit = status === "draft" || status === "rejected";
  return (
    <>
      <h2 className="m-0 text-xl font-semibold tracking-[-0.02em] text-ink">{t("settings.verification")}</h2>
      <SettingsCard title={t("settings.status")}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {status === "verified" ? <span className="grid size-9 place-items-center rounded-sm bg-brand-soft text-brand"><Check aria-hidden className="size-4" strokeWidth={2.4} /></span> : null}
            <StatusBadge tone={VERIFICATION_TONE[status]}>{t(`verificationStatus.${status}`)}</StatusBadge>
          </div>
          {canSubmit ? <Link className={workspaceButton.primary} href={routes.companyVerification}>{t("sidebar.verifyAction")}</Link> : null}
        </div>
        <p className="mt-3 mb-0 text-sm leading-6 text-muted">{t("settings.verificationPublicNote")}</p>
      </SettingsCard>

      <SettingsCard lead={t("legal.lead")} title={t("legal.title")}>
        <FriendlyAlert tone="info">{t("legal.notice")}</FriendlyAlert>
        <div className="mt-5">
          <Facts
            rows={([
              ["legalName", profile.legal.legalName],
              ["ice", profile.legal.ice],
              ["rcNumber", profile.legal.rcNumber],
              ["legalRepresentative", profile.legal.legalRepresentative],
              ["legalPhone", profile.legal.phone],
              ["address", profile.legal.address],
            ] as const).map(([key, value]) => [t(`legal.fields.${key}`), value || t("legal.notProvided")])}
          />
        </div>
      </SettingsCard>

      <SettingsCard title={t("legal.documentsLabel")}>
        {profile.legal.documents.length > 0 ? (
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {profile.legal.documents.map((document) => (
              <li className="rounded-sm bg-[#f7f9fb] px-4 py-3 text-sm" key={`${document.documentType}-${document.fileName}`}>
                <span className="block text-xs font-semibold text-brand">{t(`legal.documentTypes.${document.documentType}`)}</span>
                <span className="mt-1 block break-all text-muted">{document.fileName}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">{t("legal.noDocuments")}</p>
        )}
      </SettingsCard>
    </>
  );
}

function SettingsCard({ title, lead, action, children }: { title: string; lead?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-brand-border bg-white px-5 py-5 sm:px-7 sm:py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="m-0 text-[1.05rem] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
          {lead ? <p className="mt-1 mb-0 text-sm leading-6 text-muted">{lead}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="m-0 grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="m-0 mt-1 text-sm break-words text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Chips({ items }: { items: string[] }) {
  const t = useTranslations("companyProfileManager");
  if (items.length === 0) return <p className="m-0 text-sm text-muted">{t("profileView.notSpecified")}</p>;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {items.map((item) => <li className="rounded-sm bg-[#eef2f5] px-3 py-1.5 text-sm font-medium text-ink" key={item}>{item}</li>)}
    </ul>
  );
}
