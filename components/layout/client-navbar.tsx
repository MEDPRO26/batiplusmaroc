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

type ClientUser = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  onboardingStatus: "pending" | "completed" | null;
};

export function ClientNavbar({ user }: { user: ClientUser }) {
  const t = useTranslations("nav");
  const tBrand = useTranslations("brand");
  const tMenu = useTranslations("nav.profileMenu");
  const profile = useQuery(
    api.clients.getMyProfile,
    user.onboardingStatus === "completed" ? {} : "skip",
  );

  const projectsHref =
    user.onboardingStatus === "completed" ? routes.clientDashboard : routes.clientOnboarding;
  const profileHref =
    user.onboardingStatus === "completed" ? routes.clientProfile : routes.clientOnboarding;

  const links = [
    { href: projectsHref, label: t("myProjects") },
    { href: routes.companies, label: t("findCompanies") },
    { href: routes.messages, label: t("messages") },
  ];

  const accountLinks = [
    { href: profileHref, label: tMenu("client.myProfile") },
    { href: projectsHref, label: tMenu("client.myProjects") },
    { href: profileHref, label: tMenu("client.accountSettings") },
  ];

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email ||
    tMenu("client.fallbackName");

  return (
    <div data-navbar="client">
      <SignedInNavbarChrome
        accountLinks={accountLinks}
        ariaLabel={t("clientMain")}
        cta={null}
        links={links}
        logo={<NavbarLogo homeAria={tBrand("homeAria")} name={tBrand("name")} />}
        profile={
          <ProfileMenu
            displayName={displayName}
            firstName={user.firstName}
            items={accountLinks}
            lastName={user.lastName}
            profileImageUrl={profile?.profilePhotoUrl ?? null}
            role="client"
            roleLabel={tMenu("client.role")}
          />
        }
        utilities={<ClientNavbarUtilities />}
      />
    </div>
  );
}

export function ClientNavbarUtilities() {
  const t = useTranslations("nav");
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const notificationRoot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchOpen && !notificationsOpen) return;
    if (searchOpen) searchInput.current?.focus();
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

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("query") ?? "").trim();
    if (!value) {
      searchInput.current?.focus();
      return;
    }
    setSearchOpen(false);
    router.push({ pathname: routes.companies, query: { q: value } });
  }

  const iconButton =
    "relative grid size-11 shrink-0 place-items-center rounded-full border-0 bg-transparent text-ink transition-[background-color,color,scale] duration-150 active:scale-[0.96] hover:bg-brand-soft hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand";

  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      <form className="relative hidden w-[clamp(12rem,17vw,17rem)] xl:block" onSubmit={submitSearch} role="search">
        <label className="sr-only" htmlFor="client-navbar-search">{t("searchLabel")}</label>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted" />
        <input
          className="min-h-11 w-full rounded-full border border-brand-border bg-white pr-4 pl-10 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted/75 focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]"
          id="client-navbar-search"
          name="query"
          placeholder={t("searchPlaceholder")}
          type="search"
        />
      </form>

      <div className="relative xl:hidden">
        <button
          aria-controls="client-mobile-search"
          aria-expanded={searchOpen}
          aria-label={t("searchLabel")}
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
            id="client-mobile-search"
            onSubmit={submitSearch}
            role="search"
          >
            <label className="sr-only" htmlFor="client-mobile-search-input">{t("searchLabel")}</label>
            <input
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-brand-border px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              id="client-mobile-search-input"
              name="query"
              placeholder={t("searchPlaceholder")}
              ref={searchInput}
              type="search"
            />
            <button className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" type="submit">
              <span className="sr-only">{t("submitSearch")}</span>
              <ArrowIcon />
            </button>
          </form>
        ) : null}
      </div>

      <div className="relative" ref={notificationRoot}>
        <button
          aria-controls="client-notifications-preview"
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
            id="client-notifications-preview"
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
  return <svg aria-hidden className={className} fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>;
}

function BellIcon() {
  return <svg aria-hidden className="size-5" fill="none" viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" /><path d="M10 20h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></svg>;
}

function ArrowIcon() {
  return <svg aria-hidden className="size-5" fill="none" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>;
}
