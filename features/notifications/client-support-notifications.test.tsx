import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { CLIENT_SUPPORT_NOTIFICATION_TYPES } from "@/convex/notifications/constants";
import { NotificationItem } from "./components/notification-item";
import { readThenNavigate, resolveNotificationDestinationForOpen, type NotificationRecord } from "./lib/presentation";
import { localizedNotificationDestination, notificationDestination } from "@/lib/notifications/destination";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

function alert(type: NotificationRecord["type"]): NotificationRecord {
  return {
    id: "alert" as Id<"notifications">, type,
    entity: { type: "client_support_entry", id: "entry" as Id<"clientSupportMessages"> },
    projectId: "project-1" as Id<"projects">, payload: {}, actorUserId: null,
    createdAt: 1_800_000_000_000, readAt: null,
  };
}

describe("support notification presentation and navigation", () => {
  test.each(["en", "fr"] as const)("renders every generic %s event without private interpolations or previews", (locale) => {
    const messages = locale === "en" ? en : fr;
    for (const type of CLIENT_SUPPORT_NOTIFICATION_TYPES) {
      const notification = { ...alert(type), payload: { actorDisplayName: "PRIVATE_NAME_SENTINEL", projectTitle: "PRIVATE_TITLE_SENTINEL", messagePreview: "PRIVATE_MESSAGE_ATTACHMENT_URL_SENTINEL" } };
      const html = renderToStaticMarkup(
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Africa/Casablanca" now={new Date(1_800_000_060_000)}>
          <NotificationItem notification={notification} onOpen={vi.fn()} />
        </NextIntlClientProvider>,
      );
      expect(html).toContain(messages.notifications.events[type]);
      expect(html).not.toContain("PRIVATE_");
      expect(messages.notifications.events[type]).not.toContain("{");
    }
  });

  test.each(["en", "fr"] as const)("links directly to existing %s Client/admin routes with encoded Project IDs", (locale) => {
    expect(routing.pathnames[routes.clientProjectSupport][locale]).toBe(locale === "en" ? "/client/projects/[projectId]/batiplus" : "/espace-client/projets/[projectId]/batiplus");
    expect(routing.pathnames[routes.adminSupport][locale]).toBe(locale === "en" ? "/admin/support" : "/admin/assistance");
    for (const type of CLIENT_SUPPORT_NOTIFICATION_TYPES) {
      const n = alert(type);
      const isReply = type === "client_support_admin_reply_received";
      const role = isReply ? "client" : "admin";
      const destination = resolveNotificationDestinationForOpen(n, role);
      expect(destination).toEqual(isReply
        ? { pathname: routes.clientProjectSupport, params: { projectId: "project-1" } }
        : { pathname: routes.adminSupport, query: { projectId: "project-1" } });
      expect(localizedNotificationDestination(locale, n, role, { projectId: "project/1 ?" })).toBe(isReply
        ? `/${locale}/${locale === "en" ? "client/projects" : "espace-client/projets"}/project%2F1%20%3F/batiplus`
        : `/${locale}/admin/${locale === "fr" ? "assistance" : "support"}?projectId=project%2F1%20%3F`);
      for (const wrongRole of isReply ? ["admin", "company", "seo_team"] as const : ["client", "company", "seo_team"] as const) {
        expect(resolveNotificationDestinationForOpen(n, wrongRole)).toBe(routes.notifications);
      }
      expect(resolveNotificationDestinationForOpen({ ...n, projectId: null }, role)).toBe(routes.notifications);
      expect(notificationDestination({ ...n, entity: { type: "project", id: "project" } }, role, { projectId: "project" })).toBe(routes.notifications);
    }
  });

  test.each([null, 1_800_000_000_000])("rechecks support access before navigation even with readAt %s", async (readAt) => {
    const n = { ...alert("client_support_admin_reply_received"), readAt };
    const calls: string[] = [];
    await readThenNavigate(n, routes.notifications, async () => { calls.push("checked"); }, () => { calls.push("navigated"); });
    expect(calls).toEqual(["checked", "navigated"]);
    const navigate = vi.fn();
    await expect(readThenNavigate(n, routes.notifications, async () => { throw new Error("NOTIFICATION_NOT_FOUND"); }, navigate)).rejects.toThrow("NOTIFICATION_NOT_FOUND");
    expect(navigate).not.toHaveBeenCalled();
  });
});
