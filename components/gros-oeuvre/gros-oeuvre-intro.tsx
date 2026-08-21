import Image from "next/image";

export function GrosOeuvreIntro() {
  return (
    <section className="bg-white py-20 sm:py-28 lg:py-36" aria-labelledby="gros-oeuvre-intro-title">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-[18px] sm:px-6 lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:gap-20 lg:px-8">
        <div>
          <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Le gros œuvre</p>
          <h2 id="gros-oeuvre-intro-title" className="mb-8! max-w-[720px] text-[clamp(2.7rem,5.5vw,5.5rem)] leading-[0.94] tracking-[-0.065em]">
            La structure au cœur du projet.
          </h2>
          <p className="max-w-[680px] text-lg leading-8 text-muted sm:text-xl sm:leading-9">
            Le gros œuvre est la base de toute construction solide et durable. Notre entreprise de construction est spécialisée dans la réalisation de travaux de gros œuvre pour tous types de projets : maisons individuelles, immeubles résidentiels, bâtiments industriels et locaux commerciaux.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-brand-border pt-6 text-sm font-semibold text-brand-dark sm:grid-cols-4">
            <span>Fondations</span>
            <span>Structure</span>
            <span>Maçonnerie</span>
            <span>Suivi</span>
          </div>
        </div>

        <figure className="relative m-0 min-h-[460px] overflow-hidden rounded-[22px] bg-brand-soft sm:min-h-[620px]">
          <Image
            src="/images/portfolio-2026/projects/villa-founty-construction.webp"
            alt="Structure d’une villa en construction à Founty"
            fill
            sizes="(max-width: 1023px) calc(100vw - 36px), 42vw"
            className="object-cover"
          />
          <div className="absolute top-5 right-5 border border-white/50 bg-[#0a1c31]/85 px-4 py-3 text-[0.65rem] font-bold tracking-[0.17em] text-white uppercase backdrop-blur-sm">
            Structure réelle
          </div>
        </figure>
      </div>
    </section>
  );
}
