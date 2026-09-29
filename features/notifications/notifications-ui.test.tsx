import { NextIntlClientProvider } from "next-intl";
import { getFunctionName } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { NOTIFICATION_TYPES } from "@/convex/notifications/constants";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import {
  NOTIFICATION_PREFERENCE_CATEGORY_ORDER,
  NotificationPreferencesSkeleton,
  NotificationPreferencesView,
} from "@/features/notifications/components/notification-preferences-view";
import { NotificationsPage } from "@/features/notifications/components/notifications-page";
import { BrowserPushDeviceView } from "@/features/notifications/components/browser-push-device-controls";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_CATEGORIES,
} from "@/convex/notifications/deliveryPolicy";
import {
  NOTIFICATION_PRESENTATION,
  notificationDestination,
  notificationIconCategory,
  notificationTranslationKey,
  readThenNavigate,
  resolveNotificationDestinationForOpen,
  unreadBadgeLabel,
  type NotificationRecord,
} from "@/features/notifications/lib/presentation";
import { localizedNotificationDestination } from "@/lib/notifications/destination";
import { routes } from "@/lib/routes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const state = vi.hoisted(() => ({
  unread: 0,
  results: [] as NotificationRecord[],
  status: "Exhausted",
  preferencesFunctionName: "",
  preferences: {
    pushEnabled: false,
    pushCategories: {
      projects: true,
      messages: true,
      site_visits: true,
      commercial: true,
      account: true,
    },
    updatedAt: null as number | null,
  },
}));
vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === state.preferencesFunctionName ? state.preferences : state.unread,
  useMutation: () => vi.fn(async () => ({})),
  useAction: () => vi.fn(async () => ({ sent: 1, removed: 0, failed: 0 })),
  useConvex: () => ({ query: vi.fn(async () => ({ registered: false, updatedAt: null })) }),
  usePaginatedQuery: () => ({ results: state.results, status: state.status, loadMore: vi.fn() }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

state.preferencesFunctionName = getFunctionName(
  api.notifications.preferences.getMyNotificationPreferences,
);

function renderBell(locale: "en" | "fr" = "en") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">
      <NotificationBell accountType="client" />
    </NextIntlClientProvider>,
  );
}

function renderPage(locale: "en" | "fr" = "en") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca" now={new Date(1_790_000_100_000)}>
      <NotificationsPage accountType="client" />
    </NextIntlClientProvider>,
  );
}

function notification(type: NotificationRecord["type"], entity: NotificationRecord["entity"]): NotificationRecord {
  return {
    id: "notification-1" as Id<"notifications">,
    type,
    entity,
    payload: { projectTitle: "Villa Atlas", companyName: "Atlas Build", actorDisplayName: "Sara" },
    actorUserId: null,
    createdAt: 1_790_000_000_000,
    readAt: null,
  };
}

function renderPreferences(
  locale: "en" | "fr" = "en",
  accountType: "client" | "company" | "admin" | "seo_team" = "client",
  overrides: Partial<Parameters<typeof NotificationPreferencesView>[0]> = {},
) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">
      <NotificationPreferencesView
        accountType={accountType}
        dirty={false}
        error={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
        saved={false}
        saving={false}
        value={DEFAULT_NOTIFICATION_PREFERENCES}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
}

function renderDevice(
  status: Parameters<typeof BrowserPushDeviceView>[0]["status"],
  locale: "en" | "fr" = "en",
  overrides: Partial<Parameters<typeof BrowserPushDeviceView>[0]> = {},
) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">
      <BrowserPushDeviceView
        busy={false}
        globalPushEnabled={false}
        onDisable={vi.fn()}
        onEnable={vi.fn()}
        onTest={vi.fn()}
        status={status}
        testResult="idle"
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
}

describe("notification presentation", () => {
  beforeEach(() => {
    state.unread = 0;
    state.results = [];
    state.status = "Exhausted";
    state.preferences = { ...DEFAULT_NOTIFICATION_PREFERENCES, updatedAt: null };
  });

  test("has a localized presentation for every backend type, including the reserved type", () => {
    expect(Object.keys(NOTIFICATION_PRESENTATION).sort()).toEqual([...NOTIFICATION_TYPES].sort());
    for (const type of NOTIFICATION_TYPES) {
      expect(en.notifications.events[type]).toBeTruthy();
      expect(fr.notifications.events[type]).toBeTruthy();
      expect(notificationTranslationKey(type)).toBe(`events.${type}`);
      expect(notificationIconCategory(type)).not.toBe("marketplace");
    }
    expect(notificationTranslationKey("future_unknown_type")).toBe("events.fallback");
    expect(notificationIconCategory("future_unknown_type")).toBe("marketplace");
  });

  test.each([[0, "0"], [1, "1"], [99, "99"], [100, "99+"], [412, "99+"]] as const)(
    "formats unread badge %s as %s",
    (count, label) => expect(unreadBadgeLabel(count)).toBe(label),
  );

  test("hides zero badge and renders exact and capped unread badges", () => {
    expect(renderBell()).not.toContain(">0</span>");
    state.unread = 1;
    expect(renderBell()).toContain(">1</span>");
    state.unread = 99;
    expect(renderBell()).toContain(">99</span>");
    state.unread = 100;
    expect(renderBell()).toContain(">99+</span>");
  });

  test("renders localized accessible bell labels in English and French", () => {
    state.unread = 2;
    expect(renderBell("en")).toContain("Open notifications, 2 unread notifications");
    expect(renderBell("fr")).toContain("Ouvrir les notifications, 2 notifications non lues");
  });

  test("renders full-page loading, empty, and unread/read list states", () => {
    state.status = "LoadingFirstPage";
    expect(renderPage()).toContain("aria-busy=\"true\"");
    state.status = "Exhausted";
    expect(renderPage()).toContain("You’re all caught up.");
    state.unread = 1;
    state.results = [
      notification("proposal_received", { type: "proposal", id: "proposal-1" as Id<"projectQuotes"> }),
      { ...notification("deal_completed", { type: "deal", id: "deal-1" as Id<"deals"> }), id: "notification-2" as Id<"notifications">, readAt: 1_790_000_050_000 },
    ];
    const html = renderPage();
    expect(html).toContain("Atlas Build sent a proposal for Villa Atlas.");
    expect(html).toContain("Unread: Atlas Build sent a proposal for Villa Atlas.");
    expect(html).toContain("Villa Atlas was marked completed.");
    expect(html).toContain("bg-brand-soft/50");
  });

  test("resolves representative event families to existing role-safe routes", () => {
    expect(notificationDestination(notification("proposal_received", { type: "proposal", id: "proposal-1" as Id<"projectQuotes"> }), "client")).toBe(routes.clientDashboard);
    expect(notificationDestination(notification("proposal_accepted", { type: "proposal", id: "proposal-1" as Id<"projectQuotes"> }), "company")).toBe(routes.companyProjects);
    expect(notificationDestination(notification("invitation_received", { type: "invitation", id: "invitation-1" as Id<"invitations"> }), "company")).toBe(routes.companyInvitations);
    expect(notificationDestination(notification("invitation_accepted", { type: "invitation", id: "invitation-1" as Id<"invitations"> }), "client")).toBe(routes.clientDashboard);
    expect(notificationDestination(notification("invitation_declined", { type: "invitation", id: "invitation-1" as Id<"invitations"> }), "client")).toBe(routes.clientDashboard);
    expect(notificationDestination(notification("message_received", { type: "conversation", id: "conversation-1" as Id<"conversations"> }), "client")).toEqual({ pathname: routes.messagesConversation, params: { conversationId: "conversation-1" } });
    expect(notificationDestination(notification("site_visit_confirmed", { type: "site_visit", id: "visit-1" as Id<"siteVisits"> }), "company")).toBe(routes.messages);
    expect(notificationDestination(notification("final_quote_submitted", { type: "final_quote", id: "quote-1" as Id<"finalQuotes"> }), "client")).toBe(routes.messages);
    expect(notificationDestination(notification("final_quote_accepted", { type: "final_quote", id: "quote-1" as Id<"finalQuotes"> }), "company")).toBe(routes.messages);
    expect(notificationDestination(notification("commission_due", { type: "deal", id: "deal-1" as Id<"deals"> }), "company")).toBe(routes.companyCommissions);
    expect(notificationDestination(notification("commission_paid", { type: "deal", id: "deal-1" as Id<"deals"> }), "company")).toBe(routes.companyCommissions);
    expect(notificationDestination(notification("deal_completed", { type: "deal", id: "deal-1" as Id<"deals"> }), "company")).toBe(routes.companyDashboard);
    expect(notificationDestination(notification("review_received", { type: "review", id: "review-1" as Id<"reviews"> }), "company")).toBe(routes.companyProfileManagement);
    expect(notificationDestination(notification("company_verification_approved", { type: "company_verification", id: "verification-1" as Id<"companyVerifications"> }), "company")).toBe(routes.companyVerification);
    expect(notificationDestination(notification("company_verification_rejected", { type: "company_verification", id: "verification-1" as Id<"companyVerifications"> }), "company")).toBe(routes.companyVerification);
  });

  test("renders and routes operational notifications safely in both locales", () => {
    const companyMessage = {
      ...notification("company_admin_message_received", {
        type: "admin_company_message",
        id: "message-1" as Id<"adminCompanyMessages">,
      }),
      payload: {
        companyId: "company-1" as Id<"companies">,
        companyName: "Atlas Build",
        messagePreview: "A safe operational preview.",
      },
    };
    const adminMessage = {
      ...notification("admin_company_message_received", {
        type: "admin_company_message",
        id: "message-2" as Id<"adminCompanyMessages">,
      }),
      payload: {
        companyId: "company-1" as Id<"companies">,
        companyName: "Atlas Build",
        messagePreview: "Please review this request.",
      },
    };
    expect(notificationDestination(companyMessage, "admin")).toEqual({
      pathname: routes.adminCompany,
      params: { companyId: "company-1" },
      query: { tab: "messages" },
    });
    expect(localizedNotificationDestination("en", companyMessage, "admin"))
      .toBe("/en/admin/companies/company-1?tab=messages");
    expect(localizedNotificationDestination("fr", companyMessage, "admin"))
      .toBe("/fr/admin/entreprises/company-1?tab=messages");
    expect(notificationDestination(adminMessage, "company")).toBe(routes.companyBatiplus);
    expect(localizedNotificationDestination("en", adminMessage, "company")).toBe("/en/company/batiplus");
    expect(localizedNotificationDestination("fr", adminMessage, "company")).toBe("/fr/espace-entreprise/batiplus");
    const statusNotification = {
      ...notification("company_reactivated", {
        type: "company_operational_status",
        id: "status-1" as Id<"companyOperationalStatusHistory">,
      }),
      payload: { companyId: "company-1" as Id<"companies">, companyName: "Atlas Build" },
    };
    expect(localizedNotificationDestination("en", statusNotification, "company")).toBe("/en/company");
    expect(localizedNotificationDestination("fr", statusNotification, "company")).toBe("/fr/espace-entreprise");
    expect(notificationDestination(statusNotification, "admin")).toBe(routes.notifications);
    expect(notificationDestination(companyMessage, "client")).toBe(routes.notifications);
    expect(notificationDestination(adminMessage, "admin")).toBe(routes.notifications);

    state.results = [adminMessage];
    expect(renderPage("en")).toContain("Batiplus sent you a new operational message.");
    expect(renderPage("en")).toContain("Please review this request.");
    expect(renderPage("fr")).toContain("Batiplus vous a envoyé un nouveau message opérationnel.");
  });

  test("localizes an unnamed Company in operational notifications", () => {
    state.results = [{
      ...notification("company_admin_message_received", {
        type: "admin_company_message",
        id: "message-unnamed" as Id<"adminCompanyMessages">,
      }),
      payload: {
        actorDisplayName: "",
        companyId: "company-unnamed" as Id<"companies">,
        companyName: "",
        messagePreview: "Operational update.",
      },
    }];

    expect(renderPage("en")).toContain("Company sent Batiplus a new operational message.");
    const french = renderPage("fr");
    expect(french).toContain("Entreprise a envoyé un nouveau message opérationnel à Batiplus.");
    expect(french).not.toContain("Company sent");
  });

  test("resolves proposal notifications to the related role-safe Project route", async () => {
    const projectId = "project-1" as Id<"projects">;
    const received = { ...notification("proposal_received", { type: "proposal", id: "proposal-1" as Id<"projectQuotes"> }), projectId };
    const accepted = { ...notification("proposal_accepted", { type: "proposal", id: "proposal-1" as Id<"projectQuotes"> }), projectId };

    expect(resolveNotificationDestinationForOpen(received, "client")).toEqual({
      pathname: routes.clientProject,
      params: { projectId },
    });
    expect(resolveNotificationDestinationForOpen(accepted, "company")).toEqual({
      pathname: routes.companyProject,
      params: { projectId },
    });
    expect(localizedNotificationDestination("en", received, "client", { projectId })).toBe("/en/client/projects/project-1");
    expect(localizedNotificationDestination("fr", received, "client", { projectId })).toBe("/fr/espace-client/projets/project-1");
    expect(localizedNotificationDestination("en", accepted, "company", { projectId })).toBe("/en/company/projects/project-1");
    expect(localizedNotificationDestination("fr", accepted, "company", { projectId })).toBe("/fr/espace-entreprise/projets/project-1");
  });

  test("falls back safely when the related proposal Project is unavailable", async () => {
    const row = notification("proposal_received", { type: "proposal", id: "proposal-1" as Id<"projectQuotes"> });
    expect(resolveNotificationDestinationForOpen(row, "client")).toBe(routes.notifications);
  });

  test("keeps internal-role and unknown destinations inside the shared notification surface", () => {
    const row = notification("deal_created", { type: "deal", id: "deal-1" as Id<"deals"> });
    expect(notificationDestination(row, "admin")).toBe(routes.notifications);
    expect(notificationDestination(row, "seo_team")).toBe(routes.notifications);
    const message = notification("message_received", { type: "conversation", id: "conversation-1" as Id<"conversations"> });
    expect(notificationDestination(message, "admin")).toBe(routes.notifications);
    expect(notificationDestination(message, "seo_team")).toBe(routes.notifications);
  });

  test("marks an unread item before navigation and does not navigate when the mutation fails", async () => {
    const row = notification("proposal_received", { type: "proposal", id: "proposal-1" as Id<"projectQuotes"> });
    const order: string[] = [];
    await readThenNavigate(row, routes.clientDashboard, async () => { order.push("read"); }, () => order.push("navigate"));
    expect(order).toEqual(["read", "navigate"]);

    const navigate = vi.fn();
    await expect(readThenNavigate(row, routes.clientDashboard, async () => { throw new Error("failed"); }, navigate)).rejects.toThrow("failed");
    expect(navigate).not.toHaveBeenCalled();
  });

  test("navigates a read item without issuing another mutation", async () => {
    const row = { ...notification("deal_completed", { type: "deal", id: "deal-1" as Id<"deals"> }), readAt: 1 };
    const markRead = vi.fn(async () => undefined);
    const navigate = vi.fn();
    await readThenNavigate(row, routes.clientDashboard, markRead, navigate);
    expect(markRead).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(routes.clientDashboard);
  });
});

describe("notification preferences UI", () => {
  test("keeps the UI category list complete and both locale shapes aligned", () => {
    expect([...NOTIFICATION_PREFERENCE_CATEGORY_ORDER]).toEqual([...NOTIFICATION_PREFERENCE_CATEGORIES]);
    expect(Object.keys(en.notificationPreferences).sort()).toEqual(Object.keys(fr.notificationPreferences).sort());
    for (const category of NOTIFICATION_PREFERENCE_CATEGORIES) {
      expect(en.notificationPreferences.categories[category].title).toBeTruthy();
      expect(fr.notificationPreferences.categories[category].title).toBeTruthy();
      expect(en.notificationPreferences.categories[category].toggle).toBeTruthy();
      expect(fr.notificationPreferences.categories[category].toggle).toBeTruthy();
    }
  });

  test("renders mandatory in-app copy, current values, and all categories for marketplace roles", () => {
    const html = renderPreferences("en", "company", {
      dirty: true,
      value: {
        pushEnabled: true,
        pushCategories: { ...DEFAULT_NOTIFICATION_PREFERENCES.pushCategories, messages: false },
      },
    });
    expect(html).toContain("Important Batiplus marketplace updates are always available");
    expect(html).toContain("does not request browser permission");
    expect(html).toContain("Enable browser push preference");
    expect(html).toContain("aria-checked=\"true\"");
    expect(html).toContain("Enable push for messages");
    expect(html).toContain("aria-checked=\"false\"");
    expect(html).toContain("Save preferences");
  });

  test("uses French copy and hides irrelevant categories for internal roles", () => {
    const html = renderPreferences("fr", "seo_team");
    expect(html).toContain("Préférences de notification");
    expect(html).toContain("ne demande aucune autorisation au navigateur");
    expect(html).toContain("Les catégories sont masquées");
    expect(html).not.toContain("Activer les notifications push pour les projets");
  });

  test("renders loading, success, and safe error states", () => {
    const loading = renderToStaticMarkup(<NotificationPreferencesSkeleton />);
    expect(loading).toContain("role=\"status\"");
    expect(loading).toContain("aria-label=\"loading\"");
    const status = renderPreferences("en", "client", { saved: true, error: true });
    expect(status).toContain("Preferences updated.");
    expect(status).toContain("role=\"alert\"");
    expect(status).toContain("We couldn’t save your preferences.");
  });

  test("renders every browser permission and device subscription state", () => {
    expect(renderDevice("loading")).toContain("Checking browser notification support");
    expect(renderDevice("unsupported")).toContain("Browser push is not supported");
    expect(renderDevice("not_enabled")).toContain("Not enabled on this device");
    expect(renderDevice("not_enabled")).toContain("Enable on this device");
    expect(renderDevice("denied")).toContain("Browser notification permission is denied");
    expect(renderDevice("denied")).not.toContain(">Enable on this device<");
    expect(renderDevice("enabled")).toContain("Enabled on this device");
    expect(renderDevice("enabled")).toContain("Send test notification");
    expect(renderDevice("enabled")).toContain("Disable on this device");
    expect(renderDevice("error")).toContain("setup could not be completed");
  });

  test("localizes device controls and exposes test success and error accessibly", () => {
    const success = renderDevice("enabled", "fr", { testResult: "success" });
    expect(success).toContain("Activées sur cet appareil");
    expect(success).toContain("Notification de test envoyée");
    const error = renderDevice("enabled", "en", { testResult: "error" });
    expect(error).toContain("role=\"alert\"");
    expect(error).toContain("test notification could not be sent");
  });
});
