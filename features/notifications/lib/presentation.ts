import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { NotificationType } from "@/convex/notifications/constants";
import { routes, type AppRoute } from "@/lib/routes";

export type NotificationAccountType = "client" | "company" | "admin" | "seo_team";
export type NotificationRecord = {
  id: Id<"notifications">;
  type: NotificationType;
  entity: Doc<"notifications">["entity"];
  payload: Doc<"notifications">["payload"];
  actorUserId: Id<"users"> | null;
  createdAt: number;
  readAt: number | null;
};

export type NotificationDestination =
  | AppRoute
  | { pathname: typeof routes.messagesConversation; params: { conversationId: string } };

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

export function notificationDestination(
  notification: Pick<NotificationRecord, "type" | "entity">,
  accountType: NotificationAccountType,
): NotificationDestination {
  if (accountType === "admin" || accountType === "seo_team") return routes.notifications;
  if (notification.type === "message_received" && notification.entity.type === "conversation") {
    return {
      pathname: routes.messagesConversation,
      params: { conversationId: notification.entity.id },
    };
  }
  switch (notification.type) {
    case "proposal_received":
    case "invitation_accepted":
    case "invitation_declined":
      return accountType === "client" ? routes.clientDashboard : routes.companyProjects;
    case "proposal_accepted":
      return accountType === "company" ? routes.companyProjects : routes.clientDashboard;
    case "invitation_received":
      return accountType === "company" ? routes.companyInvitations : routes.clientDashboard;
    case "site_visit_proposed":
    case "site_visit_confirmed":
    case "site_visit_rescheduled":
    case "site_visit_cancelled":
    case "final_quote_submitted":
    case "final_quote_accepted":
      return routes.messages;
    case "commission_due":
    case "commission_paid":
      return accountType === "company" ? routes.companyCommissions : routes.clientDashboard;
    case "deal_created":
    case "deal_completed":
      return accountType === "company" ? routes.companyDashboard : routes.clientDashboard;
    case "review_received":
      return accountType === "company" ? routes.companyProfileManagement : routes.clientDashboard;
    case "company_verification_approved":
    case "company_verification_rejected":
      return accountType === "company" ? routes.companyVerification : routes.clientDashboard;
    default:
      return routes.notifications;
  }
}

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
