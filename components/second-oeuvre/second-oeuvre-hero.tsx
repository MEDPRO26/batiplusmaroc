import Image from "next/image";
import Link from "next/link";

import { routes } from "@/lib/routes";

export function SecondOeuvreHero() {
  return (
    <section className="relative overflow-hidden bg-[#eef3f5]">
      <div className="pointer-events-none absolute top-0 right-[8%] hidden h-full w-px bg-[#d9e2e7] lg:block" aria-hidden="true" />
      <div className="mx-auto grid max-w-[1280px] gap-12 px-[18px] pt-10 pb-18 sm:px-6 sm:pt-14 sm:pb-24 lg:min-h-[780px] lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16 lg:px-8 lg:py-24">
        <div className="relative z-10">
          <nav aria-label="Fil d’Ariane" className="mb-12 flex items-center gap-3 text-[0.68rem] font-bold tracking-[0.16em] text-muted uppercase">
            <Link className="transition-colors hover:text-brand" href={routes.home}>Accueil</Link>
            <span className="text-[#b8c2c8]" aria-hidden="true">/</span>
            <span aria-current="page" className="text-brand">Second œuvre</span>
          </nav>
          <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">S2MBOU SARL — Agadir</p>
          <h1 className="mb-8 text-[clamp(3.5rem,8vw,7.5rem)] leading-[0.83] font-semibold tracking-[-0.075em] text-ink">Second œuvre</h1>
          <p className="max-w-[700px] text-[clamp(2rem,4vw,3.9rem)] leading-[0.98] font-semibold tracking-[-0.055em] text-ink">
            Donner aux espaces leur confort, leur usage et leur caractère.
          </p>
          <p className="mt-7 max-w-[620px] text-base leading-7 text-muted sm:text-lg sm:leading-8">
            Des installations techniques aux finitions intérieures, S2MBOU coordonne les savoir-faire qui rendent chaque espace fonctionnel et soigné.
          </p>
        </div>

        <figure className="relative m-0 min-h-[520px] overflow-hidden rounded-[26px] bg-brand-dark sm:min-h-[650px] lg:min-h-[700px]">
          <Image src="/images/portfolio-2026/interiors/amenagement-interieur-02.webp" alt="Salon achevé avec revêtement de sol brillant et finitions murales" fill priority sizes="(max-width: 1023px) calc(100vw - 36px), 55vw" className="object-cover" />
          <div className="absolute inset-0 bg-linear-to-t from-[#071524]/80 via-transparent to-transparent" aria-hidden="true" />
          <figcaption className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
            <p className="mb-2 text-[0.65rem] font-bold tracking-[0.18em] text-[#e8bd50] uppercase">Portfolio S2MBOU 2026</p>
            <p className="max-w-sm text-lg leading-6 font-semibold">Aménagement et finitions intérieures</p>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
