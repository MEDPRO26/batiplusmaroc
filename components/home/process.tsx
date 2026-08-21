const steps = [
  {
    title: "Étude",
    text: "Analyse du besoin, visite et définition du projet.",
  },
  {
    title: "Planification",
    text: "Solutions techniques, matériaux, organisation et calendrier.",
  },
  {
    title: "Réalisation",
    text: "Coordination des travaux et suivi du chantier.",
  },
  {
    title: "Livraison",
    text: "Contrôle, finitions et remise du projet.",
  },
] as const;

export function Process() {
  return (
    <section
      className="process-section relative overflow-hidden bg-[#0b1929] px-[18px] py-20 text-white sm:px-6 sm:py-24 lg:px-8 lg:py-32"
      aria-labelledby="process-title"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.045]"
        aria-hidden="true"
      >
        <div className="mx-auto grid h-full max-w-[1280px] grid-cols-4 border-x border-white">
          <span className="border-r border-white" />
          <span className="border-r border-white" />
          <span className="border-r border-white" />
          <span />
        </div>
      </div>
      <div
        className="pointer-events-none absolute -top-44 right-[8%] size-[520px] rounded-full bg-[#075d91]/18 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-[1280px]">
        <div className="grid items-end gap-9 border-b border-white/10 pb-10 md:grid-cols-[1fr_auto] md:pb-14">
          <div className="max-w-[820px]">
            <div className="mb-6 flex items-center gap-3 text-[0.7rem] font-bold tracking-[0.2em] text-[#80c9ee] uppercase sm:text-xs">
              <span className="h-px w-9 bg-[#80c9ee]" aria-hidden="true" />
              Notre méthode
            </div>
            <h2
              id="process-title"
              className="process-title max-w-[820px] text-[clamp(2.5rem,6vw,5rem)] leading-[0.98] font-semibold tracking-[-0.055em]"
            >
              Un accompagnement clair, de l’idée à la réalisation.
            </h2>
          </div>

          <div className="flex items-center gap-4 md:pb-2">
            <span className="text-[2.7rem] leading-none font-light tracking-[-0.06em] text-[#e7b63f]">
              04
            </span>
            <span className="max-w-20 text-[0.65rem] leading-4 font-bold tracking-[0.16em] text-[#8295a7] uppercase">
              étapes du projet
            </span>
          </div>
        </div>

        <div className="relative">
          <span
            className="absolute top-[4.25rem] right-[12.5%] left-[12.5%] hidden h-px bg-linear-to-r from-[#80c9ee]/70 via-white/20 to-[#e7b63f]/70 lg:block"
            aria-hidden="true"
          />

          <ol className="m-0 grid list-none gap-4 pt-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:pt-14">
            {steps.map((step, index) => (
              <li
                className="group relative flex min-h-[300px] flex-col overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.045] p-6 transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07] md:p-8 lg:min-h-[350px] lg:rounded-none lg:border-y lg:border-r-0 lg:border-l lg:first:rounded-l-[22px] lg:last:rounded-r-[22px] lg:last:border-r"
                key={step.title}
              >
              <div className="relative z-10 flex items-center justify-between">
                <span className="text-xs font-bold tracking-[0.16em] text-[#80c9ee]">
                  0{index + 1}
                </span>
                <span
                  className="grid size-9 place-items-center rounded-full border border-white/10 bg-[#0b1929] transition-colors duration-300 group-hover:border-[#e7b63f]/60"
                  aria-hidden="true"
                >
                  <span className="size-1.5 rounded-full bg-[#e7b63f]" />
                </span>
              </div>

              <span
                className="pointer-events-none absolute -right-2 top-12 text-[8rem] leading-none font-semibold tracking-[-0.09em] text-white/[0.035] transition-colors duration-300 group-hover:text-white/[0.055]"
                aria-hidden="true"
              >
                0{index + 1}
              </span>

              <div className="relative z-10 mt-auto pt-20">
                <div
                  className="mb-5 h-px w-10 bg-[#e7b63f] transition-all duration-300 group-hover:w-16"
                  aria-hidden="true"
                />
                <h3 className="process-card-title m-0 text-[1.45rem] font-semibold tracking-[-0.035em]">
                  {step.title}
                </h3>
                <p className="mt-3 mb-0 max-w-[255px] text-[0.95rem] leading-6 text-[#aab8c5]">
                  {step.text}
                </p>
              </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
