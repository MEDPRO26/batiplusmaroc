import Image from "next/image";

const interiors = [
  { title: "Aménagement intérieur", src: "/images/portfolio-2026/interiors/amenagement-interieur.webp", alt: "Aménagement intérieur avec mobilier intégré et éclairage" , className: "md:col-span-2 md:row-span-2" },
  { title: "Finitions intérieures", src: "/images/portfolio-2026/interiors/finitions-interieures-01.webp", alt: "Finition intérieure avec revêtement décoratif mural", className: "" },
  { title: "Détails de finition", src: "/images/portfolio-2026/interiors/details-finition-03.webp", alt: "Détail de finition décorative autour d’une cheminée intérieure", className: "" },
  { title: "Revêtements décoratifs", src: "/images/portfolio-2026/interiors/revetements-decoratifs-02.webp", alt: "Revêtement décoratif appliqué sur un mur intérieur", className: "" },
  { title: "Faux plafonds & éclairage", src: "/images/portfolio-2026/interiors/faux-plafonds-eclairage-02.webp", alt: "Faux plafond avec éclairage intégré dans un espace intérieur", className: "" },
  { title: "Escaliers & circulations", src: "/images/portfolio-2026/interiors/escaliers-circulations-01.webp", alt: "Travaux de finition autour d’un escalier et d’une circulation intérieure", className: "md:col-span-2" },
];

export function InteriorPortfolio() {
  return (
    <section className="bg-[#111c2b] px-[18px] py-20 text-white sm:px-6 sm:py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-12 grid gap-7 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
          <p className="text-[0.68rem] font-bold tracking-[0.2em] text-[#e7b63f] uppercase">Finitions & aménagement</p>
          <div><h2 className="max-w-4xl text-[clamp(2.8rem,5.6vw,5.8rem)] leading-[0.92] font-semibold tracking-[-0.06em] text-white!">Le savoir-faire jusque dans les détails.</h2><p className="mt-6 max-w-2xl text-lg leading-8 text-[#aab9c6]">Des espaces intérieurs, revêtements et éléments de finition réalisés à partir du portefeuille client S2MBOU.</p></div>
        </div>
        <div className="grid auto-rows-[310px] gap-4 sm:grid-cols-2 md:grid-cols-4 md:auto-rows-[330px]">
          {interiors.map((item) => (
            <figure key={item.title} className={`group relative overflow-hidden rounded-[18px] bg-[#233044] ${item.className}`}>
              <Image src={item.src} alt={item.alt} fill sizes="(max-width: 639px) 100vw, (max-width: 767px) 50vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.025]" />
              <div className="absolute inset-0 bg-linear-to-t from-black/75 via-transparent to-transparent" aria-hidden="true" />
              <figcaption className="absolute right-5 bottom-5 left-5 border-t border-white/35 pt-4 text-sm font-semibold text-white"><h3 className="m-0 text-base font-semibold tracking-[-0.02em] text-white!">{item.title}</h3></figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
