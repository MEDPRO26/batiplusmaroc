"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft, LockKeyhole, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { ClientSupportRequestActions } from "@/features/client-support/components/client-support-actions";
import { SupportBoundary, SupportThread } from "@/features/client-support/components/support-thread";
import {
  createSupportDraftStore,
  resolveClientSupportRedirect,
  SUPPORT_REQUEST_KINDS,
} from "@/features/client-support/lib/support-thread";
import { WorkspacePage, workspaceButton } from "@/features/shared/components/workspace-page";
import { Link, useRouter } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { ClientAgreementPanel } from "@/features/coordination-agreements/components/client-agreement-panel";

type Project = NonNullable<FunctionReturnType<typeof api.projects.index.getMyProject>>;

const BACK_LINK =
  "inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
/** The one surface used on this page; kept local so shared panels elsewhere are unchanged. */
const PANEL = "min-w-0 overflow-hidden rounded-sm border border-brand-border bg-white";

/** Project/Batiplus route for the owning Client. Opening it never creates a request. */
export function ClientSupportPage({ projectId }: { projectId: string }) {
  const t = useTranslations("clientSupport.page");
  const router = useRouter();
  const user = useQuery(api.users.currentUser);
  const destination = resolveClientSupportRedirect(user);
  const canLoad = user !== undefined && user !== null && destination === null;
  const project = useQuery(api.projects.index.getMyProject, canLoad ? { projectId } : "skip");

  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);

  if (!canLoad || project === undefined) {
    return (
      <WorkspacePage busy label={t("loading")}>
        <div className="skeleton-block h-5 w-36 rounded-sm" />
        <div className="skeleton-block mt-4 h-9 w-72 max-w-full rounded-sm" />
        <div className="skeleton-block mt-5 h-[24rem] rounded-sm" />
      </WorkspacePage>
    );
  }

  // Only the owner reaches the Client-only support queries below.
  if (project === null || project.viewerRole !== "owner") {
    return (
      <WorkspacePage label={t("label")}>
        <SupportNotice lead={t("notFoundLead")} title={t("notFoundTitle")}>
          <Link className={workspaceButton.secondary} href={routes.clientDashboard}>{t("backToProjects")}</Link>
        </SupportNotice>
      </WorkspacePage>
    );
  }

  const projectHref = { pathname: routes.clientProject, params: { projectId: project.id } } as const;
  return (
    <WorkspacePage label={t("label")}>
      <Link className={BACK_LINK} href={projectHref}>
        <ArrowLeft aria-hidden className="size-4" />
        {t("backToProject")}
      </Link>
      <header className="mt-1">
        <p className="m-0 text-sm font-semibold text-muted">{t("eyebrow")}</p>
        <h1 className="mt-1 mb-0 text-[1.5rem] leading-[1.2] font-semibold tracking-[-0.03em] text-balance break-words text-ink sm:text-[1.75rem]">
          {project.title ?? t("untitledProject")}
        </h1>
        <p className="mt-1.5 mb-0 flex max-w-2xl items-start gap-1.5 text-sm leading-6 text-pretty text-muted">
          <LockKeyhole aria-hidden className="mt-1 size-4 shrink-0" />
          {t("lead")}
        </p>
      </header>
      <SupportBoundary
        fallback={(retry) => (
          <div className="mt-5">
            <SupportNotice lead={t("deniedLead")} title={t("deniedTitle")}>
              <button className={workspaceButton.primary} onClick={retry} type="button">{t("retry")}</button>
              <Link className={workspaceButton.secondary} href={projectHref}>{t("backToProject")}</Link>
            </SupportNotice>
          </div>
        )}
        resetKey={project.id}
      >
        <ClientSupportWorkspace key={`${project.id}:${user?._id}`} project={project} />
      </SupportBoundary>
    </WorkspacePage>
  );
}

function ClientSupportWorkspace({ project }: { project: Project }) {
  const t = useTranslations("clientSupport");
  const tWizard = useTranslations("projectWizard");
  const tProjects = useTranslations("clientProjects");
  const [drafts] = useState(createSupportDraftStore);
  const conversation = useQuery(api.clientSupport.index.getMyConversation, { projectId: project.id });

  if (conversation === undefined) {
    return <div aria-busy="true" aria-label={t("page.loading")} className="skeleton-block mt-5 h-[24rem] rounded-sm" role="status" />;
  }

  const requestedKinds = conversation?.requestedKinds ?? [];
  const remaining = SUPPORT_REQUEST_KINDS.some((kind) => !requestedKinds.includes(kind));
  return (
    <>
      <dl aria-label={t("page.contextTitle")} className="mt-3 mb-0 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">{t("page.contextCity")}</dt>
          <MapPin aria-hidden className="size-4 shrink-0 text-muted" />
          <dd className={`m-0 font-medium ${project.city ? "text-ink" : "text-muted"}`}>
            {project.city ? tWizard(`cityOptions.${project.city}`) : t("page.notProvided")}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-muted">{t("page.contextStatus")}</dt>
          <dd className="m-0 rounded-sm bg-surface-muted px-2 py-0.5 text-xs font-semibold text-ink">
            {project.status === "draft" ? tProjects("draftBadge") : tProjects(`status.${project.status}`)}
          </dd>
        </div>
        {requestedKinds.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <dt className="text-muted">{t("page.contextRequested")}</dt>
            <dd className="m-0 font-medium text-ink">{requestedKinds.map((kind) => t(`kinds.${kind}`)).join(" · ")}</dd>
          </div>
        ) : null}
      </dl>
      {/* Conversation first in the source so phones read: context, chat, coordination. */}
      <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] md:items-start lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6">
        {conversation ? (
          // Grows with the history up to a viewport-relative cap, so a short thread keeps the composer close.
          <section aria-labelledby="support-thread-title" className={`${PANEL} flex max-h-[min(80dvh,52rem)] min-h-[21rem] flex-col md:sticky md:top-24`}>
            <h2 className="m-0 border-b border-brand-border px-4 py-3.5 text-base font-semibold text-ink sm:px-5" id="support-thread-title">
              {t("thread.title")}
            </h2>
            <SupportThread compact conversation={conversation} drafts={drafts} key={conversation.id} role="client" />
          </section>
        ) : (
          <section className={`${PANEL} p-5 sm:p-6 md:col-span-2`}>
            <h2 className="m-0 text-lg font-semibold tracking-[-0.02em] text-balance text-ink">{t("page.noThreadTitle")}</h2>
            <p className="mt-2 mb-5 max-w-xl text-sm leading-6 text-pretty text-muted">{t("page.noThreadLead")}</p>
            <ClientSupportRequestActions projectId={project.id} requestedKinds={[]} />
          </section>
        )}
        {conversation ? (
          <div className="grid min-w-0 content-start gap-5">
            <ClientAgreementPanel conversationId={conversation.id} key={project.id} projectId={project.id} />
            {remaining ? (
              <section aria-labelledby="support-services-title" className={`${PANEL} px-5 py-5 sm:px-6`}>
                <h2 className="mt-0 mb-3 text-base font-semibold text-ink" id="support-services-title">{t("page.servicesTitle")}</h2>
                <ClientSupportRequestActions projectId={project.id} requestedKinds={requestedKinds} />
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

function SupportNotice({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-brand-border bg-white px-5 py-10 text-center sm:px-8" role="alert">
      <h2 className="m-0 text-lg font-semibold text-balance text-ink">{title}</h2>
      <p className="mx-auto mt-2 mb-0 max-w-xl text-sm leading-6 text-pretty text-muted">{lead}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2.5">{children}</div>
    </div>
  );
}
