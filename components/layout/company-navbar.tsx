"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { NavbarLogo } from "@/components/layout/navbar-logo";
import { buildCompanyNav } from "@/components/layout/company-nav";
import { ProfileMenu, type ProfileMenuItem } from "@/components/layout/profile-menu";
import { SignedInNavbarChrome } from "@/components/layout/signed-in-navbar-chrome";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

type CompanyUser = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  onboardingStatus: "pending" | "completed" | null;
};

export function CompanyNavbar({ user }: { user: CompanyUser }) {
  const t = useTranslations("nav");
  const tBrand = useTranslations("brand");
  const tMenu = useTranslations("nav.profileMenu");
  const onboarded = user.onboardingStatus === "completed";
  const access = useQuery(api.companyVerification.index.getVerificationStatus, onboarded ? {} : "skip");
  const profile = useQuery(api.companies.index.getOnboardingProfile, onboarded && access?.canManageDocuments ? {} : "skip");

  const links = buildCompanyNav(t, onboarded);
  const profileHref = onboarded ? routes.companyProfileManagement : routes.companyOnboarding;
  const settingsHref = onboarded ? routes.companySettings : routes.companyOnboarding;

  // The avatar menu answers "who am I and how do I manage my company?" —
  // marketplace destinations (portfolio, commissions, projects) live in the navbar.
  const identitySection: ProfileMenuItem[] = [
    ...(profile?.publicSlug
      ? [
          {
            href: { pathname: "/entreprises/[slug]" as const, params: { slug: profile.publicSlug } },
            label: tMenu("company.viewPublicProfile"),
          },
        ]
      : []),
    { href: profileHref, label: tMenu("company.companyProfile") },
  ];
  const accountSection: ProfileMenuItem[] = [
    { href: settingsHref, label: tMenu("company.settings") },
    {
      href: onboarded ? { pathname: routes.companySettings, query: { section: "verification" } } : routes.companyOnboarding,
      label: tMenu("company.verification"),
      meta: profile ? tMenu(`company.verificationStatus.${profile.verificationStatus}`) : undefined,
    },
  ];

  const personName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  const displayName = profile?.name || personName || user.email || tMenu("company.fallbackName");

  return (
    <div data-navbar="company">
      <SignedInNavbarChrome
        ariaLabel={t("companyMain")}
        cta={null}
        links={links}
        accountLinks={[{ href: profileHref, label: tMenu("company.companyProfile") }, { href: settingsHref, label: tMenu("company.settings") }]}
        logo={<NavbarLogo homeAria={tBrand("homeAria")} name={tBrand("name")} />}
        profile={
          <ProfileMenu
            displayName={displayName}
            firstName={profile?.name || user.firstName}
            lastName={profile?.name ? null : user.lastName}
            profileImageUrl={profile?.logoUrl ?? null}
            role="company"
            roleLabel={tMenu("company.role")}
            sections={[identitySection, accountSection]}
          />
        }
        utilities={<CompanyNavbarUtilities />}
      />
      {profile?.accountRestricted ? (
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950" role="status">
          <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 font-medium">{t("companySuspended.message")}</p>
            <Link className="font-semibold underline underline-offset-4" href={routes.companyBatiplus}>
              {t("companySuspended.support")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CompanyNavbarUtilities() {
  const t = useTranslations("nav");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const mobileSearchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!searchOpen) return;
    if (searchOpen) mobileSearchInput.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [searchOpen]);

  function goToProjectSearch(value: string) {
    const trimmed = value.trim();
    setSearchOpen(false);
    if (!trimmed) {
      router.push(routes.companyProjects);
      return;
    }
    router.push({ pathname: routes.companyProjects, query: { q: trimmed } });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("query") ?? "").trim();
    if (!value) {
      (searchOpen ? mobileSearchInput : searchInput).current?.focus();
      return;
    }
    setQuery(value);
    goToProjectSearch(value);
  }

  const iconButton =
    "relative grid size-11 shrink-0 place-items-center rounded-full border-0 bg-transparent text-ink transition-[background-color,color,scale] duration-150 active:scale-[0.96] hover:bg-brand-soft hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand";

  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      <form
        className="relative hidden min-w-0 xl:block xl:w-[clamp(15rem,20vw,20rem)]"
        onSubmit={submitSearch}
        role="search"
      >
        <label className="sr-only" htmlFor="company-navbar-search">
          {t("companySearchLabel")}
        </label>
        <div className="flex min-h-11 items-center overflow-hidden rounded-full border border-brand-border bg-white transition-[border-color,box-shadow] duration-150 focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]">
          <SearchIcon className="ml-3.5 size-[18px] shrink-0 text-muted" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent px-2.5 py-2.5 text-sm text-ink outline-none placeholder:text-muted/75 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
            id="company-navbar-search"
            name="query"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("companySearchPlaceholder")}
            ref={searchInput}
            type="search"
            value={query}
          />
          {query ? (
            <button
              aria-label={t("clearSearch")}
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-brand-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={() => {
                setQuery("");
                searchInput.current?.focus();
              }}
              type="button"
            >
              <ClearIcon />
            </button>
          ) : null}
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-brand-border" />
          <span className="mr-4 shrink-0 text-sm font-medium text-muted">{t("searchScopeProjects")}</span>
        </div>
      </form>

      <div className="relative xl:hidden">
        <button
          aria-controls="company-mobile-search"
          aria-expanded={searchOpen}
          aria-label={t("companySearchLabel")}
          className={iconButton}
          onClick={() => setSearchOpen((value) => !value)}
          type="button"
        >
          <SearchIcon className="size-5" />
        </button>
        {searchOpen ? (
          <form
            className="absolute top-[calc(100%+14px)] right-[-7.5rem] z-50 flex w-[min(88vw,360px)] gap-2 rounded-2xl border border-brand-border bg-white p-3 shadow-[0_18px_50px_rgb(23_61_99_/_0.14)] sm:right-0"
            id="company-mobile-search"
            onSubmit={submitSearch}
            role="search"
          >
            <label className="sr-only" htmlFor="company-mobile-search-input">
              {t("companySearchLabel")}
            </label>
            <input
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-brand-border px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              id="company-mobile-search-input"
              name="query"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("companySearchPlaceholder")}
              ref={mobileSearchInput}
              type="search"
              value={query}
            />
            <button
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              type="submit"
            >
              <span className="sr-only">{t("submitSearch")}</span>
              <ArrowIcon />
            </button>
          </form>
        ) : null}
      </div>

      <NotificationBell accountType="company" />
    </div>
  );
}

function SearchIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg aria-hidden className={className} fill="none" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg aria-hidden className="size-3.5" fill="none" viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="m9 5 7 7-7 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
