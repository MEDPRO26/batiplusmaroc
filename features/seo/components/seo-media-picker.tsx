"use client";

import { useQuery } from "convex/react";
import { Check, ImageIcon, Search, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SEO_PRESS } from "@/features/seo/components/seo-workspace-shell";
import { SEO_MEDIA_ACCEPT, useSeoMediaUpload } from "@/features/seo/components/use-seo-media-upload";

export type SeoMediaSelection = {
  mediaId: Id<"seoMedia">;
  filename: string;
  publicUrl: string | null;
  altText: string | null;
};

type Props = {
  open: boolean;
  locale: "fr" | "en";
  selectedMediaId?: Id<"seoMedia"> | null;
  onClose: () => void;
  onSelect: (selection: SeoMediaSelection) => void;
};

export function SeoMediaPicker({ open, locale, selectedMediaId, onClose, onSelect }: Props) {
  const t = useTranslations("seoCms.mediaPicker");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<Id<"seoMedia"> | null>(selectedMediaId ?? null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const { upload, uploading } = useSeoMediaUpload();
  const media = useQuery(api.seo.content.listMedia, open
    ? { status: "active", search: search || undefined, limit: 100 }
    : "skip");

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      setPendingId(selectedMediaId ?? null);
      searchRef.current?.focus();
    });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [onClose, open, selectedMediaId]);

  if (!open) return null;

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const mediaId = await upload(file);
      setPendingId(mediaId);
    } catch {
      setError(t("uploadError"));
    }
  }

  const selected = media?.find((item) => item.mediaId === pendingId);

  return (
    <div
      aria-labelledby="seo-media-picker-title"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      role="dialog"
    >
      <div className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:rounded-[24px]" ref={dialogRef}>
        <div className="flex items-start justify-between gap-4 border-b border-[#e7eaee] p-5 sm:p-6">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]" id="seo-media-picker-title">{t("title")}</h2>
            <p className="mt-1 text-sm text-[#626970]">{t("description")}</p>
          </div>
          <button aria-label={t("close")} className={`grid size-11 shrink-0 place-items-center rounded-full border border-[#e6e9ee] ${SEO_PRESS}`} onClick={onClose} type="button">
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-[#e7eaee] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <label className="relative block w-full max-w-md">
            <span className="sr-only">{t("searchLabel")}</span>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#8b919a]" />
            <input ref={searchRef} className="min-h-11 w-full rounded-full border border-[#dfe3e8] pl-10 pr-4 text-sm outline-none focus:border-[#2f6bff] focus:ring-2 focus:ring-[#2f6bff]/15" onChange={(event) => setSearch(event.target.value)} placeholder={t("searchPlaceholder")} value={search} />
          </label>
          <label className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#dfe3e8] px-4 text-sm font-semibold ${SEO_PRESS} ${uploading ? "pointer-events-none opacity-60" : ""}`}>
            <Upload aria-hidden className="size-4" />
            {uploading ? t("uploading") : t("upload")}
            <input accept={SEO_MEDIA_ACCEPT} className="sr-only" disabled={uploading} onChange={(event) => void handleUpload(event.target.files?.[0])} type="file" />
          </label>
        </div>

        {error ? <p className="mx-4 mt-4 rounded-[12px] bg-[#fdecec] px-4 py-3 text-sm text-[#b42318] sm:mx-6" role="alert">{error}</p> : null}

        <div className="min-h-60 flex-1 overflow-y-auto p-4 sm:p-6">
          {media === undefined ? <PickerSkeleton label={t("loading")} /> : media.length === 0 ? (
            <div className="grid min-h-64 place-items-center rounded-[18px] border border-dashed border-[#dfe3e8] text-center">
              <div><ImageIcon aria-hidden className="mx-auto size-8 text-[#8b919a]" /><p className="mt-3 font-semibold">{t("emptyTitle")}</p><p className="mt-1 text-sm text-[#626970]">{t("emptyDescription")}</p></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {media.map((item) => {
                const active = pendingId === item.mediaId;
                const altText = locale === "fr" ? item.frAltText : item.enAltText;
                return (
                  <button
                    aria-pressed={active}
                    className={`group overflow-hidden rounded-[16px] border bg-white text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[#2f6bff] focus-visible:ring-offset-2 ${active ? "border-[#2f6bff] ring-2 ring-[#2f6bff]/15" : "border-[#e7eaee] hover:border-[#b8c8f8]"}`}
                    key={item.mediaId}
                    onClick={() => setPendingId(item.mediaId)}
                    type="button"
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden bg-[#f1f3f5]">
                      {item.publicUrl ? <img alt={altText ?? ""} className="size-full object-cover transition duration-200 group-hover:scale-[1.02]" src={item.publicUrl} /> : <ImageIcon aria-hidden className="absolute inset-0 m-auto size-8 text-[#a3a8af]" />}
                      {active ? <span className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-[#2f6bff] text-white"><Check aria-hidden className="size-4" /></span> : null}
                    </span>
                    <span className="block truncate px-3 pt-3 text-sm font-semibold">{item.filename}</span>
                    <span className="block px-3 pb-3 text-xs text-[#707780]">{item.width && item.height ? `${item.width} × ${item.height}` : t("dimensionsUnknown")}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#e7eaee] p-4 sm:px-6">
          <button className={`min-h-11 rounded-full border border-[#dfe3e8] px-4 text-sm font-semibold ${SEO_PRESS}`} onClick={onClose} type="button">{t("cancel")}</button>
          <button
            className={`min-h-11 rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${SEO_PRESS}`}
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              onSelect({
                mediaId: selected.mediaId,
                filename: selected.filename,
                publicUrl: selected.publicUrl,
                altText: locale === "fr" ? selected.frAltText : selected.enAltText,
              });
              onClose();
            }}
            type="button"
          >
            {t("select")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PickerSkeleton({ label }: { label: string }) {
  return <div aria-busy="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" role="status"><span className="sr-only">{label}</span>{Array.from({ length: 8 }, (_, index) => <div className="aspect-[4/3] animate-pulse rounded-[16px] bg-[#eef0f3]" key={index} />)}</div>;
}
