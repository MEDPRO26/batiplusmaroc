import Image from "next/image";
import Link from "next/link";

import { routes } from "@/lib/routes";

export function ServicesCta() {
  return (
    <section className="bg-white px-[18px] py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-28" aria-labelledby="services-cta-title">
      <div className="relative mx-auto grid max-w-[1280px] overflow-hidden rounded-[28px] bg-brand text-white shadow-[0_28px_80px_rgb(8_35_58_/_0.16)] lg:grid-cols-[1.15fr_0.85fr]">
        <div className="relative flex flex-col justify-center px-6 py-12 sm:px-10 sm:py-16 lg:min-h-[560px] lg:px-16 lg:py-20 xl:px-20">
          <div className="pointer-events-none absolute -bottom-44 -left-40 size-[390px] rounded-full border border-white/8" aria-hidden="true" />
          <div className="relative">
            <div className="mb-8 flex items-center gap-4"><span className="h-px w-10 bg-[#e7b63f]" aria-hidden="true" /><p className="m-0 text-[0.68rem] font-bold tracking-[0.2em] text-[#b8ddf1] uppercase">Parlons de votre projet</p></div>
            <h2 id="services-cta-title" className="mb-7! max-w-[770px] text-[clamp(2.5rem,5vw,4.8rem)] leading-[0.96] tracking-[-0.06em] text-white!">Quel que soit votre projet, parlons de vos besoins.</h2>
            <p className="max-w-[610px] text-base leading-7 text-white/72 sm:text-lg sm:leading-8">Construction, rénovation, aménagement ou finitions&nbsp;: échangeons sur votre projet.</p>
            <Link className="group mt-10 inline-flex min-h-14 w-fit items-center justify-center gap-5 rounded-[12px] bg-white px-7 py-4 font-semibold text-[#0a3152]! shadow-[0_16px_40px_rgb(2_18_32_/_0.22)] transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-[#f5f8fa]" href={routes.contact}>Demander un devis <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">↗</span></Link>
          </div>
        </div>
        <figure className="relative order-first m-0 min-h-[310px] overflow-hidden lg:order-last lg:min-h-full">
          <Image src="/images/portfolio-2026/projects/villa-founty-03.webp" alt="Projet résidentiel achevé par S2MBOU à Agadir" fill sizes="(max-width: 1023px) calc(100vw - 36px), 40vw" className="object-cover" />
          <div className="absolute inset-0 bg-linear-to-t from-[#06385e]/60 via-transparent to-transparent lg:bg-linear-to-r lg:from-brand/35 lg:via-transparent lg:to-transparent" aria-hidden="true" />
        </figure>
      </div>
    </section>
  );
}
