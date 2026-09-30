"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect } from "react";
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

type Deal = FunctionReturnType<typeof api.deals.company.listMyDeals>[number];
type City = NonNullable<Doc<"projects">["city"]>;
export type CompanyWorkView = "active" | "history";

const STATUS_TONE: Record<Deal["status"], BadgeTone> = {
  active: "brand",
  completed: "success",
  cancelled: "neutral",
};

export function CompanyWork({ view }: { view: CompanyWorkView }) {
  const t = useTranslations("companyWork");
  const user = useQuery(api.users.currentUser);
  const router = useRouter();
  const canLoad = user?.accountType === "company" && user.onboardingStatus === "completed";
  const deals = useQuery(api.deals.company.listMyDeals, canLoad ? {} : "skip");

  useEffect(() => {
    if (user === null) router.replace(routes.signIn);
    else if (user && !canLoad) router.replace(workspaceRouteForUser(user));
  }, [canLoad, router, user]);

  const active = (deals ?? []).filter((deal) => deal.status === "active");
  const history = (deals ?? []).filter((deal) => deal.status !== "active");
  const visible = view === "active" ? active : history;

  return (
    <WorkspacePage busy={deals === undefined}>
      <WorkspacePageHeader lead={t("lead")} title={view === "active" ? t("activeTitle") : t("historyTitle")} />
      <div className="mt-7">
        <WorkspaceTabs
          label={t("tabsLabel")}
          onChange={(next) =>
            router.replace(next === "history" ? { pathname: routes.companyWork, query: { view: "history" } } : routes.companyWork)
          }
          tabs={[
            { value: "active", label: t("tabs.active"), count: deals ? active.length : undefined },
            { value: "history", label: t("tabs.history"), count: deals ? history.length : undefined },
          ]}
          value={view}
        />
      </div>
      <div className="mt-5">
        {deals === undefined ? (
          <TableListSkeleton rows={3} />
        ) : visible.length === 0 ? (
          <EmptyState
            actionHref={view === "active" ? routes.companyProposals : undefined}
            actionLabel={view === "active" ? t("empty.activeAction") : undefined}
            description={view === "active" ? t("empty.activeLead") : t("empty.historyLead")}
            title={view === "active" ? t("empty.activeTitle") : t("empty.historyTitle")}
          />
        ) : (
          <WorkspacePanel>
            <ul className="m-0 list-none divide-y divide-brand-border p-0">
              {visible.map((deal) => (
                <DealRow deal={deal} key={deal.dealId} />
              ))}
            </ul>
          </WorkspacePanel>
        )}
      </div>
    </WorkspacePage>
  );
}

function DealRow({ deal }: { deal: Deal }) {
  const t = useTranslations("companyWork");
  const tWizard = useTranslations("projectWizard");
  const format = useFormatter();
  const date = (value: number) => format.dateTime(value, { dateStyle: "medium" });

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="m-0 truncate text-[0.98rem] font-semibold text-ink">{deal.projectTitle}</h2>
          <StatusBadge tone={STATUS_TONE[deal.status]}>{t(`status.${deal.status}`)}</StatusBadge>
        </div>
        <p className="mt-1 mb-0 flex flex-wrap gap-x-2 text-sm text-muted">
          {deal.city ? <span>{tWizard(`cityOptions.${deal.city as City}`)}</span> : null}
          {deal.city ? <span aria-hidden>·</span> : null}
          <span>
            {deal.completedAt
              ? t("completedOn", { date: date(deal.completedAt) })
              : t("startedOn", { date: date(deal.createdAt) })}
          </span>
        </p>
      </div>
      <p className="m-0 text-sm sm:w-44 sm:text-right">
        <span className="block text-xs text-muted">{t("agreedAmount")}</span>
        <span className="font-semibold tabular-nums text-ink">
          {format.number(deal.agreedAmountMad, { style: "currency", currency: "MAD", maximumFractionDigits: 0 })}
        </span>
      </p>
      <div className="sm:w-44 sm:text-right">
        <Link
          className={workspaceButton.secondary}
          href={{ pathname: routes.messagesConversation, params: { conversationId: deal.conversationId } }}
        >
          {t("openWorkspace")}
        </Link>
      </div>
    </li>
  );
}
