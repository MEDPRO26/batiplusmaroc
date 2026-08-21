const legacyProjects = [
  "Amical Omolkoura",
  "Particulier privé",
  "Amical Annajah",
  "Villa avec sous sol",
  "Alhouda Doha Iamar",
] as const;

export function LegacyProjects() {
  return (
    <section className="bg-[#f3f6f7] py-20 sm:py-28 lg:py-36" aria-labelledby="legacy-projects-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.62fr_1.38fr] lg:gap-20">
          <div>
            <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Autres réalisations</p>
            <h2 id="legacy-projects-title" className="mb-6! max-w-lg text-[clamp(2.7rem,5vw,4.8rem)] leading-[0.95] tracking-[-0.06em]">
              Des références déjà présentées par S2MBOU.
            </h2>
            <p className="m-0 max-w-md leading-7 text-muted">
              Sélection de projets issue du portfolio existant de l’entreprise.
            </p>
          </div>

          <ul className="m-0 list-none border-t border-brand-border p-0">
            {legacyProjects.map((project, index) => (
              <li key={project} className="grid grid-cols-[42px_1fr] items-center gap-4 border-b border-brand-border py-6 sm:grid-cols-[70px_1fr] sm:py-7">
                <span className="text-[0.68rem] font-bold tracking-[0.16em] text-[#a77d18]">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-[clamp(1.35rem,3.2vw,2.6rem)] leading-tight font-semibold tracking-[-0.045em] text-ink">{project}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
