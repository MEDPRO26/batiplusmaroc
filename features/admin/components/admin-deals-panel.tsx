"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ADMIN_PRESS, AdminPage } from "./admin-shell";

type Row = FunctionReturnType<typeof api.admin.deals.listCommissionObligations>[number];
type Filter = "all" | "due" | "paid";

export function AdminDealsPanel() {
  const t = useTranslations("adminDeals");
  const locale = useLocale();
  const [status, setStatus] = useState<Filter>("due");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const rows = useQuery(api.admin.deals.listCommissionObligations, { status, search: search.trim() || undefined });
  useEffect(() => { if (!notice) return; const id = window.setTimeout(() => setNotice(""), 4000); return () => window.clearTimeout(id); }, [notice]);
  return (
    <AdminPage breadcrumb={t("title")} notice={notice} title={t("title")}>
      <p className="max-w-3xl text-sm leading-6 text-[#626970]">{t("lead")}</p>
      <section className="rounded-[20px] border border-[#e7eaee] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-1" role="tablist" aria-label={t("filtersLabel")}>
            {(["due", "paid", "all"] as const).map((item) => <button aria-selected={status === item} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${ADMIN_PRESS} ${status === item ? "bg-[#2f6bff] text-white" : "bg-[#f4f6f8] text-[#626970]"}`} key={item} onClick={() => setStatus(item)} role="tab" type="button">{t(`status.${item}`)}</button>)}
          </div>
          <label className="flex min-h-11 min-w-64 items-center rounded-full bg-[#f4f6f8] px-3 text-sm">
            <span className="sr-only">{t("searchLabel")}</span>
            <input className="h-11 w-full bg-transparent outline-none" onChange={(e) => setSearch(e.target.value)} placeholder={t("searchPlaceholder")} value={search} />
          </label>
        </div>
        {rows === undefined ? <p className="py-12 text-center text-sm text-[#8b919a]">{t("loading")}</p> : rows.length === 0 ? <p className="py-12 text-center text-sm text-[#8b919a]">{t("empty")}</p> : <>
          <div className="mt-5 grid gap-3 md:hidden">{rows.map((row) => <DealCard key={row.dealId} locale={locale} onOpen={() => setSelected(row)} row={row} t={t} />)}</div>
          <div className="mt-5 hidden overflow-x-auto md:block"><table className="min-w-full border-separate border-spacing-y-2 text-left text-sm"><thead><tr className="text-xs font-semibold uppercase tracking-wide text-[#8b919a]">{(["project","company","dealAmount","commission","statusLabel","created","action"] as const).map((key) => <th className="px-3 py-2" key={key}>{t(`columns.${key}`)}</th>)}</tr></thead><tbody>{rows.map((row) => <tr className="bg-[#f8fafb]" key={row.dealId}><td className="rounded-l-[14px] px-3 py-3 font-semibold">{row.projectTitle}</td><td className="px-3 py-3">{row.companyName}</td><td className="px-3 py-3">{money(row.agreedAmountMad, locale)}</td><td className="px-3 py-3 font-semibold">{money(row.commissionAmountMad, locale)} <span className="block text-xs font-normal text-[#8b919a]">{rate(row.commissionRateBps, locale)}</span></td><td className="px-3 py-3"><Status status={row.commissionStatus} t={t} /></td><td className="px-3 py-3">{date(row.createdAt, locale)}</td><td className="rounded-r-[14px] px-3 py-3"><button className={`min-h-10 rounded-full border bg-white px-3 font-semibold ${ADMIN_PRESS}`} onClick={() => setSelected(row)} type="button">{t("view")}</button></td></tr>)}</tbody></table></div>
        </>}
      </section>
      {selected ? <DealDialog locale={locale} onClose={() => setSelected(null)} onSuccess={() => { setSelected(null); setNotice(t("paidSuccess")); }} row={selected} /> : null}
    </AdminPage>
  );
}

function DealCard({ row, locale, onOpen, t }: { row: Row; locale: string; onOpen: () => void; t: ReturnType<typeof useTranslations> }) {
  return <article className="rounded-[14px] bg-[#f8fafb] p-4"><div className="flex justify-between gap-3"><div><h2 className="font-semibold">{row.projectTitle}</h2><p className="text-sm text-[#626970]">{row.companyName}</p></div><Status status={row.commissionStatus} t={t} /></div><p className="mt-4 text-lg font-semibold">{money(row.commissionAmountMad, locale)}</p><p className="text-xs text-[#8b919a]">{t("commissionOf", { amount: money(row.agreedAmountMad, locale), rate: rate(row.commissionRateBps, locale) })}</p><button className={`mt-4 min-h-10 rounded-full border bg-white px-3 text-sm font-semibold ${ADMIN_PRESS}`} onClick={onOpen} type="button">{t("view")}</button></article>;
}

function DealDialog({ row, locale, onClose, onSuccess }: { row: Row; locale: string; onClose: () => void; onSuccess: () => void }) {
  const t = useTranslations("adminDeals");
  const markPaid = useMutation(api.admin.deals.markCommissionPaid);
  const [reference, setReference] = useState(""); const [note, setNote] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function submit(e: React.FormEvent) { e.preventDefault(); setSaving(true); setError(""); try { await markPaid({ dealId: row.dealId as Id<"deals">, paymentReference: reference || undefined, paymentNote: note || undefined }); onSuccess(); } catch (cause) { const message = cause instanceof Error ? cause.message : ""; setError(message.includes("COMMISSION_ALREADY_PAID") ? t("errors.alreadyPaid") : message.includes("INVALID_COMMISSION_PAYMENT") ? t("errors.invalidInput") : t("errors.generic")); } finally { setSaving(false); } }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" role="presentation"><section aria-modal="true" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[24px] bg-white p-5 shadow-2xl sm:rounded-[24px] sm:p-6" role="dialog" aria-labelledby="deal-dialog-title"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-[#626970]">{row.companyName}</p><h2 className="text-xl font-semibold" id="deal-dialog-title">{row.projectTitle}</h2></div><button aria-label={t("close")} className={`size-11 rounded-full bg-[#f4f6f8] ${ADMIN_PRESS}`} onClick={onClose} type="button">×</button></div><dl className="mt-5 grid gap-4 rounded-[16px] bg-[#f8fafb] p-4 sm:grid-cols-2"><Field label={t("fields.dealAmount")} value={money(row.agreedAmountMad, locale)} /><Field label={t("fields.commission")} value={money(row.commissionAmountMad, locale)} /><Field label={t("fields.rate")} value={rate(row.commissionRateBps, locale)} /><Field label={t("fields.configVersion")} value={String(row.commissionConfigVersion)} /><Field label={t("fields.status")} value={t(`status.${row.commissionStatus}`)} /><Field label={t("fields.created")} value={date(row.createdAt, locale)} /></dl>{row.commissionStatus === "paid" ? <dl className="mt-4 grid gap-4 sm:grid-cols-2"><Field label={t("fields.paidAt")} value={date(row.paidAt, locale)} /><Field label={t("fields.paidBy")} value={row.paidByAdminName ?? "—"} /><Field label={t("fields.reference")} value={row.paymentReference ?? "—"} /><Field label={t("fields.note")} value={row.paymentNote ?? "—"} /></dl> : <form className="mt-5" onSubmit={submit}><h3 className="font-semibold">{t("markPaidTitle")}</h3><p className="mt-1 text-sm text-[#626970]">{t("markPaidHelp")}</p><label className="mt-4 block text-sm font-medium">{t("referenceLabel")}<input className="mt-2 min-h-11 w-full rounded-[12px] border px-3 font-normal" maxLength={120} onChange={(e) => setReference(e.target.value)} value={reference} /></label><label className="mt-4 block text-sm font-medium">{t("noteLabel")}<textarea className="mt-2 min-h-24 w-full rounded-[12px] border p-3 font-normal" maxLength={1000} onChange={(e) => setNote(e.target.value)} value={note} /></label>{error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}<div className="mt-5 flex justify-end gap-2"><button className={`min-h-11 rounded-full border px-4 font-semibold ${ADMIN_PRESS}`} onClick={onClose} type="button">{t("cancel")}</button><button className={`min-h-11 rounded-full bg-[#2f6bff] px-4 font-semibold text-white disabled:opacity-60 ${ADMIN_PRESS}`} disabled={saving} type="submit">{saving ? t("saving") : t("confirmPaid")}</button></div></form>}</section></div>;
}

function Field({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#8b919a]">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>; }
function Status({ status, t }: { status: "due" | "paid"; t: ReturnType<typeof useTranslations> }) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{t(`status.${status}`)}</span>; }
function money(value: number, locale: string) { return new Intl.NumberFormat(locale, { style: "currency", currency: "MAD", maximumFractionDigits: 0 }).format(value); }
function rate(bps: number, locale: string) { return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(bps / 10000); }
function date(value: number | null, locale: string) { return value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Casablanca" }).format(value) : "—"; }
