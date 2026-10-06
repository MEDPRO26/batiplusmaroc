"use client";

import { Building2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { workspaceButton } from "@/features/shared/components/workspace-page";
import { fetchCompanyCoverPreview } from "@/lib/files/company-cover";

/** Shared owner/Admin transport; ready means the exact authenticated image decoded in the browser. */
export function PrivateCompanyCoverPreview({ imageId, sessionToken, alt, onReady, large = false }: {
  imageId: Id<"companyCoverImages">; sessionToken: string; alt: string; onReady?: (ready: boolean) => void; large?: boolean;
}) {
  const t = useTranslations("companyCover");
  const active = useRef<{ imageId: typeof imageId; sessionToken: string; attempt: number } | null>(null);
  const readyCallback = useRef(onReady);
  useEffect(() => { readyCallback.current = onReady; }, [onReady]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ imageId: typeof imageId; sessionToken: string; attempt: number; url?: string; failed?: boolean } | null>(null);
  useEffect(() => {
    active.current = { imageId, sessionToken, attempt };
    const controller = new AbortController();
    let url: string | undefined;
    let disposed = false;
    let downloading = false;
    readyCallback.current?.(false);
    // Strict Mode can discard this effect immediately; start only if it is still active.
    void Promise.resolve().then(() => {
      if (disposed) return null;
      downloading = true;
      return fetchCompanyCoverPreview({ imageId, sessionToken, signal: controller.signal });
    }).then(blob => {
      downloading = false;
      if (disposed || !blob) return;
      url = URL.createObjectURL(blob);
      setResult({ imageId, sessionToken, attempt, url });
    }).catch(() => {
      downloading = false;
      if (!disposed) setResult({ imageId, sessionToken, attempt, failed: true });
    });
    return () => {
      disposed = true;
      active.current = null;
      // A finished body has nothing to cancel; keep cancellation for active downloads only.
      if (downloading) controller.abort();
      if (url) URL.revokeObjectURL(url);
      readyCallback.current?.(false);
    };
  }, [imageId, sessionToken, attempt]);
  const current = result?.imageId === imageId && result.sessionToken === sessionToken && result.attempt === attempt ? result : null;
  if (current?.url) return <Image alt={alt} className={large ? "h-auto max-h-[420px] w-full rounded-xl border border-brand-border object-contain" : "h-28 w-full rounded-xl border border-brand-border object-contain"}
    height={large ? 420 : 112} width={560} src={current.url} unoptimized
    onLoad={event => {
      if (event.currentTarget.isConnected && active.current?.imageId === imageId && active.current.sessionToken === sessionToken && active.current.attempt === attempt) readyCallback.current?.(true);
    }} onError={() => {
      if (active.current?.imageId !== imageId || active.current.sessionToken !== sessionToken || active.current.attempt !== attempt) return;
      readyCallback.current?.(false);
      URL.revokeObjectURL(current.url!);
      setResult({ imageId, sessionToken, attempt, failed: true });
    }} />;
  return <div>
    <span aria-label={t("genericAlt")} className="grid h-28 w-full place-items-center rounded-xl bg-brand-soft text-brand" role="img"><Building2 aria-hidden className="size-8" /></span>
    {current?.failed ? <div className="mt-2 text-xs text-muted" role="alert">
      <p className="m-0">{t("previewError")}</p>
      <button className={`${workspaceButton.ghost} mt-1 min-h-11 px-0`} onClick={() => setAttempt(value => value + 1)} type="button">{t("retryPreview")}</button>
    </div> : <span className="mt-2 block text-xs text-muted" role="status">{t("loadingPreview")}</span>}
  </div>;
}
