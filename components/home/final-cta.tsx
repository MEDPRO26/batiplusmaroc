import Image from "next/image";
import Link from "next/link";

import { routes } from "@/lib/routes";

export function FinalCta() {
  return (
    <section
      className="bg-[#f7f9fb] px-[18px] py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
      aria-labelledby="final-cta-title"
    >
      <div className="relative mx-auto grid max-w-[1280px] overflow-hidden rounded-[28px] bg-[#0c223a] shadow-[0_28px_80px_rgba(12,34,58,0.16)] lg:grid-cols-[1.08fr_0.92fr]">
        <div className="relative z-10 flex flex-col justify-center px-6 py-12 sm:px-10 sm:py-14 lg:min-h-[530px] lg:px-14 xl:px-16">
          <div
            className="pointer-events-none absolute -left-28 -top-28 size-72 rounded-full bg-[#0a639b]/25 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative">
            <div className="mb-7 flex items-center gap-3 text-[0.7rem] font-bold tracking-[0.19em] text-[#e7b63f] uppercase sm:text-xs">
              <span className="h-px w-9 bg-[#e7b63f]" aria-hidden="true" />
              Parlons de votre projet
            </div>

            <h2
              id="final-cta-title"
              className="final-cta-title max-w-[720px] text-[clamp(2.35rem,5vw,4.6rem)] leading-[0.98] font-semibold tracking-[-0.055em]"
            >
              Vous avez un projet de construction ou d’aménagement ?
            </h2>

            <p className="mt-6 max-w-[580px] text-base leading-7 text-[#c4d1dd] sm:text-lg">
              Échangeons sur vos besoins et votre projet.
            </p>

            <div className="mt-9 flex flex-col items-stretch gap-5 sm:flex-row sm:items-center sm:gap-7">
              <Link
                className="group inline-flex min-h-14 items-center justify-center gap-5 rounded-xl bg-[#e7b63f] px-6 py-4 text-sm font-bold text-[#0c223a] transition duration-200 hover:-translate-y-0.5 hover:bg-[#f0c85e] sm:w-fit"
                href={routes.contact}
              >
                Demander un devis
                <span
                  className="text-lg transition-transform duration-200 group-hover:translate-x-1 group-hover:-translate-y-1"
                  aria-hidden="true"
                >
                  ↗
                </span>
              </Link>

              <a
                className="group flex min-h-14 items-center gap-3 rounded-xl px-1 text-white sm:px-0"
                href="tel:+212766018650"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full border border-white/20 bg-white/8 text-lg text-white transition-colors group-hover:border-[#e7b63f]/70 group-hover:text-[#e7b63f]">
                  <span aria-hidden="true">↗</span>
                </span>
                <span className="grid gap-0.5">
                  <span className="text-[0.66rem] font-bold tracking-[0.16em] text-[#8da3b7] uppercase">
                    Appelez-nous
                  </span>
                  <span className="text-sm font-semibold text-white sm:text-base">
                    +212 766-018650
                  </span>
                </span>
              </a>
            </div>
          </div>
        </div>

        <div className="relative min-h-[360px] overflow-hidden lg:min-h-full">
          <Image
            className="object-cover"
            src="/images/portfolio-2026/exteriors/exterieur-piscine-02.webp"
            alt="Réalisation extérieure avec villa et piscine"
            fill
            sizes="(max-width: 1023px) 100vw, 46vw"
          />
          <div
            className="absolute inset-0 bg-linear-to-t from-[#0c223a]/55 via-transparent to-transparent lg:bg-linear-to-r lg:from-[#0c223a] lg:via-[#0c223a]/12 lg:to-transparent"
            aria-hidden="true"
          />
          <div className="absolute right-5 bottom-5 left-5 flex items-center justify-between gap-5 rounded-2xl border border-white/20 bg-[#07182a]/70 px-5 py-4 text-white backdrop-blur-md sm:right-7 sm:bottom-7 sm:left-7">
            <span className="text-sm font-semibold">S2MBOU Construction</span>
            <span className="text-[0.67rem] font-bold tracking-[0.16em] text-[#d3dfE8] uppercase">
              Agadir
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
