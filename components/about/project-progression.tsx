import Image from "next/image";

const stages = [
  {
    number: "01",
    title: "Démarrage des travaux",
    image: "/images/portfolio-2026/projects/al-huda-01.webp",
    alt: "Immeuble R+5 à Al-Huda au démarrage des travaux",
  },
  {
    number: "02",
    title: "Avancement gros œuvre",
    image: "/images/portfolio-2026/projects/al-huda-02.webp",
    alt: "Immeuble R+5 à Al-Huda pendant le gros œuvre",
  },
  {
    number: "03",
    title: "État final / façade",
    image: "/images/portfolio-2026/projects/al-huda-03.webp",
    alt: "Façade finale d’un immeuble R+5 à Agadir",
  },
] as const;

export function ProjectProgression() {
  return (
    <section className="relative overflow-hidden bg-[#0a1c31] py-18 text-white sm:py-24 lg:py-32" aria-labelledby="progression-title">
      <div className="pointer-events-none absolute top-0 right-0 h-full w-[42%] bg-linear-to-l from-[#0b5684]/20 to-transparent" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="mb-12 grid gap-7 lg:mb-16 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-[#75bfe8] uppercase">Une expertise sur le terrain</p>
            <h2 id="progression-title" className="mb-0! max-w-[760px] text-[clamp(2.6rem,5.7vw,5.5rem)] leading-[0.95] tracking-[-0.06em] text-white!">
              Du chantier à la réalisation finale.
            </h2>
          </div>
          <div className="border-l border-white/18 pl-6 text-sm leading-7 text-[#a8bac9] sm:text-base">
            <p className="font-semibold text-white">Immeuble R+5</p>
            <p>Quartier Al-Huda, Agadir</p>
            <p>Suivi des phases de construction et gros œuvre</p>
          </div>
        </div>

        <ol className="grid list-none gap-8 p-0 md:grid-cols-3 md:gap-4 lg:gap-6">
          {stages.map((stage, index) => (
            <li key={stage.number} className="relative">
              <div className="relative mb-5 aspect-[4/5] overflow-hidden rounded-[22px] bg-[#17314e]">
                <Image src={stage.image} alt={stage.alt} fill sizes="(max-width: 767px) calc(100vw - 36px), 33vw" className="object-cover" />
                <span className="absolute top-4 left-4 grid size-11 place-items-center rounded-full bg-white text-[0.68rem] font-bold tracking-[0.1em] text-brand-dark shadow-lg">{stage.number}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <h3 className="m-0! text-lg tracking-[-0.025em] text-white! sm:text-xl">{stage.title}</h3>
                {index < stages.length - 1 ? <span className="hidden text-xl text-[#e7b63f] md:block" aria-hidden="true">→</span> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
