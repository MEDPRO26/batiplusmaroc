"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationItem } from "@/features/notifications/components/notification-item";
import { unreadBadgeLabel } from "@/features/notifications/lib/presentation";
import { routes } from "@/lib/routes";
import Link from "next/link";

type NotificationItemRecord = Parameters<typeof NotificationItem>[0]["notification"];

export function NotificationBellView({
  unreadCount,
  notifications,
  loading,
  pending,
  error,
  open,
  tone = "marketplace",
  onMarkAll,
  onOpen,
  onOpenChange,
}: {
  unreadCount: number | undefined;
  notifications: NotificationItemRecord[];
  loading: boolean;
  pending: boolean;
  error: boolean;
  open?: boolean;
  tone?: "marketplace" | "internal";
  onMarkAll: () => void;
  onOpen: (notification: NotificationItemRecord) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const count = unreadCount ?? 0;
  const triggerClass = tone === "internal"
    ? "relative grid size-11 shrink-0 place-items-center rounded-sm border border-[#e6e9ee] bg-white text-[#17191d] transition-colors hover:bg-[#eef3ff] hover:text-[#2f6bff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6bff]"
    : "relative grid size-11 shrink-0 place-items-center rounded-sm border-0 bg-transparent text-ink transition-[background-color,color,scale] duration-150 active:scale-[0.96] hover:bg-brand-soft hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand";

  return (
    <DropdownMenu onOpenChange={onOpenChange} open={open}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={count > 0 ? t("bellWithUnread", { count }) : t("bell")}
          className={triggerClass}
          type="button"
        >
          <Bell aria-hidden className="size-5" />
          {unreadCount === undefined ? (
            <span aria-hidden className="absolute top-1 right-1 size-2 animate-pulse rounded-sm bg-slate-300" />
          ) : count > 0 ? (
            <span className="absolute -top-0.5 -right-1 grid min-h-5 min-w-5 place-items-center rounded-sm bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
              {unreadBadgeLabel(count)}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(calc(100vw-1.5rem),390px)] overflow-hidden rounded-sm border border-brand-border bg-white p-0 shadow-[0_18px_50px_rgb(23_61_99/0.16)]"
        sideOffset={10}
      >
        <div className="flex items-center justify-between gap-3 border-b border-brand-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-ink">{t("title")}</p>
            <p className="mt-0.5 text-xs text-muted">{t("unreadCount", { count })}</p>
          </div>
          {count > 0 ? (
            <button
              className="inline-flex min-h-9 items-center gap-1.5 rounded-sm px-2 text-xs font-semibold text-brand hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              disabled={pending}
              onClick={onMarkAll}
              type="button"
            >
              <CheckCheck aria-hidden className="size-3.5" />
              {t("markAll")}
            </button>
          ) : null}
        </div>
        {error ? <p className="m-3 rounded-sm bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{t("error")}</p> : null}
        <div aria-busy={loading} className="max-h-[min(60vh,430px)] overflow-y-auto p-1.5 ">
          {loading ? <NotificationListSkeleton compact /> : null}
          {!loading && notifications.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <Bell aria-hidden className="mx-auto size-7 text-muted" />
              <p className="mt-3 font-semibold text-ink">{t("emptyTitle")}</p>
              <p className="mt-1 text-sm text-muted">{t("emptyDescription")}</p>
            </div>
          ) : null}
          {notifications.map((notification) => (
            <NotificationItem
              compact
              disabled={pending}
              key={notification.id}
              notification={notification}
              onOpen={() => onOpen(notification)}
            />
          ))}
        </div>
        <Link
          className="flex min-h-12 items-center justify-center border-t border-brand-border px-4 text-sm font-semibold text-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-brand"
          href={`/${locale}${routes.notifications}`}
        >
          {t("viewAll")}
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NotificationListSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-label="loading" className="grid gap-2 p-2" role="status">
      {[0, 1, 2].map((item) => (
        <div className={`flex items-center gap-3 rounded-sm ${compact ? "py-2" : "py-4"}`} key={item}>
          <span className="skeleton-block size-10 shrink-0 rounded-sm" />
          <span className="flex-1">
            <span className="skeleton-block block h-3 w-4/5 rounded" />
            <span className="skeleton-block mt-2 block h-2.5 w-1/3 rounded" />
          </span>
        </div>
      ))}
    </div>
  );
}
