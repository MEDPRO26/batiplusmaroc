import { NotificationListSkeleton } from "@/features/notifications/components/notification-bell-view";

export default function NotificationsLoading() {
  return <main className="mx-auto w-full max-w-4xl px-4 py-12"><div className="skeleton-block h-8 w-52 rounded-sm" /><div className="mt-8 rounded-2xl border border-brand-border bg-white p-2"><NotificationListSkeleton /></div></main>;
}
