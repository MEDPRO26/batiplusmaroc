"use client";

import { useMutation, useQuery } from "convex/react";
import { Archive, FileImage, ImageIcon, RefreshCw, Search, Upload, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SEO_PRESS } from "@/features/seo/components/seo-workspace-shell";
import { SEO_MEDIA_ACCEPT, useSeoMediaUpload } from "@/features/seo/components/use-seo-media-upload";

type MediaStatus = "active" | "archived";
type MetadataForm = { altText: string; title: string; caption: string; description: string; seoFilename: string };
const EMPTY_METADATA: MetadataForm = { altText: "", title: "", caption: "", description: "", seoFilename: "" };

export function SeoMediaLibrary() {
  const t = useTranslations("seoCms.media");
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MediaStatus>("active");
  const [selectedId, setSelectedId] = useState<Id<"seoMedia"> | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { upload, uploading } = useSeoMediaUpload();
  const media = useQuery(api.seo.content.listMedia, {
    status,
    search: search || undefined,
    limit: 100,
  });

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const mediaId = await upload(file);
      setStatus("active");
      setSelectedId(mediaId);
      setNotice(t("success.uploaded"));
    } catch {
      setError(t("errors.upload"));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
      {notice ? <p className="fixed bottom-6 left-1/2 z-[90] max-w-sm -translate-x-1/2 rounded-full bg-[#17191d] px-4 py-3 text-sm text-white shadow-[0_12px_32px_rgba(16,24,40,0.24)]" role="status">{notice}</p> : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[0.72rem] font-bold tracking-[0.12em] text-[#2f6bff] uppercase">{t("eyebrow")}</p>
          <h1 className="mt-2 text-[1.9rem] font-semibold tracking-[-0.04em] sm:text-[2.2rem]">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#626970]">{t("description")}</p>
        </div>
        <label className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(47,107,255,0.24)] ${SEO_PRESS} ${uploading ? "pointer-events-none opacity-60" : ""}`}>
          <Upload aria-hidden className="size-4" />
          {uploading ? t("uploading") : t("upload")}
          <input accept={SEO_MEDIA_ACCEPT} className="sr-only" disabled={uploading} onChange={(event) => void handleUpload(event.target.files?.[0])} type="file" />
        </label>
      </div>

      {error ? <p className="rounded-[14px] bg-[#fdecec] px-4 py-3 text-sm text-[#b42318]" role="alert">{error}</p> : null}

      <section className="rounded-[20px] border border-[#e7eaee] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block">
            <span className="sr-only">{t("searchLabel")}</span>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#8b919a]" />
            <input className="min-h-11 w-full rounded-full border border-[#dfe3e8] pl-10 pr-4 text-sm outline-none focus:border-[#2f6bff] focus:ring-2 focus:ring-[#2f6bff]/15" onChange={(event) => setSearch(event.target.value)} placeholder={t("searchPlaceholder")} value={search} />
          </label>
          <label>
            <span className="sr-only">{t("statusLabel")}</span>
            <select className="min-h-11 w-full rounded-full border border-[#dfe3e8] bg-white px-4 text-sm outline-none focus:border-[#2f6bff] focus:ring-2 focus:ring-[#2f6bff]/15" onChange={(event) => setStatus(event.target.value as MediaStatus)} value={status}>
              <option value="active">{t("statuses.active")}</option>
              <option value="archived">{t("statuses.archived")}</option>
            </select>
          </label>
        </div>
      </section>

      {media === undefined ? <MediaSkeleton label={t("loading")} /> : media.length === 0 ? (
        <section className="grid min-h-[360px] place-items-center rounded-[20px] border border-dashed border-[#dfe3e8] bg-white p-8 text-center">
          <div><FileImage aria-hidden className="mx-auto size-10 text-[#9ba1a8]" /><h2 className="mt-4 text-lg font-semibold">{t("emptyTitle")}</h2><p className="mt-1 text-sm text-[#626970]">{t("emptyDescription")}</p></div>
        </section>
      ) : (
        <section aria-label={t("gridLabel")} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {media.map((item) => {
            const metadataReady = locale === "fr" ? item.frMetadataReady : item.enMetadataReady;
            const altText = locale === "fr" ? item.frAltText : item.enAltText;
            return (
              <button className={`group overflow-hidden rounded-[18px] border border-[#e7eaee] bg-white text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none hover:border-[#b8c8f8] focus-visible:ring-2 focus-visible:ring-[#2f6bff] focus-visible:ring-offset-2 ${SEO_PRESS}`} key={item.mediaId} onClick={() => setSelectedId(item.mediaId)} type="button">
                <span className="relative block aspect-[4/3] overflow-hidden bg-[#eef0f3]">
                  {item.publicUrl ? <img alt={altText ?? ""} className="size-full object-cover transition duration-200 group-hover:scale-[1.02]" src={item.publicUrl} /> : <ImageIcon aria-hidden className="absolute inset-0 m-auto size-10 text-[#a3a8af]" />}
                </span>
                <span className="block p-3.5">
                  <span className="block truncate text-sm font-semibold text-[#272a2f]">{item.filename}</span>
                  <span className="mt-1 block text-xs text-[#707780]">{item.width && item.height ? `${item.width} × ${item.height}` : t("dimensionsUnknown")} · {formatBytes(item.size, locale)}</span>
                  <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ${metadataReady ? "bg-[#e7f8ee] text-[#157a3e]" : "bg-[#fff4df] text-[#8a5a00]"}`}>{metadataReady ? t("metadataComplete") : t("metadataMissing")}</span>
                </span>
              </button>
            );
          })}
        </section>
      )}

      {selectedId ? <MediaDetailsDialog mediaId={selectedId} onClose={() => setSelectedId(null)} onError={setError} onSuccess={setNotice} /> : null}
    </div>
  );
}

function MediaDetailsDialog({ mediaId, onClose, onSuccess, onError }: {
  mediaId: Id<"seoMedia">;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations("seoCms.media");
  const locale = useLocale();
  const details = useQuery(api.seo.content.getMediaDetails, { mediaId });
  const saveMetadata = useMutation(api.seo.content.upsertMediaMetadata);
  const archiveMedia = useMutation(api.seo.content.archiveMedia);
  const { upload, uploading } = useSeoMediaUpload();
  const [tab, setTab] = useState<"general" | "fr" | "en">("general");
  const [fr, setFr] = useState<MetadataForm>(EMPTY_METADATA);
  const [en, setEn] = useState<MetadataForm>(EMPTY_METADATA);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const hydratedId = useRef<string | null>(null);

  useEffect(() => {
    if (!details || hydratedId.current === details.media._id) return;
    hydratedId.current = details.media._id;
    setFr(toMetadataForm(details.fr));
    setEn(toMetadataForm(details.en));
  }, [details]);

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); returnFocus?.focus(); };
  }, [onClose]);

  async function save(localeKey: "fr" | "en") {
    const values = localeKey === "fr" ? fr : en;
    setSaving(true); onError("");
    try {
      await saveMetadata({
        mediaId,
        locale: localeKey,
        altText: values.altText,
        title: values.title || undefined,
        caption: values.caption || undefined,
        description: values.description || undefined,
        seoFilename: values.seoFilename || undefined,
      });
      onSuccess(t("success.metadataSaved", { locale: t(`tabs.${localeKey}`) }));
    } catch { onError(t("errors.metadata")); }
    finally { setSaving(false); }
  }

  async function archive() {
    if (!window.confirm(t("confirmArchive"))) return;
    setSaving(true); onError("");
    try { await archiveMedia({ mediaId }); onSuccess(t("success.archived")); onClose(); }
    catch (error) {
      onError(String(error).includes("SEO_MEDIA_IN_USE") ? t("errors.inUse") : t("errors.archive"));
    } finally { setSaving(false); }
  }

  async function replace(file: File | undefined) {
    if (!file) return;
    onError("");
    try { await upload(file, mediaId); onSuccess(t("success.replaced")); onClose(); }
    catch { onError(t("errors.replace")); }
  }

  const usageTotal = details ? Object.values(details.usage).reduce((sum, value) => sum + value, 0) : 0;

  return (
    <div aria-labelledby="media-details-title" aria-modal="true" className="fixed inset-0 z-[70] flex justify-end bg-black/50" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog">
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl" ref={dialogRef}>
        <div className="flex items-start justify-between gap-4 border-b border-[#e7eaee] p-5 sm:p-6">
          <div className="min-w-0"><p className="text-[0.7rem] font-bold tracking-[0.12em] text-[#2f6bff] uppercase">{t("detailsEyebrow")}</p><h2 className="mt-1 truncate text-xl font-semibold" id="media-details-title">{details?.media.filename ?? t("detailsTitle")}</h2></div>
          <button ref={closeRef} aria-label={t("close")} className={`grid size-11 shrink-0 place-items-center rounded-full border border-[#e6e9ee] ${SEO_PRESS}`} onClick={onClose} type="button"><X aria-hidden className="size-5" /></button>
        </div>
        <div aria-label={t("tabsLabel")} className="flex gap-1 overflow-x-auto border-b border-[#e7eaee] px-5 pt-3 sm:px-6" role="tablist">
          {(["general", "fr", "en"] as const).map((value) => <button aria-selected={tab === value} className={`min-h-11 border-b-2 px-4 text-sm font-semibold ${tab === value ? "border-[#2f6bff] text-[#2f6bff]" : "border-transparent text-[#626970]"}`} key={value} onClick={() => setTab(value)} role="tab" type="button">{t(`tabs.${value}`)}</button>)}
        </div>
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {details === undefined ? <div aria-busy="true" className="h-96 animate-pulse rounded-[18px] bg-[#eef0f3]" role="status"><span className="sr-only">{t("loadingDetails")}</span></div> : details === null ? <p>{t("notFound")}</p> : tab === "general" ? (
            <div className="grid gap-5">
              <div className="aspect-video overflow-hidden rounded-[18px] bg-[#eef0f3]">{details.publicUrl ? <img alt="" className="size-full object-contain" src={details.publicUrl} /> : null}</div>
              <dl className="grid gap-3 rounded-[16px] bg-[#f7f8fa] p-4 text-sm sm:grid-cols-2">
                <Info label={t("fields.fileName")} value={details.media.filename} />
                <Info label={t("fields.type")} value={details.media.mimeType} />
                <Info label={t("fields.dimensions")} value={details.media.width && details.media.height ? `${details.media.width} × ${details.media.height}` : t("dimensionsUnknown")} />
                <Info label={t("fields.size")} value={formatBytes(details.media.size, locale)} />
                <Info label={t("fields.created")} value={new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(details.media.createdAt)} />
                <Info label={t("fields.usage")} value={t("usageCount", { count: usageTotal })} />
              </dl>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#dfe3e8] px-4 text-sm font-semibold ${SEO_PRESS} ${uploading ? "pointer-events-none opacity-60" : ""}`}><RefreshCw aria-hidden className="size-4" />{uploading ? t("replacing") : t("replace")}<input accept={SEO_MEDIA_ACCEPT} className="sr-only" disabled={uploading} onChange={(event) => void replace(event.target.files?.[0])} type="file" /></label>
                <button className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#f4c7c2] px-4 text-sm font-semibold text-[#b42318] disabled:cursor-not-allowed disabled:opacity-50 ${SEO_PRESS}`} disabled={saving || details.media.status === "archived"} onClick={() => void archive()} type="button"><Archive aria-hidden className="size-4" />{t("archive")}</button>
              </div>
              {usageTotal > 0 ? <p className="text-xs leading-5 text-[#7a5300]">{t("replacementHint")}</p> : null}
            </div>
          ) : (
            <MetadataEditor disabled={saving || details.media.status === "archived"} form={tab === "fr" ? fr : en} onChange={tab === "fr" ? setFr : setEn} onSave={() => void save(tab)} t={t} />
          )}
        </div>
      </div>
    </div>
  );
}

function MetadataEditor({ form, onChange, onSave, disabled, t }: { form: MetadataForm; onChange: (value: MetadataForm) => void; onSave: () => void; disabled: boolean; t: ReturnType<typeof useTranslations<"seoCms.media">> }) {
  function update(key: keyof MetadataForm, value: string) { onChange({ ...form, [key]: value }); }
  return <div className="grid gap-4"><MetadataField label={t("fields.altText")} required><input disabled={disabled} maxLength={300} onChange={(event) => update("altText", event.target.value)} required value={form.altText} /></MetadataField><MetadataField label={t("fields.title")}><input disabled={disabled} maxLength={300} onChange={(event) => update("title", event.target.value)} value={form.title} /></MetadataField><MetadataField label={t("fields.caption")}><textarea disabled={disabled} maxLength={1000} onChange={(event) => update("caption", event.target.value)} rows={3} value={form.caption} /></MetadataField><MetadataField label={t("fields.description")}><textarea disabled={disabled} maxLength={2000} onChange={(event) => update("description", event.target.value)} rows={4} value={form.description} /></MetadataField><MetadataField hint={t("seoFilenameHint")} label={t("fields.seoFilename")}><input disabled={disabled} maxLength={160} onChange={(event) => update("seoFilename", event.target.value)} value={form.seoFilename} /></MetadataField><button className={`min-h-11 rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${SEO_PRESS}`} disabled={disabled || !form.altText.trim()} onClick={onSave} type="button">{t("saveMetadata")}</button></div>;
}

function MetadataField({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) { return <label className="grid gap-2 text-sm font-semibold text-[#34383e]"><span>{label}{required ? <span aria-hidden className="text-[#b42318]"> *</span> : null}</span><span className="[&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-[12px] [&_input]:border [&_input]:border-[#dfe3e8] [&_input]:px-3.5 [&_input]:font-normal [&_input]:outline-none [&_input]:focus:border-[#2f6bff] [&_input]:focus:ring-2 [&_input]:focus:ring-[#2f6bff]/15 [&_textarea]:w-full [&_textarea]:rounded-[12px] [&_textarea]:border [&_textarea]:border-[#dfe3e8] [&_textarea]:px-3.5 [&_textarea]:py-3 [&_textarea]:font-normal [&_textarea]:outline-none [&_textarea]:focus:border-[#2f6bff] [&_textarea]:focus:ring-2 [&_textarea]:focus:ring-[#2f6bff]/15 [&_:disabled]:bg-[#f4f6f8]">{children}</span>{hint ? <span className="text-xs font-normal text-[#8b919a]">{hint}</span> : null}</label>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold text-[#707780]">{label}</dt><dd className="mt-1 break-words font-medium text-[#272a2f]">{value}</dd></div>; }
function toMetadataForm(value: { altText: string; title?: string; caption?: string; description?: string; seoFilename?: string } | null): MetadataForm { return value ? { altText: value.altText, title: value.title ?? "", caption: value.caption ?? "", description: value.description ?? "", seoFilename: value.seoFilename ?? "" } : { ...EMPTY_METADATA }; }
function formatBytes(bytes: number, locale: string) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024)} KB`; return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`; }
function MediaSkeleton({ label }: { label: string }) { return <div aria-busy="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5" role="status"><span className="sr-only">{label}</span>{Array.from({ length: 10 }, (_, index) => <div className="aspect-[4/3] animate-pulse rounded-[18px] bg-white" key={index} />)}</div>; }
