"use client";

import { useAction, useConvex, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { ADMIN_PRESS } from "./admin-shell";

type Row = FunctionReturnType<typeof api.legacyMediaIngestion.retirement.listRetirements>["page"][number];
const BUTTON = `min-h-11 rounded-full border border-[#d9e1ef] px-4 text-sm font-semibold disabled:opacity-50 ${ADMIN_PRESS}`;

/** Mounted only inside the existing Admin/account-keyed ingestion boundary. */
export function AdminLegacyMediaRetirement() {
  const t = useTranslations("adminLegacyRetirement");
  const { results, status, loadMore } = usePaginatedQuery(api.legacyMediaIngestion.retirement.listRetirements, {}, { initialNumItems: 20 });
  return <div className="mt-6 border-t border-[#e7eaee] pt-5">
    <h3 className="font-semibold">{t("title")}</h3><p className="mt-2 text-sm leading-6 text-[#626970]">{t("lead")}</p>
    {status === "LoadingFirstPage" ? <p className="mt-3" role="status">{t("loading")}</p> : results.length === 0 ? <p className="mt-3 text-sm">{t("empty")}</p> :
      <ul className="mt-4 grid list-none gap-3 p-0">{results.map(row => <RetirementRow key={row.ingestionId} row={row} />)}</ul>}
    {status === "CanLoadMore" || status === "LoadingMore" ? <button className={`${BUTTON} mt-4 w-full`} disabled={status === "LoadingMore"} onClick={() => loadMore(20)} type="button">{t(status === "LoadingMore" ? "loading" : "loadMore")}</button> : null}
  </div>;
}
function RetirementRow({ row }: { row: Row }) {
  const t = useTranslations("adminLegacyRetirement"); const media = useTranslations("adminLegacyMedia");
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const liveReadiness = useQuery(api.legacyMediaIngestion.retirement.getReadiness, checkedAt !== null ? { ingestionId: row.ingestionId, checkedAt } : "skip");
  const convex = useConvex();
  const [snapshot, setSnapshot] = useState<FunctionReturnType<typeof api.legacyMediaIngestion.retirement.getReadiness> | undefined>();
  const [checking, setChecking] = useState(false);
  const readiness = liveReadiness ?? snapshot;
  const retire = useAction(api.legacyMediaIngestion.retirementActions.retire);
  const [confirmation, setConfirmation] = useState<string | null>(null); const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const [result, setResult] = useState<FunctionReturnType<typeof api.legacyMediaIngestion.retirementActions.retire> | null>(null);
  const active = useRef(false); const mounted = useRef(true); const trigger = useRef<HTMLButtonElement>(null); const inputId = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const open = confirmation !== null && readiness?.ready === true && confirmation === readiness.fingerprint;
  const stale = confirmation !== null && !open && !busy && readiness?.retirementStatus !== "retired" && result?.retirementStatus !== "retired";
  const status = result?.retirementStatus ?? readiness?.retirementStatus ?? row.retirementStatus;
  const urls = result?.knownUrls ?? readiness?.knownUrls ?? [];
  const cacheRequired = result?.cacheVerificationRequired || readiness?.cacheVerificationRequired || row.cacheVerificationRequired;
  const tab = row.mediaType === "companyLogo" ? "logo" : row.mediaType === "companyCover" ? "cover" : "portfolioImages";
  const check = async () => {
    if (active.current) return;
    active.current = true; setChecking(true); setError(false); setConfirmation(null); setResult(null); setTyped("");
    try {
      const checkTime = Date.now();
      const response = await convex.query(api.legacyMediaIngestion.retirement.getReadiness, { ingestionId: row.ingestionId, checkedAt: checkTime });
      if (mounted.current) { setSnapshot(response); setCheckedAt(checkTime); }
    } catch { if (mounted.current) setError(true); }
    finally { active.current = false; if (mounted.current) setChecking(false); }
  };
  const run = async () => {
    if (active.current || !open || !confirmation || typed !== t("confirmationWord")) return;
    active.current = true; setBusy(true); setError(false);
    try {
      const response = await retire({ ingestionId: row.ingestionId, expectedFingerprint: confirmation, confirmation: "RETIRE" });
      if (mounted.current) { setResult(response); setConfirmation(null); setTyped(""); if (response.retirementStatus === "failed") setError(true); }
    } catch { if (mounted.current) { setError(true); setConfirmation(null); setTyped(""); } }
    finally { active.current = false; if (mounted.current) setBusy(false); }
  };
  return <li className="min-w-0 rounded-xl bg-[#f8fafb] p-3">
    <h4 className="break-words text-sm font-semibold">{row.companyName || media("companyFallback")}</h4>
    <p className="mt-1 break-words text-sm">{media(`types.${row.mediaType}`)} · {media(`providers.${row.provider}`)}{row.projectTitle ? ` · ${row.projectTitle}` : ""}</p>
    {readiness?.order !== null && readiness?.order !== undefined ? <p className="mt-1 text-sm">{media("slot", { order: readiness.order + 1 })}</p> : null}
    <p className="mt-1 text-xs">{t("ingestionState", { state: media(`status.${row.ingestionStatus}`) })} · {t("moderationState", { state: t(`moderation.${readiness?.moderationStatus ?? row.moderationStatus ?? "missing"}`) })}</p>
    <p className="mt-1 text-sm" role="status">{busy ? t("retiring") : t(`status.${status}`)}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button className={BUTTON} disabled={busy || checking} onClick={() => void check()} type="button">{checking ? t("loading") : t("check")}</button>
      <Link className={`${BUTTON} inline-flex items-center`} href={{ pathname: routes.adminCompany, params: { companyId: row.companyId }, query: { tab } }}>{media("review")}</Link>
      {readiness?.ready && status !== "retired" ? <button className={BUTTON} ref={trigger} disabled={busy || checking} onClick={() => { setConfirmation(readiness.fingerprint); setTyped(""); setError(false); }} type="button">{t(readiness.retryable ? "retry" : "retire")}</button> : null}
    </div>
    {readiness?.blockers.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{readiness.blockers.map(blocker => <li key={blocker}>{t(`blockers.${blocker}`)}</li>)}</ul> : null}
    {stale ? <p className="mt-3 text-sm text-amber-800" role="alert">{t("stale")}</p> : null}
    {error ? <p className="mt-3 text-sm text-red-800" role="alert">{t("error")}</p> : null}
    {cacheRequired ? <div className="mt-3 text-sm"><p className="font-semibold">{t("cacheRequired")}</p><p className="mt-1 leading-6">{t("cacheChecklist")}</p></div> : null}
    {urls.length ? <div className="mt-3 text-sm"><p className="font-semibold">{t("knownUrls")}</p><ul className="mt-1 list-disc pl-5">{urls.map(url => <li className="break-all" key={url}><a className="underline" href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>)}</ul><p className="mt-1 text-xs">{t("unknownAliases")}</p></div> : null}
    <Dialog.Root open={open} onOpenChange={value => { if (!value && !busy) { setConfirmation(null); setTyped(""); } }}>
      <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[60] bg-[#101828]/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[16px] bg-white p-5 outline-none sm:p-6"
          onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}
          onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
          <Dialog.Title className="text-lg font-semibold">{t("confirmTitle")}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6">{t("warning")}</Dialog.Description>
          <p className="mt-3 break-words text-sm font-semibold">{row.companyName || media("companyFallback")} · {media(`types.${row.mediaType}`)} · {media(`providers.${row.provider}`)}{row.projectTitle ? ` · ${row.projectTitle}` : ""}</p>
          {urls.map(url => <p className="mt-2 break-all text-xs" key={url}>{url}</p>)}
          <label className="mt-4 block text-sm font-semibold" htmlFor={inputId}>{t("typeIntent", { word: t("confirmationWord") })}</label>
          <input className="mt-2 min-h-11 w-full rounded-lg border border-[#d9e1ef] px-3" autoComplete="off" id={inputId} disabled={busy} value={typed} onChange={event => setTyped(event.target.value)} />
          <div className="mt-5 flex flex-wrap justify-end gap-2"><Dialog.Close asChild><button className={BUTTON} disabled={busy} type="button">{t("cancel")}</button></Dialog.Close>
            <button className={`${BUTTON} border-red-700 text-red-800`} disabled={busy || typed !== t("confirmationWord")} onClick={() => void run()} type="button">{busy ? t("retiring") : t("confirmRetire")}</button></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </li>;
}
