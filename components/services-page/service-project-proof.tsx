import Image from "next/image";
import Link from "next/link";

import { routes } from "@/lib/routes";

const projects = [
  ["Immeuble R+5 — Al-Huda", "Construction & gros œuvre", "/images/portfolio-2026/projects/al-huda-03.webp", "Façade finale de l’immeuble R+5 à Al-Huda"],
  ["Villa Founty", "Construction & finitions", "/images/portfolio-2026/projects/villa-founty-02.webp", "Façade achevée d’une villa moderne à Founty"],
  ["Extérieur & piscine", "Aménagement extérieur", "/images/portfolio-2026/exteriors/facades-travaux-exterieurs-03.webp", "Aménagement extérieur avec piscine réalisé par S2MBOU"],
] as const;

export function ServiceProjectProof() {
  return (
    <section className="bg-[#edf3f7] py-20 sm:py-28 lg:py-36" aria-labelledby="project-proof-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">La preuve par le projet</p>
            <h2 id="project-proof-title" className="mb-0! max-w-[780px] text-[clamp(2.7rem,5vw,5rem)] leading-[0.95] tracking-[-0.065em]">Des compétences visibles sur le terrain.</h2>
          </div>
          <Link className="group inline-flex w-fit items-center gap-4 border-b border-brand pb-2 font-semibold text-brand" href={routes.projects}>Voir nos réalisations <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">→</span></Link>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {projects.map(([title, category, image, alt], index) => (
            <article key={title} className="overflow-hidden rounded-[24px] border border-slate-200/70 bg-white">
              <figure className="group relative m-0 min-h-[360px] overflow-hidden bg-brand-soft">
                <Image src={image} alt={alt} fill sizes="(max-width: 767px) 100vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                <span className="absolute top-5 left-5 grid size-10 place-items-center rounded-full bg-white/92 text-[0.62rem] font-bold text-brand backdrop-blur">0{index + 1}</span>
              </figure>
              <div className="p-6 sm:p-7">
                <p className="mb-3 text-[0.64rem] font-bold tracking-[0.15em] text-brand uppercase">{category}</p>
                <h3 className="mb-0 text-xl leading-tight tracking-[-0.035em] sm:text-2xl">{title}</h3>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
