import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { NOTIFICATION_TYPES } from "@/convex/notifications/constants";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { NotificationsPage } from "@/features/notifications/components/notifications-page";
import {
  NOTIFICATION_PRESENTATION,
  notificationDestination,
  notificationIconCategory,
  notificationTranslationKey,
  readThenNavigate,
  unreadBadgeLabel,
  type NotificationRecord,
} from "@/features/notifications/lib/presentation";
import { routes } from "@/lib/routes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const state = vi.hoisted(() => ({ unread: 0, results: [] as NotificationRecord[], status: "Exhausted" }));
vi.mock("convex/react", () => ({
  useQuery: () => state.unread,
  useMutation: () => vi.fn(async () => ({})),
  usePaginatedQuery: () => ({ results: state.results, status: state.status, loadMore: vi.fn() }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

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

describe("notification presentation", () => {
  beforeEach(() => { state.unread = 0; state.results = []; state.status = "Exhausted"; });

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
    expect(html).toContain("bg-brand-soft/65");
  });

  test("resolves representative event families to existing role-safe routes", () => {
    expect(notificationDestination(notification("proposal_received", { type: "proposal", id: "proposal-1" as Id<"projectQuotes"> }), "client")).toBe(routes.clientDashboard);
    expect(notificationDestination(notification("invitation_received", { type: "invitation", id: "invitation-1" as Id<"invitations"> }), "company")).toBe(routes.companyInvitations);
    expect(notificationDestination(notification("message_received", { type: "conversation", id: "conversation-1" as Id<"conversations"> }), "client")).toEqual({ pathname: routes.messagesConversation, params: { conversationId: "conversation-1" } });
    expect(notificationDestination(notification("site_visit_confirmed", { type: "site_visit", id: "visit-1" as Id<"siteVisits"> }), "company")).toBe(routes.messages);
    expect(notificationDestination(notification("final_quote_submitted", { type: "final_quote", id: "quote-1" as Id<"finalQuotes"> }), "client")).toBe(routes.messages);
    expect(notificationDestination(notification("commission_due", { type: "deal", id: "deal-1" as Id<"deals"> }), "company")).toBe(routes.companyCommissions);
    expect(notificationDestination(notification("deal_completed", { type: "deal", id: "deal-1" as Id<"deals"> }), "company")).toBe(routes.companyDashboard);
    expect(notificationDestination(notification("review_received", { type: "review", id: "review-1" as Id<"reviews"> }), "company")).toBe(routes.companyProfileManagement);
    expect(notificationDestination(notification("company_verification_rejected", { type: "company_verification", id: "verification-1" as Id<"companyVerifications"> }), "company")).toBe(routes.companyVerification);
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
