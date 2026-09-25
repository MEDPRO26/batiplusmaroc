"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CalendarDays, Check, Clock3, History, MapPin, RotateCcw, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Link } from "@/i18n/navigation";
import { mapAppError } from "@/lib/errors/map-app-error";
import { routes } from "@/lib/routes";

type Result = FunctionReturnType<typeof api.siteVisits.index.getForProject>;
type Visit = NonNullable<NonNullable<Result["assessment"]>["visit"]>;

export function ConversationSiteAssessment({ conversationId }: { conversationId: Id<"conversations"> }) {
  const result = useQuery(api.siteVisits.index.getForConversation, { conversationId });
  if (result === undefined) return <AssessmentSkeleton />;
  return <SiteAssessmentPanel conversationId={conversationId} result={result} />;
}

export function ProjectSiteAssessment({ projectId }: { projectId: Id<"projects"> }) {
  const result = useQuery(api.siteVisits.index.getForProject, { projectId });
  if (result === undefined) return <AssessmentSkeleton />;
  if (!result.assessment) return null;
  return <SiteAssessmentPanel result={result} />;
}

export function SiteAssessmentPanel({ conversationId, result }: { conversationId?: Id<"conversations">; result: Result }) {
  const t = useTranslations("siteAssessment");
  const tUx = useTranslations("ux");
  const format = useFormatter();
  const invite = useMutation(api.siteVisits.index.invite);
  const respond = useMutation(api.siteVisits.index.respond);
  const proposeVisit = useMutation(api.siteVisits.index.proposeVisit);
  const respondToVisit = useMutation(api.siteVisits.index.respondToVisit);
  const cancelVisit = useMutation(api.siteVisits.index.cancelVisit);
  const completeVisit = useMutation(api.siteVisits.index.completeVisit);
  const [confirmingInvite, setConfirmingInvite] = useState(false);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposedDate, setProposedDate] = useState("");
  const [proposedTime, setProposedTime] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [note, setNote] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const assessment = result.assessment;
  const visit = assessment?.visit ?? null;
  const isBusy = busy !== null;
  const completionIsDue = visit?.canComplete === true && visit.scheduledEpoch <= clock;

  useEffect(() => {
    if (visit?.status !== "confirmed") return;
    const interval = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [visit?.status]);

  async function run(label: string, action: () => Promise<unknown>, onSuccess?: () => void) {
    setBusy(label);
    setError(null);
    try {
      await action();
      onSuccess?.();
    } catch (cause) {
      setError(mapAppError(cause, (key) => tUx(key)));
    } finally {
      setBusy(null);
    }
  }

  async function onPropose(event: FormEvent) {
    event.preventDefault();
    if (!assessment || !proposedDate || !proposedTime || siteAddress.trim().length < 8) {
      setError(t("visit.form.validation"));
      return;
    }
    await run("propose", () => proposeVisit({
      assessmentId: assessment.id, proposedDate, proposedTime,
      timezone: "Africa/Casablanca", siteAddress, note: note || undefined,
    }), () => {
      setShowProposalForm(false);
      setProposedDate(""); setProposedTime(""); setSiteAddress(""); setNote("");
    });
  }

  function beginReschedule(current: Visit) {
    setProposedDate(current.proposedDate);
    setProposedTime(current.proposedTime);
    setSiteAddress(current.siteAddress);
    setNote(current.note ?? "");
    setShowProposalForm(true);
  }

  if (!assessment && !result.canInvite) return null;
  const badgeStatus =
    visit?.status === "confirmed"
      ? "scheduled"
      : (visit?.status ?? assessment?.status);

  return (
    <section aria-labelledby="site-assessment-title" aria-live="polite" className="border-b border-brand-border bg-[#f6fafc] px-4 py-4 sm:px-7">
      <div className="mx-auto max-w-[760px] rounded-2xl border border-brand-border bg-white p-4 shadow-[0_1px_2px_rgb(23_61_99/0.04)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="m-0 text-[11px] font-bold tracking-[0.12em] text-brand uppercase">{t("eyebrow")}</p>
            <h3 className="mt-1 mb-0 text-base font-semibold text-ink" id="site-assessment-title">{t("title")}</h3>
          </div>
          {badgeStatus ? <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-dark">{t(`status.${badgeStatus}`)}</span> : null}
        </div>

        {!assessment ? (
          confirmingInvite ? (
            <div className="mt-4">
              <p className="m-0 text-sm leading-6 text-ink">{t("invite.confirmation")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton busy={isBusy} onClick={() => void run("invite", () => invite({ conversationId: conversationId! }))}>{t("invite.confirm")}</ActionButton>
                <SecondaryButton busy={isBusy} onClick={() => setConfirmingInvite(false)}>{t("actions.back")}</SecondaryButton>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <p className="m-0 text-sm leading-6 text-muted">{t("invite.description")}</p>
              <ActionButton className="mt-4" onClick={() => setConfirmingInvite(true)}>{t("invite.action")}</ActionButton>
            </div>
          )
        ) : (
          <div className="mt-4">
            {visit?.status === "proposed" || visit?.status === "confirmed" ? (
              <p className="m-0 text-sm text-muted">{t("company", { name: assessment.companyName })}</p>
            ) : (
              <>
                <p className="m-0 text-sm leading-6 text-ink">{t("company", { name: assessment.companyName })}</p>
                <p className="mt-1 mb-0 text-xs text-muted">{t("invitedAt", { date: format.dateTime(assessment.invitedAt, { dateStyle: "medium", timeStyle: "short" }) })}</p>
              </>
            )}
            {assessment.clientNote && !visit ? <p className="mt-3 mb-0 rounded-xl bg-surface-muted px-3 py-2 text-sm text-ink">{assessment.clientNote}</p> : null}

            {assessment.status === "invited" && result.viewerType === "company" ? (
              <div className="mt-4">
                <p className="m-0 text-sm leading-6 text-muted">{t("response.acknowledgement")}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton busy={isBusy} onClick={() => void run("accept", () => respond({ assessmentId: assessment.id, decision: "accept" }))}>{t("response.accept")}</ActionButton>
                  <SecondaryButton busy={isBusy} onClick={() => void run("decline-assessment", () => respond({ assessmentId: assessment.id, decision: "decline" }))}>{t("response.decline")}</SecondaryButton>
                </div>
              </div>
            ) : null}
            {assessment.status === "invited" && result.viewerType === "client" ? <p className="mt-4 mb-0 text-sm text-muted">{t("invite.waiting")}</p> : null}

            {assessment.status === "accepted" && (!visit || visit.status === "declined" || visit.status === "cancelled") && result.viewerType !== "admin" && !showProposalForm ? (
              <div className="mt-4 rounded-xl border border-brand-border bg-surface-muted p-4">
                <p className="m-0 text-sm leading-6 text-muted">{t("visit.intro")}</p>
                <ActionButton className="mt-4" onClick={() => setShowProposalForm(true)}>{t("visit.schedule")}</ActionButton>
              </div>
            ) : null}

            {visit ? <VisitSummary format={format} result={result} t={t} visit={visit} /> : null}

            {visit?.status === "proposed" && visit.canConfirm && !showProposalForm ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton busy={isBusy} onClick={() => void run("confirm", () => respondToVisit({ visitId: visit.id, decision: "confirm" }))}><Check aria-hidden className="size-4" />{t("visit.actions.confirm")}</ActionButton>
                <SecondaryButton busy={isBusy} onClick={() => beginReschedule(visit)}><RotateCcw aria-hidden className="size-4" />{t("visit.actions.reschedule")}</SecondaryButton>
                <DangerButton busy={isBusy} onClick={() => void run("decline-visit", () => respondToVisit({ visitId: visit.id, decision: "decline" }))}><X aria-hidden className="size-4" />{t("visit.actions.decline")}</DangerButton>
              </div>
            ) : null}

            {assessment.status === "accepted" && showProposalForm && result.viewerType !== "admin" ? (
              <ProposalForm busy={isBusy} date={proposedDate} note={note} onCancel={() => setShowProposalForm(false)} onDate={setProposedDate} onNote={setNote} onSubmit={onPropose} onTime={setProposedTime} onAddress={setSiteAddress} siteAddress={siteAddress} t={t} time={proposedTime} />
            ) : null}

            {visit?.status === "confirmed" && result.viewerType !== "admin" ? (
              showCancelForm ? (
                <div className="mt-4 rounded-xl border border-[#f0c7c3] bg-[#fff8f7] p-4">
                  <label className="grid gap-1.5 text-sm font-medium text-ink">{t("visit.cancel.reason")}<textarea className="min-h-20 rounded-xl border border-brand-border bg-white px-3 py-2 text-sm outline-none focus:border-brand" maxLength={500} onChange={(event) => setCancellationReason(event.target.value)} value={cancellationReason} /></label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <DangerButton busy={isBusy} onClick={() => void run("cancel-visit", () => cancelVisit({ visitId: visit.id, reason: cancellationReason || undefined }), () => setShowCancelForm(false))}>{t("visit.actions.cancel")}</DangerButton>
                    <SecondaryButton busy={isBusy} onClick={() => setShowCancelForm(false)}>{t("actions.back")}</SecondaryButton>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {completionIsDue ? (
                    <ActionButton busy={isBusy} onClick={() => void run("complete", () => completeVisit({ visitId: visit.id }))}>{t("visit.actions.complete")}</ActionButton>
                  ) : (
                    <p className="m-0 flex-1 text-xs leading-5 text-muted">{t("visit.actions.completeAfterVisit")}</p>
                  )}
                  <button
                    className="inline-flex min-h-11 items-center justify-center px-2 text-sm font-semibold text-[#a33a32] transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a33a32] disabled:opacity-55"
                    disabled={isBusy}
                    onClick={() => setShowCancelForm(true)}
                    type="button"
                  >
                    {t("visit.actions.cancel")}
                  </button>
                </div>
              )
            ) : null}

            {assessment.status === "accepted" && result.viewerType === "company" && !conversationId ? (
              <Link className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-brand-border bg-white px-5 text-sm font-semibold text-ink transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.96]" href={{ pathname: routes.messagesConversation, params: { conversationId: assessment.conversationId } }}>{t("visit.openConversation")}</Link>
            ) : null}
          </div>
        )}
        {error ? <p className="mt-3 mb-0 rounded-xl bg-[#fff4f2] px-3 py-2 text-sm text-[#8a2f28]" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}

function VisitSummary({ format, result, t, visit }: { format: ReturnType<typeof useFormatter>; result: Result; t: ReturnType<typeof useTranslations<"siteAssessment">>; visit: Visit }) {
  const visitDate = new Date(`${visit.proposedDate}T12:00:00Z`);
  const shortDate = format.dateTime(visitDate, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const longDate = format.dateTime(visitDate, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const isScheduled = visit.status === "proposed" || visit.status === "confirmed";
  const summaryLabel = t(`visit.summary.${visit.status}`, {
    date: shortDate,
    time: visit.proposedTime,
  });

  if (isScheduled) {
    return (
      <div
        aria-label={summaryLabel}
        className={`mt-4 rounded-2xl border px-4 py-4 sm:px-5 ${
          visit.status === "confirmed"
            ? "border-[#cfe3f4] bg-[#f4f9fc]"
            : "border-brand-border bg-[#fafbfc]"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full ${
              visit.status === "confirmed" ? "bg-white text-brand" : "bg-white text-ink"
            }`}
          >
            <CalendarDays className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="m-0 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
              {visit.status === "confirmed" ? t("status.scheduled") : t("status.proposed")}
            </p>
            <p className="mt-1 mb-0 text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
              {longDate}
            </p>
            <p className="mt-1 mb-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Clock3 aria-hidden className="size-3.5 text-muted" />
                {visit.proposedTime}
              </span>
              <span className="text-muted">·</span>
              <span className="text-muted">{t("visit.timezone")}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2.5 border-t border-brand-border/70 pt-4">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
          <p className="m-0 text-sm leading-6 text-ink">{visit.siteAddress}</p>
        </div>

        {visit.note ? (
          <p className="mt-3 mb-0 border-l-2 border-brand-border pl-3 text-sm leading-6 text-muted">
            {visit.note}
          </p>
        ) : null}

        {visit.status === "proposed" ? (
          <p className="mt-4 mb-0 text-xs leading-5 text-muted">
            {t(visit.canConfirm ? "visit.proposedBy.other" : "visit.proposedBy.you")}
          </p>
        ) : null}

        <VisitHistory t={t} visit={visit} />
        {result.viewerType === "admin" ? (
          <p className="mt-3 mb-0 text-xs text-muted">{t("visit.adminReadOnly")}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-brand-border bg-surface-muted px-4 py-4 sm:px-5">
      <p className="m-0 text-sm font-semibold text-ink">{summaryLabel}</p>
      <div className="mt-3 flex items-start gap-2.5">
        <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
        <p className="m-0 text-sm leading-6 text-ink">{visit.siteAddress}</p>
      </div>
      {visit.cancellationReason ? (
        <p className="mt-3 mb-0 text-sm leading-6 text-muted">{visit.cancellationReason}</p>
      ) : null}
      <VisitHistory t={t} visit={visit} />
      {result.viewerType === "admin" ? (
        <p className="mt-3 mb-0 text-xs text-muted">{t("visit.adminReadOnly")}</p>
      ) : null}
    </div>
  );
}

function VisitHistory({
  t,
  visit,
}: {
  t: ReturnType<typeof useTranslations<"siteAssessment">>;
  visit: Visit;
}) {
  if (visit.proposals.length <= 1) return null;
  return (
    <details className="mt-4 border-t border-brand-border/70 pt-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink">
        <History aria-hidden className="size-4" />
        {t("visit.history.title", { count: visit.proposals.length })}
      </summary>
      <ol className="mt-2 space-y-2">
        {visit.proposals.map((proposal) => (
          <li className="rounded-lg bg-white/80 px-3 py-2 text-xs text-muted" key={proposal.id}>
            {t("visit.history.item", {
              sequence: proposal.sequence,
              date: proposal.proposedDate,
              time: proposal.proposedTime,
            })}
          </li>
        ))}
      </ol>
    </details>
  );
}

function ProposalForm({ busy, date, note, onAddress, onCancel, onDate, onNote, onSubmit, onTime, siteAddress, t, time }: { busy: boolean; date: string; note: string; onAddress: (value: string) => void; onCancel: () => void; onDate: (value: string) => void; onNote: (value: string) => void; onSubmit: (event: FormEvent) => void; onTime: (value: string) => void; siteAddress: string; t: ReturnType<typeof useTranslations<"siteAssessment">>; time: string }) {
  return (
    <form className="mt-4 grid gap-3 rounded-xl border border-brand-border bg-white p-4" onSubmit={onSubmit}>
      <div><h4 className="m-0 text-sm font-semibold text-ink">{t("visit.form.title")}</h4><p className="mt-1 mb-0 text-xs leading-5 text-muted">{t("visit.form.description")}</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-ink">{t("visit.form.date")}<input className="min-h-11 rounded-xl border border-brand-border px-3 text-sm outline-none focus:border-brand" onChange={(event) => onDate(event.target.value)} required type="date" value={date} /></label>
        <label className="grid gap-1.5 text-sm font-medium text-ink">{t("visit.form.time")}<input className="min-h-11 rounded-xl border border-brand-border px-3 text-sm outline-none focus:border-brand" onChange={(event) => onTime(event.target.value)} required type="time" value={time} /></label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium text-ink">{t("visit.form.address")}<input autoComplete="street-address" className="min-h-11 rounded-xl border border-brand-border px-3 text-sm outline-none focus:border-brand" maxLength={500} minLength={8} onChange={(event) => onAddress(event.target.value)} required value={siteAddress} /></label>
      <label className="grid gap-1.5 text-sm font-medium text-ink">{t("visit.form.note")}<textarea className="min-h-20 rounded-xl border border-brand-border px-3 py-2 text-sm outline-none focus:border-brand" maxLength={1000} onChange={(event) => onNote(event.target.value)} value={note} /></label>
      <div className="flex flex-wrap gap-2"><ActionButton busy={busy} type="submit">{t("visit.form.submit")}</ActionButton><SecondaryButton busy={busy} onClick={onCancel}>{t("actions.back")}</SecondaryButton></div>
    </form>
  );
}

function ActionButton({ busy = false, className = "", type = "button", onClick, children }: { busy?: boolean; className?: string; type?: "button" | "submit"; onClick?: () => void; children: React.ReactNode }) {
  return <button className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white transition-[transform,background-color] duration-150 hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.96] disabled:opacity-55 ${className}`} disabled={busy} onClick={onClick} type={type}>{children}</button>;
}
function SecondaryButton({ busy = false, onClick, children }: { busy?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-brand-border bg-white px-5 text-sm font-semibold text-ink transition-[transform,background-color] duration-150 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.96] disabled:opacity-55" disabled={busy} onClick={onClick} type="button">{children}</button>;
}
function DangerButton({ busy = false, onClick, children }: { busy?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#efc7c3] bg-white px-5 text-sm font-semibold text-[#a33a32] transition-[transform,background-color] duration-150 hover:bg-[#fff4f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a33a32] active:scale-[0.96] disabled:opacity-55" disabled={busy} onClick={onClick} type="button">{children}</button>;
}
function AssessmentSkeleton() { return <div aria-busy="true" className="border-b border-brand-border bg-[#f6fafc] px-4 py-4" role="status"><div className="mx-auto h-28 max-w-[760px] animate-pulse rounded-2xl bg-surface-muted" /></div>; }
