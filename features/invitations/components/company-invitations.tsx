"use client";

import { useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Link, useRouter } from "@/i18n/navigation";
import { formatMarketplaceDateTime } from "@/lib/dates/marketplace-date-time";
import { mapAppError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { workspaceRouteForUser } from "@/lib/auth/workspace-route";

type Filter = "all" | "pending" | "accepted" | "declined";

export function CompanyInvitations() {
  const t = useTranslations("invitations.company");
  const tUx = useTranslations("ux");
  const tWizard = useTranslations("projectWizard");
  const locale = useLocale();
  const user = useQuery(api.users.currentUser);
  const router = useRouter();
  const canLoad =
    user?.accountType === "company" && user.onboardingStatus === "completed";
  const rows = useQuery(
    api.invitations.index.listMyCompanyInvitations,
    canLoad ? {} : "skip",
  );
  const accept = useMutation(api.invitations.index.acceptInvitation);
  const decline = useMutation(api.invitations.index.declineInvitation);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<Id<"invitations"> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user === null) router.replace(routes.signIn);
    else if (user && !canLoad) router.replace(workspaceRouteForUser(user));
  }, [canLoad, router, user]);

  async function decide(id: Id<"invitations">, action: "accept" | "decline") {
    setBusyId(id);
    setError("");
    try {
      await (action === "accept"
        ? accept({ invitationId: id })
        : decline({ invitationId: id }));
    } catch (cause) {
      setError(mapAppError(cause, (key) => tUx(key)));
    } finally {
      setBusyId(null);
    }
  }

  if (!canLoad || rows === undefined)
    return (
      <main
        className="mx-auto min-h-[65vh] w-[calc(100%-36px)] max-w-[1120px] animate-pulse py-10"
        aria-busy="true"
      >
        <div className="h-10 w-64 rounded bg-surface-muted" />
        <div className="mt-8 h-64 rounded-2xl bg-surface-muted" />
      </main>
    );
  const visible =
    filter === "all" ? rows : rows.filter((row) => row.status === filter);
  return (
    <main className="mx-auto min-h-[calc(100dvh-4.5rem)] w-[calc(100%-36px)] max-w-[1120px] py-8 sm:w-[calc(100%-48px)] sm:py-12">
      <header>
        <p className="m-0 text-xs font-semibold tracking-[0.12em] text-brand uppercase">
          {t("eyebrow")}
        </p>
        <h1 className="mt-2 mb-0 text-3xl font-semibold tracking-[-0.04em] text-ink">
          {t("title")}
        </h1>
        <p className="mt-3 mb-0 max-w-2xl text-sm leading-6 text-muted">
          {t("lead")}
        </p>
      </header>
      <div
        className="mt-7 flex flex-wrap gap-2"
        role="group"
        aria-label={t("filterLabel")}
      >
        {(["all", "pending", "accepted", "declined"] as const).map((item) => (
          <button
            aria-pressed={filter === item}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${filter === item ? "border-brand bg-brand text-white" : "border-brand-border bg-white text-ink"}`}
            key={item}
            onClick={() => setFilter(item)}
            type="button"
          >
            {t(`filter.${item}`)}
          </button>
        ))}
      </div>
      {error ? (
        <p
          className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {visible.length === 0 ? (
        <div className="mt-7 rounded-2xl border border-dashed border-brand-border p-10 text-center">
          <h2 className="m-0 text-lg font-semibold">{t("emptyTitle")}</h2>
          <p className="mt-2 mb-0 text-sm text-muted">{t("emptyLead")}</p>
        </div>
      ) : (
        <ul className="mt-7 grid list-none gap-4 p-0">
          {visible.map((row) => (
            <li key={row.id}>
              <article className="rounded-2xl border border-brand-border bg-white p-5 shadow-[0_8px_24px_rgb(23_61_99/0.05)] sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="m-0 text-lg font-semibold text-ink">
                      {row.projectTitle}
                    </h2>
                    <p className="mt-1 mb-0 text-xs text-muted">
                      {t("invitedAt", {
                        date: formatMarketplaceDateTime(row.createdAt, locale, {
                          dateStyle: "medium",
                        }),
                      })}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${row.status === "accepted" ? "bg-emerald-50 text-emerald-700" : row.status === "declined" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-800"}`}
                  >
                    {t(`status.${row.status}`)}
                  </span>
                </div>
                <p className="mt-4 mb-0 line-clamp-3 text-sm leading-6 text-ink/80">
                  {row.projectDescription}
                </p>
                <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
                  {row.city ? (
                    <div>
                      <dt className="sr-only">{t("location")}</dt>
                      <dd>{tWizard(`cityOptions.${row.city}`)}</dd>
                    </div>
                  ) : null}
                  {row.category ? (
                    <div>
                      <dt className="sr-only">{t("category")}</dt>
                      <dd>{tWizard(`categoryOptions.${row.category}`)}</dd>
                    </div>
                  ) : null}
                  {row.budgetRange ? (
                    <div>
                      <dt className="sr-only">{t("budget")}</dt>
                      <dd>{tWizard(`budgetOptions.${row.budgetRange}`)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="sr-only">{t("client")}</dt>
                    <dd>
                      {t("fromClient", {
                        name: row.clientDisplayName || t("clientFallback"),
                      })}
                    </dd>
                  </div>
                </dl>
                {row.message ? (
                  <blockquote className="mt-4 rounded-xl bg-surface-muted p-4 text-sm leading-6 text-ink/80">
                    {row.message}
                  </blockquote>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-2">
                  {row.status === "pending" ? (
                    <>
                      <button
                        className="min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white disabled:opacity-60"
                        disabled={busyId === row.id}
                        onClick={() => void decide(row.id, "accept")}
                        type="button"
                      >
                        {busyId === row.id ? t("working") : t("accept")}
                      </button>
                      <button
                        className="min-h-11 rounded-full border border-brand-border px-5 text-sm font-semibold text-ink disabled:opacity-60"
                        disabled={busyId === row.id}
                        onClick={() => void decide(row.id, "decline")}
                        type="button"
                      >
                        {t("decline")}
                      </button>
                    </>
                  ) : row.status === "accepted" ? (
                    <Link
                      className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white"
                      href={{
                        pathname: routes.companyProject,
                        params: { projectId: row.projectId },
                      }}
                    >
                      {t("continue")}
                    </Link>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
