"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { EmptyState } from "@/features/shared/components/error-state";
import { TableListSkeleton } from "@/features/shared/components/skeletons";
import {
  StatusBadge,
  WorkspacePage,
  WorkspacePageHeader,
  WorkspacePanel,
  WorkspaceTabs,
  workspaceButton,
  type BadgeTone,
} from "@/features/shared/components/workspace-page";
import { Link, useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";
import { routes } from "@/lib/routes";

type Proposal = FunctionReturnType<typeof api.proposals.index.listMyProposals>[number];
type Filter = "all" | "open" | "discussion" | "closed";
type City = NonNullable<Doc<"projects">["city"]>;

const FILTER_STATUSES: Record<Exclude<Filter, "all">, Proposal["status"][]> = {
  open: ["submitted", "viewed", "shortlisted"],
  discussion: ["discussion_open"],
  closed: ["declined", "withdrawn"],
};

const STATUS_TONE: Record<Proposal["status"], BadgeTone> = {
  submitted: "neutral",
  viewed: "brand",
  shortlisted: "brand",
  discussion_open: "success",
  declined: "danger",
  withdrawn: "neutral",
};

export function CompanyProposals() {
  const t = useTranslations("companyProposals");
  const user = useQuery(api.users.currentUser);
  const router = useRouter();
  const canLoad = user?.accountType === "company" && user.onboardingStatus === "completed";
  const proposals = useQuery(api.proposals.index.listMyProposals, canLoad ? {} : "skip");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (user === null) router.replace(routes.signIn);
    else if (user && !canLoad) router.replace(workspaceRouteForUser(user));
  }, [canLoad, router, user]);

  const count = (value: Filter) =>
    value === "all"
      ? (proposals?.length ?? 0)
      : (proposals ?? []).filter((item) => FILTER_STATUSES[value].includes(item.status)).length;
  const visible =
    filter === "all"
      ? (proposals ?? [])
      : (proposals ?? []).filter((item) => FILTER_STATUSES[filter].includes(item.status));

  return (
    <WorkspacePage busy={proposals === undefined}>
      <WorkspacePageHeader
        actions={
          <Link className={workspaceButton.secondary} href={routes.companyProjects}>
            {t("findProjects")}
          </Link>
        }
        lead={t("lead")}
        title={t("title")}
      />
      <div className="mt-7">
        <WorkspaceTabs
          label={t("filtersLabel")}
          onChange={setFilter}
          tabs={(["all", "open", "discussion", "closed"] as const).map((value) => ({
            value,
            label: t(`filters.${value}`),
            count: proposals ? count(value) : undefined,
          }))}
          value={filter}
        />
      </div>
      <div className="mt-5">
        {proposals === undefined ? (
          <TableListSkeleton rows={4} />
        ) : visible.length === 0 ? (
          <EmptyState
            actionHref={proposals.length === 0 ? routes.companyProjects : undefined}
            actionLabel={proposals.length === 0 ? t("empty.action") : undefined}
            description={proposals.length === 0 ? t("empty.lead") : t("empty.filteredLead")}
            title={proposals.length === 0 ? t("empty.title") : t("empty.filteredTitle")}
          />
        ) : (
          <WorkspacePanel>
            <ul className="m-0 list-none divide-y divide-brand-border p-0">
              {visible.map((proposal) => (
                <ProposalRow key={proposal.quoteId} proposal={proposal} />
              ))}
            </ul>
          </WorkspacePanel>
        )}
      </div>
    </WorkspacePage>
  );
}

function ProposalRow({ proposal }: { proposal: Proposal }) {
  const t = useTranslations("companyProposals");
  const tStatus = useTranslations("initialQuote.detail");
  const tWizard = useTranslations("projectWizard");
  const format = useFormatter();

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="m-0 truncate text-[0.98rem] font-semibold text-ink">{proposal.projectTitle}</h2>
          <StatusBadge tone={STATUS_TONE[proposal.status]}>{tStatus(proposal.status)}</StatusBadge>
        </div>
        <p className="mt-1 mb-0 flex flex-wrap gap-x-2 text-sm text-muted">
          {proposal.city ? <span>{tWizard(`cityOptions.${proposal.city as City}`)}</span> : null}
          {proposal.city ? <span aria-hidden>·</span> : null}
          <span>{t("sentOn", { date: format.dateTime(proposal.submittedAt, { dateStyle: "medium" }) })}</span>
        </p>
      </div>
      <p className="m-0 text-sm text-muted sm:w-40 sm:text-right">
        <span className="sr-only">{t("estimate")}: </span>
        <span className="font-semibold tabular-nums text-ink">
          {format.number(proposal.estimatedPriceMad, { style: "currency", currency: "MAD", maximumFractionDigits: 0 })}
        </span>
      </p>
      <div className="sm:w-44 sm:text-right">
        {proposal.conversationId ? (
          <Link
            className={workspaceButton.secondary}
            href={{ pathname: routes.messagesConversation, params: { conversationId: proposal.conversationId } }}
          >
            {t("openDiscussion")}
          </Link>
        ) : proposal.canOpenQuoteWorkspace ? (
          <Link
            className={workspaceButton.ghost}
            href={{ pathname: routes.companyInitialQuote, params: { projectId: proposal.projectId } }}
          >
            {t("viewProposal")}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
