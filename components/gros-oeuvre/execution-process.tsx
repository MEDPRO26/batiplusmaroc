import Image from "next/image";

const stages = [
  ["01", "Lecture et préparation du projet", "Prise en compte du projet et des plans avant l’exécution."],
  ["02", "Organisation du chantier", "Coordination des interventions et préparation des étapes de travail."],
  ["03", "Exécution du gros œuvre", "Réalisation des éléments structurels prévus au projet."],
  ["04", "Contrôle et suivi des étapes", "Suivi de chantier, qualité d’exécution et respect des engagements."],
] as const;

export function ExecutionProcess() {
  return (
    <section className="bg-white py-20 sm:py-28 lg:py-36" aria-labelledby="execution-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="mb-12 grid gap-8 lg:mb-18 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Approche chantier</p>
            <h2 id="execution-title" className="mb-0! max-w-[870px] text-[clamp(2.7rem,5.5vw,5.5rem)] leading-[0.94] tracking-[-0.065em]">
              Un suivi rigoureux à chaque étape du chantier.
            </h2>
          </div>
          <p className="m-0 border-l border-brand-border pl-6 text-base leading-8 text-muted">
            Une organisation claire, une coordination des travaux et un suivi de l’exécution selon les plans du projet.
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
          <div className="relative min-h-[440px] overflow-hidden rounded-[22px] bg-brand-soft sm:min-h-[620px]">
            <Image src="/images/portfolio-2026/projects/villa-founty-01.webp" alt="Chantier d’une villa à Founty suivi par S2MBOU" fill sizes="(max-width: 1023px) calc(100vw - 36px), 38vw" className="object-cover" />
            <div className="absolute inset-0 bg-linear-to-t from-[#081727]/55 via-transparent to-transparent" aria-hidden="true" />
          </div>

          <ol className="m-0 list-none border-t border-brand-border p-0">
            {stages.map(([number, title, description]) => (
              <li key={number} className="grid gap-4 border-b border-brand-border py-7 sm:grid-cols-[62px_1fr] sm:gap-7 sm:py-8">
                <span className="text-[0.68rem] font-bold tracking-[0.16em] text-[#a77d18]">{number}</span>
                <div>
                  <h3 className="mb-2 text-xl leading-tight tracking-[-0.035em] sm:text-2xl">{title}</h3>
                  <p className="m-0 max-w-xl leading-7 text-muted">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
