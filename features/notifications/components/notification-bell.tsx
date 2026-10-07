"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { NotificationBellView } from "@/features/notifications/components/notification-bell-view";
import {
  readThenNavigate,
  resolveNotificationDestinationForOpen,
  type NotificationAccountType,
  type NotificationRecord,
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
  const { results, status, loadMore } = usePaginatedQuery(
    api.notifications.index.listMyNotifications,
    {},
    { initialNumItems: 8 },
  );
  const markRead = useMutation(api.notifications.index.markNotificationRead);
  const markAll = useMutation(api.notifications.index.markAllNotificationsRead);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const openingRef = useRef(false);
  useEffect(() => {
    if (results.length === 0 && status === "CanLoadMore") loadMore(8);
  }, [results.length, status, loadMore]);

  async function openNotification(notification: NotificationRecord) {
    if (openingRef.current) return;
    openingRef.current = true;
    let navigated = false;
    setPending(true);
    setError(false);
    try {
      const destination = resolveNotificationDestinationForOpen(notification, accountType);
      await readThenNavigate(
        notification,
        destination,
        (notificationId) => markRead({ notificationId }),
        (nextDestination) => {
          setOpen(false);
          router.push(nextDestination);
        },
      );
      navigated = true;
    } catch {
      setError(true);
    } finally {
      if (!navigated) openingRef.current = false;
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
      loading={status === "LoadingFirstPage" || (results.length === 0 && status !== "Exhausted")}
      notifications={results}
      onMarkAll={() => void markEverythingRead()}
      onOpen={(notification) => void openNotification(notification)}
      onOpenChange={(nextOpen) => {
        if (nextOpen) openingRef.current = false;
        setOpen(nextOpen);
      }}
      open={open}
      pending={pending}
      tone={tone}
      unreadCount={unreadCount}
    />
  );
}
