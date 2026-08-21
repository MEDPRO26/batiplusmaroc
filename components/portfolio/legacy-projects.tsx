const projects = ["Amical Omolkoura", "Particulier privé", "Amical Annajah", "Villa avec sous sol", "Alhouda Doha Iamar"];

export function LegacyProjects() {
  return (
    <section className="border-y border-brand-border bg-[#f0f3f5] px-[18px] py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-[1280px]">
        <div className="grid gap-8 lg:grid-cols-[0.65fr_1.35fr]">
          <div><p className="text-[0.68rem] font-bold tracking-[0.2em] text-brand uppercase">Archives de projets</p><h2 className="mt-5 max-w-md text-[clamp(2.5rem,4vw,4rem)] leading-[0.98] font-semibold tracking-[-0.055em] text-ink">Autres réalisations</h2></div>
          <ol className="m-0 list-none border-t border-[#cbd5dc] p-0">
            {projects.map((project, index) => <li key={project} className="grid grid-cols-[42px_1fr] items-center gap-4 border-b border-[#cbd5dc] py-5 sm:grid-cols-[70px_1fr]"><span className="text-xs font-bold tracking-[0.16em] text-[#a88232]">{String(index + 1).padStart(2, "0")}</span><p className="m-0 text-[clamp(1.25rem,2.2vw,2rem)] font-semibold tracking-[-0.035em] text-ink">{project}</p></li>)}
          </ol>
        </div>
      </div>
    </section>
  );
}
