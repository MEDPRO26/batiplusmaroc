"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { NavbarLogo } from "@/components/layout/navbar-logo";
import { ProfileMenu } from "@/components/layout/profile-menu";
import { SignedInNavbarChrome } from "@/components/layout/signed-in-navbar-chrome";
import { useRouter } from "@/i18n/navigation";
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
  const profile = useQuery(
    api.companies.index.getOnboardingProfile,
    user.onboardingStatus === "completed" ? {} : "skip",
  );

  const workspaceHref =
    user.onboardingStatus === "completed" ? routes.companyDashboard : routes.companyOnboarding;
  const profileHref =
    user.onboardingStatus === "completed"
      ? routes.companyProfileManagement
      : routes.companyOnboarding;
  const portfolioHref =
    user.onboardingStatus === "completed" ? routes.companyPortfolio : routes.companyOnboarding;

  const links = [
    { href: routes.companyProjects, label: t("findProjects") },
    { href: portfolioHref, label: t("portfolio") },
    { href: routes.messages, label: t("messages") },
    { href: workspaceHref, label: t("myWorkspace") },
  ];

  const accountLinks = [
    { href: profileHref, label: tMenu("company.companyProfile") },
    { href: portfolioHref, label: tMenu("company.portfolio") },
    { href: workspaceHref, label: tMenu("company.workspace") },
  ];

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email ||
    tMenu("company.fallbackName");

  return (
    <div data-navbar="company">
      <SignedInNavbarChrome
        ariaLabel={t("companyMain")}
        cta={null}
        links={links}
        accountLinks={accountLinks}
        logo={<NavbarLogo homeAria={tBrand("homeAria")} name={tBrand("name")} />}
        profile={
          <ProfileMenu
            displayName={displayName}
            firstName={user.firstName}
            items={[
              { href: profileHref, label: tMenu("company.companyProfile") },
              { href: portfolioHref, label: tMenu("company.portfolio") },
              { href: workspaceHref, label: tMenu("company.workspace") },
            ]}
            lastName={user.lastName}
            profileImageUrl={profile?.logoUrl ?? null}
            role="company"
            roleLabel={tMenu("company.role")}
          />
        }
        utilities={<CompanyNavbarUtilities />}
      />
    </div>
  );
}

export function CompanyNavbarUtilities() {
  const t = useTranslations("nav");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const mobileSearchInput = useRef<HTMLInputElement>(null);
  const notificationRoot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchOpen && !notificationsOpen) return;
    if (searchOpen) mobileSearchInput.current?.focus();
    const close = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setSearchOpen(false);
        setNotificationsOpen(false);
      }
      if (
        event instanceof MouseEvent &&
        notificationsOpen &&
        !notificationRoot.current?.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("keydown", close);
    document.addEventListener("mousedown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("mousedown", close);
    };
  }, [notificationsOpen, searchOpen]);

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
        className="relative hidden min-w-0 lg:block lg:w-[clamp(14rem,22vw,22rem)]"
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
          <span className="mr-3.5 flex shrink-0 items-center gap-1 text-sm font-medium text-ink">
            {t("searchScopeProjects")}
            <ChevronIcon />
          </span>
        </div>
      </form>

      <div className="relative lg:hidden">
        <button
          aria-controls="company-mobile-search"
          aria-expanded={searchOpen}
          aria-label={t("companySearchLabel")}
          className={iconButton}
          onClick={() => {
            setNotificationsOpen(false);
            setSearchOpen((value) => !value);
          }}
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

      <div className="relative" ref={notificationRoot}>
        <button
          aria-controls="company-notifications-preview"
          aria-expanded={notificationsOpen}
          aria-label={t("notifications")}
          className={iconButton}
          onClick={() => {
            setSearchOpen(false);
            setNotificationsOpen((value) => !value);
          }}
          type="button"
        >
          <BellIcon />
        </button>
        {notificationsOpen ? (
          <div
            className="absolute top-[calc(100%+14px)] right-0 z-50 w-[min(88vw,280px)] rounded-2xl border border-brand-border bg-white p-4 text-sm leading-6 text-muted shadow-[0_18px_50px_rgb(23_61_99_/_0.14)]"
            id="company-notifications-preview"
            role="status"
          >
            <p className="m-0 font-semibold text-ink">{t("notifications")}</p>
            <p className="mt-1 mb-0">{t("notificationsEmpty")}</p>
          </div>
        ) : null}
      </div>
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

function BellIcon() {
  return (
    <svg aria-hidden className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path d="M10 20h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
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

function ChevronIcon() {
  return (
    <svg aria-hidden className="size-3.5 text-muted" fill="none" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
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
