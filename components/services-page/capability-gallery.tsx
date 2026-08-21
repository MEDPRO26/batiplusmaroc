import Image from "next/image";

const capabilities = [
  ["Construction", "/images/portfolio-2026/projects/al-huda-01.webp", "Démarrage d’un chantier d’immeuble R+5 à Al-Huda"],
  ["Rénovation", "/images/portfolio-2026/projects/villa-founty-01.webp", "Villa à Founty en cours de construction"],
  ["Finitions", "/images/portfolio-2026/interiors/details-finition-02.webp", "Faux plafond avec lignes lumineuses intégrées"],
  ["Aménagement intérieur", "/images/portfolio-2026/interiors/amenagement-interieur-03.webp", "Pièce aménagée avec sol géométrique et mur décoratif"],
  ["Façades", "/images/portfolio-2026/exteriors/facades-travaux-exterieurs-02.webp", "Façade résidentielle réalisée par S2MBOU"],
  ["Extérieurs", "/images/portfolio-2026/exteriors/exterieur-piscine-03.webp", "Façade moderne avec circulation extérieure"],
  ["Piscines", "/images/portfolio-2026/exteriors/exterieur-piscine-01.webp", "Aménagement extérieur avec piscine"],
] as const;

export function CapabilityGallery() {
  return (
    <section className="overflow-hidden bg-white py-20 sm:py-28 lg:py-36" aria-labelledby="capability-gallery-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Capacités en images</p>
            <h2 id="capability-gallery-title" className="mb-0! max-w-[820px] text-[clamp(2.7rem,5vw,5rem)] leading-[0.95] tracking-[-0.065em]">Un savoir-faire qui traverse tout le projet.</h2>
          </div>
          <p className="m-0 text-[0.65rem] font-bold tracking-[0.16em] text-muted uppercase">Faites défiler <span className="ml-2 text-brand" aria-hidden="true">→</span></p>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1540px] snap-x snap-mandatory gap-4 overflow-x-auto px-[18px] pb-5 [scrollbar-color:#7ca7c2_transparent] [scrollbar-width:thin] sm:px-6 lg:px-8">
        {capabilities.map(([label, image, alt], index) => (
          <figure key={label} className="group relative m-0 min-h-[430px] w-[82vw] max-w-[360px] shrink-0 snap-start overflow-hidden rounded-[24px] bg-brand-soft sm:w-[42vw] lg:w-[29vw]">
            <Image src={image} alt={alt} fill sizes="(max-width: 639px) 82vw, (max-width: 1023px) 42vw, 29vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
            <div className="absolute inset-0 bg-linear-to-t from-[#071524]/82 via-transparent to-transparent" aria-hidden="true" />
            <figcaption className="absolute right-6 bottom-6 left-6 flex items-end justify-between gap-4 text-white">
              <span className="text-xl font-semibold tracking-[-0.025em]">{label}</span>
              <span className="text-[0.62rem] font-bold tracking-[0.14em] text-[#e8bd50]">{String(index + 1).padStart(2, "0")}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
