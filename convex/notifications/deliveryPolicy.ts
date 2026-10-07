import { v } from "convex/values";
import type { NotificationType } from "./constants";

export const NOTIFICATION_PREFERENCE_CATEGORIES = [
  "projects",
  "messages",
  "site_visits",
  "commercial",
  "account",
] as const;

export type NotificationPreferenceCategory =
  (typeof NOTIFICATION_PREFERENCE_CATEGORIES)[number];

export type NotificationPushCategories = Record<NotificationPreferenceCategory, boolean>;

export type NotificationPreferences = {
  pushEnabled: boolean;
  pushCategories: NotificationPushCategories;
};

export const notificationPushCategoriesValidator = v.object({
  projects: v.boolean(),
  messages: v.boolean(),
  site_visits: v.boolean(),
  commercial: v.boolean(),
  account: v.boolean(),
});

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  pushEnabled: false,
  pushCategories: {
    projects: true,
    messages: true,
    site_visits: true,
    commercial: true,
    account: true,
  },
};

type ActiveDeliveryPolicy = {
  active: true;
  inApp: true;
  pushEligible: true;
  category: NotificationPreferenceCategory;
  defaultPushEnabled: true;
};

type ReservedDeliveryPolicy = {
  active: false;
  inApp: false;
  pushEligible: false;
  category: NotificationPreferenceCategory | null;
  defaultPushEnabled: false;
};

type InAppOnlyDeliveryPolicy = {
  active: true;
  inApp: true;
  pushEligible: false;
  category: null;
  defaultPushEnabled: false;
};

export type NotificationDeliveryPolicy = ActiveDeliveryPolicy | InAppOnlyDeliveryPolicy | ReservedDeliveryPolicy;

const active = (category: NotificationPreferenceCategory): ActiveDeliveryPolicy => ({
  active: true,
  inApp: true,
  pushEligible: true,
  category,
  defaultPushEnabled: true,
});

const inAppOnly: InAppOnlyDeliveryPolicy = {
  active: true,
  inApp: true,
  pushEligible: false,
  category: null,
  defaultPushEnabled: false,
};

export const NOTIFICATION_DELIVERY_POLICY = {
  proposal_received: active("projects"),
  proposal_accepted: active("projects"),
  invitation_received: active("projects"),
  invitation_accepted: active("projects"),
  invitation_declined: active("projects"),
  message_received: active("messages"),
  site_visit_proposed: active("site_visits"),
  site_visit_confirmed: active("site_visits"),
  site_visit_rescheduled: active("site_visits"),
  site_visit_cancelled: active("site_visits"),
  final_quote_submitted: active("commercial"),
  final_quote_accepted: active("commercial"),
  deal_created: {
    active: false,
    inApp: false,
    pushEligible: false,
    category: null,
    defaultPushEnabled: false,
  },
  commission_due: active("commercial"),
  commission_paid: active("commercial"),
  deal_completed: active("commercial"),
  review_received: active("commercial"),
  company_verification_approved: active("account"),
  company_verification_rejected: active("account"),
  admin_company_message_received: active("messages"),
  company_admin_message_received: active("messages"),
  company_suspended: active("account"),
  company_reactivated: active("account"),
  client_support_free_help_requested: inAppOnly,
  client_support_coordination_requested: inAppOnly,
  client_support_client_message_received: inAppOnly,
  client_support_admin_reply_received: inAppOnly,
} as const satisfies Record<NotificationType, NotificationDeliveryPolicy>;

const UNKNOWN_DELIVERY_POLICY: ReservedDeliveryPolicy = {
  active: false,
  inApp: false,
  pushEligible: false,
  category: null,
  defaultPushEnabled: false,
};

export function getNotificationDeliveryPolicy(type: string): NotificationDeliveryPolicy {
  return type in NOTIFICATION_DELIVERY_POLICY
    ? NOTIFICATION_DELIVERY_POLICY[type as NotificationType]
    : UNKNOWN_DELIVERY_POLICY;
}

export function resolveNotificationDelivery(
  type: string,
  preferences: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
) {
  const policy = getNotificationDeliveryPolicy(type);
  const pushEnabledForUser = policy.pushEligible
    && preferences.pushEnabled
    && policy.category !== null
    && preferences.pushCategories[policy.category];

  return {
    ...policy,
    pushEnabledForUser,
  };
}
