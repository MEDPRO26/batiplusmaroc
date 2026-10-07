"use client";

import { useAuthToken } from "@convex-dev/auth/react";
import { useAction, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { ADMIN_PRESS } from "./admin-shell";
import { AdminLegacyMediaRetirement } from "./admin-legacy-media-retirement";

type Candidate = FunctionReturnType<typeof api.legacyMediaIngestion.index.listCandidates>["page"][number];
type MediaType = Candidate["mediaType"];
const TYPES: MediaType[] = ["companyLogo", "companyCover", "portfolioCover", "portfolioGallery"];
const BUTTON = `min-h-11 rounded-sm border border-[#d9e1ef] px-4 text-sm font-semibold disabled:opacity-50 ${ADMIN_PRESS}`;

class IngestionBoundary extends Component<{ children: ReactNode; error: string; retry: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { console.error("Legacy media candidates could not load"); }
  render() {
    return this.state.failed ? <div className="mt-4"><p role="alert">{this.props.error}</p><button className={`${BUTTON} mt-3`} onClick={() => this.setState({ failed: false })} type="button">{this.props.retry}</button></div> : this.props.children;
  }
}

export function AdminLegacyMediaIngestion() {
  const token = useAuthToken();
  const user = useQuery(api.users.currentUser);
  const t = useTranslations("adminLegacyMedia");
  if (!token || user?.accountType !== "admin" || !user._id) return null;
  return <section className="mb-5 min-w-0 rounded-[14px] border border-[#e7eaee] bg-white p-4 sm:p-5" aria-label={t("title")}>
    <h2 className="font-semibold">{t("title")}</h2><p className="mt-2 text-sm leading-6 text-[#626970]">{t("lead")}</p>
    <IngestionBoundary key={`${user._id}:${token}`} error={t("loadError")} retry={t("retry")}><IngestionTypes /></IngestionBoundary>
  </section>;
}

function IngestionTypes() {
  const t = useTranslations("adminLegacyMedia");
  const [mediaType, setMediaType] = useState<MediaType>("companyLogo");
  return <>
    <label className="mt-4 flex flex-col gap-2 text-sm font-semibold">{t("mediaType")}
      <select className="min-h-11 max-w-full rounded-sm border border-[#d9e1ef] bg-white px-3 font-normal" value={mediaType} onChange={event => setMediaType(event.target.value as MediaType)}>
        {TYPES.map(type => <option value={type} key={type}>{t(`types.${type}`)}</option>)}
      </select>
    </label>
    <CandidateList key={mediaType} mediaType={mediaType} />
    <AdminLegacyMediaRetirement />
  </>;
}
function CandidateList({ mediaType }: { mediaType: MediaType }) {
  const t = useTranslations("adminLegacyMedia");
  const { results, status, loadMore } = usePaginatedQuery(api.legacyMediaIngestion.index.listCandidates, { mediaType }, { initialNumItems: 20 });
  return <div className="mt-4">
    {status === "LoadingFirstPage" ? <p role="status" aria-busy="true">{t("loading")}</p> : results.length === 0 ? <p className="text-sm text-[#626970]">{t("empty")}</p> :
      <ul className="grid list-none gap-3 p-0">{results.map(row => <CandidateRow key={row.sourceKey} row={row} />)}</ul>}
    {status === "CanLoadMore" || status === "LoadingMore" ? <button className={`${BUTTON} mt-4 w-full`} disabled={status === "LoadingMore"} onClick={() => loadMore(20)} type="button">{t(status === "LoadingMore" ? "loading" : "loadMore")}</button> : null}
  </div>;
}

function CandidateRow({ row }: { row: Candidate }) {
  const t = useTranslations("adminLegacyMedia");
  const ingest = useAction(api.legacyMediaIngestion.actions.ingest);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<{ value: NonNullable<Candidate["state"]>; priorState: string } | null>(null);
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // Reactive persisted state wins over an older action response (e.g. another Admin retried).
  const persistedState = JSON.stringify(row.state);
  const state = result?.priorState === persistedState ? result.value : row.state;
  const stateKey = state?.status ?? "notStarted";
  const reviewTab = row.mediaType === "companyLogo" ? "logo" : row.mediaType === "companyCover" ? "cover" : "portfolioImages";
  const run = async () => {
    if (active.current) return;
    active.current = true; setBusy(true); setError(false);
    try {
      const response = await ingest({ mediaType: row.mediaType, provider: row.provider, companyId: row.companyId,
        portfolioProjectId: row.portfolioProjectId, gallerySlotId: row.gallerySlotId, sourceKey: row.sourceKey });
      if (mounted.current) setResult({ value: response, priorState: persistedState });
    } catch { if (mounted.current) setError(true); }
    finally { active.current = false; if (mounted.current) setBusy(false); }
  };
  return <li className="flex min-w-0 flex-col gap-3 rounded-xl bg-[#f8fafb] p-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <h3 className="break-words text-sm font-semibold">{row.companyName || t("companyFallback")}</h3>
      <p className="mt-1 break-words text-sm">{t(`types.${row.mediaType}`)} · {t(`providers.${row.provider}`)}{row.projectTitle ? ` · ${row.projectTitle}` : ""}{row.order !== null ? ` · ${t("slot", { order: row.order + 1 })}` : ""}</p>
      <p className="mt-1 text-xs text-[#626970]" role="status">{busy ? t("ingesting") : t(`status.${stateKey}`)}</p>
      {row.hasModeratedState && stateKey !== "ingested" ? <p className="mt-1 text-xs text-[#626970]">{t("conflict")}</p> : null}
      {stateKey === "failed" || error ? <p className="mt-1 text-sm text-red-700" role="alert">{t("actionError")}</p> : null}
    </div>
    <div className="flex shrink-0 flex-wrap gap-2">
      {state?.imageId ? <Link className={`${BUTTON} inline-flex items-center`} href={{ pathname: routes.adminCompany, params: { companyId: row.companyId }, query: { tab: reviewTab } }}>{t("review")}</Link> : null}
      {stateKey === "notStarted" || stateKey === "failed" || row.retryable || error ? <button className={BUTTON} disabled={busy} onClick={run} type="button">{t(stateKey === "notStarted" && !error ? "ingest" : "retry")}</button> : null}
    </div>
  </li>;
}
