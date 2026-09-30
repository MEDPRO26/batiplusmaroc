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
  disabled = false,
  onOpen,
}: {
  notification: NotificationRecord;
  compact?: boolean;
  disabled?: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const Icon = ICONS[notificationIconCategory(notification.type)];
  const unread = notification.readAt === null;
  const label = t(notificationTranslationKey(notification.type), notificationInterpolation(
    notification.payload,
    {
      actorDisplayName: notification.type === "company_admin_message_received"
        ? t("fallbackCompanyMember")
        : "",
      companyName: t("fallbackCompany"),
    },
  ));

  return (
    <button
      aria-label={unread ? t("openUnread", { notification: label }) : label}
      className={`group flex w-full min-w-0 cursor-pointer items-start gap-3 border-0 text-left transition-colors disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand ${
        compact ? "rounded-xl px-3 py-3" : "px-4 py-4 sm:px-5"
      } ${unread ? "bg-brand-soft/50 hover:bg-brand-soft" : "bg-transparent hover:bg-slate-50/80"}`}
      disabled={disabled}
      onClick={onOpen}
      type="button"
    >
      <span className={`grid shrink-0 place-items-center rounded-full bg-white text-brand ring-1 ring-brand-border ${compact ? "size-9" : "size-10"}`}>
        <Icon aria-hidden className={compact ? "size-4" : "size-[18px]"} />
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
