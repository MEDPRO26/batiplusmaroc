"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { ArrowLeft, MapPin, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminPage, ADMIN_PRESS } from "@/features/admin/components/admin-shell";
import { SupportBoundary, SupportThread, SupportUnreadBadge } from "@/features/client-support/components/support-thread";
import {
  createSupportDraftStore,
  supportEventLabelKey,
  supportInboxState,
  SUPPORT_INBOX_PAGE_SIZE,
  type SupportDraftStore,
  type SupportSummary,
} from "@/features/client-support/lib/support-thread";
import { useRouter } from "@/i18n/navigation";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { routes } from "@/lib/routes";
import { AdminAgreementPanel } from "@/features/coordination-agreements/components/admin-agreement-panel";

const SECONDARY = `inline-flex min-h-10 items-center justify-center gap-1.5 rounded-sm border border-[#e6e9ee] bg-white px-4 text-sm font-semibold text-[#17191d] hover:bg-[#f7f9fc] disabled:opacity-50 ${ADMIN_PRESS}`;
const PANE = "min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#e7eaee] bg-white";

/**
 * Admin support workspace. The selected thread lives in the URL as `projectId`,
 * so deep links and refreshes resolve through `getAdminConversation` without
 * depending on the request being in a loaded inbox page.
 */
export function AdminSupportPanel({ initialProjectId }: { initialProjectId: string | null }) {
  const t = useTranslations("clientSupport.admin");
  const router = useRouter();
  const [drafts] = useState(createSupportDraftStore);
  const [selected, setSelected] = useState(initialProjectId);
  const [linkedProjectId, setLinkedProjectId] = useState(initialProjectId);
  const threadRef = useRef<HTMLElement>(null);
  const inboxRef = useRef<HTMLElement>(null);
  // Follow navigations that change the query while this page stays mounted.
  if (linkedProjectId !== initialProjectId) {
    setLinkedProjectId(initialProjectId);
    setSelected(initialProjectId);
  }

  function select(projectId: string | null) {
    setSelected(projectId);
    router.replace(
      { pathname: routes.adminSupport, query: projectId ? { projectId } : {} },
      { scroll: false },
    );
    // On small screens only one pane is shown: move focus with the view.
    window.requestAnimationFrame(() => (projectId ? threadRef : inboxRef).current?.focus({ preventScroll: true }));
  }

  return (
    <AdminPage breadcrumb={t("title")} title={t("title")}>
      <p className="max-w-3xl text-sm leading-6 text-pretty text-[#626970]">{t("lead")}</p>
      <SupportBoundary
        fallback={(retry) => (
          <Notice lead={t("inboxDeniedLead")} title={t("inboxDeniedTitle")}>
            <button className={SECONDARY} onClick={retry} type="button">{t("retry")}</button>
          </Notice>
        )}
        resetKey="inbox"
      >
        <AdminSupportWorkspace
          drafts={drafts}
          inboxRef={inboxRef}
          onSelect={select}
          selected={selected}
          threadRef={threadRef}
        />
      </SupportBoundary>
    </AdminPage>
  );
}

type InboxPage = {
  results: SupportSummary[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: (numItems: number) => void;
};

/** Both panes use the same cursor state; an empty filtered page is still loading. */
function AdminSupportWorkspace({ drafts, inboxRef, onSelect, selected, threadRef }: {
  drafts: SupportDraftStore;
  inboxRef: RefObject<HTMLElement | null>;
  onSelect: (projectId: string | null) => void;
  selected: string | null;
  threadRef: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("clientSupport.admin");
  const page = usePaginatedQuery(
    api.clientSupport.index.listAdminConversations,
    {},
    { initialNumItems: SUPPORT_INBOX_PAGE_SIZE },
  );
  const { results, status, loadMore } = page;
  const state = supportInboxState(status, results.length);
  // A page emptied by the backend's relationship filter is progress, not the end.
  useEffect(() => {
    if (state === "continue") loadMore(SUPPORT_INBOX_PAGE_SIZE);
  }, [loadMore, state]);

  return (
    <div className="grid min-h-0 gap-4 lg:h-[calc(100dvh-13.5rem)] lg:min-h-[32rem] lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section
        aria-label={t("inboxLabel")}
        className={`${PANE} outline-none ${selected ? "hidden lg:flex" : "flex"}`}
        ref={inboxRef}
        tabIndex={-1}
      >
        <AdminSupportInbox onSelect={onSelect} page={page} selectedProjectId={selected} />
      </section>
      <section
        aria-label={t("conversationLabel")}
        className={`${PANE} h-[calc(100dvh-11rem)] min-h-[28rem] outline-none lg:h-auto ${selected ? "flex" : "hidden lg:flex"}`}
        ref={threadRef}
        tabIndex={-1}
      >
        {selected ? (
          <>
            <div className="border-b border-[#eef1f4] px-2 py-1 lg:hidden">
              <button
                className={`inline-flex min-h-11 items-center gap-2 rounded-sm px-3 text-sm font-semibold text-[#2f6bff] ${ADMIN_PRESS}`}
                onClick={() => onSelect(null)}
                type="button"
              >
                <ArrowLeft aria-hidden className="size-4" />
                {t("backToRequests")}
              </button>
            </div>
            <SupportBoundary
              fallback={(retry) => (
                <Notice lead={t("deniedLead")} title={t("deniedTitle")}>
                  <button className={SECONDARY} onClick={retry} type="button">{t("retry")}</button>
                </Notice>
              )}
              resetKey={selected}
            >
              <AdminSupportConversation drafts={drafts} key={selected} projectId={selected} />
            </SupportBoundary>
          </>
        ) : (
          state === "empty" ? (
            <Notice lead={t("emptyLead")} title={t("emptyTitle")} />
          ) : state === "list" ? (
            <Notice lead={t("selectLead")} title={t("selectTitle")} />
          ) : (
            <div aria-busy="true" className="flex flex-1">
              <Notice lead={t("loadingLead")} title={t("loading")} />
            </div>
          )
        )}
      </section>
    </div>
  );
}

function AdminSupportInbox({
  selectedProjectId,
  onSelect,
  page,
}: {
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
  page: InboxPage;
}) {
  const t = useTranslations("clientSupport.admin");
  const { results, status, loadMore } = page;
  const state = supportInboxState(status, results.length);

  return (
    <>
      <h2 className="m-0 border-b border-[#eef1f4] px-4 py-3.5 text-sm font-semibold text-[#17191d] sm:px-5">
        {t("inboxTitle")}
      </h2>
      {state === "loading" || state === "continue" ? (
        <div aria-busy="true" aria-label={t("loading")} className="space-y-2 p-4" role="status">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="h-[4.5rem] animate-pulse rounded-[10px] bg-[#f4f6f8]" key={index} />
          ))}
        </div>
      ) : state === "empty" ? (
        <Notice lead={t("emptyLead")} title={t("emptyTitle")} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ul className="m-0 list-none divide-y divide-[#eef1f4] p-0">
            {results.map((summary) => (
              <li key={summary.id}>
                <InboxRow
                  onSelect={() => onSelect(summary.project.id)}
                  selected={summary.project.id === selectedProjectId}
                  summary={summary}
                />
              </li>
            ))}
          </ul>
          {status === "CanLoadMore" || status === "LoadingMore" ? (
            <div className="flex justify-center border-t border-[#eef1f4] p-3">
              <button
                className={SECONDARY}
                disabled={status === "LoadingMore"}
                onClick={() => loadMore(SUPPORT_INBOX_PAGE_SIZE)}
                type="button"
              >
                {status === "LoadingMore" ? t("loadingMore") : t("loadMore")}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

function InboxRow({
  summary,
  selected,
  onSelect,
}: {
  summary: SupportSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("clientSupport");
  const locale = useLocale();
  const last = summary.lastEntry;
  const preview = !last
    ? null
    : last.kind === "request"
      ? t(supportEventLabelKey(last.eventKey))
      : t(last.senderType === "client" ? "admin.lastEntryClient" : "admin.lastEntryTeam", { preview: last.preview });
  return (
    <button
      aria-current={selected ? "true" : undefined}
      className="flex w-full cursor-pointer flex-col gap-1 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-[#f7f9fc] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#2f6bff] aria-[current=true]:bg-[#eef3ff] sm:px-5"
      onClick={onSelect}
      type="button"
    >
      <span className="flex items-start justify-between gap-3">
        <span className={`min-w-0 truncate text-sm text-[#17191d] ${summary.hasUnread ? "font-semibold" : "font-medium"}`}>
          {summary.project.title ?? t("admin.untitledProject")}
        </span>
        <SupportUnreadBadge count={summary.unreadCount} label={t("admin.unread", { count: summary.unreadCount })} />
      </span>
      <span className="truncate text-xs text-[#626970]">
        {summary.clientDisplayName || t("admin.clientFallback")}
      </span>
      {preview ? <span className="line-clamp-2 text-xs leading-5 text-[#626970]">{preview}</span> : null}
      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <KindChips kinds={summary.requestedKinds} />
        {last ? (
          <time className="ml-auto text-[11px] text-[#626970] tabular-nums" dateTime={new Date(last.createdAt).toISOString()}>
            {formatMarketplaceDateTime(last.createdAt, locale, { dateStyle: "medium", timeStyle: "short" })}
          </time>
        ) : null}
      </span>
    </button>
  );
}

function KindChips({ kinds }: { kinds: SupportSummary["requestedKinds"] }) {
  const t = useTranslations("clientSupport.kinds");
  return kinds.map((kind) => (
    <span className="rounded-sm bg-[#f2f4f7] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-[#475467]" key={kind}>
      {t(kind)}
    </span>
  ));
}

function AdminSupportConversation({ projectId, drafts }: { projectId: string; drafts: SupportDraftStore }) {
  const t = useTranslations("clientSupport.admin");
  const tProjects = useTranslations("adminProjects");
  const tWizard = useTranslations("projectWizard");
  const tAgreement = useTranslations("coordinationAgreement");
  const [summaryOpen, setSummaryOpen] = useState(false);
  // An ID the backend cannot validate throws and is handled by the boundary above.
  const conversation = useQuery(api.clientSupport.index.getAdminConversation, {
    projectId: projectId as Id<"projects">,
  });

  if (conversation === undefined) {
    return (
      <div aria-busy="true" aria-label={t("loading")} className="space-y-3 p-5" role="status">
        <div className="h-16 animate-pulse rounded-sm bg-[#f4f6f8]" />
        <div className="h-56 animate-pulse rounded-sm bg-[#f4f6f8]" />
      </div>
    );
  }
  if (conversation === null) return <Notice lead={t("noThreadLead")} title={t("noThreadTitle")} />;

  const { project } = conversation;
  const cityKey = `cityOptions.${project.city}` as "cityOptions.agadir";
  return (
    <>
      <header aria-label={t("contextLabel")} className="border-b border-[#eef1f4] px-4 py-3.5 sm:px-6">
        <h2 className="m-0 text-base font-semibold tracking-[-0.01em] text-balance break-words text-[#17191d]">
          {project.title ?? t("untitledProject")}
        </h2>
        <dl className="mt-1.5 mb-0 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#626970]">
          <ContextItem icon={<UserRound aria-hidden className="size-3.5" />} label={t("contextClient")}>
            {conversation.clientDisplayName || t("clientFallback")}
          </ContextItem>
          <ContextItem icon={<MapPin aria-hidden className="size-3.5" />} label={t("contextCity")}>
            {project.city ? (tWizard.has(cityKey) ? tWizard(cityKey) : project.city) : t("notProvided")}
          </ContextItem>
          <ContextItem label={t("contextStatus")}>{tProjects(`status.${project.status}`)}</ContextItem>
          <ContextItem label={t("contextRequested")}>
            <span className="inline-flex flex-wrap gap-1.5"><KindChips kinds={conversation.requestedKinds} /></span>
          </ContextItem>
        </dl>
      </header>
      <div className="flex gap-2 border-b border-brand-border px-4 py-2" role="tablist" aria-label={tAgreement("workspaceTabs")} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const next = event.key === "Home" ? false : event.key === "End" ? true : !summaryOpen;
        setSummaryOpen(next); event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next ? 1 : 0]?.focus();
      }}>
        <button aria-controls="support-messages-pane" aria-selected={!summaryOpen} className={SECONDARY} id="support-messages-tab" onClick={() => setSummaryOpen(false)} role="tab" tabIndex={summaryOpen ? -1 : 0} type="button">{tAgreement("messagesTab")}</button>
        <button aria-controls="support-summary-pane" aria-selected={summaryOpen} className={SECONDARY} id="support-summary-tab" onClick={() => setSummaryOpen(true)} role="tab" tabIndex={summaryOpen ? 0 : -1} type="button">{tAgreement("title")}</button>
      </div>
      <div aria-labelledby="support-messages-tab" className={!summaryOpen ? "flex min-h-0 flex-1 flex-col" : "hidden"} id="support-messages-pane" role="tabpanel">
        <SupportThread active={!summaryOpen} conversation={conversation} drafts={drafts} key={conversation.id} role="admin" />
      </div>
      <div aria-labelledby="support-summary-tab" className={summaryOpen ? "min-h-0 flex-1 overflow-y-auto" : "hidden"} id="support-summary-pane" role="tabpanel">
        <AdminAgreementPanel active={summaryOpen} key={projectId} projectId={conversation.project.id} />
      </div>
    </>
  );
}

function ContextItem({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="inline-flex min-w-0 items-center gap-1.5">
      <dt className={icon ? "sr-only" : "text-[#8b919a]"}>{label}</dt>
      {icon}
      <dd className="m-0 min-w-0 break-words text-[#17191d]">{children}</dd>
    </div>
  );
}

function Notice({ title, lead, children }: { title: string; lead: string; children?: ReactNode }) {
  return (
    <div className="grid flex-1 place-content-center justify-items-center gap-1.5 px-6 py-14 text-center">
      <p className="m-0 text-base font-semibold text-balance text-[#17191d]">{title}</p>
      <p className="m-0 max-w-sm text-sm leading-6 text-pretty text-[#626970]">{lead}</p>
      {children ? <div className="mt-3 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}
