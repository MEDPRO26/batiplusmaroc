import Image from "next/image";

const portfolio = [
  ["/images/portfolio-2026/interiors/finitions-interieures-02.webp", "Mur intérieur texturé dans un salon", "Finition murale"],
  ["/images/portfolio-2026/interiors/details-finition-03.webp", "Cheminée intérieure avec habillage décoratif", "Détail de finition"],
  ["/images/portfolio-2026/interiors/revetements-decoratifs-01.webp", "Grand mur intérieur avec revêtement texturé", "Revêtement décoratif"],
  ["/images/portfolio-2026/interiors/finitions-interieures-03.webp", "Mur décoratif avec motifs dorés", "Décor intérieur"],
  ["/images/portfolio-2026/interiors/details-finition-02.webp", "Plafond intérieur moderne avec éclairage linéaire", "Plafond & éclairage"],
  ["/images/portfolio-2026/interiors/revetements-decoratifs-03.webp", "Détail de parement mural effet pierre", "Parement mural"],
] as const;

export function FinishingPortfolio() {
  return (
    <section className="bg-[#eaf1f5] py-20 sm:py-28 lg:py-36" aria-labelledby="finishing-portfolio-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Portfolio finitions</p>
        <h2 id="finishing-portfolio-title" className="mb-12! max-w-[920px] text-[clamp(2.7rem,5.5vw,5.5rem)] leading-[0.94] tracking-[-0.065em] lg:mb-16!">Des réalisations qui montrent le niveau de détail.</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portfolio.map(([src, alt, label], index) => (
            <figure key={src} className={`relative m-0 min-h-[420px] overflow-hidden rounded-[20px] bg-[#d9e2e7] ${index === 0 || index === 4 ? "lg:min-h-[560px]" : "lg:min-h-[460px]"}`}>
              <Image src={src} alt={alt} fill sizes="(max-width: 639px) calc(100vw - 36px), (max-width: 1023px) 50vw, 33vw" className="object-cover" />
              <div className="absolute inset-0 bg-linear-to-t from-[#071524]/75 via-transparent to-transparent" aria-hidden="true" />
              <figcaption className="absolute inset-x-0 bottom-0 p-6 text-sm font-semibold text-white">{label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
