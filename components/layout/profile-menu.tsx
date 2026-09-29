"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useSafeSignOut } from "@/features/auth/hooks/use-safe-sign-out";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { userInitials } from "./navbar-role";

export type ProfileMenuItem = {
  href: ComponentProps<typeof Link>["href"];
  label: string;
  /** Short trailing status, e.g. the verification state next to "Verification". */
  meta?: ReactNode;
};

export function ProfileMenu({
  firstName,
  lastName,
  displayName,
  roleLabel,
  profileImageUrl,
  sections,
}: {
  role: "client" | "company";
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  roleLabel: string;
  profileImageUrl?: string | null;
  /** Groups of account links, separated visually. Marketplace navigation stays in the navbar. */
  sections: ProfileMenuItem[][];
}) {
  const t = useTranslations("nav.profileMenu");
  const tAuth = useTranslations("auth");
  const signOut = useSafeSignOut();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);
  const menuId = useId();
  const initials = userInitials(firstName, lastName);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );
      if (items.length === 0) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      items[(current + direction + items.length) % items.length]?.focus();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative block" ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("openMenu")}
        className="relative flex size-11 items-center justify-center overflow-hidden rounded-full border border-brand-border bg-brand-soft text-sm font-semibold text-brand-dark outline outline-1 -outline-offset-1 outline-black/10 transition-[transform,box-shadow] duration-150 active:scale-[0.96] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        {profileImageUrl ? (
          <Image alt="" className="object-cover" fill sizes="44px" src={profileImageUrl} />
        ) : (
          <span aria-hidden>{initials}</span>
        )}
      </button>
      <div
        className={
          open
            ? "absolute top-[calc(100%+10px)] right-0 z-50 w-[min(92vw,280px)] rounded-2xl border border-brand-border bg-white p-2 text-ink shadow-[0_18px_50px_rgb(23_61_99_/_0.14)]"
            : "hidden"
        }
        id={menuId}
        role="menu"
      >
        <div className="flex items-center gap-3 border-b border-brand-border px-3 py-3">
          <span aria-hidden className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft text-sm font-semibold text-brand-dark outline outline-1 -outline-offset-1 outline-black/10">
            {profileImageUrl ? <Image alt="" className="object-cover" fill sizes="40px" src={profileImageUrl} /> : initials}
          </span>
          <div className="min-w-0">
            <p className="m-0 truncate text-sm font-semibold text-ink">{displayName}</p>
            <p className="m-0 text-xs text-muted">{roleLabel}</p>
          </div>
        </div>
        <ul className="m-0 list-none p-1" role="none">
          {sections.map((section, sectionIndex) => (
            <Fragment key={sectionIndex}>
              {sectionIndex > 0 ? <li aria-hidden className="mx-2 my-1 h-px bg-brand-border" role="separator" /> : null}
              {section.map((item, index) => (
                <li key={item.label} role="none">
                  <Link
                    className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-sm font-medium text-ink transition-colors hover:bg-brand-soft/70 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    href={item.href}
                    onClick={() => setOpen(false)}
                    ref={sectionIndex === 0 && index === 0 ? firstItemRef : undefined}
                    role="menuitem"
                  >
                    {item.label}
                    {item.meta ? <span className="shrink-0 text-xs font-normal text-muted">{item.meta}</span> : null}
                  </Link>
                </li>
              ))}
            </Fragment>
          ))}
          <li aria-hidden className="mx-2 my-1 h-px bg-brand-border" role="separator" />
          <li role="none">
            <button
              className="flex min-h-11 w-full cursor-pointer items-center rounded-xl border-0 bg-transparent px-3 text-start text-sm font-medium text-ink transition-colors hover:bg-brand-soft/70 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={() => {
                setOpen(false);
                void signOut().then((signedOut) => {
                  if (signedOut) router.push(routes.signIn);
                });
              }}
              role="menuitem"
              type="button"
            >
              {tAuth("signOut")}
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
