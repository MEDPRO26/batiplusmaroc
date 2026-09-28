"use client";

import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";

const MAX_MESSAGE_LENGTH = 5_000;
const PAGE_SIZE = 30;

export type OperationalConversationSummary = NonNullable<
  FunctionReturnType<typeof api.adminCompanyMessaging.getMyConversation>
>;
export type OperationalMessage = FunctionReturnType<
  typeof api.adminCompanyMessaging.listMyMessages
>["page"][number];

type ConversationRole = "admin" | "company";

export function sortOperationalMessages(messages: readonly OperationalMessage[]) {
  return [...new Map(messages.map((message) => [message.id, message])).values()]
    .sort((left, right) => left.sequence - right.sequence);
}

export function OperationalConversation({
  conversation,
  role,
  title,
  lead,
  emptyTitle,
  emptyLead,
  emptyAction,
  onSend,
  onMarkRead,
}: {
  conversation: OperationalConversationSummary | null;
  role: ConversationRole;
  title: string;
  lead: string;
  emptyTitle: string;
  emptyLead: string;
  emptyAction: string;
  onSend: (body: string, idempotencyKey: string) => Promise<unknown>;
  onMarkRead: (messageId: Id<"adminCompanyMessages">) => Promise<unknown>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm">
      <header className="border-b border-brand-border px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="m-0 text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h2>
            <p className="mt-1.5 mb-0 max-w-3xl text-sm leading-6 text-muted">{lead}</p>
          </div>
          {conversation?.unreadCount ? <UnreadBadge count={conversation.unreadCount} /> : null}
        </div>
      </header>
      {conversation ? (
        <OperationalThread
          conversation={conversation}
          onMarkRead={onMarkRead}
          onSend={onSend}
          role={role}
        />
      ) : (
        <OperationalEmptyConversation
          action={emptyAction}
          lead={emptyLead}
          onSend={onSend}
          title={emptyTitle}
        />
      )}
    </section>
  );
}

function OperationalThread({
  conversation,
  role,
  onSend,
  onMarkRead,
}: {
  conversation: OperationalConversationSummary;
  role: ConversationRole;
  onSend: (body: string, idempotencyKey: string) => Promise<unknown>;
  onMarkRead: (messageId: Id<"adminCompanyMessages">) => Promise<unknown>;
}) {
  const t = useTranslations("operationalMessaging.thread");
  const locale = useLocale();
  const listMessages = role === "admin"
    ? api.adminCompanyMessaging.listAdminMessages
    : api.adminCompanyMessaging.listMyMessages;
  const { results, status, loadMore } = usePaginatedQuery(
    listMessages,
    { conversationId: conversation.id },
    { initialNumItems: PAGE_SIZE },
  );
  const messages = useMemo(() => sortOperationalMessages(results), [results]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const markedSequenceRef = useRef(conversation.readThroughSequence);
  const previousNewestRef = useRef(0);
  const olderLoadRef = useRef<{ count: number; scrollHeight: number } | null>(null);
  const [readError, setReadError] = useState(false);
  const newest = messages.at(-1);

  useEffect(() => {
    if (!newest || newest.sequence <= markedSequenceRef.current) return;
    markedSequenceRef.current = newest.sequence;
    setReadError(false);
    void onMarkRead(newest.id).catch(() => {
      markedSequenceRef.current = Math.max(0, newest.sequence - 1);
      setReadError(true);
    });
  }, [newest, onMarkRead]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !newest) return;
    const olderLoad = olderLoadRef.current;
    if (olderLoad && messages.length > olderLoad.count) {
      viewport.scrollTop += viewport.scrollHeight - olderLoad.scrollHeight;
      olderLoadRef.current = null;
    } else if (previousNewestRef.current === 0 || newest.sequence > previousNewestRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
    previousNewestRef.current = newest.sequence;
  }, [messages.length, newest]);

  function loadOlder() {
    const viewport = viewportRef.current;
    if (viewport) {
      olderLoadRef.current = { count: messages.length, scrollHeight: viewport.scrollHeight };
    }
    loadMore(PAGE_SIZE);
  }

  if (status === "LoadingFirstPage") {
    return <ConversationLoading />;
  }

  return (
    <>
      <div
        className="max-h-[min(60dvh,42rem)] min-h-72 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
        ref={viewportRef}
      >
        {status === "CanLoadMore" || status === "LoadingMore" ? (
          <div className="mb-4 flex justify-center">
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-brand-border bg-white px-4 text-sm font-semibold text-brand transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
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
            <OperationalMessageBubble key={message.id} locale={locale} message={message} />
          ))}
        </ol>
      </div>
      {readError ? <p className="mx-4 mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 sm:mx-6" role="alert">{t("readFailed")}</p> : null}
      <div className="border-t border-brand-border bg-[#fbfcfd] p-3 sm:p-4">
        <OperationalComposer onSend={onSend} />
      </div>
    </>
  );
}

export function OperationalMessageBubble({
  message,
  locale,
}: {
  message: OperationalMessage;
  locale: string;
}) {
  const t = useTranslations("operationalMessaging.thread");
  const timestamp = formatMarketplaceDateTime(message.createdAt, locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <li
      aria-label={message.isOwnMessage ? t("yourMessage") : undefined}
      className={`flex ${message.isOwnMessage ? "justify-end" : "justify-start"}`}
      data-operational-message={message.sequence}
    >
      <article className={`max-w-[88%] rounded-2xl px-4 py-3 sm:max-w-[72%] ${message.isOwnMessage ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-brand-border bg-[#f7f9fb] text-ink"}`}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold">
            {message.senderDisplayName || (message.senderType === "admin" ? t("senderAdmin") : t("senderCompany"))}
          </span>
          <span className={`text-[11px] ${message.isOwnMessage ? "text-white/75" : "text-muted"}`}>
            {message.senderType === "admin" ? t("senderAdmin") : t("senderCompany")}
          </span>
        </div>
        <p className="mt-1.5 mb-0 whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
        <time className={`mt-1.5 block text-right text-[11px] ${message.isOwnMessage ? "text-white/75" : "text-muted"}`} dateTime={new Date(message.createdAt).toISOString()}>
          {timestamp}
        </time>
      </article>
    </li>
  );
}

function OperationalEmptyConversation({
  title,
  lead,
  action,
  onSend,
}: {
  title: string;
  lead: string;
  action: string;
  onSend: (body: string, idempotencyKey: string) => Promise<unknown>;
}) {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="px-3 py-6 sm:px-6 sm:py-8">
      <div className="rounded-2xl bg-[#f7f9fb] px-5 py-9 text-center">
        <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-full bg-brand-soft text-brand"><ConversationIcon /></span>
        <h3 className="mt-4 mb-0 text-lg font-semibold text-ink">{title}</h3>
        <p className="mx-auto mt-2 mb-0 max-w-xl text-sm leading-6 text-muted">{lead}</p>
        <button className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand" onClick={() => composerRef.current?.focus()} type="button">{action}</button>
      </div>
      <div className="mt-4">
        <OperationalComposer onSend={onSend} textareaRef={composerRef} />
      </div>
    </div>
  );
}

export function OperationalComposer({
  onSend,
  textareaRef,
}: {
  onSend: (body: string, idempotencyKey: string) => Promise<unknown>;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const t = useTranslations("operationalMessaging.thread");
  const generatedId = useId();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const sendingRef = useRef(false);
  const attemptRef = useRef<{ body: string; key: string } | null>(null);
  const localTextareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = textareaRef ?? localTextareaRef;
  const trimmed = body.trim();
  const showCount = body.length >= 4_500;

  async function submit() {
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH || sendingRef.current) return;
    const attempt = attemptRef.current?.body === trimmed
      ? attemptRef.current
      : { body: trimmed, key: crypto.randomUUID() };
    attemptRef.current = attempt;
    sendingRef.current = true;
    setSending(true);
    setError(false);
    try {
      await onSend(attempt.body, attempt.key);
      setBody("");
      attemptRef.current = null;
    } catch {
      setError(true);
    } finally {
      sendingRef.current = false;
      setSending(false);
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
      <label className="text-sm font-semibold text-ink" htmlFor={generatedId}>{t("composerLabel")}</label>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          aria-describedby={`${generatedId}-count${error ? ` ${generatedId}-error` : ""}`}
          className="min-h-24 min-w-0 flex-1 resize-y rounded-2xl border border-brand-border bg-white px-4 py-3 text-base leading-6 text-ink outline-none placeholder:text-muted/75 focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-surface-muted sm:text-sm"
          disabled={sending}
          id={generatedId}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(event) => {
            setBody(event.target.value);
            if (error) setError(false);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("composerPlaceholder")}
          ref={inputRef}
          value={body}
        />
        <button
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-white transition-[background-color,scale] hover:bg-brand-hover active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-55"
          disabled={sending || !trimmed}
          type="submit"
        >
          {sending ? t("sending") : error ? t("retry") : t("send")}
        </button>
      </div>
      <span className={showCount ? "text-right text-xs text-muted" : "sr-only"} id={`${generatedId}-count`}>
        {t("characterCount", { count: body.length, maximum: MAX_MESSAGE_LENGTH })}
      </span>
      {error ? <p className="m-0 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800" id={`${generatedId}-error`} role="alert">{t("sendFailed")}</p> : null}
    </form>
  );
}

function ConversationLoading() {
  const t = useTranslations("operationalMessaging.thread");
  return (
    <div aria-busy="true" aria-label={t("loading")} className="space-y-3 px-4 py-8" role="status">
      <div className="skeleton-block h-16 w-3/5 rounded-2xl" />
      <div className="skeleton-block ml-auto h-20 w-2/3 rounded-2xl" />
      <div className="skeleton-block h-16 w-1/2 rounded-2xl" />
    </div>
  );
}

function UnreadBadge({ count }: { count: number }) {
  const t = useTranslations("operationalMessaging.thread");
  return (
    <span aria-label={t("unreadBadge", { count })} className="inline-flex min-h-7 items-center rounded-full bg-brand px-2.5 text-xs font-semibold text-white tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function ConversationIcon() {
  return <svg aria-hidden className="size-5" fill="none" viewBox="0 0 24 24"><path d="M5 18.5 3.5 21l.6-4A8.4 8.4 0 0 1 3 13C3 8.6 7 5 12 5s9 3.6 9 8-4 8-9 8c-2.7 0-5.2-1.1-7-2.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></svg>;
}
