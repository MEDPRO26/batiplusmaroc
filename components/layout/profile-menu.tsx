"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { AppRoute } from "@/lib/routes";
import { routes } from "@/lib/routes";
import { userInitials } from "./navbar-role";

export type ProfileMenuItem = {
  href: AppRoute;
  label: string;
};

export function ProfileMenu({
  firstName,
  lastName,
  displayName,
  roleLabel,
  profileImageUrl,
  items,
}: {
  role: "client" | "company";
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  roleLabel: string;
  profileImageUrl?: string | null;
  items: ProfileMenuItem[];
}) {
  const t = useTranslations("nav.profileMenu");
  const tAuth = useTranslations("auth");
  const { signOut } = useAuthActions();
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
        <ul className="m-0 list-none p-1">
          {items.map((item, index) => (
            <li key={`${item.href}-${item.label}`}>
              <Link
                className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-ink transition-colors hover:bg-brand-soft/70 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                href={item.href}
                onClick={() => setOpen(false)}
                ref={index === 0 ? firstItemRef : undefined}
                role="menuitem"
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <button
              className="flex min-h-11 w-full cursor-pointer items-center rounded-xl border-0 bg-transparent px-3 text-start text-sm font-medium text-ink transition-colors hover:bg-brand-soft/70 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={() => {
                setOpen(false);
                void signOut().then(() => router.push(routes.signIn));
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
