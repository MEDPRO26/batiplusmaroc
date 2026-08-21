import Image from "next/image";
import Link from "next/link";

import { routes } from "@/lib/routes";

export function ServicesHero() {
  return (
    <section className="relative overflow-hidden bg-[#eef4f7]" aria-labelledby="services-title">
      <div className="pointer-events-none absolute inset-y-0 left-[8%] hidden w-px bg-brand-border/80 lg:block" aria-hidden="true" />
      <div className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full border border-brand/10" aria-hidden="true" />
      <div className="pointer-events-none absolute -top-22 -right-22 size-[340px] rounded-full border border-brand/10" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-[1280px] gap-12 px-[18px] pt-10 pb-18 sm:px-6 sm:pt-14 sm:pb-24 lg:min-h-[780px] lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-16 lg:px-8 lg:py-24">
        <div className="relative z-10">
          <nav aria-label="Fil d’Ariane" className="mb-12 flex items-center gap-3 text-[0.68rem] font-bold tracking-[0.16em] text-muted uppercase">
            <Link className="transition-colors hover:text-brand" href={routes.home}>Accueil</Link>
            <span className="text-[#b8c2c8]" aria-hidden="true">/</span>
            <span aria-current="page" className="text-brand">Nos services</span>
          </nav>

          <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">S2MBOU — Construction & aménagement</p>
          <h1 id="services-title" className="mb-7 text-[clamp(3.8rem,8.2vw,7.8rem)] leading-[0.82] font-semibold tracking-[-0.08em] text-ink">Nos services</h1>
          <p className="max-w-[720px] text-[clamp(2rem,4vw,3.9rem)] leading-[0.98] font-semibold tracking-[-0.055em] text-ink">
            Du gros œuvre aux finitions, une maîtrise complète du projet.
          </p>
          <p className="mt-7 max-w-[620px] text-base leading-7 text-muted sm:text-lg sm:leading-8">
            S2MBOU intervient à chaque étape du bâtiment, de la structure aux finitions, en passant par la rénovation, l’aménagement intérieur et les travaux extérieurs.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link className="group inline-flex min-h-14 items-center justify-center gap-5 rounded-[11px] bg-brand px-7 py-4 font-semibold text-white! transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand" href={routes.contact}>
              Demander un devis <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">↗</span>
            </Link>
            <Link className="group inline-flex min-h-14 items-center justify-center gap-4 rounded-[11px] border border-[#b8c7d0] bg-white/55 px-7 py-4 font-semibold text-ink transition-[border-color,background-color] duration-200 hover:border-brand/45 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand" href={routes.structuralWork}>
              Découvrir le gros œuvre <span className="text-brand transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <figure className="relative m-0 min-h-[510px] overflow-hidden rounded-[26px] bg-[#0a3152] sm:min-h-[650px] lg:min-h-[690px]">
          <Image src="/images/portfolio-2026/projects/immeuble-r5-al-huda-gros-oeuvre.webp" alt="Structure d’un immeuble R+5 en cours de construction" fill priority sizes="(max-width: 1023px) calc(100vw - 36px), 54vw" className="object-cover" />
          <div className="absolute inset-0 bg-linear-to-t from-[#071524]/84 via-transparent to-transparent" aria-hidden="true" />
          <figcaption className="absolute right-6 bottom-6 left-6 flex items-end justify-between gap-6 text-white sm:right-8 sm:bottom-8 sm:left-8">
            <div>
              <p className="mb-2 text-[0.64rem] font-bold tracking-[0.18em] text-[#e8bd50] uppercase">Construction & gros œuvre</p>
              <p className="m-0 max-w-[430px] text-lg leading-6 font-semibold">Immeuble R+5 — Quartier Al-Huda, Agadir</p>
            </div>
            <span className="grid size-12 shrink-0 place-items-center rounded-full border border-white/35 text-lg" aria-hidden="true">01</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
