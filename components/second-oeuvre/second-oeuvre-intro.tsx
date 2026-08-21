export function SecondOeuvreIntro() {
  return (
    <section className="bg-white py-20 sm:py-28 lg:py-36" aria-labelledby="second-oeuvre-intro-title">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-[18px] sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20 lg:px-8">
        <div>
          <p className="mb-5 text-[0.7rem] font-bold tracking-[0.2em] text-brand uppercase">Comprendre le second œuvre</p>
          <h2 id="second-oeuvre-intro-title" className="mb-0! max-w-xl text-[clamp(2.7rem,5.5vw,5.4rem)] leading-[0.94] tracking-[-0.065em]">Ce qui transforme un bâtiment en espace à vivre.</h2>
        </div>
        <div className="border-t border-brand-border pt-8 lg:mt-16">
          <p className="mb-7 text-xl leading-8 font-semibold text-ink sm:text-2xl sm:leading-9">
            Le second œuvre regroupe l’ensemble des travaux qui viennent après le gros œuvre dans la construction d’un bâtiment.
          </p>
          <p className="m-0 max-w-2xl text-base leading-7 text-muted sm:text-lg sm:leading-8">
            Ces interventions rendent le bâtiment confortable, fonctionnel et esthétique. Elles articulent les réseaux techniques, l’isolation, les cloisons, les revêtements, la menuiserie et les finitions dans un ensemble cohérent.
          </p>
        </div>
      </div>
    </section>
  );
}
