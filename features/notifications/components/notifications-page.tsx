"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { NotificationItem } from "@/features/notifications/components/notification-item";
import { NotificationListSkeleton } from "@/features/notifications/components/notification-bell-view";
import { NotificationPreferencesPanel } from "@/features/notifications/components/notification-preferences-panel";
import { notificationDestination, readThenNavigate, type NotificationAccountType } from "@/features/notifications/lib/presentation";
import { useRouter } from "@/i18n/navigation";

export function NotificationsPage({ accountType }: { accountType: NotificationAccountType }) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const unreadCount = useQuery(api.notifications.index.getMyUnreadCount);
  const { results, status, loadMore } = usePaginatedQuery(
    api.notifications.index.listMyNotifications,
    {},
    { initialNumItems: 20 },
  );
  const markRead = useMutation(api.notifications.index.markNotificationRead);
  const markAll = useMutation(api.notifications.index.markAllNotificationsRead);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const count = unreadCount ?? 0;

  async function openNotification(notification: (typeof results)[number]) {
    setPendingId(notification.id);
    setError(false);
    try {
      await readThenNavigate(
        notification,
        notificationDestination(notification, accountType),
        (notificationId) => markRead({ notificationId }),
        (destination) => router.push(destination),
      );
    } catch {
      setError(true);
    } finally {
      setPendingId(null);
    }
  }

  async function markEverythingRead() {
    setPendingId("all");
    setError(false);
    try {
      await markAll({});
    } catch {
      setError(true);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12" aria-labelledby="notifications-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-brand uppercase">{t("eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-ink" id="notifications-title">{t("title")}</h1>
          <p className="mt-2 text-sm text-muted">{t("unreadCount", { count })}</p>
        </div>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold text-brand shadow-sm hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          disabled={pendingId !== null || count === 0}
          onClick={() => void markEverythingRead()}
          type="button"
        >
          <CheckCheck aria-hidden className="size-4" />
          {t("markAll")}
        </button>
      </div>

      {error ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          <span>{t("error")}</span>
          <button className="min-h-10 rounded-lg px-3 font-semibold hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700" onClick={() => setError(false)} type="button">{t("dismiss")}</button>
        </div>
      ) : null}

      <div aria-busy={status === "LoadingFirstPage"} className="mt-6 overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm">
        {status === "LoadingFirstPage" ? <NotificationListSkeleton /> : null}
        {status !== "LoadingFirstPage" && results.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft text-brand"><Bell aria-hidden className="size-6" /></span>
            <h2 className="mt-4 text-lg font-semibold text-ink">{t("emptyTitle")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{t("emptyDescription")}</p>
          </div>
        ) : null}
        {results.length > 0 ? (
          <ol className="m-0 list-none divide-y divide-brand-border p-0">
            {results.map((notification) => (
              <li className={pendingId === notification.id ? "opacity-60" : ""} key={notification.id}>
                <NotificationItem notification={notification} onOpen={() => void openNotification(notification)} />
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {status !== "Exhausted" && status !== "LoadingFirstPage" ? (
        <div className="mt-6 text-center">
          <button
            className="min-h-11 rounded-xl border border-brand-border bg-white px-5 text-sm font-semibold text-ink hover:bg-brand-soft disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(20)}
            type="button"
          >
            {status === "LoadingMore" ? t("loadingMore") : t("loadMore")}
          </button>
        </div>
      ) : null}
      <NotificationPreferencesPanel accountType={accountType} />
    </section>
  );
}
