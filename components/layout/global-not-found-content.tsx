"use client";

import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/layout/brand-logo";
import { getPathname } from "@/i18n/navigation";
import { routes, type AppRoute } from "@/lib/routes";

type Locale = "en" | "fr";

type GlobalNotFoundCopy = {
  kicker: string;
  eyebrow: string;
  title: string;
  description: string;
  actionsLabel: string;
  home: string;
  browseCompanies: string;
  contact: string;
  services: string;
  projects: string;
  brandName: string;
  brandHomeAria: string;
  languageLabel: string;
  languageFr: string;
  languageEn: string;
};

export type GlobalNotFoundCopies = Record<Locale, GlobalNotFoundCopy>;

export function GlobalNotFoundContent({
  copies,
  fontClassName,
}: {
  copies: GlobalNotFoundCopies;
  fontClassName: string;
}) {
  const pathname = usePathname() || "/fr";
  const locale: Locale = pathname === "/en" || pathname.startsWith("/en/") ? "en" : "fr";
  const copy = copies[locale];
  const routeHref = (route: AppRoute) => getPathname({ href: route, locale });
  const localeHref = (nextLocale: Locale) => {
    const rest = pathname.replace(/^\/(?:en|fr)(?=\/|$)/, "");
    return `/${nextLocale}${rest || ""}`;
  };

  return (
    <html lang={locale === "en" ? "en" : "fr-FR"} className={`${fontClassName} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-[#f5f8fa] text-ink">
        <header className="border-b border-brand-border/85 bg-white">
          <div className="mx-auto flex min-h-18 w-[calc(100%-36px)] max-w-[1180px] items-center justify-between gap-5">
            <a aria-label={copy.brandHomeAria} className="inline-flex text-brand" href={routeHref(routes.home)}>
              <BrandLogo className="text-[1.55rem] leading-none" name={copy.brandName} />
            </a>
            <nav aria-label={copy.languageLabel} className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.04em]">
              <a aria-current={locale === "fr" ? "page" : undefined} className={locale === "fr" ? "text-ink" : "text-muted hover:text-ink"} href={localeHref("fr")}>{copy.languageFr}</a>
              <span aria-hidden className="text-ink/25">|</span>
              <a aria-current={locale === "en" ? "page" : undefined} className={locale === "en" ? "text-ink" : "text-muted hover:text-ink"} href={localeHref("en")}>{copy.languageEn}</a>
            </nav>
          </div>
        </header>

        <main className="relative isolate flex flex-1 items-center overflow-hidden px-[18px] py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div aria-hidden className="absolute inset-0 -z-10 opacity-55 [background-image:linear-gradient(#dce4e9_1px,transparent_1px),linear-gradient(90deg,#dce4e9_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
          <div className="mx-auto grid w-full max-w-[1180px] items-center gap-10 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-20">
            <div className="relative min-h-[240px] overflow-hidden rounded-[28px] bg-brand-dark p-7 text-white shadow-[0_28px_80px_rgb(23_61_99_/_0.18)] sm:min-h-[340px] sm:p-10 lg:min-h-[430px]">
              <div aria-hidden className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgb(255_255_255_/_0.28)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255_/_0.28)_1px,transparent_1px)] [background-size:36px_36px]" />
              <div aria-hidden className="absolute -right-16 -bottom-24 size-72 rounded-full border border-white/15 sm:size-96" />
              <div aria-hidden className="absolute -right-4 -bottom-16 size-48 rounded-full border border-white/15 sm:size-64" />
              <div className="relative flex min-h-[190px] flex-col justify-between sm:min-h-[260px] lg:min-h-[350px]">
                <p className="m-0 text-[0.68rem] font-bold tracking-[0.2em] text-white/65 uppercase">{copy.kicker}</p>
                <h1 className="m-0 text-[clamp(6.5rem,22vw,12.5rem)] leading-[0.72] font-bold tracking-[-0.08em] text-white! select-none">404</h1>
              </div>
            </div>

            <div className="max-w-[660px] lg:py-8">
              <p className="eyebrow">{copy.eyebrow}</p>
              <h2 className="max-w-[620px] text-[clamp(2.35rem,5vw,4.4rem)] leading-[0.98] tracking-[-0.05em]">{copy.title}</h2>
              <p className="mt-6 max-w-[570px] text-[1rem] leading-7 text-muted sm:text-[1.08rem] sm:leading-8">{copy.description}</p>
              <nav aria-label={copy.actionsLabel} className="mt-9 flex flex-wrap gap-3">
                <a className="button button-primary active:scale-[0.96]" href={routeHref(routes.home)}>
                  {copy.home} <span aria-hidden>→</span>
                </a>
                <a className="button border border-brand-border bg-white text-ink shadow-[0_8px_24px_rgb(23_61_99_/_0.06)] transition-[border-color,color,transform] duration-200 hover:border-brand hover:text-brand active:scale-[0.96]" href={routeHref(routes.companies)}>
                  {copy.browseCompanies}
                </a>
              </nav>
              <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3 border-t border-brand-border pt-6 text-sm font-semibold text-brand">
                <a className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" href={routeHref(routes.services)}>{copy.services}</a>
                <a className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" href={routeHref(routes.projects)}>{copy.projects}</a>
                <a className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" href={routeHref(routes.contact)}>{copy.contact}</a>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
