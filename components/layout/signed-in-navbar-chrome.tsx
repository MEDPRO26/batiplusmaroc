"use client";

import { useTranslations } from "next-intl";
import { DropdownMenu } from "radix-ui";
import { Fragment, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useSafeSignOut } from "@/features/auth/hooks/use-safe-sign-out";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { AppRoute } from "@/lib/routes";
import { routes } from "@/lib/routes";

export type NavbarLink = {
  href: AppRoute;
  label: string;
  query?: Record<string, string>;
  /**
   * Internal pathnames (and their descendants) that mark this entry as current.
   * Defaults to the exact `href`, so a parent route never lights up its children.
   */
  match?: readonly string[];
  /** Internal pathnames that mark this entry as current only on an exact match. */
  exact?: readonly string[];
};

export type NavbarGroup = {
  kind: "group";
  id: string;
  label: string;
  sections: { heading?: string; items: NavbarLink[] }[];
};

export type NavbarItem = NavbarLink | NavbarGroup;

function isGroup(item: NavbarItem): item is NavbarGroup {
  return "kind" in item && item.kind === "group";
}

export function pathMatches(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isLinkActive(pathname: string, link: NavbarLink) {
  if (link.exact?.includes(pathname)) return true;
  return link.match ? pathMatches(pathname, link.match) : pathname === link.href;
}

export function isGroupActive(pathname: string, group: NavbarGroup) {
  return group.sections.some((section) =>
    section.items.some((item) => isLinkActive(pathname, item)),
  );
}

function linkHref(link: NavbarLink): ComponentProps<typeof Link>["href"] {
  if (!link.query) return link.href;
  // `href` is a static AppRoute, so the object form is always valid for next-intl.
  return { pathname: link.href, query: link.query } as ComponentProps<typeof Link>["href"];
}

const topLevelClass =
  "relative inline-flex min-h-11 items-center gap-1 rounded-[10px]  px-2.5 text-sm font-medium text-ink transition-colors duration-150 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand data-[active=true]:text-brand data-[state=open]:text-brand after:pointer-events-none after:absolute after:inset-x-2.5 after:-bottom-[15px] after:h-0.5 after:rounded-sm after:bg-brand after:opacity-0 data-[active=true]:after:opacity-100";

export function SignedInNavbarChrome({
  logo,
  links,
  accountLinks,
  cta,
  utilities,
  profile,
  ariaLabel,
  menuScope,
}: {
  logo: ReactNode;
  links: NavbarItem[];
  accountLinks: NavbarLink[];
  cta?: { href: AppRoute; label: string } | null;
  utilities?: ReactNode;
  profile: ReactNode;
  ariaLabel: string;
  /** Marks portaled menus so client items can skip the global focus outline. */
  menuScope?: "client";
}) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-brand-border/85 bg-surface/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-[calc(100%-32px)] max-w-[1280px] items-center gap-3 sm:gap-4 md:min-h-[4.5rem]">
        {logo}
        <nav aria-label={ariaLabel} className="ml-2 hidden items-center gap-0.5 lg:flex xl:ml-5">
          {links.map((item) =>
            isGroup(item) ? (
              <NavGroupMenu group={item} key={item.id} menuScope={menuScope} pathname={pathname} />
            ) : (
              <Link
                aria-current={isLinkActive(pathname, item) ? "page" : undefined}
                className={topLevelClass}
                data-active={isLinkActive(pathname, item)}
                href={linkHref(item)}
                key={`${item.href}-${item.label}`}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center justify-end gap-1.5 sm:gap-2.5 lg:gap-3 ">
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
          <RoleMobileMenu
            accountLinks={accountLinks}
            ariaLabel={ariaLabel}
            cta={cta}
            links={links}
            pathname={pathname}
          />
        </div>
      </div>
    </header>
  );
}

function NavGroupMenu({ group, pathname, menuScope }: { group: NavbarGroup; pathname: string; menuScope?: "client" }) {
  const active = isGroupActive(pathname, group);
  return (
    // Non-modal: opening a menu must not lock page scroll or shift the layout.
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-current={active ? "true" : undefined}
        className={`${topLevelClass} group cursor-pointer border-0 bg-transparent`}
        data-active={active}
      >
        {group.label}
        <svg
          aria-hidden
          className="size-3.5 text-muted transition-transform duration-150 group-data-[state=open]:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          className="z-[60] min-w-60 rounded-[14px] border border-brand-border bg-white p-1.5 text-ink shadow-[0_14px_40px_rgb(23_61_99_/_0.14)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          data-navbar-menu={menuScope}
          sideOffset={10}
        >
          {group.sections.map((section, index) => (
            <Fragment key={section.heading ?? index}>
              {index > 0 ? <DropdownMenu.Separator className="mx-1.5 my-1.5 h-px bg-brand-border" /> : null}
              {section.heading ? (
                <DropdownMenu.Label className="px-3 pt-1.5 pb-1 text-xs font-medium text-muted">
                  {section.heading}
                </DropdownMenu.Label>
              ) : null}
              {section.items.map((item) => {
                const current = isLinkActive(pathname, item);
                return (
                  <DropdownMenu.Item asChild key={`${item.href}-${item.label}`}>
                    <Link
                      aria-current={current ? "page" : undefined}
                      className="flex min-h-10 items-center rounded-[8px] px-3 text-sm text-ink outline-none transition-colors data-[current=true]:font-semibold data-[current=true]:text-brand data-[highlighted]:bg-brand-soft data-[highlighted]:text-brand"
                      data-current={current}
                      href={linkHref(item)}
                    >
                      {item.label}
                    </Link>
                  </DropdownMenu.Item>
                );
              })}
            </Fragment>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function RoleMobileMenu({
  links,
  accountLinks,
  cta,
  ariaLabel,
  pathname,
}: {
  links: NavbarItem[];
  accountLinks: NavbarLink[];
  cta?: { href: AppRoute; label: string } | null;
  ariaLabel: string;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tCommon = useTranslations("common");
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const signOut = useSafeSignOut();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>("#role-mobile-menu a")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const navHrefs = new Set(
    links.flatMap((item) =>
      isGroup(item) ? item.sections.flatMap((section) => section.items.map((link) => link.href)) : [item.href],
    ),
  );
  const extraAccountLinks = accountLinks.filter((item) => !navHrefs.has(item.href));

  const itemClass =
    "flex min-h-11 items-center rounded-[10px] px-2.5 text-[0.95rem] text-ink transition-colors hover:bg-brand-soft hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand aria-[current=page]:font-semibold aria-[current=page]:text-brand";
  const headingClass = "px-2.5 pt-3 pb-1 text-xs font-medium tracking-[0.04em] text-muted uppercase";

  const renderLink = (link: NavbarLink, key: string) => (
    <Link
      aria-current={isLinkActive(pathname, link) ? "page" : undefined}
      className={itemClass}
      href={linkHref(link)}
      key={key}
      onClick={() => setOpen(false)}
    >
      {link.label}
    </Link>
  );

  return (
    <div className="relative lg:hidden" ref={rootRef}>
      <button
        aria-label={open ? tCommon("closeMenu") : tCommon("openMenu")}
        aria-controls="role-mobile-menu"
        aria-expanded={open}
        className="flex min-h-11 min-w-11 items-center justify-center gap-3 border-0 bg-transparent font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
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
          className="absolute top-[calc(100%+14px)] right-0 z-50 grid max-h-[calc(100dvh-6rem)] w-[min(calc(100vw-32px),340px)] overflow-y-auto rounded-2xl border border-brand-border bg-white p-2.5 text-ink shadow-[0_24px_70px_rgb(23_61_99_/_0.16)]"
          id="role-mobile-menu"
        >
          {links.map((item) =>
            isGroup(item) ? (
              <div className="border-b border-brand-border pb-2 last:border-b-0" key={item.id}>
                <p className={headingClass}>{item.label}</p>
                {item.sections.map((section, index) => (
                  <div key={section.heading ?? index}>
                    {section.heading ? <p className={`${headingClass} normal-case tracking-normal`}>{section.heading}</p> : null}
                    {section.items.map((link) => renderLink(link, `${link.href}-${link.label}`))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-b border-brand-border py-1" key={`${item.href}-${item.label}`}>
                {renderLink(item, "link")}
              </div>
            ),
          )}
          {extraAccountLinks.length > 0 ? (
            <div className="border-b border-brand-border py-1">
              {extraAccountLinks.map((link) => renderLink(link, `account-${link.href}-${link.label}`))}
            </div>
          ) : null}
          <div className="border-b border-brand-border px-2.5 py-3 md:hidden">
            <LanguageSwitcher />
          </div>
          <button
            className={`${itemClass} mt-1 w-full cursor-pointer border-0 bg-transparent text-start`}
            onClick={() => {
              setOpen(false);
              void signOut().then((signedOut) => {
                if (signedOut) router.push(routes.signIn);
              });
            }}
            type="button"
          >
            {tAuth("signOut")}
          </button>
          {cta ? (
            <Link
              className="mt-3 inline-flex min-h-12 items-center justify-center rounded-[10px] bg-brand px-5 font-semibold text-white! transition-colors hover:bg-brand-hover hover:text-white! focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
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
      <div className="mx-auto flex min-h-16 w-[calc(100%-32px)] max-w-[1280px] items-center justify-between md:min-h-[4.5rem]">
        <div className="skeleton-block h-6 w-28 rounded-md" />
        <div className="flex items-center gap-3">
          <div className="skeleton-block hidden h-11 w-28 rounded-[11px] sm:block" />
          <div className="skeleton-block size-11 rounded-sm" />
        </div>
      </div>
    </header>
  );
}
