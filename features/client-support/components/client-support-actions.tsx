"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { SupportRequestKind } from "@/convex/clientSupport/constants";
import { SupportBoundary, SupportUnreadBadge } from "@/features/client-support/components/support-thread";
import { SUPPORT_REQUEST_KINDS } from "@/features/client-support/lib/support-thread";
import { workspaceButton } from "@/features/shared/components/workspace-page";
import { Link, useRouter } from "@/i18n/navigation";
import { describeAppError } from "@/lib/errors";
import { routes } from "@/lib/routes";

const KIND_COPY = { free_help: "freeHelp", coordination_discussion: "coordination" } as const;

/**
 * The two optional Batiplus services. A request is only ever created by an
 * explicit click here: never on render and never by opening a link.
 */
export function ClientSupportRequestActions({
  projectId,
  requestedKinds,
  onRequested,
}: {
  projectId: Id<"projects">;
  requestedKinds: readonly SupportRequestKind[];
  onRequested?: (kind: SupportRequestKind) => void;
}) {
  const t = useTranslations("clientSupport.actions");
  const tUx = useTranslations("ux");
  const requestSupport = useMutation(api.clientSupport.index.requestSupport);
  const [pending, setPending] = useState<SupportRequestKind | null>(null);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);

  async function request(requestKind: SupportRequestKind) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(requestKind);
    setError("");
    try {
      await requestSupport({ projectId, requestKind });
      onRequested?.(requestKind);
    } catch (cause) {
      const described = describeAppError(cause, { logUnknown: false });
      setError(
        described.code === "UNKNOWN" || described.code === "NETWORK"
          ? t("requestFailed")
          : tUx(described.messageKey),
      );
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  }

  return (
    <div className="grid gap-3">
      {SUPPORT_REQUEST_KINDS.map((kind) => {
        const copy = KIND_COPY[kind];
        const requested = requestedKinds.includes(kind);
        return (
          <section
            aria-labelledby={`support-${kind}-title`}
            className="border-t border-brand-border pt-3 first:border-t-0 first:pt-0"
            data-support-kind={kind}
            key={kind}
          >
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <h3 className="m-0 text-sm font-semibold text-ink" id={`support-${kind}-title`}>
                {t(`${copy}.title`)}
              </h3>
              {requested ? (
                <span className="inline-flex items-center gap-1 rounded-sm bg-[#e3f4e8] px-2.5 py-0.5 text-xs font-semibold text-[#1c6b3a]">
                  <Check aria-hidden className="size-3.5" />
                  {t("requested")}
                </span>
              ) : null}
            </div>
            <p className="mt-1 mb-0 text-[0.8125rem] leading-5 text-pretty text-muted">{t(`${copy}.description`)}</p>
            {requested ? null : (
              <button
                aria-busy={pending === kind || undefined}
                className={`mt-2 w-full ${workspaceButton.secondary}`}
                disabled={pending !== null}
                onClick={() => void request(kind)}
                type="button"
              >
                {pending === kind ? t("submitting") : t(`${copy}.action`)}
              </button>
            )}
          </section>
        );
      })}
      {error ? (
        <p className="m-0 rounded-sm bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>
      ) : null}
      <p className="m-0 border-t border-brand-border pt-3 text-xs leading-5 text-pretty text-muted">{t("note")}</p>
    </div>
  );
}

/**
 * Support entry on a saved project. Mount it for the owning Client only: it
 * calls Client-only queries that an admin project preview must never run.
 */
export function ClientProjectSupport({ projectId }: { projectId: Id<"projects"> }) {
  const t = useTranslations("clientSupport.actions");
  return (
    <section aria-labelledby="project-support-title" className="rounded-2xl border border-brand-border bg-white p-5">
      <h2 className="mt-0 mb-3 text-base font-semibold text-ink" id="project-support-title">{t("title")}</h2>
      <SupportBoundary
        fallback={(retry) => (
          <div role="alert">
            <p className="m-0 text-sm text-red-800">{t("unavailable")}</p>
            <button className={`mt-3 ${workspaceButton.secondary}`} onClick={retry} type="button">{t("retry")}</button>
          </div>
        )}
        resetKey={projectId}
      >
        <ClientProjectSupportContent projectId={projectId} />
      </SupportBoundary>
    </section>
  );
}

function ClientProjectSupportContent({ projectId }: { projectId: Id<"projects"> }) {
  const t = useTranslations("clientSupport.actions");
  const router = useRouter();
  const conversation = useQuery(api.clientSupport.index.getMyConversation, { projectId });
  const href = { pathname: routes.clientProjectSupport, params: { projectId } } as const;

  if (conversation === undefined) {
    return (
      <div aria-busy="true" aria-label={t("loading")} className="grid gap-3" role="status">
        <div className="skeleton-block h-28 rounded-sm" />
        <div className="skeleton-block h-28 rounded-sm" />
      </div>
    );
  }

  return (
    <>
      {conversation ? (
        <Link
          className="mb-3 flex min-h-11 items-center justify-between gap-3 rounded-sm bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand-dark transition-colors hover:bg-[#dfebf3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          href={href}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            {t("openConversation")}
            <SupportUnreadBadge count={conversation.unreadCount} label={t("unread", { count: conversation.unreadCount })} />
          </span>
          <ArrowRight aria-hidden className="size-4 shrink-0" />
        </Link>
      ) : null}
      <ClientSupportRequestActions
        onRequested={() => router.push(href)}
        projectId={projectId}
        requestedKinds={conversation?.requestedKinds ?? []}
      />
    </>
  );
}
