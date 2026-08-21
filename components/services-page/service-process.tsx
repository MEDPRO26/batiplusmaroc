const stages = [
  ["01", "Étude du projet", "Lecture du besoin et définition du périmètre des travaux."],
  ["02", "Organisation & préparation", "Préparation des interventions, des étapes et des moyens nécessaires."],
  ["03", "Réalisation des travaux", "Exécution coordonnée des travaux prévus pour le projet."],
  ["04", "Suivi & finitions", "Suivi des étapes, contrôle de l’exécution et finalisation des ouvrages."],
] as const;

export function ServiceProcess() {
  return (
    <section className="relative overflow-hidden bg-[#08192a] py-20 text-white sm:py-28 lg:py-36" aria-labelledby="service-process-title">
      <div className="pointer-events-none absolute -right-48 -top-48 size-[520px] rounded-full border border-white/6" aria-hidden="true" />
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <p className="text-[0.7rem] font-bold tracking-[0.2em] text-[#81c6ed] uppercase">Notre accompagnement</p>
          <h2 id="service-process-title" className="mb-0! max-w-[900px] text-[clamp(2.7rem,5.5vw,5.4rem)] leading-[0.94] tracking-[-0.065em] text-white!">Une vision globale, de l’étude à la finition.</h2>
        </div>

        <ol className="mt-14 grid list-none border-t border-white/16 p-0 sm:grid-cols-2 lg:mt-20 lg:grid-cols-4">
          {stages.map(([number, title, description]) => (
            <li key={number} className="relative border-b border-white/12 px-0 py-8 sm:px-6 sm:first:pl-0 lg:min-h-[310px] lg:border-r lg:border-b-0 lg:last:border-r-0 lg:last:pr-0">
              <span className="text-[0.68rem] font-bold tracking-[0.16em] text-[#e8bd50]">{number}</span>
              <h3 className="mt-18 mb-4 text-2xl leading-tight tracking-[-0.04em] text-white!">{title}</h3>
              <p className="m-0 max-w-[260px] text-sm leading-7 text-white/58">{description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
