import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { NotificationType } from "@/convex/notifications/constants";
import {
  notificationDestination,
  type NotificationAccountType,
  type NotificationDestination,
} from "@/lib/notifications/destination";
import { routes } from "@/lib/routes";

export type { NotificationAccountType, NotificationDestination };
export type NotificationRecord = {
  id: Id<"notifications">;
  type: NotificationType;
  entity: Doc<"notifications">["entity"];
  projectId?: Id<"projects"> | null;
  payload: Doc<"notifications">["payload"];
  actorUserId: Id<"users"> | null;
  createdAt: number;
  readAt: number | null;
};

export type NotificationIconCategory =
  | "proposal"
  | "invitation"
  | "message"
  | "siteVisit"
  | "finalQuote"
  | "deal"
  | "review"
  | "verification";

export const NOTIFICATION_PRESENTATION = {
  proposal_received: { translationKey: "events.proposal_received", iconCategory: "proposal" },
  proposal_accepted: { translationKey: "events.proposal_accepted", iconCategory: "proposal" },
  invitation_received: { translationKey: "events.invitation_received", iconCategory: "invitation" },
  invitation_accepted: { translationKey: "events.invitation_accepted", iconCategory: "invitation" },
  invitation_declined: { translationKey: "events.invitation_declined", iconCategory: "invitation" },
  message_received: { translationKey: "events.message_received", iconCategory: "message" },
  site_visit_proposed: { translationKey: "events.site_visit_proposed", iconCategory: "siteVisit" },
  site_visit_confirmed: { translationKey: "events.site_visit_confirmed", iconCategory: "siteVisit" },
  site_visit_rescheduled: { translationKey: "events.site_visit_rescheduled", iconCategory: "siteVisit" },
  site_visit_cancelled: { translationKey: "events.site_visit_cancelled", iconCategory: "siteVisit" },
  final_quote_submitted: { translationKey: "events.final_quote_submitted", iconCategory: "finalQuote" },
  final_quote_accepted: { translationKey: "events.final_quote_accepted", iconCategory: "finalQuote" },
  deal_created: { translationKey: "events.deal_created", iconCategory: "deal" },
  commission_due: { translationKey: "events.commission_due", iconCategory: "deal" },
  commission_paid: { translationKey: "events.commission_paid", iconCategory: "deal" },
  deal_completed: { translationKey: "events.deal_completed", iconCategory: "deal" },
  review_received: { translationKey: "events.review_received", iconCategory: "review" },
  company_verification_approved: { translationKey: "events.company_verification_approved", iconCategory: "verification" },
  company_verification_rejected: { translationKey: "events.company_verification_rejected", iconCategory: "verification" },
  admin_company_message_received: { translationKey: "events.admin_company_message_received", iconCategory: "message" },
  company_admin_message_received: { translationKey: "events.company_admin_message_received", iconCategory: "message" },
  company_suspended: { translationKey: "events.company_suspended", iconCategory: "verification" },
  company_reactivated: { translationKey: "events.company_reactivated", iconCategory: "verification" },
} as const satisfies Record<NotificationType, {
  translationKey: `events.${NotificationType}`;
  iconCategory: NotificationIconCategory;
}>;

export function notificationTranslationKey(type: string) {
  return type in NOTIFICATION_PRESENTATION
    ? NOTIFICATION_PRESENTATION[type as NotificationType].translationKey
    : "events.fallback";
}

export function notificationIconCategory(type: string): NotificationIconCategory | "marketplace" {
  return type in NOTIFICATION_PRESENTATION
    ? NOTIFICATION_PRESENTATION[type as NotificationType].iconCategory
    : "marketplace";
}

export { notificationDestination };

export function notificationInterpolation(payload: NotificationRecord["payload"]) {
  return {
    actorDisplayName: payload.actorDisplayName ?? "",
    projectTitle: payload.projectTitle ?? "",
    companyName: payload.companyName ?? "",
    messagePreview: payload.messagePreview ?? "",
    scheduledAt: payload.scheduledAt ?? 0,
    amountMad: payload.amountMad ?? 0,
    rating: payload.rating ?? 0,
  };
}

export function unreadBadgeLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}

export async function readThenNavigate(
  notification: Pick<NotificationRecord, "id" | "readAt">,
  destination: NotificationDestination,
  markRead: (notificationId: Id<"notifications">) => Promise<unknown>,
  navigate: (destination: NotificationDestination) => void,
) {
  if (notification.readAt === null) await markRead(notification.id);
  navigate(destination);
}

export function resolveNotificationDestinationForOpen(
  notification: NotificationRecord,
  accountType: NotificationAccountType,
): NotificationDestination {
  const needsProposalProject = (
    (notification.type === "proposal_received" && accountType === "client")
    || (notification.type === "proposal_accepted" && accountType === "company")
  );
  if (!needsProposalProject || notification.entity.type !== "proposal") {
    return notificationDestination(notification, accountType);
  }

  return notification.projectId
    ? notificationDestination(notification, accountType, { projectId: notification.projectId })
    : routes.notifications;
}
