import Image from "next/image";

const ceilingImages = [
  ["/images/portfolio-2026/interiors/faux-plafonds-eclairage-01.webp", "Faux plafond de salon avec éclairage indirect", "Faux plafonds"],
  ["/images/portfolio-2026/interiors/faux-plafonds-eclairage-02.webp", "Plafond courbe avec éclairage et lustre", "Éclairage intégré"],
  ["/images/portfolio-2026/interiors/faux-plafonds-eclairage-03.webp", "Plafond géométrique éclairé dans une circulation", "Lignes lumineuses"],
] as const;

export function CeilingsLighting() {
  return (
    <section className="overflow-hidden bg-[#0b2036] py-20 text-white sm:py-28 lg:py-36" aria-labelledby="ceilings-lighting-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="mb-12 grid gap-7 lg:mb-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-[#7ec6ef] uppercase">Plafonds, lumière & détails</p>
            <h2 id="ceilings-lighting-title" className="mb-0! max-w-[820px] text-[clamp(2.7rem,5.5vw,5.5rem)] leading-[0.94] tracking-[-0.065em] text-white!">Travailler les volumes par la lumière.</h2>
          </div>
          <p className="m-0 max-w-xl text-base leading-7 text-[#b8c8d6] sm:text-lg sm:leading-8 lg:justify-self-end">Faux plafonds, éclairage intégré et revêtements décoratifs structurent les perspectives et révèlent les matières.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {ceilingImages.map(([src, alt, label], index) => (
            <figure key={src} className={`relative m-0 min-h-[500px] overflow-hidden rounded-[22px] bg-[#17314d] ${index === 1 ? "md:mt-16" : ""}`}>
              <Image src={src} alt={alt} fill sizes="(max-width: 767px) calc(100vw - 36px), 33vw" className="object-cover" />
              <div className="absolute inset-0 bg-linear-to-t from-[#071524]/82 via-transparent to-transparent" aria-hidden="true" />
              <figcaption className="absolute inset-x-0 bottom-0 p-6 text-sm font-semibold text-white">{label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
