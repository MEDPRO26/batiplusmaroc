"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageSkeleton } from "@/features/shared/components/skeletons";
import { Link, useRouter } from "@/i18n/navigation";
import { mapAppError } from "@/lib/errors/map-app-error";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { routes } from "@/lib/routes";

type DashboardUser = {
  accountType: "client" | "company" | "admin" | "seo_team" | null;
  onboardingStatus: "pending" | "completed" | null;
} | null | undefined;

export type MessageThread = FunctionReturnType<typeof api.messages.index.listMyThreads>[number];
type OwnedProject = FunctionReturnType<typeof api.projects.index.getMyProjects>[number];

export function resolveMessagesRedirect(user: DashboardUser) {
  if (user === undefined) return null;
  if (user === null) return routes.signIn;
  if (user.accountType === "client" && user.onboardingStatus !== "completed") return routes.clientOnboarding;
  if (user.accountType === "company" && user.onboardingStatus !== "completed") return routes.companyOnboarding;
  if (user.accountType !== "client" && user.accountType !== "company") {
    return workspaceRouteForUser(user);
  }
  return null;
}

export function MessagesInbox({ initialConversationId = null }: { initialConversationId?: string | null }) {
  const tUx = useTranslations("ux");
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "client" || user?.accountType === "company";
  const completed = canLoad && user.onboardingStatus === "completed";
  const threads = useQuery(api.messages.index.listMyThreads, completed ? {} : "skip");
  const projects = useQuery(api.projects.index.getMyProjects, completed && user.accountType === "client" ? {} : "skip");
  const router = useRouter();

  useEffect(() => {
    const destination = resolveMessagesRedirect(user);
    if (destination) router.replace(destination);
  }, [router, user]);

  if (user === undefined || user === null || !canLoad || user.onboardingStatus !== "completed" || threads === undefined) {
    return <PageSkeleton label={tUx("loading.page")} />;
  }

  return <MessagesInboxView accountType={user.accountType === "company" ? "company" : "client"} initialConversationId={initialConversationId} projects={projects ?? []} threads={threads} />;
}

export function MessagesInboxView({
  accountType,
  initialConversationId = null,
  projects,
  threads,
}: {
  accountType: "client" | "company";
  initialConversationId?: string | null;
  projects: OwnedProject[];
  threads: MessageThread[];
}) {
  const t = useTranslations("messages");
  const format = useFormatter();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  const visibleThreads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return threads.filter((thread) => {
      if (unreadOnly && !thread.unread) return false;
      if (projectId && thread.projectId !== projectId) return false;
      if (!needle) return true;
      return `${thread.otherPartyName} ${thread.projectTitle ?? ""} ${thread.preview ?? ""}`.toLowerCase().includes(needle);
    });
  }, [projectId, query, threads, unreadOnly]);

  const cta = accountType === "company"
    ? { href: routes.companyProjects, label: t("ctaCompany") }
    : { href: routes.companies, label: t("ctaClient") };

  return (
    <div className="flex min-h-[calc(100dvh-4.5rem)] flex-1 flex-col bg-white lg:flex-row">
      <aside
        aria-label={t("sidebarLabel")}
        className={`relative z-10 flex w-full shrink-0 flex-col border-brand-border bg-white lg:w-[320px] lg:border-r ${initialConversationId ? "hidden lg:flex" : "flex"}`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-brand-border px-4 py-3.5">
          <h1 className="m-0 text-lg font-semibold tracking-[-0.02em] text-ink">{t("title")}</h1>
          <div className="flex items-center">
            <button
              aria-expanded={searchOpen}
              aria-label={t("searchConversations")}
              className="grid size-10 place-items-center rounded-md text-muted hover:bg-[#f4f6f8] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={() => setSearchOpen((value) => !value)}
              type="button"
            >
              <SearchIcon />
            </button>
            <InboxMenu
              onReset={() => {
                setQuery("");
                setUnreadOnly(false);
                setProjectId(null);
              }}
            />
          </div>
        </div>
        {searchOpen ? (
          <div className="border-b border-brand-border px-3 py-2.5">
            <label className="sr-only" htmlFor="messages-conversation-search">
              {t("searchConversations")}
            </label>
            <input
              className="min-h-10 w-full rounded-md border border-brand-border bg-white px-3 text-sm text-ink outline-none focus:border-brand"
              id="messages-conversation-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchConversationsPlaceholder")}
              ref={searchRef}
              type="search"
              value={query}
            />
          </div>
        ) : null}
        <div className="relative z-30 flex items-center gap-2 border-b border-brand-border px-3 py-2.5">
          <FilterChip active={unreadOnly} onClick={() => setUnreadOnly((value) => !value)}>
            {t("unread")}
          </FilterChip>
          {accountType === "client" ? (
            <ProjectsFilter onSelect={setProjectId} projectId={projectId} projects={projects} />
          ) : null}
        </div>
        <div className="relative z-0 flex min-h-40 flex-1 flex-col overflow-y-auto">
          {visibleThreads.length === 0 ? (
            <p className="m-0 px-4 py-8 text-sm leading-6 text-muted">
              {threads.length === 0 ? t("conversationsEmpty") : t("noMatchingConversations")}
            </p>
          ) : (
            <ul className="m-0 list-none divide-y divide-[#e8ecef] p-0">
              {visibleThreads.map((thread) => {
                const active = thread.id === initialConversationId;
                return (
                  <li key={thread.id}>
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={`flex gap-3 px-3.5 py-3.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand ${
                        active
                          ? "border-l-2 border-l-brand bg-[#f0f5f9]"
                          : "border-l-2 border-l-transparent hover:bg-[#f7f9fb]"
                      }`}
                      href={{ pathname: routes.messagesConversation, params: { conversationId: thread.id } }}
                    >
                      <ThreadAvatar name={thread.otherPartyName || t("unknownParty")} url={thread.otherPartyAvatarUrl} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span
                            className={`min-w-0 flex-1 truncate text-[0.9375rem] text-ink ${
                              thread.unread ? "font-semibold" : "font-medium"
                            }`}
                          >
                            {thread.otherPartyName || t("unknownParty")}
                          </span>
                          {thread.lastMessageAt ? (
                            <time
                              className={`shrink-0 text-[11px] ${thread.unread ? "font-semibold text-brand" : "text-muted"}`}
                              dateTime={new Date(thread.lastMessageAt).toISOString()}
                            >
                              {format.relativeTime(new Date(thread.lastMessageAt), { now: new Date() })}
                            </time>
                          ) : null}
                        </div>
                        <p className="mt-0.5 mb-0 truncate text-xs text-muted">
                          {thread.projectTitle ?? t("untitledProject")}
                          <span className="mx-1.5 text-[#c5ccd3]" aria-hidden>
                            ·
                          </span>
                          <span className="uppercase tracking-[0.04em]">
                            {thread.status === "active" ? t("statusActive") : t("statusClosed")}
                          </span>
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <p
                            className={`m-0 min-w-0 flex-1 truncate text-sm ${
                              thread.unread ? "font-medium text-ink" : "text-muted"
                            }`}
                          >
                            {thread.preview ?? t("noMessagesYet")}
                          </p>
                          {thread.unread ? (
                            <span className="size-2 shrink-0 rounded-full bg-brand">
                              <span className="sr-only">{t("unread")}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
      {initialConversationId ? (
        <ActiveConversation accountType={accountType} conversationId={initialConversationId as Id<"conversations">} />
      ) : (
        <section
          aria-label={t("threadPane")}
          className="flex min-h-[50vh] flex-1 flex-col items-center justify-center px-6 py-16 text-center"
        >
          <span aria-hidden className="grid size-14 place-items-center rounded-lg bg-brand-soft text-brand">
            <ChatIcon />
          </span>
          <h2 className="mt-5 mb-0 text-[1.4rem] font-semibold tracking-[-0.03em] text-ink">{t("welcomeTitle")}</h2>
          <p className="mt-2.5 mb-0 max-w-[28rem] text-sm leading-6 text-muted">
            {threads.length === 0 ? t("emptyDescription") : t("selectConversation")}
          </p>
          {threads.length === 0 ? (
            <Link
              className="mt-6 inline-flex min-h-10 items-center rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-hover"
              href={cta.href}
            >
              {cta.label}
            </Link>
          ) : null}
        </section>
      )}
    </div>
  );
}

function ActiveConversation({ accountType, conversationId }: { accountType: "client" | "company"; conversationId: Id<"conversations"> }) {
  const t = useTranslations("messages");
  const tUx = useTranslations("ux");
  const format = useFormatter();
  const conversation = useQuery(api.messages.index.getConversation, { conversationId });
  const { results, status, loadMore } = usePaginatedQuery(api.messages.index.listMessages, { conversationId }, { initialNumItems: 30 });
  const sendMessage = useMutation(api.messages.index.sendMessage);
  const markRead = useMutation(api.messages.index.markConversationRead);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const newestMessageRef = useRef<string | null>(null);
  const ordered = useMemo(() => [...results].reverse(), [results]);

  useEffect(() => {
    if (conversation?.unread) void markRead({ conversationId });
  }, [conversation?.unread, conversationId, markRead]);
  const newestMessageId = ordered.at(-1)?.id ?? null;
  useEffect(() => {
    if (newestMessageId !== newestMessageRef.current) {
      endRef.current?.scrollIntoView({ block: "end" });
      newestMessageRef.current = newestMessageId;
    }
  }, [newestMessageId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const normalized = body.trim();
    if (!normalized || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage({ conversationId, body: normalized, clientMessageId: crypto.randomUUID() });
      setBody("");
    } catch (cause) {
      setError(mapAppError(cause, (key) => tUx(key)));
    } finally {
      setSending(false);
    }
  }

  if (conversation === undefined) return <section className="flex flex-1 flex-col p-5" aria-busy="true"><div className="h-20 animate-pulse rounded-2xl bg-surface-muted" /><div className="mt-5 flex-1 animate-pulse rounded-2xl bg-surface-muted" /></section>;
  const projectHref = accountType === "client"
    ? { pathname: routes.clientProject, params: { projectId: conversation.projectId } } as const
    : { pathname: routes.companyProject, params: { projectId: conversation.projectId } } as const;

  return <section aria-label={t("threadPane")} className="flex min-h-[70dvh] min-w-0 flex-1 flex-col">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border px-5 py-4 sm:px-7">
      <div className="flex min-w-0 items-center gap-3"><Link aria-label={t("backToConversations")} className="grid size-11 shrink-0 place-items-center rounded-full border border-brand-border text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:hidden" href={routes.messages}>←</Link><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="m-0 truncate text-lg font-semibold text-ink">{conversation.otherPartyName || t("unknownParty")}</h2><span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-dark">{conversation.status === "active" ? t("statusActive") : t("statusClosed")}</span></div><Link className="mt-1 block truncate text-sm text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" href={projectHref}>{conversation.projectTitle ?? t("untitledProject")}</Link></div></div>
      {accountType === "client" && conversation.companySlug ? <Link className="text-sm font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" href={{ pathname: "/entreprises/[slug]", params: { slug: conversation.companySlug } }}>{t("viewCompanyProfile")}</Link> : null}
    </header>
    <div aria-live="polite" aria-relevant="additions text" className="flex flex-1 flex-col overflow-y-auto bg-[#fbfcfd] px-4 py-5 sm:px-8" role="log">
      {status === "CanLoadMore" ? <button className="mx-auto mb-5 min-h-11 rounded-full border border-brand-border bg-white px-4 text-sm font-semibold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" onClick={() => loadMore(30)} type="button">{t("loadOlder")}</button> : null}
      {status === "LoadingMore" ? <p className="mb-5 text-center text-sm text-muted">{t("loadingOlder")}</p> : null}
      {ordered.length === 0 ? <div className="my-auto text-center"><h3 className="m-0 text-lg font-semibold text-ink">{t("startConversation")}</h3><p className="mt-2 mb-0 text-sm text-muted">{t("startConversationDescription")}</p></div> : <ol className="m-0 mt-auto list-none space-y-3 p-0">{ordered.map((message) => <li className={`flex ${message.isMine ? "justify-end" : "justify-start"}`} key={message.id}><div className={`max-w-[min(82%,38rem)] rounded-2xl px-4 py-3 ${message.isMine ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-brand-border bg-white text-ink"}`}><p className="m-0 whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p><time className={`mt-1 block text-end text-[11px] ${message.isMine ? "text-white/75" : "text-muted"}`} dateTime={new Date(message.createdAt).toISOString()}>{format.dateTime(new Date(message.createdAt), { hour: "2-digit", minute: "2-digit" })}</time></div></li>)}</ol>}
      <div ref={endRef} />
    </div>
    {conversation.status === "active" ? <form className="border-t border-brand-border bg-white p-4 sm:p-5" onSubmit={onSubmit}>
      {error ? <p className="mb-3 rounded-xl bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2f28]" role="alert">{error}</p> : null}
      <label className="sr-only" htmlFor="message-composer">{t("composerLabel")}</label>
      <div className="flex items-end gap-3"><textarea className="max-h-40 min-h-12 flex-1 resize-y rounded-2xl border border-brand-border px-4 py-3 text-sm text-ink outline-none focus:border-brand focus-visible:shadow-[0_0_0_3px_rgb(5_79_132/0.14)]" id="message-composer" maxLength={4000} onChange={(event) => setBody(event.target.value)} placeholder={t("composerPlaceholder")} rows={1} value={body} /><button className="min-h-12 shrink-0 rounded-full bg-brand px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50" disabled={sending || !body.trim()} type="submit">{sending ? t("sending") : t("send")}</button></div>
      <p className="mt-2 mb-0 text-end text-xs text-muted">{t("characterCount", { count: body.length, max: 4000 })}</p>
    </form> : <p className="m-0 border-t border-brand-border bg-surface-muted px-5 py-4 text-sm text-muted">{t("closedNotice")}</p>}
  </section>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        active ? "border-brand bg-brand-soft text-brand-dark" : "border-brand-border bg-white text-ink hover:bg-[#f7f9fb]"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ThreadAvatar({ name, url }: { name: string; url: string | null }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden
      className="relative mt-0.5 grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-brand-border bg-brand-soft text-xs font-semibold text-brand"
    >
      {url ? <Image alt="" className="object-cover" fill sizes="40px" src={url} /> : initials}
    </span>
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
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
          open || projectId ? "border-brand bg-brand-soft text-brand-dark" : "border-brand-border bg-white text-ink hover:bg-[#f7f9fb]"
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
            ? "absolute top-[calc(100%+6px)] left-0 z-50 w-[min(88vw,240px)] rounded-md border border-brand-border bg-white p-1.5 shadow-lg"
            : "hidden"
        }
        id={menuId}
      >
        <button
          className="min-h-10 w-full rounded-md px-2 text-start text-sm font-medium text-ink hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-brand"
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
          className="mt-1 min-h-10 w-full rounded-md border border-brand-border px-3 text-sm focus-visible:outline-2 focus-visible:outline-brand"
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
                  className="min-h-10 w-full rounded-md px-2 text-start text-sm text-ink hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-brand"
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
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
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
        className="grid size-10 place-items-center rounded-md text-muted hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <MoreIcon />
      </button>
      <div
        className={
          open
            ? "absolute top-full right-0 z-100 w-52 rounded-md border border-brand-border bg-white p-1 shadow-lg"
            : "hidden"
        }
        id={menuId}
        role="menu"
      >
        <button
          className="min-h-10 w-full rounded-md px-3 text-start text-sm font-medium text-ink hover:bg-[#f4f6f8] focus-visible:outline-2 focus-visible:outline-brand"
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
function SearchIcon() { return <svg aria-hidden className="size-[18px]" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" /><path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" /></svg>; }
function ChevronIcon() { return <svg aria-hidden className="size-3.5" fill="none" viewBox="0 0 12 12"><path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg>; }
function MoreIcon() { return <svg aria-hidden className="size-5" fill="currentColor" viewBox="0 0 20 20"><circle cx="4.5" cy="10" r="1.4" /><circle cx="10" cy="10" r="1.4" /><circle cx="15.5" cy="10" r="1.4" /></svg>; }
function ChatIcon() { return <svg aria-hidden className="size-8" fill="none" viewBox="0 0 32 32"><path d="M8 9.5h16A3.5 3.5 0 0 1 27.5 13v7A3.5 3.5 0 0 1 24 23.5H16l-5.5 4v-4H8A3.5 3.5 0 0 1 4.5 20v-7A3.5 3.5 0 0 1 8 9.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" /></svg>; }
