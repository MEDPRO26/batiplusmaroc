const projects = ["Amical Omolkoura", "Particulier privé", "Amical Annajah", "Villa avec sous sol", "Alhouda Doha Iamar"] as const;

export function LegacyProjects() {
  return (
    <section className="bg-white py-18 sm:py-24" aria-labelledby="legacy-finishing-projects-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
          <div>
            <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Références historiques</p>
            <h2 id="legacy-finishing-projects-title" className="mb-0! max-w-lg text-[clamp(2.4rem,4.5vw,4.3rem)] leading-[0.96] tracking-[-0.06em]">Projets présentés sur le site historique.</h2>
          </div>
          <ol className="m-0 list-none border-t border-brand-border p-0">
            {projects.map((project, index) => (
              <li key={project} className="grid grid-cols-[42px_1fr] gap-4 border-b border-brand-border py-5 sm:grid-cols-[64px_1fr] sm:py-6">
                <span className="text-[0.66rem] font-bold tracking-[0.15em] text-[#a87e16]">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">{project}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
