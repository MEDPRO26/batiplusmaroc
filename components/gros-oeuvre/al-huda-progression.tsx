import Image from "next/image";

const stages = [
  { number: "01", title: "Démarrage des travaux", image: "/images/portfolio-2026/projects/al-huda-01.webp", alt: "Immeuble R+5 à Al-Huda au démarrage du chantier" },
  { number: "02", title: "Avancement gros œuvre", image: "/images/portfolio-2026/projects/al-huda-02.webp", alt: "Avancement du gros œuvre d’un immeuble R+5 à Agadir" },
  { number: "03", title: "État final / façade", image: "/images/portfolio-2026/projects/al-huda-03.webp", alt: "Façade finale de l’immeuble R+5 à Al-Huda" },
] as const;

export function AlHudaProgression() {
  return (
    <section className="relative overflow-hidden bg-[#091a2e] py-20 text-white sm:py-28 lg:py-36" aria-labelledby="al-huda-title">
      <div className="pointer-events-none absolute -top-52 right-[-10%] h-[560px] w-[560px] rounded-full border border-white/8" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1400px] px-[18px] sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 grid max-w-[1280px] gap-7 lg:mb-18 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-[#e6b94c] uppercase">Projet référence</p>
            <h2 id="al-huda-title" className="mb-0! max-w-[860px] text-[clamp(2.7rem,5.7vw,5.7rem)] leading-[0.94] tracking-[-0.065em] text-white!">
              Immeuble R+5 — Al-Huda, Agadir
            </h2>
          </div>
          <p className="m-0 border-l border-white/18 pl-6 text-base leading-8 text-[#a9bac8]">
            Suivi des phases de construction et gros œuvre.
          </p>
        </div>

        <ol className="relative grid list-none gap-10 p-0 md:grid-cols-3 md:gap-5 lg:gap-7">
          <div className="pointer-events-none absolute top-6 right-[16.5%] left-[16.5%] hidden h-px bg-white/15 md:block" aria-hidden="true" />
          {stages.map((stage) => (
            <li key={stage.number} className="relative">
              <div className="mb-5 flex items-center gap-4">
                <span className="relative z-10 grid size-12 shrink-0 place-items-center rounded-full border border-[#e6b94c]/65 bg-[#091a2e] text-[0.67rem] font-bold tracking-[0.12em] text-[#e6b94c]">{stage.number}</span>
                <span className="h-px flex-1 bg-white/12 md:hidden" aria-hidden="true" />
              </div>
              <figure className="m-0">
                <div className="relative aspect-[4/5] overflow-hidden rounded-[18px] bg-[#17314e]">
                  <Image src={stage.image} alt={stage.alt} fill sizes="(max-width: 767px) calc(100vw - 36px), 33vw" className="object-cover" />
                </div>
                <figcaption>
                  <h3 className="mt-5 mb-0! text-xl leading-7 tracking-[-0.03em] text-white! sm:text-2xl">{stage.title}</h3>
                </figcaption>
              </figure>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
