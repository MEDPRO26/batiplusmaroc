"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { LifeBuoy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  Component,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { api } from "@/convex/_generated/api";
import { SUPPORT_MAX_BODY_LENGTH } from "@/convex/clientSupport/constants";
import {
  mergeSupportMessages,
  newestVisibleMessage,
  shouldMarkSupportRead,
  supportEventLabelKey,
  SUPPORT_MESSAGE_PAGE_SIZE,
  type SupportDraftStore,
  type SupportMessage,
  type SupportRole,
  type SupportSummary,
} from "@/features/client-support/lib/support-thread";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { describeAppError } from "@/lib/errors";

/** Distance from the bottom within which a new entry keeps the reader pinned there. */
const STICK_TO_BOTTOM_PX = 120;

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function useDocumentVisible() {
  return useSyncExternalStore(
    subscribeToVisibility,
    () => document.visibilityState === "visible",
    () => false,
  );
}

/**
 * One Client–Batiplus thread. The role only selects which isolated API wrappers
 * are called; the backend re-checks access on every call.
 */
export function SupportThread({
  conversation,
  role,
  drafts,
  active = true,
  compact = false,
}: {
  conversation: SupportSummary;
  role: SupportRole;
  drafts: SupportDraftStore;
  active?: boolean;
  /** Client workspace presentation; other screens keep the default look. */
  compact?: boolean;
}) {
  const t = useTranslations("clientSupport.thread");
  const locale = useLocale();
  const admin = role === "admin";
  const { results, status, loadMore } = usePaginatedQuery(
    admin ? api.clientSupport.index.listAdminMessages : api.clientSupport.index.listMyMessages,
    { conversationId: conversation.id },
    { initialNumItems: SUPPORT_MESSAGE_PAGE_SIZE },
  );
  const markRead = useMutation(
    admin
      ? api.clientSupport.index.markAdminConversationRead
      : api.clientSupport.index.markMyConversationRead,
  );
  const messages = useMemo(() => mergeSupportMessages(results), [results]);
  const documentVisible = useDocumentVisible() && active;
  const viewportRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef(new Set<string>());
  const markedSequenceRef = useRef(0);
  const previousNewestRef = useRef(0);
  const olderLoadRef = useRef<{ count: number; scrollHeight: number } | null>(null);
  const [seenVersion, setSeenVersion] = useState(0);
  const [readError, setReadError] = useState(false);
  const newest = messages.at(-1);

  // Entries count as seen only while their end is on screen in a foreground tab.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !documentVisible || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.supportSeen;
        if (entry.isIntersecting && id && !seenIdsRef.current.has(id)) {
          seenIdsRef.current.add(id);
          changed = true;
        }
      }
      if (changed) setSeenVersion((version) => version + 1);
    });
    viewport.querySelectorAll("[data-support-seen]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [documentVisible, messages]);

  useEffect(() => {
    const candidate = newestVisibleMessage(messages, seenIdsRef.current);
    if (!candidate || !shouldMarkSupportRead({
      candidateSequence: candidate.sequence,
      readThroughSequence: conversation.readThroughSequence,
      markedSequence: markedSequenceRef.current,
      documentVisible,
    })) return;
    markedSequenceRef.current = candidate.sequence;
    void markRead({ conversationId: conversation.id, readThroughMessageId: candidate.id }).then(
      () => setReadError(false),
      () => {
        // Allow the same position to be acknowledged again on the next change.
        markedSequenceRef.current = Math.min(markedSequenceRef.current, candidate.sequence - 1);
        setReadError(true);
      },
    );
  }, [conversation.id, conversation.readThroughSequence, documentVisible, markRead, messages, seenVersion]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !newest) return;
    const olderLoad = olderLoadRef.current;
    if (olderLoad && messages.length > olderLoad.count) {
      // Older entries were prepended: keep the entry the reader was on in place.
      viewport.scrollTop += viewport.scrollHeight - olderLoad.scrollHeight;
      olderLoadRef.current = null;
    } else if (previousNewestRef.current === 0) {
      viewport.scrollTop = viewport.scrollHeight;
    } else if (newest.sequence > previousNewestRef.current) {
      const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      if (newest.isOwnMessage || distance < STICK_TO_BOTTOM_PX + viewport.clientHeight / 2) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
    previousNewestRef.current = newest.sequence;
  }, [messages.length, newest]);

  function loadOlder() {
    const viewport = viewportRef.current;
    if (viewport) {
      olderLoadRef.current = { count: messages.length, scrollHeight: viewport.scrollHeight };
    }
    loadMore(SUPPORT_MESSAGE_PAGE_SIZE);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {status === "LoadingFirstPage" ? (
        <div aria-busy="true" aria-label={t("loading")} className="flex-1 space-y-3 px-4 py-6 sm:px-6" role="status">
          <div className={`skeleton-block h-16 w-3/5 ${compact ? "rounded-sm" : "rounded-2xl"}`} />
          <div className={`skeleton-block ml-auto h-20 w-2/3 ${compact ? "rounded-sm" : "rounded-2xl"}`} />
          <div className={`skeleton-block h-16 w-1/2 ${compact ? "rounded-sm" : "rounded-2xl"}`} />
        </div>
      ) : (
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
          data-support-viewport
          ref={viewportRef}
        >
          {status === "CanLoadMore" || status === "LoadingMore" ? (
            <div className="mb-4 flex justify-center">
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-sm border border-brand-border bg-white px-4 text-sm font-semibold text-brand transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
                disabled={status === "LoadingMore"}
                onClick={loadOlder}
                type="button"
              >
                {status === "LoadingMore" ? t("loadingOlder") : t("loadOlder")}
              </button>
            </div>
          ) : null}
          <ol aria-label={t("messageList")} aria-live="polite" className="m-0 flex list-none flex-col gap-3 p-0">
            {messages.map((message) => (
              <SupportEntry compact={compact} key={message.id} locale={locale} message={message} />
            ))}
          </ol>
        </div>
      )}
      {readError ? (
        <p className={`mx-4 mb-3 bg-red-50 px-3 py-2 text-sm text-red-800 sm:mx-6 ${compact ? "rounded-sm" : "rounded-[10px]"}`} role="alert">
          {t("readFailed")}
        </p>
      ) : null}
      <div className="border-t border-brand-border bg-[#fbfcfd] p-3 sm:p-4">
        <SupportComposer compact={compact} conversationId={conversation.id} drafts={drafts} role={role} />
      </div>
    </div>
  );
}

/** Renders human text and translated request events; never raw HTML. */
export function SupportEntry({ message, locale, compact = false }: { message: SupportMessage; locale: string; compact?: boolean }) {
  const t = useTranslations("clientSupport");
  const timestamp = formatMarketplaceDateTime(message.createdAt, locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const roleLabel = message.senderType === "admin" ? t("thread.senderAdmin") : t("thread.senderClient");
  const name = message.senderDisplayName || roleLabel;
  const seenMarker = <span aria-hidden className="block h-px" data-support-seen={message.id} />;

  if (compact && message.kind === "request") {
    // A quiet marker between hairlines: requests are context, not conversation.
    return (
      <li className="flex items-center gap-3 py-1" data-support-entry={message.sequence}>
        <span aria-hidden className="h-px min-w-4 flex-1 bg-brand-border" />
        <div className="min-w-0 text-center text-xs leading-5 text-muted">
          <p className="m-0 inline-flex items-center gap-1.5 font-semibold text-ink">
            <LifeBuoy aria-hidden className="size-3.5 shrink-0 text-brand" />
            {t(supportEventLabelKey(message.eventKey))}
          </p>
          <p className="m-0 break-words tabular-nums">{t("thread.requestMeta", { name, date: timestamp })}</p>
          {seenMarker}
        </div>
        <span aria-hidden className="h-px min-w-4 flex-1 bg-brand-border" />
      </li>
    );
  }

  if (compact && message.kind === "message") {
    const mine = message.isOwnMessage;
    return (
      <li
        aria-label={mine ? t("thread.yourMessage") : undefined}
        className={`flex ${mine ? "justify-end" : "justify-start"}`}
        data-support-entry={message.sequence}
      >
        <article className={`max-w-[88%] min-w-0 rounded-sm px-3.5 py-2.5 sm:max-w-[70%] ${mine ? "bg-brand text-white" : "border border-brand-border bg-white text-ink"}`}>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[13px] font-semibold break-words">{name}</span>
            {message.senderDisplayName ? (
              <span className={`text-xs ${mine ? "text-white/80" : "text-muted"}`}>{roleLabel}</span>
            ) : null}
            <time
              className={`ml-auto pl-3 text-xs tabular-nums ${mine ? "text-white/80" : "text-muted"}`}
              dateTime={new Date(message.createdAt).toISOString()}
            >
              {timestamp}
            </time>
          </div>
          <p className="mt-1 mb-0 text-[0.9375rem] leading-6 break-words whitespace-pre-wrap">{message.body}</p>
          {seenMarker}
        </article>
      </li>
    );
  }

  if (message.kind === "request") {
    return (
      <li className="flex justify-center" data-support-entry={message.sequence}>
        <div className="flex max-w-full items-start gap-2.5 rounded-sm bg-brand-soft px-3.5 py-2.5 text-brand-dark">
          <LifeBuoy aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="m-0 text-sm font-semibold">{t(supportEventLabelKey(message.eventKey))}</p>
            <p className="m-0 mt-0.5 text-xs break-words">
              {t("thread.requestMeta", { name, date: timestamp })}
            </p>
            {seenMarker}
          </div>
        </div>
      </li>
    );
  }

  const own = message.isOwnMessage;
  return (
    <li
      aria-label={own ? t("thread.yourMessage") : undefined}
      className={`flex ${own ? "justify-end" : "justify-start"}`}
      data-support-entry={message.sequence}
    >
      <article className={`max-w-[88%] rounded-2xl px-4 py-3 sm:max-w-[72%] ${own ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-brand-border bg-[#f7f9fb] text-ink"}`}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold break-words">{name}</span>
          {message.senderDisplayName ? (
            <span className={`text-[11px] ${own ? "text-white/75" : "text-muted"}`}>{roleLabel}</span>
          ) : null}
        </div>
        <p className="mt-1.5 mb-0 text-sm leading-6 break-words whitespace-pre-wrap">{message.body}</p>
        <time
          className={`mt-1.5 block text-right text-[11px] tabular-nums ${own ? "text-white/75" : "text-muted"}`}
          dateTime={new Date(message.createdAt).toISOString()}
        >
          {timestamp}
        </time>
        {seenMarker}
      </article>
    </li>
  );
}

export function SupportComposer({
  conversationId,
  role,
  drafts,
  compact = false,
}: {
  conversationId: SupportSummary["id"];
  role: SupportRole;
  drafts: SupportDraftStore;
  compact?: boolean;
}) {
  const t = useTranslations("clientSupport.thread");
  const tUx = useTranslations("ux");
  const send = useMutation(
    role === "admin"
      ? api.clientSupport.index.sendAdminMessage
      : api.clientSupport.index.sendClientMessage,
  );
  const fieldId = useId();
  const [body, setBody] = useState(() => drafts.body(conversationId));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const sendingRef = useRef(false);
  const aliveRef = useRef(true);
  const trimmed = body.trim();
  const showCount = body.length >= SUPPORT_MAX_BODY_LENGTH - 500;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  async function submit() {
    if (!trimmed || trimmed.length > SUPPORT_MAX_BODY_LENGTH || sendingRef.current) return;
    const attempt = drafts.attempt(conversationId, trimmed, () => crypto.randomUUID());
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      await send({ conversationId, body: attempt.body, idempotencyKey: attempt.key });
      drafts.settle(attempt);
      // The thread may have been switched while the request was in flight.
      if (aliveRef.current) setBody("");
    } catch (cause) {
      if (!aliveRef.current) return;
      const described = describeAppError(cause, { logUnknown: false });
      setError(
        described.code === "UNKNOWN" || described.code === "NETWORK"
          ? t("sendFailed")
          : tUx(described.messageKey),
      );
    } finally {
      sendingRef.current = false;
      if (aliveRef.current) setSending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  }

  return (
    <form className="grid gap-2" onSubmit={onSubmit}>
      <label className="text-sm font-semibold text-ink" htmlFor={fieldId}>{t("composerLabel")}</label>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          aria-describedby={`${fieldId}-hint ${fieldId}-count${error ? ` ${fieldId}-error` : ""}`}
          aria-invalid={error ? true : undefined}
          className={`min-w-0 flex-1 resize-y border border-brand-border bg-white text-base leading-6 text-ink outline-none placeholder:text-muted/75 focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-surface-muted sm:text-sm ${compact ? "min-h-[4.25rem] rounded-sm px-3.5 py-2.5" : "min-h-20 rounded-2xl px-4 py-3"}`}
          disabled={sending}
          data-support-composer={conversationId}
          id={fieldId}
          maxLength={SUPPORT_MAX_BODY_LENGTH}
          onChange={(event) => {
            setBody(event.target.value);
            drafts.setBody(conversationId, event.target.value);
            if (error) setError("");
          }}
          onKeyDown={onKeyDown}
          placeholder={role === "admin" ? t("composerPlaceholderAdmin") : t("composerPlaceholderClient")}
          value={body}
        />
        <button
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-sm bg-brand px-6 text-sm font-semibold text-white transition-[background-color,scale] duration-150 hover:bg-brand-hover active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-55"
          disabled={sending || !trimmed}
          type="submit"
        >
          {sending ? t("sending") : error ? t("retry") : t("send")}
        </button>
      </div>
      <p className="m-0 text-xs text-muted" id={`${fieldId}-hint`}>{t("composerHint")}</p>
      <span className={showCount ? "text-right text-xs text-muted tabular-nums" : "sr-only"} id={`${fieldId}-count`}>
        {t("characterCount", { count: body.length, maximum: SUPPORT_MAX_BODY_LENGTH })}
      </span>
      {error ? (
        <p className={`m-0 bg-red-50 px-3 py-2 text-sm text-red-800 ${compact ? "rounded-sm" : "rounded-[10px]"}`} id={`${fieldId}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function SupportUnreadBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span aria-label={label} className="inline-flex min-h-6 shrink-0 items-center rounded-sm bg-brand px-2 text-xs font-semibold text-white tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Convex queries throw when access is denied or a thread goes stale. The
 * boundary unmounts the subtree, so no previously loaded thread data stays on
 * screen, and `resetKey` clears the error when another thread is selected.
 */
export class SupportBoundary extends Component<
  { resetKey: string; fallback: (retry: () => void) => ReactNode; children: ReactNode },
  { failedKey: string | null }
> {
  state = { failedKey: null as string | null };

  static getDerivedStateFromError() {
    return { failedKey: "" };
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { failedKey: string | null },
  ) {
    if (state.failedKey === "") return { failedKey: props.resetKey };
    return state.failedKey !== null && state.failedKey !== props.resetKey ? { failedKey: null } : null;
  }

  componentDidCatch() {
    console.error("Client support could not be loaded");
  }

  render() {
    return this.state.failedKey === null
      ? this.props.children
      : this.props.fallback(() => this.setState({ failedKey: null }));
  }
}
