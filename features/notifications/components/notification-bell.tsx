"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { NotificationBellView } from "@/features/notifications/components/notification-bell-view";
import {
  notificationDestination,
  readThenNavigate,
  type NotificationAccountType,
} from "@/features/notifications/lib/presentation";
import { useRouter } from "@/i18n/navigation";

export { NotificationBellView, NotificationListSkeleton } from "@/features/notifications/components/notification-bell-view";

export function NotificationBell({
  accountType,
  tone = "marketplace",
}: {
  accountType: NotificationAccountType;
  tone?: "marketplace" | "internal";
}) {
  const router = useRouter();
  const unreadCount = useQuery(api.notifications.index.getMyUnreadCount);
  const { results, status } = usePaginatedQuery(
    api.notifications.index.listMyNotifications,
    {},
    { initialNumItems: 8 },
  );
  const markRead = useMutation(api.notifications.index.markNotificationRead);
  const markAll = useMutation(api.notifications.index.markAllNotificationsRead);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function openNotification(notification: (typeof results)[number]) {
    setPending(true);
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
      setPending(false);
    }
  }

  async function markEverythingRead() {
    setPending(true);
    setError(false);
    try {
      await markAll({});
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <NotificationBellView
      error={error}
      loading={status === "LoadingFirstPage"}
      notifications={results}
      onMarkAll={() => void markEverythingRead()}
      onOpen={(notification) => void openNotification(notification)}
      pending={pending}
      tone={tone}
      unreadCount={unreadCount}
    />
  );
}
