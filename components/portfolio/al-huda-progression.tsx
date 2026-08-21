import Image from "next/image";

const stages = [
  { number: "01", title: "Démarrage des travaux", src: "/images/portfolio-2026/projects/al-huda-01.webp", alt: "Immeuble R+5 à Al-Huda au démarrage du chantier" },
  { number: "02", title: "Avancement gros œuvre", src: "/images/portfolio-2026/projects/al-huda-02.webp", alt: "Avancement du gros œuvre de l’immeuble R+5 à Al-Huda" },
  { number: "03", title: "État final / façade", src: "/images/portfolio-2026/projects/al-huda-03.webp", alt: "Façade finale de l’immeuble R+5 à Al-Huda" },
];

export function AlHudaProgression() {
  return (
    <section className="bg-[#f0f3f5] px-[18px] py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-10 flex flex-col justify-between gap-5 border-b border-[#cfd8df] pb-6 sm:flex-row sm:items-end">
          <h2 className="max-w-2xl text-[clamp(2.3rem,4vw,4.2rem)] leading-[0.98] font-semibold tracking-[-0.055em] text-ink">Une progression lisible, étape par étape.</h2>
          <p className="text-sm text-muted">Al-Huda · Agadir</p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {stages.map((stage) => (
            <figure key={stage.number} className="group">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[18px] bg-[#dce4e9]">
                <Image src={stage.src} alt={stage.alt} fill sizes="(max-width: 767px) 100vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
              </div>
              <figcaption className="mt-5 grid grid-cols-[auto_1fr] gap-5 border-t border-[#cfd8df] pt-4">
                <span className="text-xs font-bold tracking-[0.16em] text-[#a88232]">{stage.number}</span>
                <h3 className="m-0 text-xl leading-tight font-semibold tracking-[-0.03em] text-ink">{stage.title}</h3>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
