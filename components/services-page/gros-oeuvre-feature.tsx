import Image from "next/image";
import Link from "next/link";

import { routes } from "@/lib/routes";

const items = ["Fondations", "Maçonnerie", "Structure béton armé", "Planchers", "Suivi selon plans"] as const;

export function GrosOeuvreFeature() {
  return (
    <section className="bg-white py-20 sm:py-28 lg:py-36" aria-labelledby="structural-feature-title">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-[18px] sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-20 lg:px-8">
        <figure className="group relative m-0 min-h-[480px] overflow-hidden rounded-[26px] bg-brand-soft sm:min-h-[680px]">
          <Image src="/images/portfolio-2026/projects/al-huda-02.webp" alt="Structure en béton armé d’un immeuble R+5 à Al-Huda" fill sizes="(max-width: 1023px) calc(100vw - 36px), 52vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.025]" />
          <div className="absolute inset-0 bg-linear-to-t from-[#071524]/68 via-transparent to-transparent" aria-hidden="true" />
          <figcaption className="absolute right-6 bottom-6 left-6 flex items-center justify-between text-white sm:right-8 sm:bottom-8 sm:left-8">
            <span className="text-sm font-semibold">Immeuble R+5 — Al-Huda</span>
            <span className="text-[0.65rem] font-bold tracking-[0.15em] text-[#e8bd50] uppercase">Gros œuvre</span>
          </figcaption>
        </figure>

        <div>
          <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Gros œuvre</p>
          <h2 id="structural-feature-title" className="mb-7! text-[clamp(2.65rem,5.2vw,5rem)] leading-[0.94] tracking-[-0.065em]">La structure qui donne sa solidité au projet.</h2>
          <p className="max-w-[570px] text-base leading-8 text-muted sm:text-lg">S2MBOU intervient sur les travaux structurels qui constituent la base du bâtiment et accompagnent son élévation.</p>
          <ul className="mt-9 grid gap-0 p-0">
            {items.map((item, index) => <li key={item} className="flex list-none items-center gap-5 border-t border-brand-border py-4 font-semibold text-ink"><span className="text-[0.65rem] tracking-[0.14em] text-brand">0{index + 1}</span>{item}</li>)}
          </ul>
          <Link className="group mt-9 inline-flex min-h-14 items-center justify-center gap-5 rounded-[11px] bg-brand px-7 py-4 font-semibold text-white! transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-brand-hover" href={routes.structuralWork}>Explorer le gros œuvre <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </section>
  );
}
