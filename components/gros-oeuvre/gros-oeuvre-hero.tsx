import Image from "next/image";
import Link from "next/link";

import { routes } from "@/lib/routes";

export function GrosOeuvreHero() {
  return (
    <section className="relative overflow-hidden bg-[#f2f6f8]">
      <div className="pointer-events-none absolute inset-y-0 left-[8%] hidden w-px bg-brand-border/80 lg:block" aria-hidden="true" />
      <div className="pointer-events-none absolute top-0 right-0 h-56 w-56 rounded-full border border-brand/10 sm:h-80 sm:w-80 lg:-top-24 lg:right-[4%] lg:h-[520px] lg:w-[520px]" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-[1280px] gap-12 px-[18px] pt-10 pb-18 sm:px-6 sm:pt-14 sm:pb-24 lg:min-h-[760px] lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-16 lg:px-8 lg:py-24">
        <div className="relative z-10">
          <nav aria-label="Fil d’Ariane" className="mb-12 flex items-center gap-3 text-[0.68rem] font-bold tracking-[0.16em] text-muted uppercase">
            <Link className="transition-colors hover:text-brand" href={routes.home}>Accueil</Link>
            <span className="text-[#b8c2c8]" aria-hidden="true">/</span>
            <span aria-current="page" className="text-brand">Gros œuvre</span>
          </nav>

          <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">S2MBOU — Gros œuvre</p>
          <h1 className="mb-8 text-[clamp(3.9rem,8.5vw,8rem)] leading-[0.8] font-semibold tracking-[-0.08em] text-ink">Gros œuvre</h1>
          <p className="max-w-[720px] text-[clamp(2rem,4.1vw,4rem)] leading-[0.98] font-semibold tracking-[-0.055em] text-ink">
            Construire des bases solides pour chaque projet.
          </p>
          <p className="mt-7 max-w-[610px] text-base leading-7 text-muted sm:text-lg sm:leading-8">
            S2MBOU réalise les travaux qui donnent au bâtiment sa structure, de la fondation à l’exécution du gros œuvre.
          </p>
        </div>

        <figure className="relative m-0 min-h-[500px] overflow-hidden rounded-[24px] bg-[#102944] sm:min-h-[620px] lg:min-h-[680px]">
          <Image
            src="/images/portfolio-2026/projects/immeuble-r5-al-huda-gros-oeuvre.webp"
            alt="Immeuble R+5 à Al-Huda pendant le gros œuvre"
            fill
            priority
            sizes="(max-width: 1023px) calc(100vw - 36px), 56vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-t from-[#071524]/85 via-[#071524]/5 to-transparent" aria-hidden="true" />
          <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-5 p-6 text-white sm:p-8">
            <div>
              <p className="mb-2 text-[0.65rem] font-bold tracking-[0.18em] text-[#e8bd50] uppercase">Projet réel</p>
              <p className="text-lg leading-6 font-semibold">Immeuble R+5 — Quartier Al-Huda, Agadir</p>
            </div>
            <span className="hidden h-px w-20 bg-white/45 sm:block" aria-hidden="true" />
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
