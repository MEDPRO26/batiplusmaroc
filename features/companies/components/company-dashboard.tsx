"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { DashboardCardsSkeleton } from "@/features/shared/components/skeletons";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { joinClassNames } from "@/lib/utils";

type VerificationStatus = "draft" | "pending" | "verified" | "rejected";

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

export function CompanyDashboard() {
  const t = useTranslations("auth.companyDashboard");
  const tUx = useTranslations("ux");
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "company" && user.onboardingStatus === "completed";
  const profile = useQuery(api.companies.index.getOnboardingProfile, canLoad ? {} : "skip");
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    if (user.accountType === "client") {
      router.replace(
        user.onboardingStatus === "completed" ? routes.clientDashboard : routes.clientOnboarding,
      );
      return;
    }
    if (user.accountType === "company" && user.onboardingStatus !== "completed") {
      router.replace(routes.companyOnboarding);
    }
  }, [router, user]);

  if (!user || !canLoad || profile == null) {
    return <DashboardCardsSkeleton label={tUx("loading.dashboard")} />;
  }

  const status = asVerificationStatus(profile.verificationStatus);
  if (!status) {
    return <DashboardCardsSkeleton label={tUx("loading.dashboard")} />;
  }

  const displayName = user.firstName?.trim() || profile.name.trim();
  const showVerificationCta = status === "draft" || status === "rejected";
  const showStatusLink = status === "pending" || status === "verified";

  return (
    <section className="mx-auto flex w-full max-w-[860px] flex-1 flex-col px-5 py-10 sm:px-8 sm:py-14">
      <header className="step-enter">
        <p className="m-0 text-[0.72rem] font-semibold tracking-[0.16em] text-brand uppercase">{t("eyebrow")}</p>
        <h1 className="mt-3 mb-0 text-[1.7rem] font-semibold tracking-[-0.035em] text-ink sm:text-[2rem]">
          {displayName ? t("greeting", { name: displayName }) : t("greetingFallback")}
        </h1>
        <p className="mt-2 mb-0 max-w-[36rem] text-[0.98rem] leading-6 text-muted">{t("lead")}</p>
      </header>

      <article
        className="step-enter step-enter-delay mt-8 rounded-2xl border border-brand-border bg-white p-5 shadow-[0_1px_2px_rgb(23_61_99/0.05),0_10px_28px_rgb(23_61_99/0.05)] sm:p-6"
      >
        <div className="flex items-start justify-center gap-4">
          <StatusGlyph status={status} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-base leading-6 font-semibold tracking-[-0.02em] text-ink">
                {t(verificationHeadlineKey[status])}
              </h2>
              <StatusChip status={status} label={t(verificationStatusKey[status])} />
            </div>
            <p className="mt-2 mb-0 text-sm leading-6 text-muted">{t(verificationLeadKey[status])}</p>
            {(showVerificationCta || showStatusLink) && (
              <div className="mt-5">
                <Link
                  className={joinClassNames(
                    "button min-h-11 transition-[background-color,border-color,transform,color] duration-150 [transition-timing-function:cubic-bezier(0.2,0,0,1)] active:scale-[0.96]",
                    showVerificationCta ? "button-primary" : "border border-brand-border bg-white text-ink hover:bg-brand-soft",
                  )}
                  href={routes.companyVerification}
                >
                  {showVerificationCta ? t(status === "rejected" ? "resubmit" : "startVerification") : t("viewStatus")}
                </Link>
              </div>
            )}
          </div>
        </div>
      </article>

      <div className="step-enter mt-4 grid gap-4 sm:grid-cols-2" style={{ animationDelay: "180ms" }}>
        <NextCard
          actionHref={routes.companyProfileManagement}
          actionLabel={t("profileAction")}
          icon="profile"
          lead={t("profileLead")}
          title={t("profileTitle")}
        />
        <NextCard
          actionHref={routes.browseProjects}
          actionLabel={t("findWorkAction")}
          icon="search"
          lead={t("findWorkLead")}
          title={t("findWorkTitle")}
        />
        <NextCard
          actionHref={routes.companyPortfolio}
          actionLabel={t("portfolioAction")}
          icon="folder"
          lead={t("portfolioLead")}
          title={t("portfolioTitle")}
        />
      </div>
    </section>
  );
}

function NextCard({
  actionHref,
  actionLabel,
  icon,
  lead,
  title,
}: {
  actionHref?:
    | typeof routes.browseProjects
    | typeof routes.companyPortfolio
    | typeof routes.companyProfileManagement;
  actionLabel?: string;
  icon: "search" | "folder" | "profile";
  lead: string;
  title: string;
}) {
  return (
    <article className="rounded-2xl border border-brand-border bg-white p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
        {icon === "search" ? <SearchIcon /> : icon === "folder" ? <FolderIcon /> : <ProfileIcon />}
      </div>
      <h2 className="mt-3 mb-0 text-base leading-6 font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      <p className="mt-2 mb-0 text-sm leading-6 text-muted">{lead}</p>
      {actionHref && actionLabel ? (
        <Link
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand transition-[color,transform] duration-150 [transition-timing-function:cubic-bezier(0.2,0,0,1)] hover:text-ink active:scale-[0.96]"
          href={actionHref}
        >
          {actionLabel}
          <span aria-hidden className="ml-1">→</span>
        </Link>
      ) : null}
    </article>
  );
}

function StatusChip({ label, status }: { label: string; status: VerificationStatus }) {
  return (
    <span
      className={joinClassNames(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[0.7rem] font-semibold tracking-[0.02em]",
        status === "verified" && "bg-brand-soft text-brand",
        status === "pending" && "bg-[#f4eee3] text-[#6a4c1d]",
        status === "rejected" && "bg-[#f8e8e6] text-[#8a2f28]",
        status === "draft" && "bg-[#eef1f4] text-muted",
      )}
    >
      {label}
    </span>
  );
}

function StatusGlyph({ status }: { status: VerificationStatus }) {
  const tone =
    status === "verified"
      ? "bg-brand-soft text-brand"
      : status === "rejected"
        ? "bg-[#f8e8e6] text-[#8a2f28]"
        : status === "pending"
          ? "bg-[#f4eee3] text-[#6a4c1d]"
          : "bg-[#eef1f4] text-muted";

  return (
    <span className={joinClassNames("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tone)} aria-hidden>
      {status === "verified" ? <CheckIcon /> : status === "rejected" ? <AlertIcon /> : status === "pending" ? <ClockIcon /> : <ShieldIcon />}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path d="M5 13.5 9.5 18 19 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg fill="none" height="20" viewBox="0 0 24 24" width="20">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v4.2L15 15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path d="M12 8.5v5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <circle cx="12" cy="16.5" fill="currentColor" r="1" />
      <path d="M11.1 4.8 3.4 18.2A1 1 0 0 0 4.3 19.7h15.4a1 1 0 0 0 .9-1.5L12.9 4.8a1 1 0 0 0-1.8 0Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg fill="none" height="20" viewBox="0 0 24 24" width="20">
      <path d="M12 4 6 6.5v5.2c0 3.5 2.4 6.7 6 7.8 3.6-1.1 6-4.3 6-7.8V6.5L12 4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg fill="none" height="18" viewBox="0 0 24 24" width="18">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h4.1L12 8.2h6.5A1.5 1.5 0 0 1 20 9.7v7.8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-10Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg fill="none" height="18" viewBox="0 0 24 24" width="18">
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="2" />
      <path d="M5.5 19c.8-3.4 3-5.2 6.5-5.2s5.7 1.8 6.5 5.2" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}
