import Image from "next/image";

const activities = [
  {
    number: "01",
    title: "Construction de bâtiments",
    description: "Des structures solides et durables, de la fondation à la finition.",
    services: ["Gros œuvre", "Maçonnerie", "Fondations"],
    image: "/images/portfolio-2026/projects/al-huda-01.webp",
    alt: "Immeuble R+5 à Al-Huda au démarrage des travaux",
  },
  {
    number: "02",
    title: "Travaux intérieurs & finitions",
    description: "Un soin précis apporté aux surfaces, aux volumes et aux détails intérieurs.",
    services: ["Plâtrerie", "Peinture", "Carrelage", "Étanchéité", "Installation de climatisation"],
    image: "/images/portfolio-2026/interiors/finitions-interieures-01.webp",
    alt: "Finition murale décorative intérieure réalisée par S2MBOU",
  },
  {
    number: "03",
    title: "Menuiserie & fermetures",
    description: "Des solutions adaptées au projet, posées avec précision et cohérence.",
    services: ["Menuiserie bois", "Menuiserie PVC", "Menuiserie aluminium"],
    image: "/images/portfolio-2026/interiors/details-finition-02.webp",
    alt: "Détail de finition intérieure réalisé par S2MBOU",
  },
  {
    number: "04",
    title: "Installations techniques",
    description: "Les équipements nécessaires au confort et au fonctionnement du bâtiment.",
    services: ["Électricité", "Plomberie"],
    image: "/images/portfolio-2026/interiors/faux-plafonds-eclairage-02.webp",
    alt: "Faux plafond et éclairage intégrés dans un aménagement intérieur",
  },
] as const;

export function CoreActivities() {
  return (
    <section className="bg-[#edf3f6] py-18 sm:py-24 lg:py-32" aria-labelledby="activities-title">
      <div className="mx-auto max-w-[1280px] px-[18px] sm:px-6 lg:px-8">
        <div className="mb-12 grid gap-6 lg:mb-16 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
          <p className="text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Nos domaines d’intervention</p>
          <h2 id="activities-title" className="mb-0! max-w-[850px] text-[clamp(2.5rem,5.5vw,5.4rem)] leading-[0.94] tracking-[-0.06em]">
            Un savoir-faire complet, du bâti aux derniers détails.
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {activities.map((activity) => (
            <article key={activity.number} className="group grid overflow-hidden rounded-[24px] border border-brand-border bg-white sm:grid-cols-[1.08fr_0.92fr]">
              <div className="flex min-h-[330px] flex-col p-7 sm:p-8 lg:p-10">
                <div className="flex items-center justify-between gap-6">
                  <span className="text-[0.7rem] font-bold tracking-[0.18em] text-brand">{activity.number}</span>
                  <span className="h-px w-12 bg-[#e4b744]" aria-hidden="true" />
                </div>
                <h3 className="mt-12 mb-4 text-[clamp(1.65rem,3vw,2.5rem)] leading-[1.05] tracking-[-0.045em]">{activity.title}</h3>
                <p className="mb-7 leading-7 text-muted">{activity.description}</p>
                <ul className="mt-auto flex list-none flex-wrap gap-x-3 gap-y-2 p-0 text-sm font-semibold text-brand-dark">
                  {activity.services.map((service, index) => (
                    <li key={service} className="flex items-center gap-3">
                      {index > 0 ? <span className="text-[#d2a52e]" aria-hidden="true">·</span> : null}
                      {service}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative min-h-[300px] overflow-hidden sm:min-h-full">
                <Image src={activity.image} alt={activity.alt} fill sizes="(max-width: 767px) calc(100vw - 36px), 24vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.025]" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
