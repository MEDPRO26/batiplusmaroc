import Image from "next/image";
import Link from "next/link";

import { routes } from "@/lib/routes";

const items = ["Plâtrerie", "Peinture", "Carrelage", "Électricité", "Plomberie", "Menuiserie", "Climatisation", "Finitions"] as const;

export function SecondOeuvreFeature() {
  return (
    <section className="bg-[#0a1d30] py-20 text-white sm:py-28 lg:py-36" aria-labelledby="finishing-feature-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div className="flex flex-col justify-between">
            <div>
              <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-[#81c6ed] uppercase">Second œuvre</p>
              <h2 id="finishing-feature-title" className="mb-7! max-w-[650px] text-[clamp(2.65rem,5.2vw,5rem)] leading-[0.94] tracking-[-0.065em] text-white!">Des finitions qui donnent vie aux espaces.</h2>
              <p className="max-w-[580px] text-base leading-8 text-white/66 sm:text-lg">Des installations techniques aux revêtements, les interventions de second œuvre rendent les espaces fonctionnels et finalisent leur identité.</p>
            </div>
            <Link className="group mt-9 inline-flex w-fit min-h-14 items-center justify-center gap-5 rounded-[11px] bg-white px-7 py-4 font-semibold text-[#0a3152]! transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-[#eef4f7]" href={routes.finishingWork}>Explorer le second œuvre <span className="text-brand transition-transform group-hover:translate-x-1" aria-hidden="true">↗</span></Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-[0.78fr_1.22fr]">
            <div className="grid content-start gap-0 border-t border-white/16">
              {items.map((item, index) => <div key={item} className="flex items-center justify-between gap-4 border-b border-white/12 py-4"><span className="text-sm font-semibold text-white/82 sm:text-base">{item}</span><span className="text-[0.62rem] tracking-[0.14em] text-[#e8bd50]">{String(index + 1).padStart(2, "0")}</span></div>)}
            </div>
            <figure className="group relative m-0 min-h-[520px] overflow-hidden rounded-[26px] bg-[#152c3f] sm:min-h-[650px]">
              <Image src="/images/portfolio-2026/interiors/amenagement-interieur-02.webp" alt="Finitions intérieures dans un espace résidentiel" fill sizes="(max-width: 1023px) 100vw, 42vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.025]" />
              <div className="absolute inset-0 bg-linear-to-t from-[#061522]/70 via-transparent to-transparent" aria-hidden="true" />
              <figcaption className="absolute right-6 bottom-6 left-6 text-[0.65rem] font-bold tracking-[0.16em] text-white uppercase">Aménagement intérieur · S2MBOU</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
