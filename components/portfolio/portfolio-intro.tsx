import Image from "next/image";

export function PortfolioIntro() {
  return (
    <section className="bg-white px-[18px] py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto grid max-w-[1280px] gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
        <div>
          <p className="mb-5 text-[0.68rem] font-bold tracking-[0.2em] text-brand uppercase">Notre savoir-faire</p>
          <h2 className="max-w-xl text-[clamp(2.7rem,5.5vw,5.5rem)] leading-[0.95] font-semibold tracking-[-0.06em] text-ink">S2MBOU, un gage de qualité</h2>
        </div>
        <div className="grid gap-8 sm:grid-cols-[1fr_0.72fr] sm:items-end">
          <div className="border-t border-brand-border pt-7">
            <p className="text-lg leading-8 text-muted">L’expérience de S2MBOU dans le monde de travaux BTP est un atout indéniable dans vos projets de construction et de rénovation.</p>
            <p className="mt-6 text-base leading-7 text-muted">Cette sélection présente le chantier dans ses différentes étapes : structure, progression, état final, aménagements et finitions.</p>
          </div>
          <figure className="relative aspect-[4/5] overflow-hidden rounded-[18px] bg-brand-soft">
            <Image src="/images/portfolio-2026/interiors/details-finition-03.webp" alt="Détail de finition intérieure réalisé par S2MBOU" fill sizes="(max-width: 639px) 100vw, 30vw" className="object-cover" />
          </figure>
        </div>
      </div>
    </section>
  );
}
