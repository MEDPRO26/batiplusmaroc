"use client";

import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { OperationalConversation } from "@/features/operations/components/operational-conversation";
import { WorkspacePage, WorkspacePageHeader } from "@/features/shared/components/workspace-page";
import { useRouter } from "@/i18n/navigation";
import { workspaceRouteForUser, type WorkspaceUser } from "@/lib/auth/workspace-route";
import type { AppRoute } from "@/lib/routes";
import { routes } from "@/lib/routes";

type CurrentUser = WorkspaceUser | null | undefined;

export function resolveCompanyOperationsRedirect(user: CurrentUser): AppRoute | null {
  if (user === undefined) return null;
  if (user === null) return routes.signIn;
  if (user.accountType === "company") return null;
  return workspaceRouteForUser(user);
}

export function CompanyOperationalMessaging() {
  const t = useTranslations("operationalMessaging");
  const router = useRouter();
  const user = useQuery(api.users.currentUser);
  const canLoad = user?.accountType === "company";
  const conversation = useQuery(api.adminCompanyMessaging.getMyConversation, canLoad ? {} : "skip");
  const send = useMutation(api.adminCompanyMessaging.sendCompanyMessage);
  const markRead = useMutation(api.adminCompanyMessaging.markMyConversationRead);

  useEffect(() => {
    const destination = resolveCompanyOperationsRedirect(user);
    if (destination) router.replace(destination);
  }, [router, user]);

  if (user === undefined || !canLoad || conversation === undefined) {
    return <CompanyOperationalMessagingSkeleton />;
  }

  return (
    <WorkspacePage label={t("company.pageLabel")}>
      <WorkspacePageHeader lead={t("company.lead")} title={t("company.title")} />
      <div className="mt-7">
        <OperationalConversation
          conversation={conversation}
          emptyAction={t("company.emptyAction")}
          emptyLead={t("company.emptyLead")}
          emptyTitle={t("company.emptyTitle")}
          lead={t("company.lead")}
          onMarkRead={(readThroughMessageId) => markRead({ conversationId: conversation!.id, readThroughMessageId })}
          onSend={(body, idempotencyKey) => send({ body, idempotencyKey })}
          role="company"
          title={t("company.title")}
        />
      </div>
    </WorkspacePage>
  );
}

function CompanyOperationalMessagingSkeleton() {
  const t = useTranslations("operationalMessaging.thread");
  return (
    <main aria-busy="true" aria-label={t("loading")} className="min-h-[calc(100dvh-4.5rem)] bg-[#f7f9fb] py-10" role="status">
      <div className="mx-auto w-[calc(100%-32px)] max-w-[1240px]">
        <div className="skeleton-block h-9 w-64 rounded-lg" />
        <div className="skeleton-block mt-3 h-5 w-full max-w-xl rounded-lg" />
        <div className="skeleton-block mt-7 h-[30rem] rounded-2xl" />
      </div>
    </main>
  );
}
