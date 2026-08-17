import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { createMetadata } from "@/lib/seo";

export const metadata: Metadata = createMetadata({ title: "Entreprise BTP et aménagement à Agadir – Construction pro", path: routes.home });

export default function Home() {
  return <section className="shell-section"><div className="container-shell"><p className="eyebrow">S2MBOU — ENTREPRISE BTP À AGADIR</p><h1>Aménagement Agadir : Intérieur &amp; extérieur sur mesure</h1><p className="shell-note">Le contenu existant sera migré sans réécriture lors de la prochaine phase.</p><Link className="button-primary" href={routes.contact}>Demander un devis</Link></div></section>;
}
