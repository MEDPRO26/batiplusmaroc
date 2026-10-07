"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";

const PAGE_SIZE = 20;
const MAX_NOTE_LENGTH = 5_000;

type Note = FunctionReturnType<
  typeof api.admin.companyNotes.listCompanyAdminNotes
>["page"][number];

export function deduplicateAdminNotes(notes: readonly Note[]) {
  return [...new Map(notes.map((note) => [note.id, note])).values()];
}

export function CompanyAdminNotes({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("adminNotes");
  const locale = useLocale();
  const createNote = useMutation(api.admin.companyNotes.createCompanyAdminNote);
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.companyNotes.listCompanyAdminNotes,
    { companyId },
    { initialNumItems: PAGE_SIZE },
  );
  const notes = useMemo(() => deduplicateAdminNotes(results), [results]);
  const inputId = useId();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const sendingRef = useRef(false);
  const trimmed = body.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || trimmed.length > MAX_NOTE_LENGTH || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(false);
    try {
      await createNote({ companyId, body: trimmed });
      setBody("");
    } catch {
      setError(true);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
      <section className="min-w-0 rounded-[16px] border border-[#e7eaee] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-sm bg-[#fff6dd] text-[#8a5b00]">
            <PrivateNoteIcon />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 text-lg font-semibold text-[#202428]">{t("title")}</h2>
            <p className="mt-1 mb-0 text-sm leading-6 text-[#626970]">{t("privateLead")}</p>
          </div>
        </div>

        {status === "LoadingFirstPage" ? (
          <div aria-busy="true" aria-label={t("loading")} className="mt-5 space-y-3" role="status">
            <div className="skeleton-block h-28 rounded-[14px]" />
            <div className="skeleton-block h-24 rounded-[14px]" />
          </div>
        ) : notes.length === 0 ? (
          <p className="mt-5 rounded-[14px] bg-[#f7f9fb] px-4 py-8 text-center text-sm text-[#626970]">{t("empty")}</p>
        ) : (
          <ol aria-label={t("listLabel")} aria-live="polite" className="mt-5 grid list-none gap-3 p-0">
            {notes.map((note) => (
              <li className="min-w-0 rounded-[14px] border border-[#e7eaee] bg-[#fbfcfd] p-4" data-admin-note={note.id} key={note.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-[#202428]">{note.authorDisplayName}</span>
                  <time className="text-xs text-[#7a8189]" dateTime={new Date(note.createdAt).toISOString()}>
                    {formatMarketplaceDateTime(note.createdAt, locale, { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </div>
                <p className="mt-3 mb-0 whitespace-pre-wrap break-words text-sm leading-6 text-[#34393f]">{note.body}</p>
              </li>
            ))}
          </ol>
        )}

        {status === "CanLoadMore" || status === "LoadingMore" ? (
          <button
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-sm border border-[#d9dee4] bg-white px-4 text-sm font-semibold text-[#2456c7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(PAGE_SIZE)}
            type="button"
          >
            {status === "LoadingMore" ? t("loadingMore") : t("loadMore")}
          </button>
        ) : null}
      </section>

      <aside className="self-start rounded-[16px] border border-[#e7eaee] bg-white p-4 shadow-sm sm:p-5 xl:sticky xl:top-24">
        <h3 className="m-0 text-base font-semibold text-[#202428]">{t("composerTitle")}</h3>
        <p className="mt-1.5 mb-0 text-sm leading-6 text-[#626970]">{t("immutableHelp")}</p>
        <form className="mt-4 grid gap-2" onSubmit={submit}>
          <label className="text-sm font-semibold text-[#202428]" htmlFor={inputId}>{t("label")}</label>
          <textarea
            aria-describedby={`${inputId}-help ${inputId}-count${error ? ` ${inputId}-error` : ""}`}
            className="min-h-36 w-full resize-y rounded-[14px] border border-[#d9dee4] bg-white px-4 py-3 text-base leading-6 text-[#202428] outline-none placeholder:text-[#8b919a] focus:border-[#2f6bff] focus:ring-2 focus:ring-[#2f6bff]/15 disabled:bg-[#f4f6f8] sm:text-sm"
            disabled={sending}
            id={inputId}
            maxLength={MAX_NOTE_LENGTH}
            onChange={(event) => {
              setBody(event.target.value);
              if (error) setError(false);
            }}
            placeholder={t("placeholder")}
            value={body}
          />
          <span className="sr-only" id={`${inputId}-help`}>{t("plainTextHelp")}</span>
          <span className={body.length >= 4_500 ? "text-right text-xs text-[#626970]" : "sr-only"} id={`${inputId}-count`}>
            {t("characterCount", { count: body.length, maximum: MAX_NOTE_LENGTH })}
          </span>
          {error ? <p className="m-0 rounded-sm bg-red-50 px-3 py-2 text-sm text-red-800" id={`${inputId}-error`} role="alert">{t("createError")}</p> : null}
          <button
            className="mt-1 inline-flex min-h-11 items-center justify-center rounded-sm bg-[#2f6bff] px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2f6bff] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={sending || !trimmed}
            type="submit"
          >
            {sending ? t("adding") : t("add")}
          </button>
        </form>
      </aside>
    </div>
  );
}

function PrivateNoteIcon() {
  return <svg className="size-5" fill="none" viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12a1 1 0 0 1 1 1v8H5v-8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" /></svg>;
}
