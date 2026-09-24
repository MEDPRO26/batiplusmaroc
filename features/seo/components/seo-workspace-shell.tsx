"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import {
  ClipboardList,
  FileText,
  GitBranch,
  ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  PanelsTopLeft,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NavbarLogo } from "@/components/layout/navbar-logo";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routes, type AppRoute } from "@/lib/routes";

export const SEO_PRESS =
  "cursor-pointer transition-[scale,background-color,color,border-color,opacity] duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.96] motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff]";

type NavItem = {
  id: "dashboard" | "articles" | "media" | "pages" | "pillars" | "clusters" | "briefs";
  href: AppRoute;
  icon: LucideIcon;
};

const NAV: NavItem[] = [
  { id: "dashboard", href: routes.seoDashboard, icon: LayoutDashboard },
  { id: "articles", href: routes.seoArticles, icon: FileText },
  { id: "media", href: routes.seoMedia, icon: ImageIcon },
  { id: "pages", href: routes.seoPages, icon: PanelsTopLeft },
  { id: "pillars", href: routes.seoPillars, icon: Network },
  { id: "clusters", href: routes.seoClusters, icon: GitBranch },
  { id: "briefs", href: routes.seoBriefs, icon: ClipboardList },
];

export function SeoWorkspaceShell({
  email,
  firstName,
  lastName,
  children,
}: {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  children: ReactNode;
}) {
  const t = useTranslations("seoCms");
  const tBrand = useTranslations("brand");
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const active = NAV.find((item) =>
    item.id === "dashboard"
      ? pathname === routes.seoDashboard
      : pathname === item.href || pathname.startsWith(`${item.href}/`),
  ) ?? NAV[0];
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || email || t("accountFallback");

  async function logOut() {
    await signOut();
    router.push(routes.signIn);
  }

  return (
    <div className="flex min-h-dvh w-full bg-[#f4f6f8] text-[#17191d]">
      {sidebarOpen ? (
        <button
          aria-label={t("closeSidebar")}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      ) : null}

      <aside
        aria-label={t("sidebarLabel")}
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-[#eceef2] bg-white px-4 py-4 transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 lg:self-start ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-2">
          <NavbarLogo homeAria={tBrand("homeAria")} name={tBrand("name")} />
          <button
            aria-label={t("closeSidebar")}
            className={`inline-flex size-11 items-center justify-center rounded-full text-[#626970] lg:hidden ${SEO_PRESS}`}
            onClick={() => setSidebarOpen(false)}
            type="button"
          >
            <X aria-hidden className="size-[18px]" />
          </button>
        </div>

        <div className="mx-2 mt-5 rounded-[14px] bg-[#eef3ff] px-3 py-2.5">
          <p className="text-[0.68rem] font-bold tracking-[0.12em] text-[#2f6bff] uppercase">
            {t("workspaceLabel")}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#17191d]">{t("workspaceName")}</p>
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-1 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === active.id;
            const className = isActive
              ? "flex min-h-11 items-center gap-3 rounded-[14px] bg-[#2f6bff] px-3 text-sm font-semibold text-white shadow-[0_8px_16px_rgba(47,107,255,0.24)]"
              : `flex min-h-11 items-center gap-3 rounded-[14px] px-3 text-sm font-medium text-[#626970] hover:bg-[#f4f6f8] hover:text-[#17191d] ${SEO_PRESS}`;
            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={className}
                href={item.href}
                key={item.id}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon aria-hidden className="size-[18px] shrink-0" />
                <span className="truncate">{t(`nav.${item.id}`)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 rounded-[16px] border border-[#eceef2] p-2">
          <div className="flex items-center gap-3 px-1 py-1">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[#2f6bff] text-sm font-semibold text-white">
              {displayName.slice(0, 1).toLocaleUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{displayName}</span>
              <span className="block truncate text-xs text-[#8b919a]">{email}</span>
            </span>
          </div>
          <button
            className={`mt-2 flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 text-sm font-semibold text-[#626970] hover:bg-[#f4f6f8] hover:text-[#17191d] ${SEO_PRESS}`}
            onClick={() => void logOut()}
            type="button"
          >
            <LogOut aria-hidden className="size-[18px]" />
            {t("signOut")}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[76px] items-center gap-3 border-b border-[#e7eaee]/80 bg-[#f4f6f8]/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <button
            aria-label={t("openSidebar")}
            className={`inline-flex size-11 items-center justify-center rounded-full border border-[#e6e9ee] bg-white text-[#17191d] lg:hidden ${SEO_PRESS}`}
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <Menu aria-hidden className="size-[18px]" />
          </button>
          <nav aria-label={t("breadcrumbLabel")} className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[#8b919a]">
            <span className="truncate">{t("workspaceName")}</span>
            <span aria-hidden className="text-[#c5cad1]">/</span>
            <span className="truncate font-medium text-[#17191d]">{t(`nav.${active.id}`)}</span>
          </nav>
          <LanguageSwitcher />
        </header>
        <main className="flex min-w-0 flex-1 flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-8" id="contenu">
          {children}
        </main>
      </div>
    </div>
  );
}
