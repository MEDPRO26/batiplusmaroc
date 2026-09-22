"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { ProjectCta } from "@/components/layout/project-cta";
import { marketplaceNavItems } from "@/content/site";
import { MobileAuthSessionControls } from "@/features/auth/components/auth-session-controls";
import { Link } from "@/i18n/navigation";

export function MobileNav({ inverted = false, projectCta }: { inverted?: boolean; projectCta: ProjectCta }) {
  const [open, setOpen] = useState(false);
  const firstLink = useRef<HTMLAnchorElement>(null);
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");

  useEffect(() => {
    if (!open) return;
    firstLink.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  return (
    <div className="relative lg:hidden">
      <button
        aria-controls="mobile-menu"
        aria-expanded={open}
        className={`flex min-h-11 items-center gap-3 border-0 bg-transparent font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand ${inverted ? "text-white" : "text-ink"}`}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span>{open ? tCommon("close") : tCommon("menu")}</span>
        <span className="grid gap-1.5" aria-hidden="true">
          <i className="block h-px w-[22px] bg-current" />
          <i className="block h-px w-[22px] bg-current" />
        </span>
      </button>
      {open ? (
        <nav className="absolute top-[calc(100%+15px)] right-0 z-50 grid w-[min(88vw,340px)] rounded-[18px] border border-brand-border bg-white p-4 text-ink shadow-[0_24px_70px_rgb(23_61_99_/_0.16)]" id="mobile-menu" aria-label={t("mobile")}>
          {marketplaceNavItems.map((item, index) => (
            <Link
              className="flex min-h-12 items-center justify-between border-b border-brand-border px-1.5 transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              href={(item.hash ? { pathname: item.href, hash: item.hash } : item.href) as never}
              key={item.labelKey}
              onClick={() => setOpen(false)}
              ref={index === 0 ? firstLink : undefined}
            >
              {t(item.labelKey)}
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
          <MobileAuthSessionControls onNavigate={() => setOpen(false)} />
          <Link
            className="mt-4 inline-flex min-h-12 items-center justify-center rounded-[10px] bg-brand px-5 font-semibold text-white! transition-colors hover:bg-brand-hover hover:text-white! focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
            href={projectCta.href}
            onClick={() => setOpen(false)}
          >
            {t(projectCta.labelKey)}
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
