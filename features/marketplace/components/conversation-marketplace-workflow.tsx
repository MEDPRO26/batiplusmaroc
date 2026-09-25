"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FinalQuoteSheet } from "@/features/final-quotes/components/conversation-final-quote-panel";
import {
  latestRevision,
  resolveConversationWorkflow,
  type ConversationWorkflowKind,
  type ConversationWorkflowState,
} from "@/features/marketplace/lib/conversation-workflow";
import { SiteAssessmentPanel } from "@/features/site-assessments/components/site-assessment-panel";
import { mapAppError } from "@/lib/errors/map-app-error";

type AssessmentQuery = FunctionReturnType<typeof api.siteVisits.index.getForConversation>;
type QuoteQuery = FunctionReturnType<typeof api.finalQuotes.index.getForConversation>;

export type AssessmentResult = {
  viewerType: AssessmentQuery["viewerType"];
  canInvite: boolean;
  assessment: AssessmentQuery["assessment"];
};

export type QuoteResult = {
  viewerType: QuoteQuery["viewerType"];
  canRequest: boolean;
  canPrepare: boolean;
  finalQuote: QuoteQuery["finalQuote"];
};

export function ConversationMarketplaceWorkflow({ conversationId }: { conversationId: Id<"conversations"> }) {
  const t = useTranslations("marketplaceWorkflow");
  const assessment = useQuery(api.siteVisits.index.getForConversation, { conversationId });
  const quote = useQuery(api.finalQuotes.index.getForConversation, { conversationId });
  if (assessment === undefined || quote === undefined) {
    return (
      <section aria-busy="true" className="border-b border-[#e6eaee] bg-white px-5 py-3" role="status">
        <span className="sr-only">{t("loading")}</span>
        <div className="mx-auto h-12 max-w-[720px] animate-pulse rounded-lg bg-[#f3f5f7]" />
      </section>
    );
  }
  return <MarketplaceWorkflowCard assessment={assessment} conversationId={conversationId} quote={quote} />;
}

export function MarketplaceWorkflowCard({
  assessment,
  conversationId,
  quote,
}: {
  assessment: AssessmentResult;
  conversationId: Id<"conversations">;
  quote: QuoteResult;
}) {
  const t = useTranslations("marketplaceWorkflow");
  const tUx = useTranslations("ux");
  const format = useFormatter();
  const invite = useMutation(api.siteVisits.index.invite);
  const requestQuote = useMutation(api.finalQuotes.index.request);
  const prepareAfterVisit = useMutation(api.finalQuotes.index.prepareAfterSiteVisit);
  const [busy, setBusy] = useState(false);
  const [confirmingVisit, setConfirmingVisit] = useState(false);
  const [error, setError] = useState("");
  const [openQuote, setOpenQuote] = useState(false);
  const workflow = resolveConversationWorkflow({
    viewerType: quote.viewerType,
    canInvite: assessment.canInvite && !quote.finalQuote,
    canRequest: quote.canRequest,
    canPrepare: quote.canPrepare,
    assessment: assessment.assessment
      ? {
          status: assessment.assessment.status,
          companyName: assessment.assessment.companyName,
          visit: assessment.assessment.visit
            ? {
                status: assessment.assessment.visit.status,
                proposedDate: assessment.assessment.visit.proposedDate,
                proposedTime: assessment.assessment.visit.proposedTime,
              }
            : null,
        }
      : null,
    finalQuote: quote.finalQuote
      ? {
          status: quote.finalQuote.status,
          companyName: quote.finalQuote.companyName,
          changesRequestReason: quote.finalQuote.changesRequestReason,
          revisions: quote.finalQuote.revisions.map((revision) => ({
            revisionNumber: revision.revisionNumber,
            price: revision.price,
            duration: revision.duration,
            validUntil: revision.validUntil,
          })),
          canSubmit: quote.finalQuote.canSubmit,
          canReview: quote.finalQuote.canReview,
        }
      : null,
  });

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setConfirmingVisit(false);
    } catch (cause) {
      setError(mapAppError(cause, (key) => tUx(key)));
    } finally {
      setBusy(false);
    }
  }

  if (workflow.kind === "hidden") return null;

  if (workflow.kind === "site_visit") {
    return <CompactSiteVisit conversationId={conversationId} result={assessment} />;
  }

  const latest = latestRevision(quote.finalQuote);
  const companyName = quote.finalQuote?.companyName || assessment.assessment?.companyName || "";
  const pill = pillFor(workflow.kind, t);
  const title = titleFor(workflow.kind, t, Boolean(latest && latest.revisionNumber > 1 && quote.viewerType === "client"));

  return (
    <section aria-labelledby="marketplace-workflow-title" className="border-b border-[#e6eaee] bg-white px-5 py-3 sm:px-7">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="m-0 text-[11px] font-medium tracking-[0.08em] text-[#6b7785] uppercase">
              {eyebrowFor(workflow.kind, t)}
            </p>
            {pill ? <StatusPill>{pill}</StatusPill> : null}
          </div>
          <h3 className="mt-1 mb-0 text-[16px] leading-6 font-semibold text-ink" id="marketplace-workflow-title">
            {title}
          </h3>
          <WorkflowLead
            companyName={companyName}
            format={format}
            kind={workflow.kind}
            latest={latest}
            quote={quote.finalQuote}
            t={t}
            viewerType={quote.viewerType}
          />
          {error ? (
            <p className="mt-2 mb-0 text-[13px] text-[#8a2f28]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <WorkflowActions
          busy={busy}
          confirmingVisit={confirmingVisit}
          onConfirmVisit={() => void run(() => invite({ conversationId }))}
          onOpenQuote={() => setOpenQuote(true)}
          onPrepare={() => {
            if (quote.finalQuote) {
              setOpenQuote(true);
              return;
            }
            void run(async () => {
              await prepareAfterVisit({ conversationId });
              setOpenQuote(true);
            });
          }}
          onRequestQuote={() => void run(() => requestQuote({ conversationId }))}
          onStartVisit={() => setConfirmingVisit(true)}
          setConfirmingVisit={setConfirmingVisit}
          workflow={workflow}
        />
      </div>
      {openQuote && quote.finalQuote ? (
        <FinalQuoteSheet
          conversationId={conversationId}
          onClose={() => setOpenQuote(false)}
          quote={quote.finalQuote}
          viewerType={quote.viewerType}
        />
      ) : null}
    </section>
  );
}

function CompactSiteVisit({
  conversationId,
  result,
}: {
  conversationId: Id<"conversations">;
  result: AssessmentResult;
}) {
  const t = useTranslations("marketplaceWorkflow");
  const format = useFormatter();
  const visit = result.assessment?.visit ?? null;
  const scheduled = visit?.status === "proposed" || visit?.status === "confirmed";
  const mustShow =
    (result.assessment?.status === "invited" && result.viewerType === "company") ||
    (result.assessment?.status === "accepted" && (!visit || visit.status === "declined" || visit.status === "cancelled"));
  const [open, setOpen] = useState(mustShow);
  const dateLabel = visit
    ? format.dateTime(new Date(`${visit.proposedDate}T12:00:00Z`), {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : null;
  const pill =
    visit?.status === "confirmed" || visit?.status === "proposed"
      ? t("pill.siteVisitScheduled")
      : t("pill.siteVisitRequested");

  return (
    <section aria-labelledby="marketplace-workflow-title" className="border-b border-[#e6eaee] bg-white px-5 py-3 sm:px-7">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="m-0 text-[11px] font-medium tracking-[0.08em] text-[#6b7785] uppercase">{t("siteVisit")}</p>
            <StatusPill>{pill}</StatusPill>
          </div>
          {scheduled || result.assessment?.status === "invited" ? (
            <button className="min-h-10 text-[14px] font-medium text-brand" onClick={() => setOpen((value) => !value)} type="button">
              {open ? t("hideDetails") : t("viewDetails")}
            </button>
          ) : null}
        </div>
        <h3 className="mt-1 mb-0 text-[16px] leading-6 font-semibold text-ink" id="marketplace-workflow-title">
          {t("siteVisit")}
        </h3>
        {result.assessment?.status === "invited" && result.viewerType === "client" ? (
          <p className="mt-1 mb-0 text-[13px] leading-5 text-[#5b6570]">{t("waitingAccept")}</p>
        ) : null}
        {result.assessment?.status === "accepted" && !visit ? (
          <p className="mt-1 mb-0 text-[13px] leading-5 text-[#5b6570]">{t("companyAccepted")}</p>
        ) : null}
        {scheduled && dateLabel ? (
          <p className="mt-1 mb-0 text-[13px] leading-5 text-ink">
            {dateLabel} · {visit.proposedTime}
            {visit.siteAddress ? <span className="text-[#5b6570]"> · {visit.siteAddress}</span> : null}
          </p>
        ) : null}
        {open || mustShow ? (
          <div className="mt-3">
            <SiteAssessmentPanel chrome="plain" conversationId={conversationId} hideHeader result={result} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-[#f3f5f7] px-2 py-0.5 text-[12px] font-medium text-[#3d4a59]">
      {children}
    </span>
  );
}

function eyebrowFor(kind: ConversationWorkflowKind, t: ReturnType<typeof useTranslations<"marketplaceWorkflow">>) {
  if (kind === "choice" || kind === "request_only" || kind === "company_wait") return t("nextStep");
  if (kind === "request_after_visit") return t("siteVisit");
  if (kind === "quote_accepted") return t("companySelected");
  return t("finalQuote");
}

function pillFor(kind: ConversationWorkflowKind, t: ReturnType<typeof useTranslations<"marketplaceWorkflow">>) {
  if (kind === "choice" || kind === "request_only") return t("pill.discussionOpen");
  if (kind === "request_after_visit") return t("siteVisitCompleted");
  if (kind === "quote_requested" || kind === "company_prepare") return t("pill.finalQuoteRequested");
  if (kind === "quote_submitted") return t("pill.finalQuoteSubmitted");
  if (kind === "quote_changes") return t("pill.changesRequested");
  if (kind === "quote_accepted") return t("pill.companySelected");
  return null;
}

function titleFor(
  kind: ConversationWorkflowKind,
  t: ReturnType<typeof useTranslations<"marketplaceWorkflow">>,
  updatedOffer: boolean,
) {
  if (kind === "choice" || kind === "request_only") return t("nextStepTitle");
  if (kind === "company_wait") return t("companyWaitingLead");
  if (kind === "request_after_visit") return t("siteVisitCompleted");
  if (kind === "quote_requested" || kind === "company_prepare") return t("requestedTitle");
  if (kind === "quote_submitted") return updatedOffer ? t("updatedOffer") : t("finalQuote");
  if (kind === "quote_changes") return t("changesRequested");
  if (kind === "quote_accepted") return t("companySelected");
  if (kind === "quote_declined") return t("declinedLead");
  if (kind === "quote_withdrawn") return t("withdrawnLead");
  return t("finalQuote");
}

function WorkflowLead({
  companyName,
  format,
  kind,
  latest,
  quote,
  t,
  viewerType,
}: {
  companyName: string;
  format: ReturnType<typeof useFormatter>;
  kind: ConversationWorkflowKind;
  latest: ReturnType<typeof latestRevision>;
  quote: QuoteResult["finalQuote"];
  t: ReturnType<typeof useTranslations<"marketplaceWorkflow">>;
  viewerType: QuoteResult["viewerType"];
}) {
  const money = latest
    ? format.number(latest.price, { style: "currency", currency: "MAD", maximumFractionDigits: 0 })
    : null;
  const validUntil = latest
    ? format.dateTime(new Date(`${latest.validUntil}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })
    : null;

  if (kind === "choice" || kind === "request_only") {
    return <p className="mt-1 mb-0 text-[13px] leading-5 text-[#5b6570]">{t("chooseHow")}</p>;
  }
  if (kind === "company_wait") {
    return (
      <>
        <p className="mt-1 mb-0 text-[13px] leading-5 text-[#5b6570]">{t("companyWaitingSupport")}</p>
        <p className="mt-1 mb-0 text-[12px] text-[#6b7785]">{t("noAction")}</p>
      </>
    );
  }
  if (kind === "request_after_visit") {
    return <p className="mt-1 mb-0 text-[13px] leading-5 text-[#5b6570]">{t("requestAfterVisit")}</p>;
  }
  if (kind === "quote_requested") {
    if (viewerType === "company") {
      return <p className="mt-1 mb-0 text-[13px] leading-5 text-[#5b6570]">{t("clientReady")}</p>;
    }
    return (
      <>
        {companyName ? <p className="mt-1 mb-0 text-[13px] font-medium text-ink">{t("requestedFrom", { name: companyName })}</p> : null}
        <p className="mt-0.5 mb-0 text-[13px] leading-5 text-[#5b6570]">{t("waitingOffer")}</p>
      </>
    );
  }
  if (kind === "company_prepare") {
    return <p className="mt-1 mb-0 text-[13px] leading-5 text-[#5b6570]">{t("clientReady")}</p>;
  }
  if (kind === "quote_submitted" && latest && money && validUntil) {
    return (
      <div className="mt-2">
        {companyName ? <p className="m-0 text-[13px] font-medium text-ink">{companyName}</p> : null}
        {latest.revisionNumber > 1 ? (
          <p className="mt-0.5 mb-0 text-[12px] text-[#6b7785]">
            {viewerType === "company" ? t("companyUpdated") : t("updatedAfterChanges")}
          </p>
        ) : null}
        <p className="mt-1 mb-0 text-[22px] leading-7 font-semibold tracking-[-0.03em] text-ink">{money}</p>
        <p className="mt-0.5 mb-0 text-[13px] text-[#3d4a59]">
          {t("days", { count: latest.duration })}
          <span className="text-[#9aa3ad]"> · </span>
          {t("validUntil", { date: validUntil })}
        </p>
        <p className="mt-0.5 mb-0 text-[12px] text-[#6b7785]">{t("revision", { number: latest.revisionNumber })}</p>
      </div>
    );
  }
  if (kind === "quote_changes") {
    return (
      <>
        {quote?.changesRequestReason ? (
          <p className="mt-1 mb-0 text-[13px] leading-5 text-[#7a5b12]">{quote.changesRequestReason}</p>
        ) : (
          <p className="mt-1 mb-0 text-[13px] leading-5 text-[#5b6570]">{t("changesRequested")}</p>
        )}
        {latest && money ? <p className="mt-1 mb-0 text-[22px] font-semibold tracking-[-0.03em] text-ink">{money}</p> : null}
        {latest ? <p className="mt-0.5 mb-0 text-[12px] text-[#6b7785]">{t("revision", { number: latest.revisionNumber })}</p> : null}
      </>
    );
  }
  if (kind === "quote_accepted" && money) {
    return (
      <>
        <p className="mt-1 mb-0 text-[13px] font-medium text-ink">
          {viewerType === "company" ? t("selected") : companyName}
        </p>
        <p className="mt-2 mb-0 text-[11px] font-medium tracking-[0.08em] text-[#6b7785] uppercase">{t("agreedQuote")}</p>
        <p className="mt-0.5 mb-0 text-[22px] font-semibold tracking-[-0.03em] text-ink">{money}</p>
        {viewerType === "client" ? <p className="mt-1 mb-0 text-[13px] text-[#5b6570]">{t("selectedReady")}</p> : null}
      </>
    );
  }
  return null;
}

function WorkflowActions({
  busy,
  confirmingVisit,
  onConfirmVisit,
  onOpenQuote,
  onPrepare,
  onRequestQuote,
  onStartVisit,
  setConfirmingVisit,
  workflow,
}: {
  busy: boolean;
  confirmingVisit: boolean;
  onConfirmVisit: () => void;
  onOpenQuote: () => void;
  onPrepare: () => void;
  onRequestQuote: () => void;
  onStartVisit: () => void;
  setConfirmingVisit: (value: boolean) => void;
  workflow: ConversationWorkflowState;
}) {
  const t = useTranslations("marketplaceWorkflow");
  if (workflow.kind === "company_wait") return null;
  if (confirmingVisit && workflow.actions.includes("schedule_visit")) {
    return (
      <div className="w-full shrink-0 sm:w-auto">
        <p className="m-0 text-[13px] leading-5 text-ink">{t("confirmVisit")}</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <PrimaryButton busy={busy} onClick={onConfirmVisit}>{t("sendInvite")}</PrimaryButton>
          <SecondaryButton busy={busy} onClick={() => setConfirmingVisit(false)}>{t("back")}</SecondaryButton>
        </div>
      </div>
    );
  }
  if (workflow.actions.length === 0) return null;
  return (
    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:items-end">
      {workflow.actions.includes("schedule_visit") ? (
        <PrimaryButton busy={busy} onClick={onStartVisit}>{t("scheduleVisit")}</PrimaryButton>
      ) : null}
      {workflow.actions.includes("request_quote") ? (
        <button
          className={workflow.actions.includes("schedule_visit") ? secondaryClass : primaryClass}
          disabled={busy}
          onClick={onRequestQuote}
          type="button"
        >
          {t("requestQuote")}
        </button>
      ) : null}
      {workflow.actions.includes("prepare_quote") ? (
        <PrimaryButton busy={busy} onClick={onPrepare}>{t("prepare")}</PrimaryButton>
      ) : null}
      {workflow.actions.includes("revise_quote") ? (
        <PrimaryButton busy={busy} onClick={onOpenQuote}>{t("reviewAndRevise")}</PrimaryButton>
      ) : null}
      {workflow.actions.includes("review_quote") ? (
        <PrimaryButton busy={busy} onClick={onOpenQuote}>{t("reviewQuote")}</PrimaryButton>
      ) : null}
      {workflow.actions.includes("view_quote") ? (
        <SecondaryButton busy={busy} onClick={onOpenQuote}>{t("viewQuote")}</SecondaryButton>
      ) : null}
    </div>
  );
}

const primaryClass =
  "inline-flex min-h-10 w-full items-center justify-center rounded-full bg-brand px-4 text-[14px] font-medium text-white transition-[transform,background-color] duration-150 hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.96] disabled:opacity-55 sm:w-auto";
const secondaryClass =
  "inline-flex min-h-10 w-full items-center justify-center rounded-full border border-[#d7dde3] bg-white px-4 text-[14px] font-medium text-ink transition-[transform,background-color] duration-150 hover:bg-[#f7f8f9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-[0.96] disabled:opacity-55 sm:w-auto";

function PrimaryButton({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={primaryClass} disabled={busy} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function SecondaryButton({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={secondaryClass} disabled={busy} onClick={onClick} type="button">
      {children}
    </button>
  );
}
