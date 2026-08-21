import Image from "next/image";
import Link from "next/link";
import { routes } from "@/lib/routes";

const buttonFocus = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand";

export function Hero() {
  return (
    <section className="home-hero relative mx-3.5 mt-3.5 mb-7 grid min-h-[710px]d max-w-[2000px] place-items-center overflow-hidden rounded-3xl bg-dark-section md:mx-6 md:mt-6 md:min-h-[740px]j md:rounded-[30px] lg:mx-8 lg:mt-7 lg:min-h-[960px] lg:rounded-[36px] 2xl:mx-auto py-10">
      <Image className="z-0 object-cover object-[56%_center]" src="/images/service-construction.png" alt="Chantier S2MBOU avec engins de construction" fill priority sizes="(max-width: 767px) calc(100vw - 28px), (max-width: 1800px) calc(100vw - 64px), 1700px" />
      <div className="absolute inset-0 z-1 bg-[linear-gradient(90deg,rgba(10,20,30,0.60),rgba(10,35,60,0.42))]" aria-hidden="true" />
      <div className="relative z-2 mx-auto mt-[74px] w-[calc(100%-40px)] max-w-[1180px] text-center md:mt-[82px] md:w-[calc(100%-72px)]">
        <p className="mb-5 text-xs leading-[1.4] font-bold tracking-[0.16em] text-[#81c6ed] uppercase">S2MBOU — ENTREPRISE BTP À AGADIR</p>
        <h1 className="mx-auto max-w-[1180px] text-[clamp(2.25rem,6vw,5.25rem)] leading-[0.98] font-bold tracking-[-0.045em] text-white! text-shadow-[0_2px_22px_rgb(0_0_0_/_0.18)] sm:text-[clamp(2.75rem,6vw,5.25rem)]">Aménagement Agadir : Intérieur &amp; extérieur sur mesure</h1>
        <p className="mx-auto mt-6.5 max-w-[760px] text-[clamp(1rem,2.4vw,1.125rem)] leading-[1.65] text-white/85!">S2MBOU accompagne les particuliers et les professionnels dans leurs projets de construction et d’aménagement, de la planification à la réalisation.</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5 max-[420px]:items-stretch">
          <Link className={`inline-flex min-h-13 items-center justify-center gap-3.5 rounded-[11px] bg-brand px-6.5 text-[0.92rem] font-semibold text-white! transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-brand-hover max-[420px]:w-full ${buttonFocus}`} href={routes.contact}>Demander un devis <span aria-hidden="true">↗</span></Link>
          <Link className={`inline-flex min-h-13 items-center justify-center gap-3.5 rounded-[11px] border border-white/50 bg-[#121e2b]/20 px-6.5 text-[0.92rem] font-semibold text-white! backdrop-blur-[7px] transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-white/15 max-[420px]:w-full ${buttonFocus}`} href={routes.projects}>Voir nos réalisations <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </section>
  );
}
