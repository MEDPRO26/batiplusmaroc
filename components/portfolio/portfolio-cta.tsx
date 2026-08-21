import Image from "next/image";
import Link from "next/link";

import { routes } from "@/lib/routes";

export function PortfolioCta() {
  return (
    <section className="bg-white px-[18px] py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
      <div className="mx-auto grid max-w-[1280px] overflow-hidden rounded-[28px] bg-brand text-white lg:grid-cols-[1.15fr_0.85fr]">
        <div className="relative px-6 py-14 sm:px-10 sm:py-16 lg:px-16 lg:py-20">
          <div className="absolute -bottom-44 -left-32 size-80 rounded-full border border-white/10" aria-hidden="true" />
          <p className="relative text-[0.68rem] font-bold tracking-[0.2em] text-[#e7b63f] uppercase">Parlons de votre projet</p>
          <h2 className="relative mt-5 max-w-3xl text-[clamp(2.8rem,5.5vw,5.6rem)] leading-[0.92] font-semibold tracking-[-0.06em] text-white!">Vous avez un projet à concrétiser ?</h2>
          <p className="relative mt-6 max-w-2xl text-lg leading-8 text-white/75">Construction, rénovation ou aménagement : échangeons sur votre projet.</p>
          <div className="relative mt-9 flex flex-col gap-3 sm:flex-row">
            <Link className="inline-flex min-h-13 items-center justify-center gap-3 rounded-[10px] bg-white px-6 text-sm font-semibold text-black! transition hover:-translate-y-0.5 hover:bg-[#eef4f7] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href={routes.contact}>Demander un devis <span aria-hidden="true">↗</span></Link>
            <Link className="inline-flex min-h-13 items-center justify-center gap-3 rounded-[10px] border border-white/30 px-6 text-sm font-semibold text-white transition hover:border-white/70 hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href={routes.services}>Découvrir nos services <span aria-hidden="true">→</span></Link>
          </div>
        </div>
        <figure className="relative min-h-[440px] lg:min-h-full"><Image src="/images/portfolio-2026/projects/al-huda-01.webp" alt="Chantier d’un immeuble R+5 suivi par S2MBOU" fill sizes="(max-width: 1023px) 100vw, 42vw" className="object-cover" /></figure>
      </div>
    </section>
  );
}
