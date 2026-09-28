import { routes } from "../routes";

export type NotificationAccountType = "client" | "company" | "admin" | "seo_team";
export type NotificationDestinationInput = {
  type: string;
  entity: { type: string; id: string };
};

export type NotificationDestination =
  | Exclude<
      (typeof routes)[keyof typeof routes],
      typeof routes.clientProject
        | typeof routes.companyProject
        | typeof routes.companyInitialQuote
        | typeof routes.messagesConversation
        | typeof routes.seoArticle
    >
  | { pathname: typeof routes.messagesConversation; params: { conversationId: string } };

export function notificationDestination(
  notification: NotificationDestinationInput,
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

const ENGLISH_PATHS: Partial<Record<string, string>> = {
  [routes.clientDashboard]: "/client/dashboard",
  [routes.companyDashboard]: "/company",
  [routes.companyProjects]: "/company/projects",
  [routes.companyInvitations]: "/company/invitations",
  [routes.companyCommissions]: "/company/commissions",
  [routes.companyProfileManagement]: "/company/profile",
  [routes.companyVerification]: "/company/verification",
};

export function localizedNotificationDestination(
  locale: "fr" | "en",
  notification: NotificationDestinationInput,
  accountType: NotificationAccountType,
) {
  const destination = notificationDestination(notification, accountType);
  if (typeof destination !== "string") {
    return `/${locale}/messages/${encodeURIComponent(destination.params.conversationId)}`;
  }
  const pathname = locale === "en" ? ENGLISH_PATHS[destination] ?? destination : destination;
  return `/${locale}${pathname === "/" ? "" : pathname}`;
}
