import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { buildCompanyNav } from "@/components/layout/company-nav";
import {
  OperationalComposer,
  OperationalConversation,
  OperationalMessageBubble,
  sortOperationalMessages,
  type OperationalMessage,
} from "@/features/operations/components/operational-conversation";
import { resolveCompanyOperationsRedirect } from "@/features/operations/components/company-operational-messaging";
import { routing } from "@/i18n/routing";
import { routes } from "@/lib/routes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

vi.mock("convex/react", () => ({
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
  useQuery: () => undefined,
  useMutation: () => vi.fn(async () => ({})),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

function provider(locale: "en" | "fr", child: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">
      {child}
    </NextIntlClientProvider>,
  );
}

function message(sequence: number, body: string, isOwnMessage = false): OperationalMessage {
  return {
    id: `operational-message-${sequence}` as Id<"adminCompanyMessages">,
    conversationId: "operational-conversation" as Id<"adminCompanyConversations">,
    senderType: isOwnMessage ? "company" : "admin",
    senderDisplayName: isOwnMessage ? "Sara Test" : "Ada Admin",
    body,
    sequence,
    createdAt: Date.UTC(2026, 8, 28, 10, sequence),
    isOwnMessage,
  };
}

describe("operational messaging UI", () => {
  test("maps the stable Company route in both locales and keeps it distinct from marketplace Messages", () => {
    expect(routing.pathnames[routes.companyBatiplus]).toEqual({
      fr: "/espace-entreprise/batiplus",
      en: "/company/batiplus",
    });
    expect(routes.companyBatiplus).not.toBe(routes.messages);
  });

  test("allows only Company accounts through the client route guard", () => {
    expect(resolveCompanyOperationsRedirect(undefined)).toBeNull();
    expect(resolveCompanyOperationsRedirect(null)).toBe(routes.signIn);
    expect(resolveCompanyOperationsRedirect({ accountType: "company", onboardingStatus: "pending" })).toBeNull();
    expect(resolveCompanyOperationsRedirect({ accountType: "client", onboardingStatus: "completed" })).toBe(routes.clientDashboard);
    expect(resolveCompanyOperationsRedirect({ accountType: "admin", onboardingStatus: "completed" })).toBe(routes.admin);
    expect(resolveCompanyOperationsRedirect({ accountType: "seo_team", onboardingStatus: "completed" })).toBe(routes.seoDashboard);
  });

  test("keeps marketplace Messages and Batiplus as separate Company navigation destinations", () => {
    const translate = ((key: string) => key) as never;
    const links = buildCompanyNav(translate, true).flatMap((item) => "kind" in item ? [] : [item]);
    expect(links.map((item) => item.href)).toEqual(expect.arrayContaining([routes.messages, routes.companyBatiplus]));
  });

  test("sorts accumulated cursor pages by authoritative sequence without duplicates", () => {
    const sorted = sortOperationalMessages([
      message(4, "four"),
      message(5, "five"),
      message(1, "one"),
      message(2, "two"),
      message(3, "three"),
      message(3, "duplicate page boundary"),
    ]);
    expect(sorted.map((item) => item.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(sorted.map((item) => item.id)).size).toBe(5);
  });

  test.each([
    ["en", "No conversation with Batiplus yet.", "Start a conversation", "Message", "Send"],
    ["fr", "Aucune conversation avec Batiplus pour le moment.", "Démarrer une conversation", "Message", "Envoyer"],
  ] as const)("renders the localized %s empty state and accessible composer", (locale, empty, action, label, send) => {
    const messages = locale === "en" ? en : fr;
    const html = provider(locale, <OperationalConversation
      conversation={null}
      emptyAction={messages.operationalMessaging.company.emptyAction}
      emptyLead={messages.operationalMessaging.company.emptyLead}
      emptyTitle={messages.operationalMessaging.company.emptyTitle}
      lead={messages.operationalMessaging.company.lead}
      onMarkRead={vi.fn(async () => undefined)}
      onSend={vi.fn(async () => undefined)}
      role="company"
      title={messages.operationalMessaging.company.title}
    />);
    expect(html).toContain(empty);
    expect(html).toContain(action);
    expect(html).toContain(`>${label}</label>`);
    expect(html).toContain(`>${send}</button>`);
    expect(html).toContain('maxLength="5000"');
  });

  test("renders operational message text as escaped plain text with sender and timestamp semantics", () => {
    const body = '<img src=x onerror="alert(1)">\nOperational only';
    const html = provider("en", <ol><OperationalMessageBubble locale="en" message={message(1, body)} /></ol>);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("Ada Admin");
    expect(html).toContain("Batiplus team");
    expect(html).toContain("<time");
  });

  test("composer exposes no attachment or rich-text controls", () => {
    const html = provider("en", <OperationalComposer onSend={vi.fn(async () => undefined)} />);
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("contenteditable");
    expect(html).not.toContain("attachment");
  });

  test("keeps FR and EN operational translation shapes aligned", () => {
    expect(Object.keys(fr.operationalMessaging).sort()).toEqual(Object.keys(en.operationalMessaging).sort());
    expect(Object.keys(fr.operationalMessaging.thread).sort()).toEqual(Object.keys(en.operationalMessaging.thread).sort());
    expect(Object.keys(fr.operationalMessaging.company).sort()).toEqual(Object.keys(en.operationalMessaging.company).sort());
  });
});
