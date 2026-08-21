import Image from "next/image";

const services = [
  ["01", "Isolation thermique et acoustique", "Améliorer le confort intérieur et maîtriser les échanges thermiques et sonores."],
  ["02", "Installation électrique", "Organiser et mettre en œuvre les installations nécessaires aux usages du bâtiment."],
  ["03", "Plomberie et sanitaires", "Intégrer les réseaux et les équipements sanitaires avec précision."],
  ["04", "Pose de cloisons et plafonds", "Structurer les volumes intérieurs et préparer l’intégration de l’éclairage."],
  ["05", "Revêtements de sols et murs", "Apporter résistance, entretien facile et cohérence visuelle aux espaces."],
  ["06", "Menuiserie intérieure (portes, escaliers, rangements)", "Finaliser les circulations, les accès et les usages quotidiens."],
  ["07", "Peinture et finitions", "Soigner les surfaces et les derniers détails qui définissent la qualité perçue."],
] as const;

export function SecondOeuvreServices() {
  return (
    <section className="overflow-hidden bg-[#eaf1f5] py-20 sm:py-28 lg:py-36" aria-labelledby="second-oeuvre-services-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="mb-12 grid gap-6 lg:mb-18 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <p className="text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Sept domaines coordonnés</p>
          <h2 id="second-oeuvre-services-title" className="mb-0! max-w-[920px] text-[clamp(2.7rem,5.6vw,5.6rem)] leading-[0.94] tracking-[-0.065em]">De la performance technique au dernier détail.</h2>
        </div>
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <figure className="relative m-0 min-h-[560px] overflow-hidden rounded-[24px] bg-brand-dark sm:min-h-[760px] lg:h-[800px]">
              <Image src="/images/portfolio-2026/interiors/finitions-interieures-01.webp" alt="Cloison décorative intérieure réalisée par S2MBOU" fill sizes="(max-width: 1023px) calc(100vw - 36px), 41vw" className="object-cover" />
              <div className="absolute inset-0 bg-linear-to-t from-[#071524]/78 via-transparent to-transparent" aria-hidden="true" />
              <figcaption className="absolute bottom-6 left-6 max-w-xs text-sm leading-6 font-semibold text-white sm:bottom-8 sm:left-8">Finitions intérieures — détail d’exécution réel.</figcaption>
            </figure>
          </div>
          <ol className="m-0 list-none border-t border-[#c8d5dd] p-0">
            {services.map(([number, name, description]) => (
              <li key={number} className="grid gap-4 border-b border-[#c8d5dd] py-7 sm:grid-cols-[58px_1fr] sm:gap-6 sm:py-9">
                <span className="text-[0.68rem] font-bold tracking-[0.16em] text-[#a87e16]">{number}</span>
                <div>
                  <h3 className="mb-3 max-w-2xl text-[clamp(1.4rem,2.7vw,2.1rem)] leading-[1.08] tracking-[-0.04em]">{name}</h3>
                  <p className="m-0 max-w-xl text-base leading-7 text-muted">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
