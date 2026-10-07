"use client";

import { useMutation, useQuery } from "convex/react";
import { ChevronRight, CircleCheck, CircleDashed } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { describeAppError } from "@/lib/errors";
import { agreementApi, agreementFailure, confirmationChanged, focusSupportComposer, startHasPassed,
  type AgreementVersion, type ConfirmPayload } from "../lib/agreement-ui";
import { AgreementGuard, AgreementHistory, AgreementTime, PRIMARY, SECONDARY, useAgreementClock, useAlive, VersionView } from "./agreement-shared";

export function ClientAgreementPanel({ projectId, conversationId }: { projectId: Id<"projects">; conversationId: string }) {
  const t = useTranslations("coordinationAgreement");
  const [denied, setDenied] = useState(false);
  return <section aria-label={t("title")} className="min-w-0 rounded-sm border border-brand-border bg-white px-5 py-5 sm:px-6">
    <h2 className="m-0 text-base font-semibold text-ink">{t("title")}</h2>
    {denied ? <p role="alert">{t("denied")}</p> : <AgreementGuard role="client" projectId={projectId}>
      <ClientAgreementBody conversationId={conversationId} projectId={projectId} onDenied={() => setDenied(true)} />
    </AgreementGuard>}
  </section>;
}
type Review = { projectId: Id<"projects">; version: AgreementVersion; payload: ConfirmPayload; readinessRevision: number };
function ClientAgreementBody({ projectId, conversationId, onDenied }: { projectId: Id<"projects">; conversationId: string; onDenied: () => void }) {
  const t = useTranslations("coordinationAgreement"); const ux = useTranslations("ux");
  const asOf = useAgreementClock(); const alive = useAlive();
  const result = useQuery(agreementApi.getMyAgreement, { projectId, asOf });
  // New clock args briefly have no result. Keep the view mounted, but await fresh data for actions.
  // Defined results (including null) replace this snapshot; access errors/guard changes still unmount it.
  const [last, setLast] = useState(result);
  if (result !== undefined && result !== last) setLast(result);
  const data = result === undefined ? last : result;
  const loading = result === undefined;
  const confirm = useMutation(agreementApi.confirmMyVersion); const readiness = useMutation(agreementApi.setMyReadiness);
  const [review, setReview] = useState<Review | null>(null); const [declared, setDeclared] = useState(false);
  const [attempt, setAttempt] = useState<ConfirmPayload | null>(null); const [retryable, setRetryable] = useState(false);
  const [busy, setBusy] = useState(false); const busyRef = useRef(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const declarationId = useId();
  if (data === undefined) return <p role="status" className="text-sm text-muted">{t("loading")}</p>;
  const current = data?.currentConfirmedVersion; const pending = data?.pendingVersion;
  const stale = review ? confirmationChanged(data, review.payload, review.readinessRevision) : false;
  const passed = review ? startHasPassed(review.version.terms, asOf) : false;
  const status = data?.pendingConfirmationStatus;
  const confirmationBlocked = pending && status !== "ready";
  const statusMessage = status && status !== "ready" ? t(`confirmationStatus.${status}`) : t("confirmationStatus.unavailable");
  const mayConfirm = data?.pendingConfirmationStatus === "ready" && data.readiness.eligible && data.projectAllowsNewActions && !passed;
  function fail(cause: unknown) {
    const failed = agreementFailure(cause);
    if (failed.denied) { onDenied(); return; }
    setRetryable(failed.retryable); setError(ux(describeAppError(cause, { logUnknown: false }).messageKey));
  }
  function openReview(version: AgreementVersion) {
    if (!data || loading) return;
    setReview({ projectId, version: structuredClone(version), readinessRevision: data.readiness.revision,
      payload: { projectId, versionId: version.id, expectedConfirmedVersionId: current?.id ?? null } });
    setDeclared(false); setAttempt(null); setRetryable(false); setError(""); setNotice("");
  }
  async function submit() {
    if (!review || loading || busyRef.current || review.projectId !== projectId) return;
    const payload = attempt ?? { ...review.payload, ...(review.version.replacesVersionId === null ? { attestNotStarted: declared } : {}) };
    setAttempt(payload); busyRef.current = true; setBusy(true); setError("");
    try {
      await confirm(payload);
      if (alive.current) { setReview(null); setAttempt(null); setNotice(t("confirmationSaved")); }
    } catch (cause) { if (alive.current) fail(cause); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  async function clear() {
    if (!data || loading || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try { await readiness({ projectId, revisionId: null, expectedReadinessRevision: data.readiness.revision });
      if (alive.current) { setReview(null); setAttempt(null); setNotice(t("readinessCleared")); } }
    catch (cause) { if (alive.current) fail(cause); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  const hasPreference = data?.readiness.declaredAt != null;
  const confirmedAt = current?.confirmation?.confirmedAt ?? null;
  return <div aria-busy={loading} className="mt-1 grid gap-5 text-sm">
    <p className="m-0 text-sm leading-6 text-pretty text-muted">{t("lead")}</p>
    {/* Status first: what is agreed today, before anything that needs action. */}
    <div className="flex items-start gap-3">
      <span aria-hidden className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm ${current ? "bg-emerald-50 text-emerald-700" : "bg-surface-muted text-muted"}`}>
        {current ? <CircleCheck className="size-[18px]" /> : <CircleDashed className="size-[18px]" />}
      </span>
      <div className="min-w-0">
        <p className="m-0 text-[0.95rem] font-semibold text-ink">{t(current ? "confirmedStatus" : "noCurrent")}</p>
        {current ? <p className="m-0 mt-0.5 text-sm text-muted tabular-nums">{t("confirmedMeta", { number: current.versionNumber })}{confirmedAt !== null ? <> <AgreementTime value={confirmedAt} /></> : null}</p> : null}
      </div>
    </div>
    {/* A version to act on comes first and is the only highlighted block. */}
    {pending ? <div className={`grid gap-2.5 rounded-sm border p-4 ${confirmationBlocked ? "border-amber-200 bg-amber-50" : "border-brand/30 bg-brand-soft"}`}>
      <h3 className="m-0 text-[0.95rem] font-semibold text-ink">{t(confirmationBlocked ? "pendingBlocked" : "pending")}</h3>
      {confirmationBlocked ? <p role="status" className="m-0 text-sm leading-6 text-amber-900">{statusMessage}</p>
        : <p className="m-0 text-sm leading-6 text-brand-dark">{t(pending.replacesVersionId ? "replacementNote" : "pendingNote")}</p>}
      <button className={`w-full sm:w-auto sm:justify-self-start ${confirmationBlocked ? SECONDARY : PRIMARY}`} disabled={busy || loading} onClick={() => openReview(pending)} type="button">{t("reviewVersion", { number: pending.versionNumber })}</button>
    </div> : null}
    {review ? <section aria-label={t("reviewTitle")} className="grid gap-4 rounded-sm border border-brand-border p-4">
      <h3 className="m-0 font-semibold text-ink">{t("reviewVersion", { number: review.version.versionNumber })}</h3>
      <VersionView version={review.version} />
      <p className="m-0 text-xs leading-5 text-muted">{t("confirmationMeaning")}</p>
      {review.version.replacesVersionId === null ? <label className="flex items-start gap-2 text-sm text-ink" htmlFor={declarationId}>
        <input checked={declared} className="mt-1 size-4 shrink-0 accent-brand" disabled={busy || attempt !== null} id={declarationId} onChange={event => setDeclared(event.target.checked)} type="checkbox" />{t("notStartedClient")}
      </label> : null}
      {stale ? <p role="alert" className="m-0 text-sm text-amber-900">{t("staleReview")}</p> : null}
      {confirmationBlocked && review.version.id === pending?.id ? <p role="alert" className="m-0 text-sm text-amber-900">{statusMessage}</p> : null}
      {passed ? <p role="alert" className="m-0 text-sm text-amber-900">{t("startPassed")}</p> : null}
      {!data?.readiness.eligible || !data?.projectAllowsNewActions ? <p className="m-0 text-xs text-muted">{t("gatesRequired")}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <button className={PRIMARY} disabled={busy || loading || (attempt ? !retryable : !mayConfirm || stale || (review.version.replacesVersionId === null && !declared))}
        onClick={() => void submit()} type="button">{t(busy ? "confirming" : attempt && retryable ? "retryConfirmation" : "confirm")}</button>
      <button className={SECONDARY} disabled={busy} onClick={() => { setReview(null); setAttempt(null); setError(""); }} type="button">{t("closeReview")}</button>
      </div>
    </section> : null}
    {notice ? <p className="m-0 rounded-sm bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{notice}</p> : null}
    {error ? <p className="m-0 rounded-sm bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p> : null}
    <div className={DIVIDED}>
      {current ? <h3 className="m-0 text-[0.95rem] font-semibold text-ink">{t("current")}</h3> : null}
      {current ? <details className="group mt-1"><summary className={DISCLOSURE}><ChevronRight aria-hidden className="size-4 shrink-0 transition-transform group-open:rotate-90" />{t("version", { number: current.versionNumber })}</summary><div className="pt-2 pb-3"><VersionView version={current} /></div></details> : null}
      <button className={`w-full sm:w-auto ${current ? "mt-2" : ""} ${SECONDARY}`} disabled={busy} onClick={() => focusSupportComposer(conversationId)} type="button">{t("askChanges")}</button>
    </div>
    <div className={DIVIDED}>
      <h3 className="m-0 text-[0.95rem] font-semibold text-ink">{t("readiness")}</h3>
      <p className="mt-1 mb-0 text-sm leading-6 text-muted">{hasPreference ? <>{t(data.readiness.eligible ? "readinessSaved" : "readinessUnavailable")} <AgreementTime value={data.readiness.declaredAt!} /></> : t("readinessAbsent")}</p>
      <p className="mt-1 mb-0 text-xs leading-5 text-muted">{t("readinessChangeNote")}</p>
      <div className="mt-1 flex flex-wrap gap-x-5">
        <Link className={TEXT_ACTION} href={{ pathname: routes.clientProject, params: { projectId } }}>{t("chooseQuote")}</Link>
        {hasPreference ? <button className={`${TEXT_ACTION} text-muted! hover:text-ink!`} disabled={busy || loading} onClick={() => void clear()} type="button">{t("clearReadiness")}</button> : null}
      </div>
    </div>
    <details className={`group ${DIVIDED} pt-2!`}><summary className={`${DISCLOSURE} font-semibold text-ink!`}><ChevronRight aria-hidden className="size-4 shrink-0 transition-transform group-open:rotate-90" />{t("history")}</summary><AgreementHistory projectId={projectId} role="client" /></details>
  </div>;
}

const DIVIDED = "border-t border-brand-border pt-5";
const DISCLOSURE = "flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden";
const TEXT_ACTION = "inline-flex min-h-11 cursor-pointer items-center rounded-sm text-left text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";
