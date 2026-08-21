"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { primaryNavigation, serviceNavigation } from "@/content/site";
import { routes } from "@/lib/routes";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const firstLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    firstLink.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  const links = [...primaryNavigation.slice(0, 2), { label: "Nos services", href: routes.services }, ...serviceNavigation, ...primaryNavigation.slice(2)];

  return (
    <div className="relative lg:hidden">
      <button className="flex min-h-11 items-center gap-3 border-0 bg-transparent font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand [body:has(.home-hero)_&]:text-white!" type="button" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((value) => !value)}>
        <span>{open ? "Fermer" : "Menu"}</span>
        <span className="grid gap-1.5" aria-hidden="true"><i className="block h-px w-[22px] bg-current" /><i className="block h-px w-[22px] bg-current" /></span>
      </button>
      {open && (
        <nav className="absolute top-[calc(100%+15px)] right-0 grid w-[min(88vw,340px)] rounded-[18px] border border-brand-border bg-white p-4 text-ink shadow-[0_24px_70px_rgb(23_61_99_/_0.16)]" id="mobile-menu" aria-label="Navigation mobile">
          {links.map((item, index) => <Link className="flex min-h-12 items-center justify-between border-b border-brand-border px-1.5 transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" ref={index === 0 ? firstLink : undefined} key={`${item.href}-${item.label}`} href={item.href} onClick={() => setOpen(false)}>{item.label}<span aria-hidden="true">↗</span></Link>)}
          <Link className="mt-4 inline-flex min-h-12 items-center justify-center rounded-[10px] bg-brand px-5 font-semibold text-white! transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand" href={routes.contact} onClick={() => setOpen(false)}>Demander un devis</Link>
        </nav>
      )}
    </div>
  );
}
