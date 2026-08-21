import Image from "next/image";
import Link from "next/link";
import { primaryNavigation, serviceNavigation } from "@/content/site";
import { routes } from "@/lib/routes";
import { MobileNav } from "./mobile-nav";

const navLink = "py-2.5 text-sm font-medium text-ink transition-colors duration-200 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand [body:has(.home-hero)_&]:text-white/90! [body:has(.home-hero)_&]:hover:text-white!";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-brand-border/85 bg-surface/95 backdrop-blur-xl [body:has(.home-hero)_&]:absolute [body:has(.home-hero)_&]:top-3.5 [body:has(.home-hero)_&]:left-1/2 [body:has(.home-hero)_&]:w-[calc(100%-28px)] [body:has(.home-hero)_&]:max-w-[1700px] [body:has(.home-hero)_&]:-translate-x-1/2 [body:has(.home-hero)_&]:border-white/15 [body:has(.home-hero)_&]:bg-transparent [body:has(.home-hero)_&]:backdrop-blur-none md:[body:has(.home-hero)_&]:top-6 md:[body:has(.home-hero)_&]:w-[calc(100%-48px)] lg:[body:has(.home-hero)_&]:top-7 lg:[body:has(.home-hero)_&]:w-[calc(100%-64px)]">
      <div className="mx-auto flex min-h-19 w-[calc(100%-36px)] max-w-[1280px] items-center justify-between gap-6 [body:has(.home-hero)_&]:min-h-19.5 [body:has(.home-hero)_&]:w-full [body:has(.home-hero)_&]:max-w-none [body:has(.home-hero)_&]:px-5 md:[body:has(.home-hero)_&]:min-h-22 md:[body:has(.home-hero)_&]:px-8 lg:[body:has(.home-hero)_&]:min-h-23 lg:[body:has(.home-hero)_&]:px-10">
        <Link className="inline-flex shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand [body:has(.home-hero)_&]:rounded-lg [body:has(.home-hero)_&]:bg-white/95 [body:has(.home-hero)_&]:px-2.5 [body:has(.home-hero)_&]:py-1.5" href={routes.home} aria-label="S2MBOU — Accueil">
          <Image className="h-auto w-[153px] [body:has(.home-hero)_&]:w-[132px]" src="/brand/s2mbou-logo.webp" alt="S2MBOU" width={153} height={40} priority />
        </Link>
        <nav className="hidden items-center gap-[clamp(1rem,1.8vw,1.75rem)] text-sm lg:flex" aria-label="Navigation principale">
          {primaryNavigation.slice(0, 2).map((item, index) => <Link className={`${navLink} ${index === 0 ? "[body:has(.home-hero)_&]:text-[#81c6ed]!" : ""}`} key={item.href} href={item.href}>{item.label}</Link>)}
          <details className="group relative">
            <summary className={`${navLink} flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden`}>Services <span className="transition-transform duration-200 group-open:rotate-180" aria-hidden="true">⌄</span></summary>
            <div className="absolute top-[calc(100%+18px)] -left-5 grid w-[210px] rounded-[10px] border border-brand-border bg-white p-2.5 text-ink shadow-[0_20px_50px_rgb(23_61_99_/_0.12)]">
              <Link className="rounded-[7px] p-3 transition-colors hover:bg-brand-soft hover:text-brand" href={routes.services}>Nos services</Link>
              {serviceNavigation.map((item) => <Link className="rounded-[7px] p-3 transition-colors hover:bg-brand-soft hover:text-brand" key={item.href} href={item.href}>{item.label}</Link>)}
            </div>
          </details>
          {primaryNavigation.slice(2).map((item) => <Link className={navLink} key={item.href} href={item.href}>{item.label}</Link>)}
          <Link className="ml-1 inline-flex min-h-12 items-center justify-center gap-3 rounded-[11px] bg-brand px-6 text-sm font-semibold text-white! transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand" href={routes.contact}>Demander un devis <span aria-hidden="true">↗</span></Link>
        </nav>
        <MobileNav />
      </div>
    </header>
  );
}
