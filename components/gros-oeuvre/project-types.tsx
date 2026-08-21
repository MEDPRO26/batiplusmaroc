const projectTypes = [
  ["01", "Maisons individuelles"],
  ["02", "Immeubles résidentiels"],
  ["03", "Bâtiments industriels"],
  ["04", "Locaux commerciaux"],
] as const;

export function ProjectTypes() {
  return (
    <section className="bg-[#173d63] py-20 text-white sm:py-28 lg:py-36" aria-labelledby="project-types-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="mb-12 grid gap-6 lg:mb-16 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <p className="text-[0.7rem] font-bold tracking-[0.2em] text-[#e5b84b] uppercase">Types de projets</p>
          <h2 id="project-types-title" className="mb-0! max-w-[900px] text-[clamp(2.7rem,5.6vw,5.6rem)] leading-[0.94] tracking-[-0.065em] text-white!">
            Des structures adaptées à différents projets.
          </h2>
        </div>

        <ol className="m-0 grid list-none border-t border-white/18 p-0 md:grid-cols-2">
          {projectTypes.map(([number, title], index) => (
            <li key={number} className={`group flex min-h-36 items-end justify-between gap-7 border-b border-white/18 py-7 md:min-h-48 md:p-8 ${index % 2 === 0 ? "md:border-r" : "md:pl-10"}`}>
              <h3 className="m-0! max-w-md text-[clamp(1.55rem,3.6vw,3rem)] leading-[1.02] tracking-[-0.05em] text-white!">{title}</h3>
              <span className="self-start text-[0.68rem] font-bold tracking-[0.16em] text-[#e5b84b]">{number}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
