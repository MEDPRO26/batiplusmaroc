import Image from "next/image";
import Link from "next/link";

import { routes } from "@/lib/routes";

export function AboutHero() {
  return (
    <section className="relative overflow-hidden bg-[#f4f7f8]">
      <div className="pointer-events-none absolute inset-y-0 left-[7%] hidden w-px bg-brand-border/75 lg:block" aria-hidden="true" />
      <div className="mx-auto grid max-w-[1280px] gap-12 px-[18px] pt-12 pb-18 sm:px-6 sm:pt-16 sm:pb-22 lg:min-h-[720px] lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-16 lg:px-8 lg:py-24">
        <div className="relative z-10">
          <nav aria-label="Fil d’Ariane" className="mb-12 flex items-center gap-3 text-[0.68rem] font-bold tracking-[0.16em] text-muted uppercase">
            <Link className="transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand" href={routes.home}>Accueil</Link>
            <span className="text-[#b8c2c8]" aria-hidden="true">/</span>
            <span aria-current="page" className="text-brand">À propos</span>
          </nav>

          <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">S2MBOU SARL</p>
          <h1 className="mb-8 text-[clamp(3.5rem,8vw,7.5rem)] leading-[0.82] font-semibold tracking-[-0.075em] text-ink">À propos</h1>
          <h2 className="mb-6! max-w-[700px] text-[clamp(2rem,4.2vw,4rem)] leading-[0.98] tracking-[-0.055em] text-ink">
            Construire avec exigence, du gros œuvre aux finitions.
          </h2>
          <p className="max-w-[590px] text-base leading-7 text-muted sm:text-lg sm:leading-8">
            S2MBOU SARL accompagne ses clients dans les travaux de construction, gros œuvre, rénovation, aménagement et finition.
          </p>
        </div>

        <div className="relative min-h-[460px] overflow-hidden rounded-[26px] bg-brand-dark sm:min-h-[580px] lg:min-h-[640px]">
          <Image
            src="/images/portfolio-2026/projects/villa-founty-01.webp"
            alt="Villa Founty en cours de construction par S2MBOU"
            fill
            priority
            sizes="(max-width: 1023px) calc(100vw - 36px), 56vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-t from-[#081727]/70 via-transparent to-transparent" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-5 p-6 text-white sm:p-8">
            <div>
              <p className="mb-2 text-[0.65rem] font-bold tracking-[0.18em] text-[#efc85f] uppercase">Projet réel</p>
              <p className="max-w-xs text-lg leading-6 font-semibold">Construction d’une villa à Founty</p>
            </div>
            <span className="grid size-12 shrink-0 place-items-center rounded-full border border-white/35 text-lg" aria-hidden="true">↗</span>
          </div>
        </div>
      </div>
    </section>
  );
}
