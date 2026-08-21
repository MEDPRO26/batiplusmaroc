import Image from "next/image";
import Link from "next/link";
import { routes } from "@/lib/routes";

export function AboutPreview() {
  return <section className="section about"><div className="container-shell about-grid"><div className="about-media"><Image src="/images/about-project.jpg" alt="Chantier de construction S2MBOU" fill sizes="(max-width: 767px) 100vw, 50vw" /></div><div className="about-copy"><p className="eyebrow">À PROPOS</p><h2>Construire, aménager, valoriser.</h2><p>S2MBOU est une entreprise de BTP située à Agadir, spécialisée dans la construction, l’aménagement intérieur et extérieur, ainsi que la menuiserie.</p><p>Nous accompagnons particuliers et professionnels avec des solutions fiables, sur mesure et de qualité, à chaque étape de leur projet.</p><ul className="check-list"><li>Solutions adaptées à chaque projet</li><li>Accompagnement de la planification à la réalisation</li><li>Construction, aménagement et menuiserie</li></ul><Link className="text-link" href={routes.about}>Découvrir l’entreprise <span aria-hidden="true">→</span></Link></div></div></section>;
}
