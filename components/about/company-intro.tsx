import Image from "next/image";

const commitments = ["Qualité d’exécution", "Suivi de chantier", "Respect des engagements"];

export function CompanyIntro() {
  return (
    <section className="bg-white py-18 sm:py-24 lg:py-32" aria-labelledby="company-intro-title">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-[18px] sm:px-6 lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:gap-[8vw] lg:px-8">
        <div className="relative min-h-[450px] overflow-hidden rounded-[24px] bg-brand-soft sm:min-h-[620px]">
          <Image
            src="/images/portfolio-2026/projects/immeuble-r5-al-huda-gros-oeuvre.webp"
            alt="Immeuble R+5 à Al-Huda pendant le gros œuvre"
            fill
            sizes="(max-width: 1023px) calc(100vw - 36px), 48vw"
            className="object-cover"
          />
          <div className="absolute top-5 left-5 rounded-full bg-white/94 px-4 py-2 text-[0.65rem] font-bold tracking-[0.14em] text-brand uppercase shadow-sm backdrop-blur-sm sm:top-7 sm:left-7">
            Bâtir avec méthode
          </div>
        </div>

        <div>
          <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Qui sommes-nous ?</p>
          <h2 id="company-intro-title" className="mb-7! text-[clamp(2.35rem,5vw,4.7rem)] leading-[0.98] tracking-[-0.055em]">
            Une entreprise de bâtiment engagée sur chaque étape.
          </h2>
          <div className="grid gap-5 text-base leading-7 text-muted sm:text-lg sm:leading-8">
            <p>
              S2MBOU est une entreprise marocaine spécialisée dans le Bâtiment et Travaux Publics (BTP), la construction et l’aménagement d’espaces résidentiels, commerciaux et industriels.
            </p>
            <p>
              De l’étude à la réalisation, l’entreprise intervient sur des villas, des maisons d’habitation R+2 ou R+3 et des immeubles de plusieurs niveaux, avec une attention constante portée au gros œuvre, à la rénovation et aux finitions intérieures et extérieures.
            </p>
          </div>
          <ul className="mt-9 grid list-none gap-0 p-0">
            {commitments.map((commitment, index) => (
              <li key={commitment} className="flex items-center gap-5 border-t border-brand-border py-4 font-semibold text-ink">
                <span className="text-[0.68rem] font-bold tracking-[0.15em] text-brand">0{index + 1}</span>
                {commitment}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
