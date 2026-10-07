import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { routing } from "@/i18n/routing";
import { APP_ERROR_CODES } from "@/lib/errors/codes";
import { routes } from "@/lib/routes";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const convex = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  paginated: {} as Record<string, { results: unknown[]; status: string }>,
  calls: [] as { name: string; args: unknown }[],
}));
vi.mock("next/font/google", () => ({ Outfit: () => ({ className: "font-outfit" }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("convex/react", () => ({
  useQuery: (reference: never, args: unknown) => {
    const name = getFunctionName(reference);
    convex.calls.push({ name, args });
    return args === "skip" ? undefined : convex.queries[name];
  },
  usePaginatedQuery: (reference: never, args: unknown) => {
    const name = getFunctionName(reference);
    convex.calls.push({ name, args });
    return { ...(convex.paginated[name] ?? { results: [], status: "Exhausted" }), loadMore: vi.fn() };
  },
  useMutation: () => vi.fn(async () => ({})),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string | { pathname: string; params?: Record<string, string>; query?: Record<string, string> } }) => {
    const path = typeof href === "string"
      ? href
      : Object.entries(href.params ?? {}).reduce((value, [key, param]) => value.replace(`[${key}]`, param), href.pathname);
    const query = typeof href === "string" ? "" : new URLSearchParams(href.query ?? {}).toString();
    return <a href={query ? `${path}?${query}` : path} {...props}>{children}</a>;
  },
  usePathname: () => "/admin/support",
  getPathname: () => "/admin/support",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));

import { AdminShell } from "@/features/admin/components/admin-shell";
import { AdminSupportPanel } from "@/features/client-support/components/admin-support-panel";
import { ClientProjectSupport, ClientSupportRequestActions } from "@/features/client-support/components/client-support-actions";
import { ClientSupportPage } from "@/features/client-support/components/client-support-page";
import { SupportComposer, SupportEntry } from "@/features/client-support/components/support-thread";
import {
  createSupportDraftStore,
  mergeSupportMessages,
  newestVisibleMessage,
  resolveClientSupportRedirect,
  resolveSendAttempt,
  shouldMarkSupportRead,
  supportEventLabelKey,
  supportInboxState,
  SUPPORT_INBOX_PAGE_SIZE,
  SUPPORT_MESSAGE_PAGE_SIZE,
  type SupportMessage,
  type SupportSummary,
} from "@/features/client-support/lib/support-thread";
import { ClientProjectDetails, ClientProjectDetailsView, type ProjectDetails } from "@/features/projects/components/client-project-details";

const GET_MINE = "clientSupport/index:getMyConversation";
const GET_ADMIN = "clientSupport/index:getAdminConversation";
const projectId = "project-villa" as Id<"projects">;
const conversationId = "support-villa" as Id<"clientSupportConversations">;
const at = Date.UTC(2026, 9, 5, 10);

function provider(locale: "en" | "fr", child: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fr} timeZone="Africa/Casablanca">
      {child}
    </NextIntlClientProvider>,
  );
}

function text(sequence: number, body: string, own = false): SupportMessage {
  return {
    id: `entry-${sequence}` as Id<"clientSupportMessages">,
    conversationId,
    kind: "message",
    senderType: own ? "client" : "admin",
    senderDisplayName: own ? "Sara Client" : "Ada Admin",
    body,
    sequence,
    createdAt: at + sequence * 60_000,
    isOwnMessage: own,
  };
}

function request(sequence: number, requestKind: "free_help" | "coordination_discussion"): SupportMessage {
  return {
    id: `entry-${sequence}` as Id<"clientSupportMessages">,
    conversationId,
    kind: "request",
    senderType: "client",
    senderDisplayName: "Sara Client",
    requestKind,
    eventKey: requestKind === "free_help"
      ? "clientSupport.events.freeHelpRequested"
      : "clientSupport.events.coordinationDiscussionRequested",
    sequence,
    createdAt: at + sequence * 60_000,
    isOwnMessage: true,
  };
}

function summary(overrides: Partial<SupportSummary> = {}): SupportSummary {
  return {
    id: conversationId,
    project: { id: projectId, title: "Villa Atlas", city: "rabat", status: "published" },
    clientDisplayName: "Sara Client",
    requestedKinds: ["free_help"],
    entryCount: 3,
    readThroughSequence: 1,
    unreadCount: 2,
    hasUnread: true,
    lastEntry: { id: "entry-3" as Id<"clientSupportMessages">, sequence: 3, createdAt: at, kind: "message", senderType: "client", preview: "Can you check my quote?" },
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function project(viewerRole: "owner" | "admin"): ProjectDetails {
  return {
    id: projectId, title: "Villa Atlas", status: "published", viewerRole, description: "Build a villa.",
    primaryCategory: null, customCategoryText: null, city: "rabat", neighborhood: null, propertyType: null,
    surface: null, surfaceUnknown: false, timeline: null, images: [], attachments: [], history: [],
    createdAt: at, submittedAt: null, canResume: false,
  } as unknown as ProjectDetails;
}

function keyShape(value: unknown): unknown {
  return value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, keyShape((value as Record<string, unknown>)[key])]))
    : null;
}

beforeEach(() => {
  convex.queries = {};
  convex.paginated = {};
  convex.calls = [];
});

describe("client support routes and access", () => {
  test("maps the localized project/Batiplus and admin support routes", () => {
    expect(routing.pathnames[routes.clientProjectSupport]).toEqual({
      fr: "/espace-client/projets/[projectId]/batiplus",
      en: "/client/projects/[projectId]/batiplus",
    });
    expect(routing.pathnames[routes.adminSupport]).toEqual({ fr: "/admin/assistance", en: "/admin/support" });
  });

  test("lets only an onboarded Client through the project/Batiplus route", () => {
    expect(resolveClientSupportRedirect(undefined)).toBeNull();
    expect(resolveClientSupportRedirect(null)).toBe(routes.signIn);
    expect(resolveClientSupportRedirect({ accountType: "client", onboardingStatus: "completed" })).toBeNull();
    expect(resolveClientSupportRedirect({ accountType: "client", onboardingStatus: "pending" })).toBe(routes.clientOnboarding);
    expect(resolveClientSupportRedirect({ accountType: "company", onboardingStatus: "completed" })).toBe(routes.companyDashboard);
    expect(resolveClientSupportRedirect({ accountType: "admin", onboardingStatus: "completed" })).toBe(routes.admin);
    expect(resolveClientSupportRedirect({ accountType: "seo_team", onboardingStatus: "completed" })).toBe(routes.seoDashboard);
  });

  test.each([
    { accountType: "company", onboardingStatus: "completed" },
    { accountType: "admin", onboardingStatus: "completed" },
  ] as const)("never runs Client support queries for a $accountType account on the route", (user) => {
    convex.queries = { "users:currentUser": user, "projects/index:getMyProject": project("admin"), [GET_MINE]: summary() };
    const html = provider("en", <ClientSupportPage projectId={projectId} />);
    expect(html).not.toContain("Villa Atlas");
    expect(convex.calls.filter((call) => call.name.startsWith("clientSupport/") && call.args !== "skip")).toEqual([]);
    expect(convex.calls.some((call) => call.name === "projects/index:getMyProject" && call.args !== "skip")).toBe(false);
  });

  test.each([
    ["en", "Project not found", "Back to my projects"],
    ["fr", "Projet introuvable", "Retour à mes projets"],
  ] as const)("shows a localized %s not-found state without support queries", (locale, title, back) => {
    convex.queries = { "users:currentUser": { accountType: "client", onboardingStatus: "completed" }, "projects/index:getMyProject": null };
    const html = provider(locale, <ClientSupportPage projectId="not-a-project" />);
    expect(html).toContain(title);
    expect(html).toContain(back);
    expect(convex.calls.some((call) => call.name.startsWith("clientSupport/"))).toBe(false);
  });

  test("wires the admin Support navigation entry to the inbox route", () => {
    const html = provider("en", <AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><AdminSupportPanel initialProjectId={null} /></AdminShell>);
    expect(html).toMatch(/aria-current="page"[^>]*>(?:(?!<\/span>)[\s\S])*Support<\/span>/);
    expect(html).not.toContain("Support. Coming soon");
  });
});

describe("client support request actions", () => {
  test.each([
    ["en", "Get free help from Batiplus", "Discuss site coordination", "Both services are optional. Requesting coordination does not commit you to pay.", "Ask to arrange a phone call."],
    ["fr", "Obtenir l’aide gratuite de Batiplus", "Discuter de la coordination de chantier", "Les deux services sont facultatifs. Demander une coordination ne vous engage pas à payer.", "Demandez à organiser un appel téléphonique."],
  ] as const)("renders both optional %s actions with their service boundaries", (locale, free, coordination, notPaid, phoneGuidance) => {
    const html = provider(locale, <ClientSupportRequestActions projectId={projectId} requestedKinds={[]} />);
    expect(html).toContain(`>${free}</button>`);
    expect(html).toContain(`>${coordination}</button>`);
    expect(html).toContain(notPaid);
    expect(html).toContain(phoneGuidance);
    expect(html).not.toContain('href="tel:');
    expect(html).not.toContain('type="file"');
  });

  test("replaces an already requested kind's action with its state and keeps the other one", () => {
    const html = provider("en", <ClientSupportRequestActions projectId={projectId} requestedKinds={["free_help"]} />);
    expect(html).not.toContain(">Get free help from Batiplus</button>");
    expect(html).toContain("Requested");
    expect(html).toContain(">Discuss site coordination</button>");
  });

  test.each([
    ["en", "Open Batiplus conversation", "2 unread messages", "/espace-client/projets/project-villa/batiplus"],
    ["fr", "Ouvrir la conversation Batiplus", "2 messages non lus", "/espace-client/projets/project-villa/batiplus"],
  ] as const)("links an existing %s thread with its unread state", (locale, label, unread, href) => {
    convex.queries = { [GET_MINE]: summary() };
    const html = provider(locale, <ClientProjectSupport projectId={projectId} />);
    expect(html).toContain(label);
    expect(html).toContain(`aria-label="${unread}"`);
    expect(html).toContain(`href="${href}"`);
  });

  test("a project without a thread shows request actions and no conversation link", () => {
    convex.queries = { [GET_MINE]: null };
    const html = provider("en", <ClientProjectSupport projectId={projectId} />);
    expect(html).toContain(">Get free help from Batiplus</button>");
    expect(html).not.toContain("Open Batiplus conversation");
  });

  test("mounts Client-only support queries for the owner and never in an admin project preview", () => {
    const base = { "users:currentUser": { accountType: "client", onboardingStatus: "completed" }, [GET_MINE]: null };
    convex.queries = { ...base, "projects/index:getMyProject": project("owner") };
    expect(provider("en", <ClientProjectDetails projectId={projectId} />)).toContain('id="project-support-title"');
    expect(convex.calls.some((call) => call.name === GET_MINE)).toBe(true);

    convex.calls = [];
    convex.queries = { ...base, "users:currentUser": { accountType: "admin", onboardingStatus: "completed" }, "projects/index:getMyProject": project("admin") };
    const html = provider("en", <ClientProjectDetails projectId={projectId} />);
    expect(html).toContain("Villa Atlas");
    expect(html).not.toContain('id="project-support-title"');
    expect(convex.calls.some((call) => call.name.startsWith("clientSupport/"))).toBe(false);
  });

  test("the standard project view renders unchanged without the optional support slot", () => {
    const html = provider("en", <ClientProjectDetailsView project={project("owner")} />);
    expect(html).toContain("Villa Atlas");
    expect(html).not.toContain("Get free help from Batiplus");
  });
});

describe("client support chat correctness", () => {
  test("merges newest-first pages of ascending entries by ID and sequence", () => {
    const merged = mergeSupportMessages([
      text(4, "four"), text(5, "five"),
      text(2, "two"), text(3, "three"), text(4, "four again"),
      request(1, "free_help"),
    ]);
    expect(merged.map((entry) => entry.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(merged.map((entry) => entry.id)).size).toBe(5);
  });

  test("stays within the documented pagination limits", () => {
    expect(SUPPORT_MESSAGE_PAGE_SIZE).toBeGreaterThanOrEqual(1);
    expect(SUPPORT_MESSAGE_PAGE_SIZE).toBeLessThanOrEqual(50);
    expect(SUPPORT_INBOX_PAGE_SIZE).toBeGreaterThanOrEqual(1);
    expect(SUPPORT_INBOX_PAGE_SIZE).toBeLessThanOrEqual(30);
  });

  test("an empty admin page is progress, not the end of the inbox", () => {
    expect(supportInboxState("LoadingFirstPage", 0)).toBe("loading");
    expect(supportInboxState("CanLoadMore", 0)).toBe("continue");
    expect(supportInboxState("LoadingMore", 0)).toBe("loading");
    expect(supportInboxState("Exhausted", 0)).toBe("empty");
    expect(supportInboxState("CanLoadMore", 3)).toBe("list");
  });

  test("keeps one key per retry and issues a new key for edited text or another thread", () => {
    let next = 0;
    const key = () => `key-${++next}`;
    const first = resolveSendAttempt(null, "thread-a", "Hello", key);
    expect(resolveSendAttempt(first, "thread-a", "Hello", key)).toBe(first);
    expect(resolveSendAttempt(first, "thread-a", "Hello!", key).key).toBe("key-2");
    expect(resolveSendAttempt(first, "thread-b", "Hello", key)).toEqual({ conversationId: "thread-b", body: "Hello", key: "key-3" });
  });

  test("preserves failed drafts per thread and ignores a stale send result", () => {
    let next = 0;
    const key = () => `key-${++next}`;
    const drafts = createSupportDraftStore();
    drafts.setBody("thread-a", "Draft A ");
    drafts.setBody("thread-b", "Draft B");
    const failed = drafts.attempt("thread-a", "Draft A", key);
    // The failure leaves the text and its key in place for a retry, even after switching.
    expect(drafts.body("thread-a")).toBe("Draft A ");
    expect(drafts.attempt("thread-a", "Draft A", key)).toBe(failed);
    expect(drafts.body("thread-b")).toBe("Draft B");

    // A result that settles after the text changed must not clear the newer draft.
    drafts.setBody("thread-a", "A newer draft");
    drafts.settle(failed);
    expect(drafts.body("thread-a")).toBe("A newer draft");
    expect(drafts.attempt("thread-a", "A newer draft", key).key).toBe("key-2");

    const sent = drafts.attempt("thread-b", "Draft B", key);
    drafts.settle(sent);
    expect(drafts.body("thread-b")).toBe("");
    expect(drafts.attempt("thread-b", "Draft B", key).key).not.toBe(sent.key);
  });

  test("acknowledges only the newest entry actually seen, forwards, in a foreground tab", () => {
    const entries = [request(1, "free_help"), text(2, "two"), text(3, "three")];
    expect(newestVisibleMessage(entries, new Set())).toBeNull();
    expect(newestVisibleMessage(entries, new Set(["entry-1", "entry-2"]))?.id).toBe("entry-2");
    const base = { candidateSequence: 2, readThroughSequence: 1, markedSequence: 0, documentVisible: true };
    expect(shouldMarkSupportRead(base)).toBe(true);
    expect(shouldMarkSupportRead({ ...base, documentVisible: false })).toBe(false);
    expect(shouldMarkSupportRead({ ...base, candidateSequence: null })).toBe(false);
    expect(shouldMarkSupportRead({ ...base, readThroughSequence: 2 })).toBe(false);
    expect(shouldMarkSupportRead({ ...base, markedSequence: 2 })).toBe(false);
  });

  test("renders human text as escaped plain text, never HTML", () => {
    const html = provider("en", <ol><SupportEntry locale="en" message={text(2, '<img src=x onerror="alert(1)">\nSecond line')} /></ol>);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("<time");
  });

  test.each([
    ["en", "Free help from Batiplus requested", "Site coordination discussion requested", "Support request recorded"],
    ["fr", "Aide gratuite Batiplus demandée", "Discussion sur la coordination de chantier demandée", "Demande d’assistance enregistrée"],
  ] as const)("translates request-event keys in %s and never prints the raw key", (locale, free, coordination, unknown) => {
    const unknownEvent = { ...request(3, "free_help"), eventKey: "clientSupport.events.somethingNew" } as unknown as SupportMessage;
    const html = provider(locale, <ol>
      <SupportEntry locale={locale} message={request(1, "free_help")} />
      <SupportEntry locale={locale} message={request(2, "coordination_discussion")} />
      <SupportEntry locale={locale} message={unknownEvent} />
    </ol>);
    expect(html).toContain(free);
    expect(html).toContain(coordination);
    expect(html).toContain(unknown);
    expect(html).not.toContain("clientSupport.events");
    expect(supportEventLabelKey("anything else")).toBe("events.unknown");
  });

  test.each([
    ["en", "Client", "Batiplus team"],
    ["fr", "Client", "Équipe Batiplus"],
  ] as const)("localizes unnamed %s senders", (locale, client, team) => {
    const html = provider(locale, <ol>
      <SupportEntry locale={locale} message={{ ...text(1, "Hello", true), senderDisplayName: "" }} />
      <SupportEntry locale={locale} message={{ ...text(2, "Hello"), senderDisplayName: "" }} />
    </ol>);
    expect(html).toContain(`>${client}</span>`);
    expect(html).toContain(`>${team}</span>`);
  });

  test.each([
    ["client", "en", "Write to the Batiplus team…"],
    ["admin", "en", "Reply to the Client…"],
    ["client", "fr", "Écrivez à l’équipe Batiplus…"],
    ["admin", "fr", "Répondez au client…"],
  ] as const)("the %s composer in %s is labelled and text-only", (role, locale, placeholder) => {
    const html = provider(locale, <SupportComposer conversationId={conversationId} drafts={createSupportDraftStore()} role={role} />);
    expect(html).toContain(">Message</label>");
    expect(html).toContain(`placeholder="${placeholder}"`);
    expect(html).toContain('maxLength="5000"');
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("contenteditable");
  });

  test("restores a preserved draft when a thread is reopened", () => {
    const drafts = createSupportDraftStore();
    drafts.setBody(conversationId, "Unsent question");
    expect(provider("en", <SupportComposer conversationId={conversationId} drafts={drafts} role="admin" />)).toContain("Unsent question</textarea>");
  });
});

describe("admin support inbox", () => {
  function panel(locale: "en" | "fr", initialProjectId: string | null) {
    return provider(locale, <AdminShell email="admin@example.test" firstName="Ada" lastName="Admin"><AdminSupportPanel initialProjectId={initialProjectId} /></AdminShell>);
  }

  test.each([
    ["en", "Client support", "Villa Atlas", "Client: Can you check my quote?", "2 unread entries", "Free help", "Select a request"],
    ["fr", "Assistance clients", "Villa Atlas", "Client : Can you check my quote?", "2 entrées non lues", "Aide gratuite", "Sélectionnez une demande"],
  ] as const)("renders the %s inbox with safe context, kinds, last entry and per-admin unread", (locale, title, projectTitle, last, unread, kind, prompt) => {
    convex.paginated = { "clientSupport/index:listAdminConversations": { status: "Exhausted", results: [summary()] } };
    const html = panel(locale, null);
    for (const expected of [title, projectTitle, "Sara Client", last, kind, prompt]) expect(html).toContain(expected);
    expect(html).toContain(`aria-label="${unread}"`);
    // Nothing is fetched or acknowledged for a thread that has not been opened.
    expect(convex.calls.some((call) => call.name === GET_ADMIN)).toBe(false);
    expect(convex.calls.some((call) => call.name === "clientSupport/index:listAdminMessages")).toBe(false);
  });

  test.each([
    ["en", "Untitled draft project", "Client"],
    ["fr", "Projet en brouillon sans titre", "Client"],
  ] as const)("uses localized %s draft and name fallbacks", (locale, untitled, client) => {
    convex.paginated = { "clientSupport/index:listAdminConversations": { status: "Exhausted", results: [summary({ project: { id: projectId, title: null, city: null, status: "draft" }, clientDisplayName: "", lastEntry: { id: "entry-1" as Id<"clientSupportMessages">, sequence: 1, createdAt: at, kind: "request", senderType: "client", requestKind: "coordination_discussion", eventKey: "clientSupport.events.coordinationDiscussionRequested" } })] } };
    const html = panel(locale, null);
    expect(html).toContain(untitled);
    expect(html).toContain(`>${client}</span>`);
    expect(html).not.toContain("clientSupport.events");
  });

  test("a deep link resolves by projectId even when the thread is not in the first inbox page", () => {
    convex.paginated = { "clientSupport/index:listAdminConversations": { status: "CanLoadMore", results: [summary({ id: "support-other" as Id<"clientSupportConversations">, project: { id: "project-other" as Id<"projects">, title: "Other project", city: null, status: "draft" } })] } };
    convex.queries = { [GET_ADMIN]: summary() };
    const html = panel("en", projectId);
    expect(convex.calls).toContainEqual({ name: GET_ADMIN, args: { projectId } });
    expect(convex.calls).toContainEqual({ name: "clientSupport/index:listAdminMessages", args: { conversationId } });
    expect(html).toContain("Villa Atlas");
    expect(html).toContain("Back to requests");
    expect(html).toContain("Load more requests");
    // Only admin wrappers are used in the admin workspace.
    expect(convex.calls.some((call) => /getMyConversation|listMyMessages/.test(call.name))).toBe(false);
  });

  test.each([
    ["en", "No support conversation for this project"],
    ["fr", "Aucune conversation d’assistance pour ce projet"],
  ] as const)("a valid %s project without a thread shows no chat and no composer", (locale, title) => {
    convex.queries = { [GET_ADMIN]: null };
    const html = panel(locale, projectId);
    expect(html).toContain(title);
    expect(html).not.toContain("<textarea");
  });
});

describe("client support catalog", () => {
  test("keeps FR and EN translation shapes aligned", () => {
    expect(keyShape(fr.clientSupport)).toEqual(keyShape(en.clientSupport));
  });

  test("translates every support backend error code in both languages", () => {
    const codes = APP_ERROR_CODES.filter((code) => code.includes("CLIENT_SUPPORT") || code.includes("IDEMPOTENCY"));
    expect(codes).toHaveLength(7);
    for (const code of codes) {
      expect(en.ux.error.codes[code]).toBeTruthy();
      expect(fr.ux.error.codes[code]).toBeTruthy();
      expect(fr.ux.error.codes[code]).not.toBe(en.ux.error.codes[code]);
    }
  });
});
