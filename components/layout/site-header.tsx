import Link from "next/link";
import { primaryNavigation } from "@/content/site";
import { routes } from "@/lib/routes";
import { MobileNav } from "./mobile-nav";
export function SiteHeader() { return <header className="site-header"><div className="container-shell header-inner"><Link className="brand" href={routes.home} aria-label="S2MBOU — Accueil">S2MBOU</Link><nav className="desktop-nav" aria-label="Navigation principale">{primaryNavigation.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}<Link className="button-primary" href={routes.contact}>Demander un devis</Link></nav><MobileNav /></div></header>; }
