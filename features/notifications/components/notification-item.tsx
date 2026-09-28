"use client";

import { Bell, BriefcaseBusiness, CalendarDays, CheckCircle2, FileText, MessageSquare, ShieldCheck, Star } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import type { ComponentType } from "react";
import type { NotificationIconCategory, NotificationRecord } from "@/features/notifications/lib/presentation";
import { notificationIconCategory, notificationInterpolation, notificationTranslationKey } from "@/features/notifications/lib/presentation";

const ICONS: Record<NotificationIconCategory | "marketplace", ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  proposal: FileText,
  invitation: BriefcaseBusiness,
  message: MessageSquare,
  siteVisit: CalendarDays,
  finalQuote: FileText,
  deal: CheckCircle2,
  review: Star,
  verification: ShieldCheck,
  marketplace: Bell,
};

export function NotificationItem({
  notification,
  compact = false,
  onOpen,
}: {
  notification: NotificationRecord;
  compact?: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const Icon = ICONS[notificationIconCategory(notification.type)];
  const unread = notification.readAt === null;
  const label = t(notificationTranslationKey(notification.type), notificationInterpolation(notification.payload));

  return (
    <button
      aria-label={unread ? t("openUnread", { notification: label }) : label}
      className={`group flex w-full min-w-0 items-start gap-3 rounded-xl border-0 px-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        compact ? "py-3" : "py-4"
      } ${unread ? "bg-brand-soft/65 hover:bg-brand-soft" : "bg-transparent hover:bg-slate-50"}`}
      onClick={onOpen}
      type="button"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-brand shadow-sm ring-1 ring-brand-border">
        <Icon aria-hidden className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block break-words text-sm leading-5 text-ink ${unread ? "font-semibold" : "font-medium"}`}>
          {label}
        </span>
        {notification.payload.messagePreview ? (
          <span className="mt-1 block line-clamp-2 break-words text-xs leading-5 text-muted">
            {notification.payload.messagePreview}
          </span>
        ) : null}
        <time className="mt-1 block text-xs text-muted" dateTime={new Date(notification.createdAt).toISOString()}>
          {format.relativeTime(new Date(notification.createdAt), { now })}
        </time>
      </span>
      {unread ? <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-brand" /> : null}
    </button>
  );
}
