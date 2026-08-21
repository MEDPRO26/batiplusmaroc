import Image from "next/image";

const gallery = [
  {
    label: "Aménagement intérieur",
    image: "/images/portfolio-2026/interiors/amenagement-interieur-03.webp",
    alt: "Aménagement intérieur réalisé par S2MBOU",
    className: "md:col-span-7 md:row-span-2",
  },
  {
    label: "Revêtements décoratifs",
    image: "/images/portfolio-2026/interiors/revetements-decoratifs-02.webp",
    alt: "Revêtement mural décoratif intérieur",
    className: "md:col-span-5",
  },
  {
    label: "Faux plafonds & éclairage",
    image: "/images/portfolio-2026/interiors/faux-plafonds-eclairage-02.webp",
    alt: "Faux plafond avec éclairage intégré",
    className: "md:col-span-5",
  },
  {
    label: "Escaliers & circulations",
    image: "/images/portfolio-2026/interiors/escaliers-circulations-03.webp",
    alt: "Escalier intérieur et finitions de circulation",
    className: "md:col-span-4",
  },
  {
    label: "Extérieur & piscine",
    image: "/images/portfolio-2026/exteriors/exterieur-piscine-01.webp",
    alt: "Aménagement extérieur avec piscine",
    className: "md:col-span-8",
  },
  {
    label: "Détails de finition",
    image: "/images/portfolio-2026/interiors/finitions-interieures-01.webp",
    alt: "Finition murale décorative intérieure",
    className: "md:col-span-12",
  },
] as const;

export function CapabilitiesGallery() {
  return (
    <section className="bg-white py-18 sm:py-24 lg:py-32" aria-labelledby="gallery-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="mb-12 grid gap-6 lg:mb-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <p className="text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Capacités & finitions</p>
          <div>
            <h2 id="gallery-title" className="mb-6! max-w-[880px] text-[clamp(2.5rem,5.5vw,5.2rem)] leading-[0.95] tracking-[-0.06em]">Un savoir-faire visible dans chaque détail.</h2>
            <p className="max-w-[660px] text-base leading-7 text-muted sm:text-lg">Décoration, finitions intérieures et extérieures : les réalisations S2MBOU traduisent une même recherche de cohérence et de précision.</p>
          </div>
        </div>

        <div className="grid auto-rows-[330px] gap-5 md:grid-cols-12 md:auto-rows-[300px]">
          {gallery.map((item) => (
            <figure key={item.label} className={`group relative m-0 overflow-hidden rounded-[22px] bg-brand-soft ${item.className}`}>
              <Image src={item.image} alt={item.alt} fill sizes="(max-width: 767px) calc(100vw - 36px), 60vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.025]" />
              <div className="absolute inset-0 bg-linear-to-t from-[#071420]/72 via-transparent to-transparent" aria-hidden="true" />
              <figcaption className="absolute right-5 bottom-5 left-5 text-[0.68rem] font-bold tracking-[0.16em] text-white uppercase sm:right-6 sm:bottom-6 sm:left-6">{item.label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
