"use client";

import { ApprovedCompanyLogo } from "@/features/companies/components/approved-company-logo";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  resolveProjectProgress,
  type ProgressStage,
} from "@/features/marketplace/lib/project-progress";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

type Conversation = FunctionReturnType<typeof api.messages.index.getConversation>;

/**
 * Right-hand context for a conversation: who the other party is, where the
 * project stands in the Batiplus lifecycle, and links to existing pages.
 * Read-only by design — workflow actions stay in the gated workflow card.
 */
export function ConversationContextPanel({
  accountType,
  conversation,
  conversationId,
}: {
  accountType: "client" | "company";
  conversation: Conversation;
  conversationId: Id<"conversations">;
}) {
  const t = useTranslations("messages.context");
  const tMessages = useTranslations("messages");
  const commercialWorkflowReady = conversation.quoteId !== null;
  const assessment = useQuery(
    api.siteVisits.index.getForConversation,
    commercialWorkflowReady ? { conversationId } : "skip",
  );
  const quote = useQuery(
    api.finalQuotes.index.getForConversation,
    commercialWorkflowReady ? { conversationId } : "skip",
  );
  // Only the selected Company (and the Client) may read the Deal, which exists once the quote is accepted.
  const dealVisible = quote?.finalQuote?.status === "accepted";
  const deal = useQuery(api.deals.index.getByProject, dealVisible ? { projectId: conversation.projectId } : "skip");

  const projectHref =
    accountType === "client"
      ? ({ pathname: routes.clientProject, params: { projectId: conversation.projectId } } as const)
      : ({ pathname: routes.companyProject, params: { projectId: conversation.projectId } } as const);
  const name = conversation.otherPartyName || tMessages("unknownParty");
  const loading =
    commercialWorkflowReady &&
    (assessment === undefined || quote === undefined || (dealVisible && deal === undefined));

  return (
    <div className="flex flex-col gap-6 px-5 py-5">
      <section aria-label={t("partyLabel")} className="flex flex-col items-center text-center">
        <PartyAvatar company={accountType === "client"} name={name} url={conversation.otherPartyAvatarUrl} />
        <p className="mt-3 mb-0 text-[0.95rem] font-semibold text-ink">{name}</p>
        <p className="mt-0.5 mb-0 text-xs text-muted">{accountType === "company" ? t("roleClient") : t("roleCompany")}</p>
        <div className="mt-4 flex w-full flex-col gap-2">
          <Link
            className="inline-flex min-h-10 w-full items-center justify-center rounded-sm border border-brand-border text-sm font-semibold text-brand transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            href={projectHref}
          >
            {t("viewProject")}
          </Link>
          {accountType === "client" && conversation.companySlug ? (
            <Link
              className="inline-flex min-h-10 w-full items-center justify-center rounded-sm text-sm font-semibold text-brand transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              href={{ pathname: "/entreprises/[slug]", params: { slug: conversation.companySlug } }}
            >
              {tMessages("viewCompanyProfile")}
            </Link>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="conversation-progress-title" className="border-t border-brand-border pt-5">
        <h3 className="m-0 text-sm font-semibold text-ink" id="conversation-progress-title">
          {t("progressTitle")}
        </h3>
        {loading ? (
          <div aria-busy="true" className="mt-4 grid gap-3" role="status">
            <span className="sr-only">{t("loading")}</span>
            {[0, 1, 2, 3].map((item) => (
              <div className="skeleton-block h-9 rounded-[10px]" key={item} />
            ))}
          </div>
        ) : (
          <ProgressTimeline
            stages={resolveProjectProgress({
              assessment: assessment?.assessment
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
              finalQuote: quote?.finalQuote
                ? {
                    status: quote.finalQuote.status,
                    companyName: quote.finalQuote.companyName,
                    changesRequestReason: quote.finalQuote.changesRequestReason,
                    revisions: quote.finalQuote.revisions,
                    canSubmit: quote.finalQuote.canSubmit,
                    canReview: quote.finalQuote.canReview,
                  }
                : null,
              deal: deal ? { status: deal.status } : null,
            })}
            visitDate={assessment?.assessment?.visit?.proposedDate ?? null}
            visitTime={assessment?.assessment?.visit?.proposedTime ?? null}
          />
        )}
      </section>
    </div>
  );
}

function ProgressTimeline({
  stages,
  visitDate,
  visitTime,
}: {
  stages: ProgressStage[];
  visitDate: string | null;
  visitTime: string | null;
}) {
  const t = useTranslations("messages.context");
  const format = useFormatter();
  const when = visitDate
    ? `${format.dateTime(new Date(`${visitDate}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}${visitTime ? ` · ${visitTime}` : ""}`
    : "";

  return (
    <ol className="m-0 mt-4 list-none p-0">
      {stages.map((stage, index) => (
        <li
          aria-current={stage.state === "current" ? "step" : undefined}
          className="relative flex gap-3 pb-5 last:pb-0"
          key={stage.key}
        >
          {index < stages.length - 1 ? (
            <span
              aria-hidden
              className={`absolute top-7 bottom-0 left-[11px] w-px ${stage.state === "done" ? "bg-brand/50" : "bg-brand-border"}`}
            />
          ) : null}
          <StageMarker state={stage.state} />
          <div className="min-w-0 pt-0.5">
            <p
              className={`m-0 text-sm leading-5 ${
                stage.state === "current"
                  ? "font-semibold text-ink"
                  : stage.state === "upcoming" || stage.state === "skipped"
                    ? "text-muted"
                    : "font-medium text-ink"
              }`}
            >
              {t(`stages.${stage.key}`)}
              <span className="sr-only">, {t(`states.${stage.state}`)}</span>
            </p>
            {stage.detail ? (
              <p className="mt-0.5 mb-0 text-xs leading-5 text-muted">
                {t(`detail.${stage.key}.${stage.detail}` as "detail.siteVisit.scheduled", { date: when })}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StageMarker({ state }: { state: ProgressStage["state"] }) {
  const base = "relative z-10 grid size-6 shrink-0 place-items-center rounded-sm";
  if (state === "done") {
    return (
      <span aria-hidden className={`${base} bg-brand text-white`}>
        <svg className="size-3.5" fill="none" viewBox="0 0 16 16">
          <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      </span>
    );
  }
  if (state === "current") {
    return (
      <span aria-hidden className={`${base} border-2 border-brand bg-white`}>
        <span className="size-2 rounded-sm bg-brand" />
      </span>
    );
  }
  if (state === "stopped") {
    return (
      <span aria-hidden className={`${base} bg-[#fde8e6] text-[#9b2c20]`}>
        <svg className="size-3" fill="none" viewBox="0 0 16 16">
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        </svg>
      </span>
    );
  }
  return (
    <span aria-hidden className={`${base} border border-dashed border-[#b9c4cc] bg-white`}>
      {state === "skipped" ? <span className="h-px w-2.5 bg-[#9aa6ae]" /> : null}
    </span>
  );
}

function PartyAvatar({ name, url, company }: { name: string; url: string | null; company: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span className="relative grid size-16 place-items-center overflow-hidden rounded-sm bg-brand-soft text-lg font-semibold text-brand-dark outline outline-1 -outline-offset-1 outline-black/10">
      {company ? <ApprovedCompanyLogo alt="" className="object-cover" fill sizes="64px" url={url} /> : url ? <Image alt="" className="object-cover" fill sizes="64px" src={url} /> : <span aria-hidden>{initials || "?"}</span>}
    </span>
  );
}
