"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Link, useRouter } from "@/i18n/navigation";
import type { AppRoute } from "@/lib/routes";
import { routes } from "@/lib/routes";

export type NavbarLink = {
  href: AppRoute;
  label: string;
};

export function SignedInNavbarChrome({
  logo,
  links,
  accountLinks,
  cta,
  utilities,
  profile,
  ariaLabel,
}: {
  logo: ReactNode;
  links: NavbarLink[];
  accountLinks: NavbarLink[];
  cta?: { href: AppRoute; label: string } | null;
  utilities?: ReactNode;
  profile: ReactNode;
  ariaLabel: string;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-brand-border/85 bg-surface/95 backdrop-blur-xl">
      <div className="mx-auto grid min-h-16 w-[calc(100%-36px)] max-w-[1280px] grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-4 md:min-h-[4.5rem]">
        {logo}
        <nav
          aria-label={ariaLabel}
          className="hidden items-center justify-center gap-[clamp(0.85rem,1.8vw,1.85rem)] text-sm lg:flex"
        >
          {links.map((item) => (
            <Link
              className="inline-flex min-h-11 items-center py-2.5 text-sm font-medium text-ink transition-colors duration-200 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              href={item.href}
              key={`${item.href}-${item.label}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-end gap-2 sm:gap-3 lg:gap-4">
          {utilities}
          {cta ? (
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-[11px] bg-brand px-3 text-[0.82rem] font-semibold whitespace-nowrap text-white! transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-brand-hover hover:text-white! focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:px-4 sm:text-sm lg:min-h-12 lg:px-5"
              href={cta.href}
            >
              {cta.label}
            </Link>
          ) : null}
          <div className="hidden md:block">
            <LanguageSwitcher />
          </div>
          {profile}
          <RoleMobileMenu accountLinks={accountLinks} ariaLabel={ariaLabel} cta={cta} links={links} />
        </div>
      </div>
    </header>
  );
}

function RoleMobileMenu({
  links,
  accountLinks,
  cta,
  ariaLabel,
}: {
  links: NavbarLink[];
  accountLinks: NavbarLink[];
  cta?: { href: AppRoute; label: string } | null;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const firstLink = useRef<HTMLAnchorElement>(null);
  const tCommon = useTranslations("common");
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const { signOut } = useAuthActions();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    firstLink.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  const itemClass =
    "flex min-h-12 items-center justify-between border-b border-brand-border px-1.5 transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

  return (
    <div className="relative lg:hidden">
      <button
        aria-label={open ? tCommon("closeMenu") : tCommon("openMenu")}
        aria-controls="role-mobile-menu"
        aria-expanded={open}
        className="flex min-h-11 items-center gap-3 border-0 bg-transparent font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="hidden sm:inline">{open ? tCommon("close") : tCommon("menu")}</span>
        <span aria-hidden className="grid gap-1.5">
          <i className="block h-px w-[22px] bg-current" />
          <i className="block h-px w-[22px] bg-current" />
        </span>
      </button>
      {open ? (
        <nav
          aria-label={ariaLabel || t("mobile")}
          className="absolute top-[calc(100%+15px)] right-0 z-50 grid w-[min(88vw,340px)] rounded-[18px] border border-brand-border bg-white p-4 text-ink shadow-[0_24px_70px_rgb(23_61_99_/_0.16)]"
          id="role-mobile-menu"
        >
          {links.map((item, index) => (
            <Link
              className={itemClass}
              href={item.href}
              key={`nav-${item.href}-${item.label}`}
              onClick={() => setOpen(false)}
              ref={index === 0 ? firstLink : undefined}
            >
              {item.label}
              <span aria-hidden>↗</span>
            </Link>
          ))}
          {accountLinks
            .filter((item) => !links.some((link) => link.href === item.href))
            .map((item) => (
            <Link
              className={itemClass}
              href={item.href}
              key={`account-${item.href}-${item.label}`}
              onClick={() => setOpen(false)}
            >
              {item.label}
              <span aria-hidden>↗</span>
            </Link>
            ))}
          <div className="border-b border-brand-border py-3">
            <LanguageSwitcher />
          </div>
          <button
            className={`${itemClass} w-full cursor-pointer border-x-0 border-t-0 bg-transparent text-start`}
            onClick={() => {
              setOpen(false);
              void signOut().then(() => router.push(routes.signIn));
            }}
            type="button"
          >
            {tAuth("signOut")}
          </button>
          {cta ? (
            <Link
              className="mt-4 inline-flex min-h-12 items-center justify-center rounded-[10px] bg-brand px-5 font-semibold text-white! transition-colors hover:bg-brand-hover hover:text-white! focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              href={cta.href}
              onClick={() => setOpen(false)}
            >
              {cta.label}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

export function NavbarLoadingShell() {
  return (
    <header
      aria-busy="true"
      className="sticky top-0 z-50 border-b border-brand-border/85 bg-surface/95 backdrop-blur-xl"
    >
      <div className="mx-auto flex min-h-16 w-[calc(100%-36px)] max-w-[1280px] items-center justify-between md:min-h-[4.5rem]">
        <div className="skeleton-block h-6 w-28 rounded-md" />
        <div className="flex items-center gap-3">
          <div className="skeleton-block hidden h-11 w-28 rounded-[11px] sm:block" />
          <div className="skeleton-block size-11 rounded-full" />
        </div>
      </div>
    </header>
  );
}
