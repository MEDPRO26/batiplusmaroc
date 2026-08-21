import Image from "next/image";
import Link from "next/link";

import { routes } from "@/lib/routes";

const terms = {
  structural: ["Fondations", "Structure béton armé", "Maçonnerie", "Planchers", "Escaliers", "Acrotères"],
  renovation: ["Extensions", "Reprises structurelles", "Redistribution intérieure", "Modernisation"],
  finishes: ["Carrelage", "Peinture", "Faux plafonds", "Éclairage", "Enduits décoratifs", "Menuiserie intérieure"],
} as const;

function TermList({ items, dark = false }: { items: readonly string[]; dark?: boolean }) {
  return (
    <ul className="mt-7 flex flex-wrap gap-2 p-0" aria-label="Prestations comprises">
      {items.map((item) => <li key={item} className={`list-none rounded-full border px-3 py-1.5 text-xs font-semibold ${dark ? "border-white/16 bg-white/7 text-white/78" : "border-brand-border bg-[#f5f8fa] text-[#46535d]"}`}>{item}</li>)}
    </ul>
  );
}

export function ServicesBento() {
  return (
    <section className="bg-[#eaf1f5] py-20 sm:py-28 lg:py-36" aria-labelledby="service-families-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="mb-12 flex flex-col gap-6 lg:mb-16 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Nos domaines d’intervention</p>
            <h2 id="service-families-title" className="mb-0! max-w-[880px] text-[clamp(2.7rem,5.5vw,5.5rem)] leading-[0.94] tracking-[-0.065em]">Une expertise à chaque étape du projet.</h2>
          </div>
          <p className="m-0 max-w-[390px] border-l border-[#bdcad2] pl-6 leading-7 text-muted">Six familles de services structurent notre intervention, du chantier aux détails de finition.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-12 lg:auto-rows-[245px]">
          <article className="relative overflow-hidden rounded-[28px] bg-[#0b2d49] p-7 text-white md:col-span-2 lg:col-span-7 lg:row-span-2 lg:p-10">
            <div className="pointer-events-none absolute -right-24 -bottom-24 size-80 rounded-full border border-white/8" aria-hidden="true" />
            <div className="relative flex h-full flex-col">
              <div className="flex items-center justify-between gap-4 text-[0.66rem] font-bold tracking-[0.18em] uppercase">
                <span className="text-[#e8bd50]">01</span><span className="text-white/44">Structure</span>
              </div>
              <div className="mt-auto pt-14">
                <h3 className="mb-4 max-w-[620px] text-[clamp(2.25rem,4.5vw,4.2rem)] leading-[0.96] tracking-[-0.055em] text-white!">Construction & Gros Œuvre</h3>
                <p className="m-0 max-w-[610px] leading-7 text-white/68">Les éléments qui forment la base et la structure du bâtiment, exécutés selon les plans du projet.</p>
                <TermList items={terms.structural} dark />
                <Link className="group mt-8 inline-flex items-center gap-4 border-b border-white/35 pb-2 font-semibold text-white!" href={routes.structuralWork}>Découvrir le gros œuvre <span className="text-[#e8bd50] transition-transform group-hover:translate-x-1" aria-hidden="true">→</span></Link>
              </div>
            </div>
          </article>

          <figure className="group relative m-0 min-h-[420px] overflow-hidden rounded-[28px] bg-brand-soft md:min-h-[500px] lg:col-span-5 lg:row-span-2">
            <Image src="/images/portfolio-2026/projects/al-farah-01.webp" alt="Immeuble R+5 en fin de gros œuvre à Al Farah" fill sizes="(max-width: 1023px) 100vw, 42vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
            <div className="absolute inset-0 bg-linear-to-t from-[#071524]/68 via-transparent to-transparent" aria-hidden="true" />
            <figcaption className="absolute right-6 bottom-6 left-6 text-[0.66rem] font-bold tracking-[0.16em] text-white uppercase">Projet réel · Al Farah</figcaption>
          </figure>

          <article className="rounded-[28px] border border-slate-200/70 bg-white p-7 lg:col-span-5 lg:row-span-2 lg:p-9">
            <div className="flex items-center justify-between text-[0.66rem] font-bold tracking-[0.18em] uppercase"><span className="text-brand">02</span><span className="text-muted/60">Sur mesure</span></div>
            <h3 className="mt-12 mb-4 text-[clamp(2rem,3.2vw,3.2rem)] leading-[0.98] tracking-[-0.05em]">Rénovation & Extension</h3>
            <p className="m-0 leading-7 text-muted">Transformation, modernisation et adaptation de bâtiments existants.</p>
            <TermList items={terms.renovation} />
          </article>

          <article className="group relative min-h-[460px] overflow-hidden rounded-[28px] bg-[#15222c] md:col-span-2 lg:col-span-7 lg:row-span-2">
            <Image src="/images/portfolio-2026/interiors/faux-plafonds-eclairage-01.webp" alt="Aménagement intérieur avec faux plafond et éclairage" fill sizes="(max-width: 1023px) 100vw, 58vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
            <div className="absolute inset-0 bg-linear-to-t from-[#07131e]/92 via-[#07131e]/20 to-transparent" aria-hidden="true" />
            <div className="absolute right-7 bottom-7 left-7 text-white sm:right-9 sm:bottom-9 sm:left-9">
              <span className="text-[0.66rem] font-bold tracking-[0.18em] text-[#e8bd50] uppercase">03 · Second œuvre</span>
              <h3 className="mt-4 mb-3 text-[clamp(2rem,4vw,3.8rem)] leading-[0.98] tracking-[-0.05em] text-white!">Finitions intérieures</h3>
              <p className="m-0 max-w-[610px] leading-7 text-white/72">Carrelage, peinture, faux plafonds, éclairage, enduits décoratifs et menuiserie intérieure.</p>
              <Link className="group/link mt-6 inline-flex items-center gap-4 border-b border-white/35 pb-2 font-semibold text-white!" href={routes.finishingWork}>Découvrir le second œuvre <span className="text-[#e8bd50] transition-transform group-hover/link:translate-x-1" aria-hidden="true">→</span></Link>
            </div>
          </article>

          <article className="relative min-h-[370px] overflow-hidden rounded-[28px] border border-slate-200/70 bg-[#dcebf2] p-7 lg:col-span-5 lg:row-span-2 lg:min-h-0 lg:p-9">
            <span className="text-[0.66rem] font-bold tracking-[0.18em] text-brand uppercase">04</span>
            <h3 className="mt-14 mb-4 text-[clamp(1.8rem,3vw,2.8rem)] leading-[1] tracking-[-0.045em]">Aménagement intérieur & façades</h3>
            <p className="m-0 max-w-[460px] leading-7 text-muted">Espaces intérieurs, habillages, revêtements, décoration et finitions extérieures.</p>
            <div className="pointer-events-none absolute -right-20 -bottom-28 size-72 rounded-full border border-brand/12" aria-hidden="true" />
          </article>

          <article className="min-h-[340px] rounded-[28px] border border-slate-200/70 bg-white p-7 lg:col-span-7 lg:row-span-2 lg:min-h-0 lg:p-9">
            <span className="text-[0.66rem] font-bold tracking-[0.18em] text-brand uppercase">05</span>
            <h3 className="mt-14 mb-4 text-[clamp(1.8rem,3vw,2.7rem)] leading-[1] tracking-[-0.045em]">Cuisines & rangements</h3>
            <p className="m-0 leading-7 text-muted">Conception et réalisation d’éléments intégrés adaptés aux espaces intérieurs, avec des finitions sur mesure.</p>
          </article>

          <article className="group relative min-h-[380px] overflow-hidden rounded-[28px] bg-[#15222c] md:col-span-2 lg:col-span-12">
            <Image src="/images/portfolio-2026/exteriors/exterieur-piscine-02.webp" alt="Aménagement extérieur avec terrasse et piscine" fill sizes="(max-width: 1023px) 100vw, 66vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
            <div className="absolute inset-0 bg-linear-to-r from-[#07131e]/90 via-[#07131e]/42 to-transparent" aria-hidden="true" />
            <div className="absolute inset-y-0 left-0 flex max-w-[620px] flex-col justify-end p-7 text-white sm:p-9 lg:p-10">
              <span className="text-[0.66rem] font-bold tracking-[0.18em] text-[#e8bd50] uppercase">06</span>
              <h3 className="mt-4 mb-3 text-[clamp(2rem,3.6vw,3.6rem)] leading-[0.98] tracking-[-0.05em] text-white!">Travaux particuliers</h3>
              <p className="m-0 leading-7 text-white/72">Piscines, terrasses, escaliers, circulations, façades et détails de finition.</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
