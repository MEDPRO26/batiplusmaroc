const principles = [
  {
    number: "01",
    title: "Qualité d’exécution",
    text: "Des travaux soignés, résistants et adaptés à la nature de chaque projet.",
  },
  {
    number: "02",
    title: "Suivi de chantier",
    text: "Organisation des équipes, contrôle des étapes et communication avec le client.",
  },
  {
    number: "03",
    title: "Polyvalence",
    text: "Une intervention coordonnée en construction, rénovation, aménagement et finition.",
  },
  {
    number: "04",
    title: "Engagement",
    text: "Sérieux, flexibilité et respect des engagements tout au long du projet.",
  },
] as const;

export function AboutWhyUs() {
  return (
    <section className="border-y border-brand-border bg-[#f6f8f9] py-18 sm:py-24 lg:py-32" aria-labelledby="why-us-title">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-[18px] sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-[8vw] lg:px-8">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Pourquoi choisir S2MBOU ?</p>
          <h2 id="why-us-title" className="mb-7! text-[clamp(2.5rem,5vw,4.8rem)] leading-[0.96] tracking-[-0.06em]">La confiance se construit dans l’exécution.</h2>
          <p className="max-w-[470px] text-base leading-7 text-muted sm:text-lg">Une approche attentive au projet, à son organisation et à la qualité du résultat livré.</p>
        </div>

        <ol className="grid list-none gap-px overflow-hidden rounded-[22px] border border-brand-border bg-brand-border p-0 sm:grid-cols-2">
          {principles.map((principle) => (
            <li key={principle.number} className="min-h-[280px] bg-white p-7 sm:p-9">
              <div className="flex items-center justify-between gap-6">
                <span className="text-[0.7rem] font-bold tracking-[0.18em] text-brand">{principle.number}</span>
                <span className="size-2 rounded-full bg-[#e7b63f]" aria-hidden="true" />
              </div>
              <h3 className="mt-16 mb-4 text-2xl leading-tight tracking-[-0.04em]">{principle.title}</h3>
              <p className="max-w-sm leading-7 text-muted">{principle.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
