export function ServicesIntro() {
  return (
    <section className="bg-white py-18 sm:py-24 lg:py-32" aria-labelledby="services-intro-title">
      <div className="mx-auto grid max-w-[1280px] gap-9 px-[18px] sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:px-8">
        <div>
          <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Notre savoir-faire</p>
          <h2 id="services-intro-title" className="mb-0! max-w-[760px] text-[clamp(2.65rem,5.5vw,5.3rem)] leading-[0.94] tracking-[-0.065em]">
            Un seul partenaire pour plusieurs métiers du bâtiment.
          </h2>
        </div>
        <div className="grid content-end gap-6 border-l border-brand-border pl-6 sm:pl-9">
          <p className="m-0 text-lg leading-8 text-ink sm:text-xl sm:leading-9">
            De la préparation de la structure à l’aménagement des espaces, les métiers se complètent pour donner au projet une exécution cohérente.
          </p>
          <p className="m-0 max-w-[600px] leading-7 text-muted">
            S2MBOU réunit les interventions de construction, rénovation et finition dans une lecture globale du bâtiment et de ses usages.
          </p>
        </div>
      </div>
    </section>
  );
}
