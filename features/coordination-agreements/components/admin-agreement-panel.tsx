"use client";

import { useMutation, useQuery } from "convex/react";
import { ChevronRight } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { describeAppError } from "@/lib/errors";
import {
  agreementApi, agreementFailure, editorToTerms, emptyEditor, publicationChanged, startHasPassed, termsToEditor,
  type AdminAgreement, type Editor, type PublishPayload, type Terms
} from "../lib/agreement-ui";
import { AgreementGuard, AgreementHistory, AgreementTime, INPUT, PRIMARY, SECONDARY, useAgreementClock, useAlive, VersionView } from "./agreement-shared";

export function AdminAgreementPanel({ projectId, active }: { projectId: Id<"projects">; active: boolean }) {
  const t = useTranslations("coordinationAgreement"); const [denied, setDenied] = useState(false);
  return <section aria-label={t("title")} className="min-w-0 p-4 sm:p-6">
    <h2 className="m-0 text-lg font-semibold tracking-[-0.01em] text-ink">{t("title")}</h2>
    {denied ? <p role="alert">{t("denied")}</p> : <AgreementGuard role="admin" projectId={projectId}>
      <AdminAgreementBody active={active} projectId={projectId} onDenied={() => setDenied(true)} />
    </AgreementGuard>}
  </section>;
}
function AdminAgreementBody({ projectId, active, onDenied }: { projectId: Id<"projects">; active: boolean; onDenied: () => void }) {
  const t = useTranslations("coordinationAgreement"); const asOf = useAgreementClock(active);
  const data = useQuery(agreementApi.getAdminAgreement, { projectId, asOf });
  // Clock refreshes must not unmount a dirty editor. Guard/boundary unmounts still clear private state.
  const [last, setLast] = useState(data);
  if (data !== undefined && data !== last) setLast(data);
  const known = data === undefined ? last : data;
  if (known === undefined) return <p role="status">{t("loading")}</p>;
  return <AdminEditor asOf={asOf} data={known} loading={data === undefined} onDenied={onDenied} projectId={projectId} />;
}
type Review = { terms: Terms; payload: PublishPayload };
function AdminEditor({ projectId, data, loading, asOf, onDenied }: { projectId: Id<"projects">; data: AdminAgreement | null; loading: boolean; asOf: number; onDenied: () => void }) {
  const t = useTranslations("coordinationAgreement"); const ux = useTranslations("ux"); const alive = useAlive(); const id = useId();
  const save = useMutation(agreementApi.saveAdminDraft); const publish = useMutation(agreementApi.publishAdminDraft);
  const [editor, setEditor] = useState<Editor>(() => data?.draft ? termsToEditor(data.draft.terms) : emptyEditor());
  const [baseRevision, setBaseRevision] = useState(data?.draftRevision ?? 0);
  const [saved, setSaved] = useState<{ terms: Terms; revision: number } | null>(() => data?.draft ? { terms: data.draft.terms, revision: data.draftRevision } : null);
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [draftConflict, setDraftConflict] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [review, setReview] = useState<Review | null>(null);
  const [declared, setDeclared] = useState(false); const [attempt, setAttempt] = useState<PublishPayload | null>(null); const [retryable, setRetryable] = useState(false);
  const staleEditor = draftConflict || (data?.draftRevision ?? 0) !== baseRevision;
  function fail(cause: unknown) {
    const failed = agreementFailure(cause);
    if (failed.denied) { onDenied(); return; }
    if (failed.code === "COORDINATION_DRAFT_CONFLICT") setDraftConflict(true);
    setRetryable(failed.retryable); setError(ux(describeAppError(cause, { logUnknown: false }).messageKey));
  }
  function edit(field: keyof Editor, value: string) {
    setEditor(previous => ({ ...previous, [field]: value })); setDirty(true); setReview(null); setAttempt(null); setDeclared(false); setError(""); setNotice("");
  }
  function reload() {
    setEditor(data?.draft ? termsToEditor(data.draft.terms) : emptyEditor()); setBaseRevision(data?.draftRevision ?? 0);
    setSaved(data?.draft ? { terms: data.draft.terms, revision: data.draftRevision } : null);
    setDirty(false); setDraftConflict(false); setReview(null); setAttempt(null); setDeclared(false); setError("");
  }
  async function saveDraft(event: FormEvent) {
    event.preventDefault(); if (busyRef.current || loading || staleEditor) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const terms = editorToTerms(editor);
      const result = await save({ projectId, expectedDraftRevision: baseRevision, terms });
      if (alive.current) { setBaseRevision(result.draftRevision); setSaved({ terms, revision: result.draftRevision }); setDirty(false); setReview(null); setAttempt(null); setNotice(t("draftSaved")); }
    } catch (cause) { if (alive.current) fail(cause); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  function reviewSaved() {
    if (!saved || dirty || loading || saved.revision !== data?.draftRevision) return;
    setReview({
      terms: structuredClone(saved.terms), payload: {
        projectId, expectedDraftRevision: saved.revision,
        expectedReadinessRevision: data.readiness.revision, expectedPendingVersionId: data.pendingVersion?.id ?? null,
        expectedConfirmedVersionId: data.currentConfirmedVersion?.id ?? null, idempotencyKey: crypto.randomUUID()
      }
    });
    setAttempt(null); setDeclared(false); setRetryable(false); setError(""); setNotice("");
  }
  async function send() {
    if (!review || busyRef.current || review.payload.projectId !== projectId) return;
    const payload = attempt ?? { ...review.payload, ...(review.payload.expectedConfirmedVersionId === null ? { attestNotStarted: declared } : {}) };
    setAttempt(payload); busyRef.current = true; setBusy(true); setError("");
    try {
      await publish(payload);
      if (alive.current) {
        setReview(null); setAttempt(null); setSaved(null); setEditor(emptyEditor());
        setBaseRevision(payload.expectedDraftRevision + 1); setDirty(false); setNotice(t("published"));
      }
    } catch (cause) { if (alive.current) fail(cause); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  const first = review?.payload.expectedConfirmedVersionId === null;
  const staleReview = review ? publicationChanged(data, review.payload) : false;
  const passed = review ? startHasPassed(review.terms, asOf) : false;
  const canPublish = data?.readiness.eligible && data.projectAllowsNewActions && !passed && !staleReview && !loading;
  const current = data?.currentConfirmedVersion;
  const pendingVersion = data?.pendingVersion;
  const readinessAt = data?.readiness.declaredAt ?? null;
  const draftMeta = data?.draft ?? null;
  const prepare = (source: Terms) => { setEditor(termsToEditor(source)); setDirty(true); setReview(null); setAttempt(null); };
  const area = (field: "tasks" | "exclusions" | "visits" | "availability" | "payer" | "paymentTerms", maxLength: number) => <label className={LABEL} key={field}>
    <span id={`${id}-${field}-label`}>{t(`fields.${field}`)}</span>
    <textarea aria-labelledby={`${id}-${field}-label`} className={`${INPUT} min-h-[5.5rem] resize-y`} maxLength={maxLength} onChange={event => edit(field, event.target.value)} required rows={3} value={editor[field]} />
  </label>;
  // Outcome messages sit with the actions, where the admin is looking after acting.
  const feedback = <>
    {notice ? <p role="status" className="m-0 rounded-sm bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
    {error ? <p role="alert" className="m-0 rounded-sm bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
  </>;
  return <div className="mt-1 grid gap-6">
    <p className="m-0 max-w-3xl text-sm leading-6 text-pretty text-muted">{t("adminLead")}</p>

    <div>
      <dl aria-label={t("adminStatus.label")} className="m-0 grid gap-px overflow-hidden rounded-sm border border-brand-border bg-brand-border sm:grid-cols-2 2xl:grid-cols-4">
        <StatusCell label={t("adminStatus.terms")} tone={current ? "success" : "neutral"} value={t(current ? "confirmedStatus" : "noCurrent")}>
          {current ? <>{t("confirmedMeta", { number: current.versionNumber })}{current.confirmation ? <> <AgreementTime value={current.confirmation.confirmedAt} /></> : null}</> : null}
        </StatusCell>
        <StatusCell label={t("adminStatus.clientReview")} tone={pendingVersion ? "warning" : "neutral"} value={t(pendingVersion ? "pendingAdmin" : "adminStatus.nothingPending")}>
          {pendingVersion ? <>{t("version", { number: pendingVersion.versionNumber })} · <AgreementTime value={pendingVersion.publishedAt} /></> : null}
        </StatusCell>
        <StatusCell label={t("adminStatus.quote")} tone={readinessAt === null ? "neutral" : data?.readiness.eligible ? "success" : "warning"}
          value={t(readinessAt === null ? "adminStatus.quoteMissing" : data?.readiness.eligible ? "adminStatus.quoteReady" : "adminStatus.quoteNotEligible")}>
          {readinessAt !== null ? <>{t("adminStatus.recordedOn")} <AgreementTime value={readinessAt} /></> : null}
        </StatusCell>
        <StatusCell label={t("adminStatus.draft")} tone={dirty ? "warning" : "neutral"} value={t(dirty ? "adminStatus.draftUnsaved" : draftMeta ? "adminStatus.draftSaved" : "adminStatus.draftNone")}>
          {draftMeta ? <><AgreementTime value={draftMeta.savedAt} />{draftMeta.savedByDisplayName ? <> {t("adminStatus.draftBy", { name: draftMeta.savedByDisplayName })}</> : null}</> : null}
        </StatusCell>
      </dl>
      <p className="mt-2 mb-0 text-xs leading-5 text-muted">{t("adminSourcePrivacy")}</p>
    </div>

    {current ? <details className="group border-y border-brand-border"><summary className={DISCLOSURE}><ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90" /><span className="font-semibold text-ink">{t("current")} · {t("version", { number: current.versionNumber })}</span></summary>
      <div className="pb-4 pl-6"><VersionView version={current} /><button className={`${SECONDARY} mt-4`} disabled={busy || loading} onClick={() => prepare(current.terms)} type="button">{t("prepareRevision")}</button></div>
    </details> : null}
    {pendingVersion ? <details className="group border-y border-brand-border"><summary className={DISCLOSURE}><ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90" /><span className="font-semibold text-ink">{t("pendingAdmin")} · {t("version", { number: pendingVersion.versionNumber })}</span></summary>
      <div className="pb-4 pl-6"><p className="mt-0 mb-3 text-xs leading-5 text-muted">{t(pendingVersion.replacesVersionId ? "replacementAdminNote" : "pendingNote")}</p><VersionView version={pendingVersion} />
        <button className={`${SECONDARY} mt-4`} disabled={busy || loading} onClick={() => prepare(pendingVersion.terms)} type="button">{t("prepareRevision")}</button></div>
    </details> : null}

    {/* The editor stays mounted while a review is open so its inputs and focus state are never lost. */}
    <form aria-label={t("privateDraft")} className={review ? "hidden" : "grid gap-6"} onSubmit={saveDraft}>
      <div><h3 className="m-0 text-base font-semibold text-ink">{t("privateDraft")}</h3><p className="mt-1 mb-0 max-w-3xl text-xs leading-5 text-muted">{t("privateDraftNote")}</p></div>
      {staleEditor ? <div className="flex flex-wrap items-center gap-3 rounded-sm bg-amber-50 px-3 py-2.5 text-sm text-amber-900" role="alert">{t("staleDraft")} <button className={SECONDARY} disabled={busy || loading} onClick={reload} type="button">{t("reloadDraft")}</button></div> : null}
      <fieldset className="m-0 grid min-w-0 gap-7 border-0 p-0" disabled={busy}>
        <DraftSection hint={t("adminSections.scopeHint")} title={t("adminSections.scope")}>
          <div className={PAIR}>{area("tasks", 5000)}{area("exclusions", 5000)}</div>
        </DraftSection>
        <DraftSection hint={t("adminSections.siteHint")} title={t("adminSections.site")}>
          <div className={PAIR}>{area("visits", 2000)}{area("availability", 2000)}</div>
        </DraftSection>
        <DraftSection hint={t("adminSections.scheduleHint")} title={t("adminSections.schedule")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={LABEL}>{t("fields.startDate")}<input className={INPUT} onChange={event => edit("startDate", event.target.value)} required type="date" value={editor.startDate} /></label>
            <label className={LABEL}><span id={`${id}-fee-label`}>{t("fields.fee")}</span><select aria-labelledby={`${id}-fee-label`} className={INPUT} onChange={event => edit("feeKind", event.target.value)} required value={editor.feeKind}>
              <option value="">{t("chooseFee")}</option><option value="fixed">{t("fixedFee")}</option><option value="percentage">{t("percentageFee")}</option>
            </select></label>
          </div>
          {editor.feeKind === "fixed" ? <label className={`${LABEL} sm:max-w-[calc(50%-0.5rem)]`}><span id={`${id}-amount-label`}>{t("fields.amountMad")}</span><input aria-describedby={`${id}-amount-hint`} aria-labelledby={`${id}-amount-label`} autoComplete="off" className={INPUT} inputMode="decimal" onChange={event => edit("amountMad", event.target.value)} required type="text" value={editor.amountMad} /><span className={HINT} id={`${id}-amount-hint`}>{t("centimeHint")}</span></label> : null}
          {editor.feeKind === "percentage" ? <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={LABEL}><span id={`${id}-rate-label`}>{t("fields.rate")}</span><input aria-describedby={`${id}-rate-hint`} aria-labelledby={`${id}-rate-label`} autoComplete="off" className={INPUT} inputMode="decimal" maxLength={64} onChange={event => edit("rate", event.target.value)} required type="text" value={editor.rate} /><span className={HINT} id={`${id}-rate-hint`}>{t("percentageHint")}</span></label>
              <label className={LABEL}><span id={`${id}-basis-amount-label`}>{t("fields.basisAmountMad")}</span><input aria-describedby={`${id}-basis-amount-hint`} aria-labelledby={`${id}-basis-amount-label`} autoComplete="off" className={INPUT} inputMode="decimal" onChange={event => edit("basisAmountMad", event.target.value)} type="text" value={editor.basisAmountMad} /><span className={HINT} id={`${id}-basis-amount-hint`}>{t("centimeHint")}</span></label>
            </div>
            <label className={LABEL}><span id={`${id}-basis-label`}>{t("fields.basis")}</span><textarea aria-labelledby={`${id}-basis-label`} className={`${INPUT} min-h-[5.5rem] resize-y`} maxLength={5000} onChange={event => edit("basis", event.target.value)} required rows={3} value={editor.basis} /></label>
          </> : null}
        </DraftSection>
        <DraftSection hint={t("payerNote")} title={t("adminSections.payment")}>
          <div className={PAIR}>{area("payer", 500)}{area("paymentTerms", 5000)}</div>
        </DraftSection>
      </fieldset>
      <div className={ACTION_BAR}>
        {feedback}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className={SECONDARY} disabled={busy || loading || dirty || !saved || saved.revision !== data?.draftRevision} onClick={reviewSaved} type="button">{t("reviewSaved")}</button>
          <button className={PRIMARY} disabled={busy || loading || staleEditor} type="submit">{t(busy ? "saving" : "saveDraft")}</button>
        </div>
      </div>
    </form>

    {review ? <section aria-label={t("publicationReview")} className="grid gap-5">
      <div><h3 className="m-0 text-base font-semibold text-ink">{t("publicationReview")}</h3><p className="mt-1 mb-0 text-sm text-brand-dark">{t("clientWillReceive")}</p></div>
      <div className="rounded-sm border border-brand-border bg-white px-4 py-5 sm:px-6"><SectionedTerms terms={review.terms} /></div>
      <p className="m-0 max-w-3xl text-xs leading-5 text-muted">{t("confirmationMeaning")}</p>
      <div className={ACTION_BAR}>
        {first ? <label className="flex items-start gap-2.5 text-sm text-ink" htmlFor={`${id}-declaration`}><input checked={declared} className="mt-0.5 size-[18px] shrink-0 accent-brand" disabled={busy || attempt !== null} id={`${id}-declaration`} onChange={event => setDeclared(event.target.checked)} type="checkbox" />{t("notStartedAdmin")}</label> : null}
        {!canPublish ? <p className="m-0 rounded-sm bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">{t(passed ? "startPassed" : staleReview ? "staleReview" : "gatesRequired")}</p> : null}
        {feedback}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className={SECONDARY} disabled={busy} onClick={() => { setReview(null); setAttempt(null); setError(""); }} type="button">{t("closeReview")}</button>
          <button className={PRIMARY} disabled={busy || (attempt ? !retryable : !canPublish || (first && !declared))} onClick={() => void send()} type="button">{t(busy ? "sending" : attempt && retryable ? "retryPublication" : "sendSummary")}</button>
        </div>
      </div>
    </section> : null}

    <details className="group border-t border-brand-border"><summary className={DISCLOSURE}><ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-90" /><span className="font-semibold text-ink">{t("history")}</span></summary><div className="pb-2 pl-6"><AgreementHistory projectId={projectId} role="admin" /></div></details>
  </div>;
}

const LABEL = "grid content-start gap-1.5 text-sm font-semibold text-ink";
const HINT = "text-xs leading-5 font-normal text-muted";
/** Two related fields side by side once the pane is wide enough. */
const PAIR = "grid gap-4 xl:grid-cols-2";
const DISCLOSURE = "flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden";
/** Stays at the bottom of the scrolling pane, so the workflow actions are always in reach. */
const ACTION_BAR = "sticky bottom-0 z-10 -mx-4 grid gap-3 border-t border-brand-border bg-white px-4 py-3 sm:-mx-6 sm:px-6";
const TONE = { success: "bg-emerald-500", warning: "bg-amber-500", neutral: "bg-slate-300" } as const;

function StatusCell({ label, value, tone, children }: { label: string; value: string; tone: keyof typeof TONE; children?: ReactNode }) {
  return <div className="min-w-0 bg-white px-4 py-3">
    <dt className="text-xs text-muted">{label}</dt>
    <dd className="m-0 mt-1">
      <span className="flex items-start gap-2 text-sm font-semibold text-ink"><span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE[tone]}`} />{value}</span>
      {children ? <span className="mt-0.5 block pl-4 text-xs text-muted tabular-nums">{children}</span> : null}
    </dd>
  </div>;
}

function DraftSection({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return <section className="grid gap-4 border-t border-brand-border pt-5">
    <div><h4 className="m-0 text-[0.95rem] font-semibold text-ink">{title}</h4><p className="mt-0.5 mb-0 max-w-3xl text-xs leading-5 font-normal text-muted">{hint}</p></div>
    {children}
  </section>;
}

/** The exact saved terms as a document, grouped like the editor. Negotiated prose is shown verbatim. */
function SectionedTerms({ terms }: { terms: Terms }) {
  const t = useTranslations("coordinationAgreement");
  const format = useFormatter();
  const mad = (value: number) => format.number(value, { style: "currency", currency: "MAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  type Field = "tasks" | "exclusions" | "visits" | "availability" | "startDate" | "fee" | "basis" | "basisAmountMad" | "payer" | "paymentTerms";
  const pricing: [Field, string][] = [["startDate", terms.startDate], ["fee", terms.fee.kind === "fixed" ? mad(terms.fee.amountMad) : `${terms.fee.rate} %`]];
  if (terms.fee.kind === "percentage") {
    pricing.push(["basis", terms.fee.basis]);
    if (terms.fee.basisAmountMad !== undefined) pricing.push(["basisAmountMad", mad(terms.fee.basisAmountMad)]);
  }
  const groups: [string, [Field, string][]][] = [
    [t("adminSections.scope"), [["tasks", terms.tasks], ["exclusions", terms.exclusions]]],
    [t("adminSections.site"), [["visits", terms.visits], ["availability", terms.availability]]],
    [t("adminSections.schedule"), pricing],
    [t("adminSections.payment"), [["payer", terms.payer], ["paymentTerms", terms.paymentTerms]]],
  ];
  return <div className="grid gap-5 divide-y divide-brand-border [&>section:not(:first-child)]:pt-5">
    {groups.map(([title, rows]) => <section key={title}>
      <h4 className="m-0 text-xs font-semibold text-muted">{title}</h4>
      <dl className="mt-2.5 mb-0 grid gap-x-8 gap-y-3 text-sm xl:grid-cols-2">{rows.map(([field, value]) => <div className="min-w-0" key={field}>
        <dt className="font-semibold text-ink">{t(`fields.${field}`)}</dt><dd className="m-0 mt-1 break-words whitespace-pre-wrap text-muted">{value}</dd>
      </div>)}</dl>
    </section>)}
  </div>;
}
