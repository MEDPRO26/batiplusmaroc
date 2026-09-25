"use client";

import { useTranslations } from "next-intl";
import { createContext, useContext, useState, type ReactNode } from "react";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NavbarLogo } from "@/components/layout/navbar-logo";
import { Link, usePathname } from "@/i18n/navigation";
import { routes, type AppRoute } from "@/lib/routes";

export type AdminNavId =
  | "home"
  | "projects"
  | "siteVisits"
  | "companies"
  | "verification"
  | "messages"
  | "deals"
  | "reviews"
  | "profile"
  | "support"
  | "settings";

type AdminNavLabel =
  | "navHome"
  | "navProjects"
  | "navSiteVisits"
  | "navCompanies"
  | "navVerification"
  | "navMessages"
  | "navDeals"
  | "navReviews"
  | "navProfile"
  | "navSupport"
  | "navSettings";

const ADMIN_NAVIGATION: { id: AdminNavId; label: AdminNavLabel; href?: AppRoute }[] = [
  { id: "home", label: "navHome", href: routes.admin },
  { id: "projects", label: "navProjects", href: routes.adminProjects },
  { id: "siteVisits", label: "navSiteVisits", href: routes.adminSiteVisits },
  { id: "companies", label: "navCompanies" },
  { id: "verification", label: "navVerification", href: routes.adminVerification },
  { id: "messages", label: "navMessages" },
  { id: "deals", label: "navDeals" },
  { id: "reviews", label: "navReviews" },
  { id: "profile", label: "navProfile" },
  { id: "support", label: "navSupport" },
  { id: "settings", label: "navSettings" },
];

export const ADMIN_PRESS =
  "cursor-pointer transition-[scale,background-color,color,border-color,opacity] duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.96] motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff]";

const AdminShellContext = createContext<(() => void) | null>(null);

export function AdminShell({
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
  const t = useTranslations("adminDashboard");
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [localNotice, setLocalNotice] = useState("");
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || email || t("accountFallback");
  const activeNav =
    ADMIN_NAVIGATION.find(({ id, href }) =>
      href
        ? id === "home"
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`)
        : false,
    )?.id ?? "home";

  return (
    <div className="flex min-h-dvh w-full bg-[#f4f6f8] text-[#17191d]">
      {localNotice ? (
        <p
          className="fixed bottom-6 left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-full bg-[#17191d] px-4 py-3 text-sm text-white shadow-[0_12px_32px_rgba(16,24,40,0.24)]"
          role="status"
        >
          {localNotice}
        </p>
      ) : null}
      {sidebarOpen ? (
        <button
          aria-label={t("closeSidebar")}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      ) : null}
      <AdminSidebar
        activeNav={activeNav}
        displayName={displayName}
        email={email}
        onClose={() => setSidebarOpen(false)}
        onUnavailable={() => {
          setLocalNotice(t("soon"));
          window.setTimeout(() => setLocalNotice(""), 4000);
          setSidebarOpen(false);
        }}
        open={sidebarOpen}
        query={query}
        setQuery={setQuery}
      />
      <AdminShellContext.Provider value={() => setSidebarOpen(true)}>
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </AdminShellContext.Provider>
    </div>
  );
}

export function AdminPage({
  breadcrumb,
  title,
  headerActions,
  notice,
  children,
}: {
  breadcrumb: string;
  title: string;
  headerActions?: ReactNode;
  notice?: string;
  children: ReactNode;
}) {
  const t = useTranslations("adminDashboard");
  const tBrand = useTranslations("brand");
  const openSidebar = useContext(AdminShellContext);

  if (!openSidebar) throw new Error("AdminPage must be rendered inside AdminShell");

  return (
    <>
      {notice ? (
        <p
          className="fixed bottom-6 left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-full bg-[#17191d] px-4 py-3 text-sm text-white shadow-[0_12px_32px_rgba(16,24,40,0.24)]"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      <header className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <button
          aria-label={t("openSidebar")}
          className={`inline-flex size-11 items-center justify-center rounded-full border border-[#e6e9ee] bg-white text-[#17191d] lg:hidden ${ADMIN_PRESS}`}
          onClick={openSidebar}
          type="button"
        >
          <MenuIcon />
        </button>
        <nav aria-label={t("breadcrumbLabel")} className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[#8b919a]">
          <NavbarLogo homeAria={tBrand("homeAria")} name={tBrand("name")} />
          <span aria-hidden className="text-[#c5cad1]">/</span>
          <span className="truncate">{t("team")}</span>
          <span aria-hidden className="text-[#c5cad1]">/</span>
          <span className="truncate">{t("area")}</span>
          <span aria-hidden className="text-[#c5cad1]">/</span>
          <span className="truncate font-medium text-[#17191d]">{breadcrumb}</span>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
          {headerActions}
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 px-4 pb-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-[1.7rem] font-semibold tracking-[-0.03em]">{title}</h1>
        </div>
        {children}
      </div>
    </>
  );
}

function AdminSidebar({
  activeNav,
  open,
  query,
  setQuery,
  displayName,
  email,
  onClose,
  onUnavailable,
}: {
  activeNav: AdminNavId;
  open: boolean;
  query: string;
  setQuery: (value: string) => void;
  displayName: string;
  email: string | null;
  onClose: () => void;
  onUnavailable: () => void;
}) {
  const t = useTranslations("adminDashboard");
  const tBrand = useTranslations("brand");
  const needle = query.trim().toLocaleLowerCase();
  const items = ADMIN_NAVIGATION.filter(({ label }) => t(label).toLocaleLowerCase().includes(needle));

  return (
    <aside
      aria-label={t("sidebarLabel")}
      className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-[#eceef2] bg-white px-4 py-4 transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 lg:self-start ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-2">
        <NavbarLogo homeAria={tBrand("homeAria")} name={tBrand("name")} />
        <button
          aria-label={t("closeSidebar")}
          className={`inline-flex size-11 items-center justify-center rounded-full text-[#626970] lg:hidden ${ADMIN_PRESS}`}
          onClick={onClose}
          type="button"
        >
          <CloseIcon />
        </button>
      </div>
      <label className="mt-4 flex min-h-11 items-center gap-2 rounded-full bg-[#f4f6f8] px-3 text-sm text-[#8b919a]">
        <SearchIcon />
        <span className="sr-only">{t("searchLabel")}</span>
        <input
          className="h-11 w-full bg-transparent text-[#17191d] outline-none placeholder:text-[#8b919a]"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          value={query}
        />
      </label>
      <nav className="mt-4 flex flex-1 flex-col gap-1 overflow-y-auto">
        {items.length === 0 ? <p className="px-3 py-4 text-sm text-[#8b919a]">{t("noNavResults")}</p> : null}
        {items.map(({ id, label, href }) => {
          const active = id === activeNav;
          const className = active
            ? "flex min-h-11 items-center gap-3 rounded-[14px] bg-[#2f6bff] px-3 text-sm font-semibold text-white shadow-[0_8px_16px_rgba(47,107,255,0.24)]"
            : `flex min-h-11 items-center gap-3 rounded-[14px] px-3 text-left text-sm font-medium text-[#626970] hover:bg-[#f4f6f8] hover:text-[#17191d] ${ADMIN_PRESS}`;

          if (href && active) {
            return (
              <span aria-current="page" className={className} key={id}>
                <NavIcon id={id} />
                {t(label)}
              </span>
            );
          }
          if (href) {
            return (
              <Link className={className} href={href} key={id} onClick={onClose}>
                <NavIcon id={id} />
                <span className="min-w-0 flex-1 truncate">{t(label)}</span>
              </Link>
            );
          }
          return (
            <button
              aria-label={`${t(label)}. ${t("soon")}`}
              className={className}
              key={id}
              onClick={onUnavailable}
              type="button"
            >
              <NavIcon id={id} />
              <span className="min-w-0 flex-1 truncate">{t(label)}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-4 flex items-center gap-3 rounded-[16px] border border-[#eceef2] px-3 py-2">
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-[#2f6bff] text-sm font-semibold text-white">
          {displayName.slice(0, 1).toLocaleUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{t("footerTeam")}</span>
          <span className="block truncate text-xs text-[#8b919a]">{email ?? displayName}</span>
        </span>
      </div>
    </aside>
  );
}

function Glyph({ children, className = "size-[18px]" }: { children: ReactNode; className?: string }) {
  return (
    <svg aria-hidden className={className} fill="none" viewBox="0 0 24 24">
      {children}
    </svg>
  );
}

function stroke() {
  return { stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 1.75 };
}

function SearchIcon() {
  return (
    <Glyph>
      <circle {...stroke()} cx="11" cy="11" r="6" />
      <path {...stroke()} d="m16 16 3 3" />
    </Glyph>
  );
}
function MenuIcon() {
  return (
    <Glyph>
      <path {...stroke()} d="M5 7h14M5 12h14M5 17h14" />
    </Glyph>
  );
}
function CloseIcon() {
  return (
    <Glyph>
      <path {...stroke()} d="m7 7 10 10M17 7 7 17" />
    </Glyph>
  );
}

function NavIcon({ id }: { id: AdminNavId }) {
  if (id === "home")
    return (
      <Glyph>
        <path {...stroke()} d="m4 11 8-7 8 7v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8Z" />
      </Glyph>
    );
  if (id === "projects")
    return (
      <Glyph>
        <path {...stroke()} d="M4 5h7v7H4V5Zm9 0h7v4h-7V5ZM13 11h7v8h-7v-8ZM4 14h7v5H4v-5Z" />
      </Glyph>
    );
  if (id === "siteVisits")
    return (
      <Glyph>
        <path {...stroke()} d="M7 3v3M17 3v3M5 9h14M6 5h12a2 2 0 0 1 2 2v12H4V7a2 2 0 0 1 2-2Z" />
        <path {...stroke()} d="m9 14 2 2 4-4" />
      </Glyph>
    );
  if (id === "companies")
    return (
      <Glyph>
        <path {...stroke()} d="M5 20V6l7-2 7 2v14M9 20v-4h6v4M9 9h.01M12 9h.01M15 9h.01M9 12h.01M12 12h.01M15 12h.01" />
      </Glyph>
    );
  if (id === "verification")
    return (
      <Glyph>
        <path {...stroke()} d="M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6l-7-3Z" />
        <path {...stroke()} d="m9 12 2 2 4-4" />
      </Glyph>
    );
  if (id === "messages")
    return (
      <Glyph>
        <path {...stroke()} d="M5 6h14v9H8l-3 3V6Z" />
      </Glyph>
    );
  if (id === "deals")
    return (
      <Glyph>
        <path {...stroke()} d="M6 7h12v12H6V7Zm3-3h6v3H9V4Z" />
      </Glyph>
    );
  if (id === "reviews")
    return (
      <Glyph>
        <path {...stroke()} d="m12 4 2.2 4.6L19 9.2l-3.5 3.4.8 4.8L12 15.2 7.7 17.4l.8-4.8L5 9.2l4.8-.6L12 4Z" />
      </Glyph>
    );
  if (id === "profile")
    return (
      <Glyph>
        <circle {...stroke()} cx="12" cy="9" r="3" />
        <path {...stroke()} d="M6 19c1.4-2.4 3.4-3.5 6-3.5S16.6 16.6 18 19" />
      </Glyph>
    );
  if (id === "support")
    return (
      <Glyph>
        <circle {...stroke()} cx="12" cy="12" r="8" />
        <path {...stroke()} d="M12 16h.01M12 8a2.5 2.5 0 0 1 1 4.8c-.6.3-1 .8-1 1.5" />
      </Glyph>
    );
  return (
    <Glyph>
      <circle {...stroke()} cx="12" cy="12" r="3" />
      <path {...stroke()} d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </Glyph>
  );
}
