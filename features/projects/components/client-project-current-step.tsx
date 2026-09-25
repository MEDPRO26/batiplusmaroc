"use client";

import { useQuery } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { ProjectDetails } from "@/features/projects/components/client-project-details";
import { latestRevision } from "@/features/marketplace/lib/conversation-workflow";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";

export function ClientProjectCurrentStep({ project }: { project: ProjectDetails }) {
  const t = useTranslations("clientProjects.currentStep");
  const format = useFormatter();
  const relevant =
    project.viewerRole === "owner" &&
    (project.status === "in_discussion" || project.status === "company_selected");
  const quotes = useQuery(api.quotes.index.listReceivedInitialQuotes, relevant ? { projectId: project.id } : "skip");
  const threads = useQuery(api.messages.index.listMyThreads, relevant ? {} : "skip");
  const thread = threads?.find((item) => item.projectId === project.id) ?? null;
  const quote = useQuery(
    api.finalQuotes.index.getForConversation,
    relevant && thread ? { conversationId: thread.id } : "skip",
  );
  if (!relevant || quotes === undefined || threads === undefined) return null;

  const openQuote = quotes.find((item) => item.status === "discussion_open") ?? quotes[0] ?? null;
  const companyName = thread?.otherPartyName || openQuote?.company.name || "";
  const conversationId = thread?.id ?? null;
  const finalQuote = quote?.finalQuote ?? null;
  const latest = latestRevision(finalQuote);
  const selected = project.status === "company_selected" || finalQuote?.status === "accepted";
  const submitted = finalQuote?.status === "submitted";

  if (!companyName && !conversationId) return null;

  const title = selected ? t("companySelected") : submitted ? t("quoteReceived") : t("reviewing", { name: companyName });

  return (
    <section aria-labelledby="project-current-step-title" className="mt-6 border-b border-[#e6eaee] pb-5">
      <p className="m-0 text-[11px] font-medium tracking-[0.08em] text-[#6b7785] uppercase">{t("eyebrow")}</p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="m-0 text-[16px] font-semibold text-ink" id="project-current-step-title">
            {title}
          </h2>
          {companyName ? <p className="mt-1 mb-0 text-[13px] font-medium text-ink">{companyName}</p> : null}
          {!selected && !submitted ? <p className="mt-0.5 mb-0 text-[13px] text-[#5b6570]">{t("discussionOpened")}</p> : null}
          {latest && (selected || submitted) ? (
            <p className="mt-1 mb-0 text-[20px] font-semibold tracking-[-0.03em] text-ink">
              {format.number(latest.price, { style: "currency", currency: "MAD", maximumFractionDigits: 0 })}
            </p>
          ) : null}
        </div>
        {conversationId ? (
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand px-4 text-[14px] font-medium text-white"
            href={{ pathname: routes.messagesConversation, params: { conversationId } }}
          >
            {selected ? t("openConversation") : t("continueConversation")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
