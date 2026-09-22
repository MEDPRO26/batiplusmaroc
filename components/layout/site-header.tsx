"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { getProjectCta } from "@/components/layout/project-cta";
import { marketplaceNavItems } from "@/content/site";
import { api } from "@/convex/_generated/api";
import { Link, usePathname } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { AuthSessionControls } from "@/features/auth/components/auth-session-controls";
import { MobileNav } from "./mobile-nav";

export function SiteHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const overHero = isHome && !scrolled;
  const t = useTranslations("nav");
  const tBrand = useTranslations("brand");
  const user = useQuery(api.users.currentUser);
  const projectCta = getProjectCta(user?.accountType);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLink = `inline-flex min-h-11 items-center py-2.5 text-sm font-medium transition-colors duration-200 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand ${overHero ? "text-white/90 hover:text-white" : "text-ink"}`;
  const authLink = `hidden min-h-11 items-center text-sm font-medium transition-colors duration-200 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand lg:inline-flex ${overHero ? "text-white/90 hover:text-white" : "text-ink"}`;

  return (
    <header
      className={
        isHome
          ? `fixed left-1/2 z-50 -translate-x-1/2 border-b transition-[width,top,background-color,border-color,border-radius,box-shadow] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              overHero
                ? "top-3.5 w-[min(2000px,calc(100%-1.75rem))] rounded-none border-white/15 bg-transparent md:top-6 md:w-[min(2000px,calc(100%-3rem))] lg:top-7 lg:w-[min(2000px,calc(100%-4rem))] xl:w-[min(2000px,calc(100%-5rem))] 2xl:w-[min(2000px,calc(100%-6rem))]"
                : "top-0 w-full rounded-none border-brand-border/85 bg-white/95 shadow-[0_8px_32px_rgb(23_61_99_/_0.08)] backdrop-blur-xl"
            }`
          : "sticky top-0 z-50 border-b border-brand-border/85 bg-surface/95 backdrop-blur-xl"
      }
    >
      <div
        className={`mx-auto grid grid-cols-[auto_1fr_auto] items-center gap-3 transition-[min-height,padding] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] sm:gap-4 ${
          isHome
            ? overHero
              ? "min-h-19.5 w-full max-w-none px-5 md:min-h-22 md:px-8 lg:min-h-23 lg:px-10"
              : "min-h-16 w-full max-w-[1280px] px-5 md:min-h-[4.5rem] md:px-8"
            : "min-h-19 w-[calc(100%-36px)] max-w-[1280px]"
        }`}
      >
        <Link
          aria-label={tBrand("homeAria")}
          className={`inline-flex shrink-0 items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand ${overHero ? "text-white" : "text-brand"}`}
          href={routes.home}
        >
          <BrandLogo className={overHero ? "text-[1.45rem] leading-none text-white" : "text-[1.55rem] leading-none"} name={tBrand("name")} />
        </Link>
        <nav className="hidden items-center justify-center gap-[clamp(0.75rem,1.6vw,1.75rem)] text-sm lg:flex" aria-label={t("main")}>
          {marketplaceNavItems.map((item) => (
            <Link
              className={navLink}
              href={(item.hash ? { pathname: item.href, hash: item.hash } : item.href) as never}
              key={item.labelKey}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-end gap-2 sm:gap-3 lg:gap-4">
          <AuthSessionControls className={authLink} inverted={overHero} />
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-[11px] bg-brand px-3 text-[0.82rem] font-semibold whitespace-nowrap text-white! transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-brand-hover hover:text-white! focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:px-4 sm:text-sm lg:min-h-12 lg:px-5"
            href={projectCta.href}
          >
            {t(projectCta.labelKey)}
          </Link>
          <LanguageSwitcher inverted={overHero} />
          <MobileNav inverted={overHero} projectCta={projectCta} />
        </div>
      </div>
    </header>
  );
}
