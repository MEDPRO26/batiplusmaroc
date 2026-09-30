"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ADMIN_PRESS, AdminPage } from "./admin-shell";

type Filter = "all" | "visible" | "hidden";
type Row = FunctionReturnType<typeof api.admin.reviews.listReviews>[number];

export function AdminReviewsPanel() {
  const t = useTranslations("adminReviews");
  const locale = useLocale();
  const [status, setStatus] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const rows = useQuery(api.admin.reviews.listReviews, { status, search: search.trim() || undefined });
  useEffect(() => { if (!notice) return; const id = window.setTimeout(() => setNotice(""), 4000); return () => window.clearTimeout(id); }, [notice]);
  return (
    <AdminPage breadcrumb={t("title")} notice={notice} title={t("title")}>
      <p className="max-w-3xl text-sm leading-6 text-[#626970]">{t("lead")}</p>
      <section className="rounded-[20px] border border-[#e7eaee] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div aria-label={t("filtersLabel")} className="flex gap-1" role="tablist">
            {(["all", "visible", "hidden"] as const).map((item) => <button aria-selected={status === item} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${ADMIN_PRESS} ${status === item ? "bg-[#2f6bff] text-white" : "bg-[#f4f6f8] text-[#626970]"}`} key={item} onClick={() => setStatus(item)} role="tab" type="button">{t(`status.${item}`)}</button>)}
          </div>
          <label className="flex min-h-11 min-w-64 items-center rounded-full bg-[#f4f6f8] px-3 text-sm"><span className="sr-only">{t("searchLabel")}</span><input className="h-11 w-full bg-transparent outline-none" onChange={(event) => setSearch(event.target.value)} placeholder={t("searchPlaceholder")} value={search} /></label>
        </div>
        {rows === undefined ? <p className="py-12 text-center text-sm text-[#8b919a]">{t("loading")}</p> : rows.length === 0 ? <p className="py-12 text-center text-sm text-[#8b919a]">{t("empty")}</p> : <div className="mt-5 grid gap-3">{rows.map((row) => <ReviewRow key={row.reviewId} locale={locale} onChanged={(next) => setNotice(t(next === "hidden" ? "hiddenSuccess" : "restoredSuccess"))} row={row} />)}</div>}
      </section>
    </AdminPage>
  );
}

function ReviewRow({ row, locale, onChanged }: { row: Row; locale: string; onChanged: (status: "visible" | "hidden") => void }) {
  const t = useTranslations("adminReviews");
  const setVisibility = useMutation(api.admin.reviews.setReviewVisibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = row.moderationStatus === "visible" ? "hidden" : "visible";
  async function update() {
    setBusy(true); setError("");
    try { await setVisibility({ reviewId: row.reviewId as Id<"reviews">, status: next }); onChanged(next); }
    catch { setError(t("error")); }
    finally { setBusy(false); }
  }
  return (
    <article className="rounded-[16px] bg-[#f8fafb] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="m-0 font-semibold text-[#17191d]">{row.companyName}</h2><Status status={row.moderationStatus} /><span aria-label={t("ratingOutOfFive", { rating: row.rating })} className="font-semibold text-amber-600">{"★".repeat(row.rating)}<span className="text-slate-300">{"★".repeat(5 - row.rating)}</span></span></div><p className="mt-1 text-sm text-[#626970]">{row.projectTitle} · {row.clientName} · {date(row.createdAt, locale)}</p></div>
        <button className={`min-h-10 shrink-0 rounded-full border bg-white px-4 text-sm font-semibold ${ADMIN_PRESS}`} disabled={busy} onClick={() => void update()} type="button">{busy ? t("saving") : t(next === "hidden" ? "hide" : "restore")}</button>
      </div>
      <p className="mt-4 mb-0 whitespace-pre-wrap text-sm leading-6 text-[#30343a]">{row.comment}</p>
      {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
    </article>
  );
}

function Status({ status }: { status: "visible" | "hidden" }) { const t = useTranslations("adminReviews"); return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === "visible" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{t(`status.${status}`)}</span>; }
function date(value: number, locale: string) { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Casablanca" }).format(value); }
