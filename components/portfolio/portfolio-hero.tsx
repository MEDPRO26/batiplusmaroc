import Image from "next/image";
import Link from "next/link";

import { routes } from "@/lib/routes";

export function PortfolioHero() {
  return (
    <section className="bg-[#f4f6f7] px-[18px] py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div className="mx-auto grid min-h-[720px] max-w-[1500px] overflow-hidden rounded-[28px] bg-[#0b223b] text-white lg:grid-cols-[0.92fr_1.08fr] lg:rounded-[36px]">
        <div className="relative flex flex-col justify-end overflow-hidden px-6 py-14 sm:px-10 sm:py-16 lg:px-[clamp(3rem,6vw,7rem)] lg:py-20">
          <div className="absolute -top-32 -left-28 size-96 rounded-full border border-white/8" aria-hidden="true" />
          <div className="absolute -top-16 -left-8 size-56 rounded-full border border-white/8" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <p className="mb-6 flex items-center gap-4 text-[0.68rem] font-bold tracking-[0.2em] text-[#e7b63f] uppercase">
              <span className="h-px w-9 bg-[#e7b63f]" aria-hidden="true" />
              S2MBOU — Nos projets
            </p>
            <h1 className="max-w-[720px] text-[clamp(3.25rem,6vw,5.5rem)] leading-[0.88] font-semibold tracking-[-0.065em] text-white!">
              Nos réalisations
            </h1>
            <p className="mt-8 max-w-xl text-[clamp(1.35rem,2.3vw,2.2rem)] leading-[1.12] font-medium tracking-[-0.035em] text-white/94">
              Des projets qui traduisent notre savoir-faire sur le terrain.
            </p>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#b8c7d4] sm:text-lg">
              De la construction au gros œuvre jusqu’aux finitions et aux aménagements, découvrez une sélection de réalisations S2MBOU.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a className="inline-flex min-h-13 items-center justify-center gap-3 rounded-[10px] bg-brand px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href="#projets">
                Découvrir les projets <span aria-hidden="true">↓</span>
              </a>
              <Link className="inline-flex min-h-13 items-center justify-center gap-3 rounded-[10px] border border-white/25 px-6 text-sm font-semibold text-white transition hover:border-white/60 hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href={routes.contact}>
                Demander un devis <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </div>
        <figure className="relative min-h-[520px] overflow-hidden lg:min-h-full">
          <Image src="/images/portfolio-2026/projects/al-huda-03.webp" alt="Façade finale de l’immeuble R+5 à Al-Huda, Agadir" fill priority sizes="(max-width: 1023px) 100vw, 55vw" className="object-cover" />
          <div className="absolute inset-0 bg-linear-to-t from-[#0b223b]/40 via-transparent to-transparent lg:bg-linear-to-r lg:from-[#0b223b]/20 lg:to-transparent" aria-hidden="true" />
          <figcaption className="absolute right-5 bottom-5 left-5 flex items-end justify-between gap-5 border-t border-white/45 pt-4 text-white sm:right-8 sm:bottom-8 sm:left-8">
            <span className="text-sm font-semibold">Immeuble R+5 — Al-Huda</span>
            <span className="text-[0.68rem] font-bold tracking-[0.18em] uppercase">Agadir</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
