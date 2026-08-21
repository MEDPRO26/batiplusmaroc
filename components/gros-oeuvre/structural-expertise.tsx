import Image from "next/image";

const expertise = [
  ["01", "Fondations", "Préparation des bases structurelles du projet."],
  ["02", "Structure béton armé", "Réalisation de la structure porteuse en béton armé."],
  ["03", "Maçonnerie", "Mise en œuvre des éléments de maçonnerie du bâtiment."],
  ["04", "Planchers", "Réalisation des planchers prévus au projet."],
  ["05", "Escaliers & éléments structurels", "Exécution des escaliers, acrotères et éléments structurels."],
  ["06", "Suivi des travaux selon plans", "Suivi de l’exécution selon les plans du projet."],
] as const;

export function StructuralExpertise() {
  return (
    <section className="overflow-hidden bg-[#eaf1f5] py-20 sm:py-28 lg:py-36" aria-labelledby="structural-expertise-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="mb-12 grid gap-6 lg:mb-18 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <p className="text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Expertise structurelle</p>
          <h2 id="structural-expertise-title" className="mb-0! max-w-[880px] text-[clamp(2.7rem,5.6vw,5.6rem)] leading-[0.94] tracking-[-0.065em]">
            De la fondation à la structure.
          </h2>
        </div>

        <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="relative min-h-[520px] overflow-hidden rounded-[22px] bg-brand-dark sm:min-h-[700px] lg:h-[760px]">
              <Image
                src="/images/portfolio-2026/projects/al-huda-01.webp"
                alt="Structure béton d’un immeuble R+5 à Al-Huda en cours d’exécution"
                fill
                sizes="(max-width: 1023px) calc(100vw - 36px), 42vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-linear-to-t from-[#071524]/80 via-transparent to-transparent" aria-hidden="true" />
              <p className="absolute bottom-6 left-6 max-w-xs text-sm leading-6 font-semibold text-white sm:bottom-8 sm:left-8">
                Construction & gros œuvre — exécution réelle sur chantier.
              </p>
            </div>
          </div>

          <ol className="m-0 list-none border-t border-[#c8d5dd] p-0">
            {expertise.map(([number, title, description]) => (
              <li key={number} className="grid gap-4 border-b border-[#c8d5dd] py-7 sm:grid-cols-[58px_1fr] sm:gap-6 sm:py-9">
                <span className="text-[0.68rem] font-bold tracking-[0.16em] text-[#b28720]">{number}</span>
                <div>
                  <h3 className="mb-3 text-[clamp(1.45rem,3vw,2.2rem)] leading-[1.05] tracking-[-0.04em]">{title}</h3>
                  <p className="m-0 max-w-xl text-base leading-7 text-muted">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
