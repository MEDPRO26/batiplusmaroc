"use client";

import { useMutation, useQuery } from "convex/react";
import { Edit3, ImageIcon, Search, ShieldAlert, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SeoMediaPicker } from "@/features/seo/components/seo-media-picker";
import { SEO_PRESS } from "@/features/seo/components/seo-workspace-shell";

type SeoLocale = "fr" | "en";
type Robots = "index,follow" | "noindex,follow" | "index,nofollow" | "noindex,nofollow";
type PageRow = NonNullable<ReturnType<typeof useQuery<typeof api.seo.content.listPageMetadata>>>[number];
type PageForm = {
  seoTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  robots: Robots;
  ogTitle: string;
  ogDescription: string;
  ogMediaId: string;
};
const EMPTY_FORM: PageForm = { seoTitle: "", metaDescription: "", canonicalUrl: "", robots: "index,follow", ogTitle: "", ogDescription: "", ogMediaId: "" };

export function SeoPagesManager() {
  const t = useTranslations("seoCms.pages");
  const locale = useLocale();
  const rows = useQuery(api.seo.content.listPageMetadata, {});
  const [search, setSearch] = useState("");
  const [localeFilter, setLocaleFilter] = useState<"all" | SeoLocale>("all");
  const [missingOnly, setMissingOnly] = useState(false);
  const [selected, setSelected] = useState<PageRow | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (rows ?? []).filter((row) => {
      const pageName = t(`pageNames.${row.nameKey}`).toLocaleLowerCase();
      return (!needle || pageName.includes(needle) || row.pageKey.includes(needle) || row.path.includes(needle)) &&
        (localeFilter === "all" || row.locale === localeFilter) &&
        (!missingOnly || !row.seoTitleReady || !row.metaDescriptionReady);
    });
  }, [localeFilter, missingOnly, rows, search, t]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
      {notice ? <p className="fixed bottom-6 left-1/2 z-[90] max-w-sm -translate-x-1/2 rounded-full bg-[#17191d] px-4 py-3 text-sm text-white shadow-[0_12px_32px_rgba(16,24,40,0.24)]" role="status">{notice}</p> : null}
      <div><p className="text-[0.72rem] font-bold tracking-[0.12em] text-[#2f6bff] uppercase">{t("eyebrow")}</p><h1 className="mt-2 text-[1.9rem] font-semibold tracking-[-0.04em] sm:text-[2.2rem]">{t("title")}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#626970]">{t("description")}</p></div>
      {error ? <p className="rounded-[14px] bg-[#fdecec] px-4 py-3 text-sm text-[#b42318]" role="alert">{error}</p> : null}

      <section className="rounded-[20px] border border-[#e7eaee] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center">
          <label className="relative block"><span className="sr-only">{t("filters.searchLabel")}</span><Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#8b919a]" /><input className="min-h-11 w-full rounded-full border border-[#dfe3e8] pl-10 pr-4 text-sm outline-none focus:border-[#2f6bff] focus:ring-2 focus:ring-[#2f6bff]/15" onChange={(event) => setSearch(event.target.value)} placeholder={t("filters.searchPlaceholder")} value={search} /></label>
          <label><span className="sr-only">{t("filters.localeLabel")}</span><select className="min-h-11 w-full rounded-full border border-[#dfe3e8] bg-white px-4 text-sm outline-none focus:border-[#2f6bff] focus:ring-2 focus:ring-[#2f6bff]/15" onChange={(event) => setLocaleFilter(event.target.value as "all" | SeoLocale)} value={localeFilter}><option value="all">{t("filters.allLocales")}</option><option value="fr">{t("locales.fr")}</option><option value="en">{t("locales.en")}</option></select></label>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-full border border-[#dfe3e8] px-4 text-sm font-semibold"><input checked={missingOnly} className="size-4 accent-[#2f6bff]" onChange={(event) => setMissingOnly(event.target.checked)} type="checkbox" />{t("filters.missingOnly")}</label>
        </div>
      </section>

      {rows === undefined ? <PagesSkeleton label={t("loading")} /> : filtered.length === 0 ? <section className="grid min-h-72 place-items-center rounded-[20px] border border-dashed border-[#dfe3e8] bg-white p-8 text-center"><div><h2 className="text-lg font-semibold">{t("emptyTitle")}</h2><p className="mt-1 text-sm text-[#626970]">{t("emptyDescription")}</p></div></section> : <>
        <div className="hidden overflow-hidden rounded-[20px] border border-[#e7eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] md:block"><table className="w-full border-collapse text-left text-sm"><thead className="bg-[#f7f8fa] text-xs font-semibold text-[#626970]"><tr><th className="px-5 py-4">{t("columns.page")}</th><th className="px-4 py-4">{t("columns.locale")}</th><th className="px-4 py-4">{t("columns.metadata")}</th><th className="px-4 py-4">{t("columns.canonical")}</th><th className="px-4 py-4">{t("columns.robots")}</th><th className="px-4 py-4">{t("columns.updated")}</th><th className="px-5 py-4 text-right">{t("columns.actions")}</th></tr></thead><tbody className="divide-y divide-[#edf0f2]">{filtered.map((row) => <PageTableRow key={`${row.pageKey}-${row.locale}`} locale={locale} onEdit={() => setSelected(row)} row={row} t={t} />)}</tbody></table></div>
        <div className="grid gap-3 md:hidden">{filtered.map((row) => <PageCard key={`${row.pageKey}-${row.locale}`} locale={locale} onEdit={() => setSelected(row)} row={row} t={t} />)}</div>
      </>}

      {selected ? <PageMetadataDialog onClose={() => setSelected(null)} onError={setError} onSuccess={setNotice} row={selected} /> : null}
    </div>
  );
}

function PageTableRow({ row, onEdit, locale, t }: { row: PageRow; onEdit: () => void; locale: string; t: ReturnType<typeof useTranslations<"seoCms.pages">> }) {
  return <tr className="hover:bg-[#fafbfc]"><td className="px-5 py-4"><p className="font-semibold text-[#272a2f]">{t(`pageNames.${row.nameKey}`)}</p><p className="mt-1 font-mono text-xs text-[#707780]">{row.pageKey} · {row.path}</p></td><td className="px-4 py-4"><LocaleBadge locale={row.locale} /></td><td className="px-4 py-4"><Readiness ready={row.seoTitleReady && row.metaDescriptionReady} t={t} /></td><td className="max-w-52 px-4 py-4"><span className="block truncate text-[#626970]">{row.canonicalUrl ?? "—"}</span></td><td className="px-4 py-4 font-mono text-xs">{row.robots ?? "—"}</td><td className="px-4 py-4 text-[#626970]">{row.updatedAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(row.updatedAt) : "—"}</td><td className="px-5 py-4 text-right"><button aria-label={t("editNamed", { page: t(`pageNames.${row.nameKey}`), locale: row.locale.toUpperCase() })} className={`inline-grid size-11 place-items-center rounded-full border border-[#dfe3e8] ${SEO_PRESS}`} onClick={onEdit} type="button"><Edit3 aria-hidden className="size-4" /></button></td></tr>;
}

function PageCard({ row, onEdit, locale, t }: { row: PageRow; onEdit: () => void; locale: string; t: ReturnType<typeof useTranslations<"seoCms.pages">> }) {
  return <article className="rounded-[18px] border border-[#e7eaee] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{t(`pageNames.${row.nameKey}`)}</h2><LocaleBadge locale={row.locale} /></div><p className="mt-1 truncate font-mono text-xs text-[#707780]">{row.pageKey}</p><p className="mt-1 truncate text-xs text-[#707780]">{row.path}</p></div><button aria-label={t("editNamed", { page: t(`pageNames.${row.nameKey}`), locale: row.locale.toUpperCase() })} className={`grid size-11 shrink-0 place-items-center rounded-full border border-[#dfe3e8] ${SEO_PRESS}`} onClick={onEdit} type="button"><Edit3 aria-hidden className="size-4" /></button></div><div className="mt-4 flex items-center justify-between gap-3 border-t border-[#edf0f2] pt-3"><Readiness ready={row.seoTitleReady && row.metaDescriptionReady} t={t} /><span className="text-xs text-[#707780]">{row.updatedAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(row.updatedAt) : t("neverUpdated")}</span></div></article>;
}

function PageMetadataDialog({ row, onClose, onSuccess, onError }: { row: PageRow; onClose: () => void; onSuccess: (message: string) => void; onError: (message: string) => void }) {
  const t = useTranslations("seoCms.pages");
  const metadata = useQuery(api.seo.content.getPageMetadata, { pageKey: row.pageKey, locale: row.locale });
  const media = useQuery(api.seo.content.listMedia, { status: "active", limit: 100 });
  const saveMetadata = useMutation(api.seo.content.upsertPageMetadata);
  const [form, setForm] = useState<PageForm>(EMPTY_FORM);
  const [confirmNoindex, setConfirmNoindex] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const hydratedKey = useRef<string | null>(null);

  useEffect(() => {
    if (metadata === undefined || hydratedKey.current === `${row.pageKey}:${row.locale}`) return;
    hydratedKey.current = `${row.pageKey}:${row.locale}`;
    setForm(metadata ? { seoTitle: metadata.seoTitle, metaDescription: metadata.metaDescription, canonicalUrl: metadata.canonicalUrl ?? "", robots: metadata.robots, ogTitle: metadata.ogTitle ?? "", ogDescription: metadata.ogDescription ?? "", ogMediaId: metadata.ogMediaId ?? "" } : EMPTY_FORM);
  }, [metadata, row.locale, row.pageKey]);

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (pickerOpen) return;
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); returnFocus?.focus(); };
  }, [onClose, pickerOpen]);

  function update<K extends keyof PageForm>(key: K, value: PageForm[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); onError("");
    try {
      await saveMetadata({ pageKey: row.pageKey, locale: row.locale, seoTitle: form.seoTitle, metaDescription: form.metaDescription, canonicalUrl: form.canonicalUrl || null, robots: form.robots, ogTitle: form.ogTitle || undefined, ogDescription: form.ogDescription || undefined, ogMediaId: form.ogMediaId ? form.ogMediaId as Id<"seoMedia"> : null, confirmCriticalNoindex: confirmNoindex });
      onSuccess(t("success.saved")); onClose();
    } catch (error) { onError(resolvePageError(error, t)); }
    finally { setSaving(false); }
  }
  const selectedMedia = media?.find((item) => item.mediaId === form.ogMediaId);
  const needsCriticalConfirmation = row.critical && form.robots.startsWith("noindex");

  return <div aria-labelledby="page-metadata-title" aria-modal="true" className="fixed inset-0 z-[70] flex justify-end bg-black/50" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog"><div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl" ref={dialogRef}><div className="flex items-start justify-between gap-4 border-b border-[#e7eaee] p-5 sm:p-6"><div><p className="text-[0.7rem] font-bold tracking-[0.12em] text-[#2f6bff] uppercase">{row.locale.toUpperCase()} · {row.pageKey}</p><h2 className="mt-1 text-xl font-semibold" id="page-metadata-title">{t("editTitle", { page: t(`pageNames.${row.nameKey}`) })}</h2><p className="mt-1 text-sm text-[#626970]">{row.path}</p></div><button ref={closeRef} aria-label={t("close")} className={`grid size-11 shrink-0 place-items-center rounded-full border border-[#dfe3e8] ${SEO_PRESS}`} onClick={onClose} type="button"><X aria-hidden className="size-5" /></button></div>{metadata === undefined ? <div aria-busy="true" className="m-6 h-96 animate-pulse rounded-[18px] bg-[#eef0f3]" role="status"><span className="sr-only">{t("loadingEditor")}</span></div> : <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void save(event)}><div className="flex-1 overflow-y-auto p-5 sm:p-6"><div className="grid gap-4"><PageField hint={t("hints.seoTitle", { count: form.seoTitle.length })} label={t("fields.seoTitle")}><input maxLength={70} minLength={2} onChange={(event) => update("seoTitle", event.target.value)} required value={form.seoTitle} /></PageField><PageField hint={t("hints.metaDescription", { count: form.metaDescription.length })} label={t("fields.metaDescription")}><textarea maxLength={180} minLength={20} onChange={(event) => update("metaDescription", event.target.value)} required rows={3} value={form.metaDescription} /></PageField><PageField hint={t("hints.canonical")} label={t("fields.canonicalUrl")}><input onChange={(event) => update("canonicalUrl", event.target.value)} placeholder="https://batiplusmaroc.com/..." type="url" value={form.canonicalUrl} /></PageField><PageField label={t("fields.robots")}><select onChange={(event) => { update("robots", event.target.value as Robots); setConfirmNoindex(false); }} value={form.robots}>{(["index,follow", "noindex,follow", "index,nofollow", "noindex,nofollow"] as const).map((value) => <option key={value} value={value}>{value}</option>)}</select></PageField>{needsCriticalConfirmation ? <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-[#f0c36a] bg-[#fff8e8] p-4 text-sm leading-6 text-[#6f4b00]"><input checked={confirmNoindex} className="mt-1 size-4 accent-[#9a6700]" onChange={(event) => setConfirmNoindex(event.target.checked)} type="checkbox" /><span><span className="flex items-center gap-2 font-semibold"><ShieldAlert aria-hidden className="size-4" />{t("critical.title")}</span>{t("critical.description")}</span></label> : null}<PageField label={t("fields.ogTitle")}><input maxLength={100} onChange={(event) => update("ogTitle", event.target.value)} value={form.ogTitle} /></PageField><PageField label={t("fields.ogDescription")}><textarea maxLength={300} onChange={(event) => update("ogDescription", event.target.value)} rows={3} value={form.ogDescription} /></PageField><div><p className="text-sm font-semibold text-[#34383e]">{t("fields.ogImage")}</p>{selectedMedia ? <div className="mt-2 overflow-hidden rounded-[14px] border border-[#e7eaee]"><div className="aspect-video bg-[#eef0f3]">{selectedMedia.publicUrl ? <img alt={row.locale === "fr" ? selectedMedia.frAltText ?? "" : selectedMedia.enAltText ?? ""} className="size-full object-cover" src={selectedMedia.publicUrl} /> : null}</div><div className="flex items-center gap-2 p-3"><p className="min-w-0 flex-1 truncate text-xs font-medium">{selectedMedia.filename}</p><button aria-label={t("removeImage")} className={`grid size-11 place-items-center rounded-full text-[#b42318] hover:bg-[#fdecec] ${SEO_PRESS}`} onClick={() => update("ogMediaId", "")} type="button"><Trash2 aria-hidden className="size-4" /></button></div></div> : <div className="mt-2 grid min-h-24 place-items-center rounded-[14px] border border-dashed border-[#cdd2d8] bg-[#fafbfc]"><ImageIcon aria-hidden className="size-6 text-[#9ba1a8]" /></div>}<button className={`mt-2 min-h-11 w-full rounded-full border border-[#dfe3e8] px-4 text-sm font-semibold ${SEO_PRESS}`} onClick={() => setPickerOpen(true)} type="button">{t("chooseImage")}</button></div></div></div><div className="flex justify-end gap-2 border-t border-[#e7eaee] p-4 sm:px-6"><button className={`min-h-11 rounded-full border border-[#dfe3e8] px-4 text-sm font-semibold ${SEO_PRESS}`} onClick={onClose} type="button">{t("cancel")}</button><button className={`min-h-11 rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${SEO_PRESS}`} disabled={saving || (needsCriticalConfirmation && !confirmNoindex)} type="submit">{saving ? t("saving") : t("save")}</button></div></form>}<SeoMediaPicker locale={row.locale} onClose={() => setPickerOpen(false)} onSelect={(selection) => update("ogMediaId", selection.mediaId)} open={pickerOpen} selectedMediaId={form.ogMediaId ? form.ogMediaId as Id<"seoMedia"> : null} /></div></div>;
}

function PageField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="grid gap-2 text-sm font-semibold text-[#34383e]"><span>{label}</span><span className="[&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-[12px] [&_input]:border [&_input]:border-[#dfe3e8] [&_input]:px-3.5 [&_input]:font-normal [&_input]:outline-none [&_input]:focus:border-[#2f6bff] [&_input]:focus:ring-2 [&_input]:focus:ring-[#2f6bff]/15 [&_textarea]:w-full [&_textarea]:rounded-[12px] [&_textarea]:border [&_textarea]:border-[#dfe3e8] [&_textarea]:px-3.5 [&_textarea]:py-3 [&_textarea]:font-normal [&_textarea]:outline-none [&_textarea]:focus:border-[#2f6bff] [&_textarea]:focus:ring-2 [&_textarea]:focus:ring-[#2f6bff]/15 [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-[12px] [&_select]:border [&_select]:border-[#dfe3e8] [&_select]:bg-white [&_select]:px-3.5 [&_select]:font-normal [&_select]:outline-none [&_select]:focus:border-[#2f6bff] [&_select]:focus:ring-2 [&_select]:focus:ring-[#2f6bff]/15">{children}</span>{hint ? <span className="text-xs font-normal text-[#8b919a]">{hint}</span> : null}</label>; }
function LocaleBadge({ locale }: { locale: SeoLocale }) { return <span className="inline-flex rounded-full bg-[#eef3ff] px-2.5 py-1 text-[0.7rem] font-semibold text-[#2f6bff]">{locale.toUpperCase()}</span>; }
function Readiness({ ready, t }: { ready: boolean; t: ReturnType<typeof useTranslations<"seoCms.pages">> }) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ${ready ? "bg-[#e7f8ee] text-[#157a3e]" : "bg-[#fff4df] text-[#8a5a00]"}`}>{ready ? t("ready") : t("missing")}</span>; }
function PagesSkeleton({ label }: { label: string }) { return <div aria-busy="true" className="space-y-3" role="status"><span className="sr-only">{label}</span>{Array.from({ length: 6 }, (_, index) => <div className="h-20 animate-pulse rounded-[18px] bg-white" key={index} />)}</div>; }
function resolvePageError(error: unknown, t: ReturnType<typeof useTranslations<"seoCms.pages">>) { const message = String(error); if (message.includes("SEO_CANONICAL_CONFLICT")) return t("errors.canonicalConflict"); if (message.includes("INVALID_SEO_CANONICAL")) return t("errors.invalidCanonical"); if (message.includes("SEO_CRITICAL_NOINDEX_CONFIRMATION_REQUIRED")) return t("errors.confirmNoindex"); if (message.includes("INVALID_SEO_MEDIA_REFERENCE")) return t("errors.invalidMedia"); return t("errors.generic"); }
