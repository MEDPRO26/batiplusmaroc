import Image from "next/image";
import Link from "next/link";

import { routes } from "@/lib/routes";

export function AboutCta() {
  return (
    <section className="bg-[#f6f8f9] px-[18px] py-14 sm:px-6 sm:py-18 lg:px-8 lg:py-24" aria-labelledby="about-cta-title">
      <div className="relative mx-auto grid max-w-[1280px] overflow-hidden rounded-[28px] bg-[#0a3152] text-white shadow-[0_28px_80px_rgb(8_35_58_/_0.16)] lg:grid-cols-[1.18fr_0.82fr]">
        <div className="relative flex flex-col justify-center px-6 py-12 sm:px-10 sm:py-16 lg:min-h-[590px] lg:px-16 lg:py-20 xl:px-20">
          <div className="pointer-events-none absolute -bottom-44 -left-40 size-[390px] rounded-full border border-white/8" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-28 -left-28 size-[270px] rounded-full border border-white/8" aria-hidden="true" />

          <div className="relative">
            <div className="mb-8 flex items-center gap-4">
              <span className="h-px w-10 bg-[#e7b63f]" aria-hidden="true" />
              <p className="m-0 text-[0.68rem] font-bold tracking-[0.2em] text-[#9ed6f5] uppercase">Parlons de votre projet</p>
            </div>
            <h2 id="about-cta-title" className="mb-7! max-w-[760px] text-[clamp(2.4rem,5vw,4.8rem)] leading-[0.96] tracking-[-0.06em] text-white!">
              Vous avez un projet de construction ou de rénovation ?
            </h2>
            <p className="max-w-[610px] text-base leading-7 text-white/72 sm:text-lg sm:leading-8">
              Construction, rénovation, aménagement ou finitions&nbsp;: échangeons sur vos besoins et le périmètre de votre projet.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link className="group inline-flex min-h-14 items-center justify-center gap-5 rounded-[12px] bg-white px-7 py-4 font-semibold text-[#0a3152]! shadow-[0_16px_40px_rgb(2_18_32_/_0.22)] transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[#f5f8fa] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href={routes.contact}>
                Demander un devis
                <span className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">↗</span>
              </Link>
              <a className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-[12px] border border-white/22 px-6 py-4 font-semibold text-white! transition-[border-color,background-color] duration-200 hover:border-white/45 hover:bg-white/6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href="tel:+212766018650" aria-label="Appeler S2MBOU au +212 766-018650">
                <span className="grid size-7 place-items-center rounded-full border border-[#e7b63f]/70 text-xs text-[#e7b63f]" aria-hidden="true">↗</span>
                +212 766-018650
              </a>
            </div>
          </div>
        </div>

        <div className="relative order-first min-h-[300px] overflow-hidden lg:order-last lg:min-h-full">
          <Image
            src="/images/portfolio-2026/exteriors/facades-travaux-exterieurs-03.webp"
            alt="Aménagement extérieur avec piscine réalisé par S2MBOU"
            fill
            sizes="(max-width: 1023px) calc(100vw - 36px), 38vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-t from-[#061a2c]/65 via-transparent to-transparent lg:bg-linear-to-r lg:from-[#0a3152]/35 lg:via-transparent lg:to-transparent" aria-hidden="true" />
          <div className="absolute right-5 bottom-5 left-5 flex items-end justify-between gap-4 rounded-[14px] border border-white/16 bg-[#071d2e]/58 p-4 text-white backdrop-blur-md sm:right-7 sm:bottom-7 sm:left-7 sm:p-5 lg:right-8 lg:bottom-8 lg:left-8">
            <div>
              <p className="mb-1 text-[0.62rem] font-bold tracking-[0.18em] text-[#e7b63f] uppercase">Savoir-faire S2MBOU</p>
              <p className="m-0 text-sm font-semibold sm:text-base">Finitions extérieures</p>
            </div>
            <span className="text-[0.65rem] font-bold tracking-[0.14em] text-white/65 uppercase">Agadir</span>
          </div>
        </div>
      </div>
    </section>
  );
}
