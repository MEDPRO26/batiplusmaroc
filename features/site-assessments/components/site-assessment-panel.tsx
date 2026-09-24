"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useFormatter, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { mapAppError } from "@/lib/errors/map-app-error";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

type Result = FunctionReturnType<typeof api.siteVisits.index.getForProject>;

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
  const schedule = useMutation(api.siteVisits.index.schedule);
  const cancel = useMutation(api.siteVisits.index.cancel);
  const complete = useMutation(api.siteVisits.index.complete);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [note, setNote] = useState("");
  const assessment = result.assessment;

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try { await action(); }
    catch (cause) { setError(mapAppError(cause, (key) => tUx(key))); }
    finally { setBusy(null); }
  }

  async function onSchedule(event: FormEvent) {
    event.preventDefault();
    if (!assessment) return;
    const timestamp = new Date(scheduledAt).getTime();
    if (!Number.isFinite(timestamp) || siteAddress.trim().length < 8) {
      setError(t("schedule.validation"));
      return;
    }
    await run("schedule", () => schedule({ assessmentId: assessment.id, scheduledAt: timestamp, siteAddress, clientNote: note || undefined }));
  }

  if (!assessment && !result.canInvite) return null;

  return (
    <section aria-labelledby="site-assessment-title" aria-live="polite" className="border-b border-brand-border bg-[#f6fafc] px-4 py-4 sm:px-7">
      <div className="mx-auto max-w-[760px] rounded-2xl border border-brand-border bg-white p-4 shadow-[0_1px_2px_rgb(23_61_99/0.04)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="m-0 text-[11px] font-bold tracking-[0.12em] text-brand uppercase">{t("eyebrow")}</p><h3 className="mt-1 mb-0 text-base font-semibold text-ink" id="site-assessment-title">{t("title")}</h3></div>
          {assessment ? <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-dark">{t(`status.${assessment.status}`)}</span> : null}
        </div>

        {!assessment ? (
          confirming ? <div className="mt-4"><p className="m-0 text-sm leading-6 text-ink">{t("invite.confirmation")}</p><div className="mt-4 flex flex-wrap gap-2"><ActionButton busy={busy === "invite"} onClick={() => void run("invite", () => invite({ conversationId: conversationId! }))}>{t("invite.confirm")}</ActionButton><SecondaryButton onClick={() => setConfirming(false)}>{t("actions.back")}</SecondaryButton></div></div>
          : <div className="mt-3"><p className="m-0 text-sm leading-6 text-muted">{t("invite.description")}</p><ActionButton className="mt-4" onClick={() => setConfirming(true)}>{t("invite.action")}</ActionButton></div>
        ) : (
          <div className="mt-4">
            <p className="m-0 text-sm leading-6 text-ink">{t("company", { name: assessment.companyName })}</p>
            <p className="mt-1 mb-0 text-xs text-muted">{t("invitedAt", { date: format.dateTime(assessment.invitedAt, { dateStyle: "medium", timeStyle: "short" }) })}</p>
            {assessment.clientNote ? <p className="mt-3 mb-0 rounded-xl bg-surface-muted px-3 py-2 text-sm text-ink">{assessment.clientNote}</p> : null}

            {assessment.status === "invited" && result.viewerType === "company" ? <div className="mt-4"><p className="m-0 text-sm leading-6 text-muted">{t("response.acknowledgement")}</p><div className="mt-4 flex flex-wrap gap-2"><ActionButton busy={busy === "accept"} onClick={() => void run("accept", () => respond({ assessmentId: assessment.id, decision: "accept" }))}>{t("response.accept")}</ActionButton><SecondaryButton busy={busy === "decline"} onClick={() => void run("decline", () => respond({ assessmentId: assessment.id, decision: "decline" }))}>{t("response.decline")}</SecondaryButton></div></div> : null}
            {assessment.status === "invited" && result.viewerType === "client" ? <p className="mt-4 mb-0 text-sm text-muted">{t("invite.waiting")}</p> : null}

            {assessment.status === "accepted" && result.viewerType === "client" ? <form className="mt-4 grid gap-3" onSubmit={onSchedule}><p className="m-0 text-sm leading-6 text-muted">{t("schedule.description")}</p><label className="grid gap-1.5 text-sm font-medium text-ink">{t("schedule.date")}<input className="min-h-11 rounded-xl border border-brand-border px-3 text-sm outline-none focus:border-brand" onChange={(event) => setScheduledAt(event.target.value)} required type="datetime-local" value={scheduledAt} /></label><label className="grid gap-1.5 text-sm font-medium text-ink">{t("schedule.address")}<input autoComplete="street-address" className="min-h-11 rounded-xl border border-brand-border px-3 text-sm outline-none focus:border-brand" maxLength={500} minLength={8} onChange={(event) => setSiteAddress(event.target.value)} required value={siteAddress} /></label><label className="grid gap-1.5 text-sm font-medium text-ink">{t("schedule.note")}<textarea className="min-h-20 rounded-xl border border-brand-border px-3 py-2 text-sm outline-none focus:border-brand" maxLength={1000} onChange={(event) => setNote(event.target.value)} value={note} /></label><ActionButton busy={busy === "schedule"} type="submit">{t("schedule.action")}</ActionButton></form> : null}
            {assessment.status === "accepted" && result.viewerType === "company" ? <div className="mt-4"><p className="m-0 text-sm text-muted">{t("schedule.waiting")}</p>{!conversationId ? <Link className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.96]" href={{ pathname: routes.messagesConversation, params: { conversationId: assessment.conversationId } }}>{t("schedule.openConversation")}</Link> : null}</div> : null}

            {assessment.status === "scheduled" && assessment.scheduledAt ? <dl className="mt-4 grid gap-3 rounded-xl bg-surface-muted p-4 text-sm"><div><dt className="text-muted">{t("schedule.date")}</dt><dd className="mt-1 font-semibold text-ink">{format.dateTime(assessment.scheduledAt, { dateStyle: "full", timeStyle: "short" })}</dd></div>{assessment.siteAddress ? <div><dt className="text-muted">{t("schedule.address")}</dt><dd className="mt-1 font-semibold text-ink">{assessment.siteAddress}</dd></div> : null}</dl> : null}
            {(assessment.status === "accepted" || assessment.status === "scheduled") && result.viewerType !== "admin" ? <div className="mt-4 flex flex-wrap gap-2"><SecondaryButton busy={busy === "cancel"} onClick={() => void run("cancel", () => cancel({ assessmentId: assessment.id }))}>{t("actions.cancel")}</SecondaryButton>{assessment.status === "scheduled" && result.viewerType === "client" ? <ActionButton busy={busy === "complete"} onClick={() => void run("complete", () => complete({ assessmentId: assessment.id }))}>{t("actions.complete")}</ActionButton> : null}</div> : null}
          </div>
        )}
        {error ? <p className="mt-3 mb-0 rounded-xl bg-[#fff4f2] px-3 py-2 text-sm text-[#8a2f28]" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}

function ActionButton({ busy = false, className = "", type = "button", onClick, children }: { busy?: boolean; className?: string; type?: "button" | "submit"; onClick?: () => void; children: React.ReactNode }) {
  return <button className={`inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white transition-[transform,background-color] duration-150 hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.96] disabled:opacity-55 ${className}`} disabled={busy} onClick={onClick} type={type}>{children}</button>;
}
function SecondaryButton({ busy = false, onClick, children }: { busy?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className="inline-flex min-h-11 items-center justify-center rounded-full border border-brand-border bg-white px-5 text-sm font-semibold text-ink transition-transform duration-150 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.96] disabled:opacity-55" disabled={busy} onClick={onClick} type="button">{children}</button>;
}
function AssessmentSkeleton() { return <div aria-busy="true" className="border-b border-brand-border bg-[#f6fafc] px-4 py-4"><div className="mx-auto h-24 max-w-[760px] animate-pulse rounded-2xl bg-surface-muted" /></div>; }
