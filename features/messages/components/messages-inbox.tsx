"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { PageSkeleton } from "@/features/shared/components/skeletons";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

type DashboardUser = {
  accountType: "client" | "company" | "admin" | null;
  onboardingStatus: "pending" | "completed" | null;
} | null | undefined;

export type MessageThread = {
  id: string;
  title: string;
  preview: string;
  unread: boolean;
  favorite: boolean;
  projectId: string | null;
};
type OwnedProject = FunctionReturnType<typeof api.projects.index.getMyProjects>[number];

export function resolveMessagesRedirect(user: DashboardUser) {
  if (user === undefined) return null;
  if (user === null) return routes.signIn;
  if (user.accountType === "client" && user.onboardingStatus !== "completed") {
    return routes.clientOnboarding;
  }
  if (user.accountType === "company" && user.onboardingStatus !== "completed") {
    return routes.companyOnboarding;
  }
  if (user.accountType !== "client" && user.accountType !== "company") {
    return routes.home;
  }
  return null;
}

export function MessagesInbox() {
  const tUx = useTranslations("ux");
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "client" || user?.accountType === "company";
  const completed = canLoad && user.onboardingStatus === "completed";
  const threads = useQuery(api.messages.index.listMyThreads, completed ? {} : "skip");
  const projects = useQuery(
    api.projects.index.getMyProjects,
    completed && user.accountType === "client" ? {} : "skip",
  );
  const router = useRouter();

  useEffect(() => {
    const destination = resolveMessagesRedirect(user);
    if (destination) router.replace(destination);
  }, [router, user]);

  if (
    user === undefined ||
    user === null ||
    !canLoad ||
    user.onboardingStatus !== "completed" ||
    threads === undefined
  ) {
    return <PageSkeleton label={tUx("loading.page")} />;
  }

  return (
    <MessagesInboxView
      accountType={user.accountType === "company" ? "company" : "client"}
      projects={projects ?? []}
      threads={threads as MessageThread[]}
    />
  );
}

export function MessagesInboxView({
  accountType,
  projects,
  threads,
}: {
  accountType: "client" | "company";
  projects: OwnedProject[];
  threads: MessageThread[];
}) {
  const t = useTranslations("messages");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const visibleThreads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return threads.filter((thread) => {
      if (unreadOnly && !thread.unread) return false;
      if (favoritesOnly && !thread.favorite) return false;
      if (projectId && thread.projectId !== projectId) return false;
      if (!needle) return true;
      return `${thread.title} ${thread.preview}`.toLowerCase().includes(needle);
    });
  }, [favoritesOnly, projectId, query, threads, unreadOnly]);

  const cta =
    accountType === "company"
      ? { href: routes.companyProjects, label: t("ctaCompany") }
      : { href: routes.companies, label: t("ctaClient") };

  return (
    <div className="flex min-h-[calc(100dvh-4.5rem)] flex-1 flex-col bg-white lg:flex-row">
      <aside
        aria-label={t("sidebarLabel")}
        className="relative z-10 m-3 flex w-full shrink-0 flex-col overflow-visible rounded-2xl border-b border-brand-border bg-[#f7f9fb] lg:w-[320px] lg:border-r lg:border-b-0"
      >
        <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
          <h1 className="m-0 text-[1.35rem] font-semibold tracking-[-0.03em] text-ink">{t("title")}</h1>
          <div className="flex items-center">
            <button
              aria-expanded={searchOpen}
              aria-label={t("searchConversations")}
              className="grid size-9 place-items-center rounded-full border-0 bg-transparent text-muted transition-colors hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={() => setSearchOpen((value) => !value)}
              type="button"
            >
              <SearchIcon />
            </button>
            <InboxMenu
              onReset={() => {
                setQuery("");
                setUnreadOnly(false);
                setFavoritesOnly(false);
                setProjectId(null);
              }}
            />
          </div>
        </div>

        {searchOpen ? (
          <div className="px-4 pb-3">
            <label className="sr-only" htmlFor="messages-conversation-search">
              {t("searchConversations")}
            </label>
            <input
              className="min-h-11 w-full rounded-full border border-brand-border bg-white px-4 text-sm text-ink outline-none placeholder:text-muted/75 focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]"
              id="messages-conversation-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchConversationsPlaceholder")}
              ref={searchRef}
              type="search"
              value={query}
            />
          </div>
        ) : null}

        <div className="relative z-30 flex flex-nowrap items-center gap-2 overflow-visible px-4 pb-4">
          <FilterChip active={unreadOnly} onClick={() => setUnreadOnly((value) => !value)}>
            {t("unread")}
          </FilterChip>
          <FilterChip active={favoritesOnly} onClick={() => setFavoritesOnly((value) => !value)}>
            {t("favorites")}
          </FilterChip>
          <ProjectsFilter
            onSelect={setProjectId}
            projectId={projectId}
            projects={projects}
          />
        </div>

        <div className="relative z-0 flex min-h-40 flex-1 flex-col px-2 pb-6">
          {visibleThreads.length === 0 ? (
            <p className="mt-auto mb-0 px-3 text-sm text-muted">
              {threads.length === 0 ? t("conversationsEmpty") : t("noMatchingConversations")}
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {visibleThreads.map((thread) => (
                <li key={thread.id}>
                  <p className="m-0 truncate px-3 py-3 text-sm font-medium text-ink">{thread.title}</p>
                  <p className="m-0 truncate px-3 pb-3 text-sm text-muted">{thread.preview}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section
        aria-label={t("threadPane")}
        className="flex min-h-[50vh] flex-1 flex-col items-center justify-center px-6 py-16 text-center"
      >
        <span
          aria-hidden
          className="grid size-16 place-items-center rounded-full bg-brand-soft text-brand"
        >
          <ChatIcon />
        </span>
        <h2 className="mt-6 mb-0 text-[1.55rem] font-semibold tracking-[-0.03em] text-ink">
          {t("welcomeTitle")}
        </h2>
        <p className="mt-3 mb-0 max-w-[26rem] text-sm leading-6 text-muted">
          {accountType === "company" ? t("welcomeLeadCompany") : t("welcomeLead")}
        </p>
        <Link
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white transition-[transform,background-color] duration-150 hover:bg-brand-hover active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand"
          href={cta.href}
        >
          {cta.label}
        </Link>
      </section>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        active
          ? "border-brand bg-brand-soft text-brand-dark"
          : "border-brand-border bg-white text-ink hover:border-brand/40"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ProjectsFilter({
  projects,
  projectId,
  onSelect,
}: {
  projects: OwnedProject[];
  projectId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useTranslations("messages");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const needle = search.trim().toLowerCase();
  const matches = projects.filter((project) =>
    (project.title ?? t("untitledProject")).toLowerCase().includes(needle),
  );

  return (
    <div className="relative z-40" ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          open || projectId
            ? "border-brand bg-brand-soft text-brand-dark"
            : "border-brand-border bg-white text-ink hover:border-brand/40"
        }`}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {t("projects")}
        <ChevronIcon />
      </button>
      <div
        className={
          open
            ? "absolute top-[calc(100%+8px)] left-0 z-50 w-[min(88vw,240px)] rounded-xl border border-brand-border bg-white p-2 shadow-[0_16px_40px_rgb(23_61_99/0.12)]"
            : "hidden"
        }
        id={menuId}
      >
        <button
          className="flex   min-h-10 w-full items-center rounded-lg border-0 bg-transparent px-2 text-start text-sm font-medium text-ink hover:bg-brand-soft/70"
          onClick={() => {
            onSelect(null);
            setOpen(false);
          }}
          type="button"
        >
          {t("allProjects")}
        </button>
        <input
          aria-label={t("searchProjects")}
          className="mt-1 min-h-10 w-full rounded-lg border border-brand-border px-3 text-sm text-ink outline-none placeholder:text-muted/75 focus:border-brand"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchProjects")}
          type="search"
          value={search}
        />
        <ul className="m-0 mt-1 max-h-48 list-none overflow-y-auto p-0">
          {matches.length === 0 ? (
            <li className="px-2 py-3 text-sm text-muted">{t("noProjectResults")}</li>
          ) : (
            matches.map((project) => (
              <li key={project.id}>
                <button
                  className="flex min-h-10 w-full items-center rounded-lg border-0 bg-transparent px-2 text-start text-sm text-ink hover:bg-brand-soft/70"
                  onClick={() => {
                    onSelect(project.id);
                    setOpen(false);
                  }}
                  type="button"
                >
                  {project.title ?? t("untitledProject")}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function InboxMenu({ onReset }: { onReset: () => void }) {
  const t = useTranslations("messages");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("openMenu")}
        className="grid size-9 place-items-center rounded-full border-0 bg-transparent text-muted transition-colors hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <MoreIcon />
      </button>
      <div
        className={
          open
            ? "absolute top-[calc(100%+6px)] right-0 z-100 w-52 rounded-xl border border-brand-border bg-white p-1 shadow-[0_16px_40px_rgb(23_61_99/0.12)]"
            : "hidden"
        }
        id={menuId}
        role="menu"
      >
        <button
          className="flex min-h-10 w-full items-center rounded-lg border-0 bg-transparent px-3 text-start text-sm font-medium text-ink hover:bg-brand-soft/70"
          onClick={() => {
            onReset();
            setOpen(false);
          }}
          role="menuitem"
          type="button"
        >
          {t("allMessages")}
        </button>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden className="size-[18px]" fill="none" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden className="size-3.5" fill="none" viewBox="0 0 12 12">
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg aria-hidden className="size-5" fill="currentColor" viewBox="0 0 20 20">
      <circle cx="4.5" cy="10" r="1.4" />
      <circle cx="10" cy="10" r="1.4" />
      <circle cx="15.5" cy="10" r="1.4" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg aria-hidden className="size-8" fill="none" viewBox="0 0 32 32">
      <path
        d="M8 9.5h16A3.5 3.5 0 0 1 27.5 13v7A3.5 3.5 0 0 1 24 23.5H16l-5.5 4v-4H8A3.5 3.5 0 0 1 4.5 20v-7A3.5 3.5 0 0 1 8 9.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}
