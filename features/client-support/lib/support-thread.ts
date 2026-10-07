import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { SupportRequestKind } from "@/convex/clientSupport/constants";
import { workspaceRouteForUser, type WorkspaceUser } from "@/lib/auth/workspace-route";
import { routes, type AppRoute } from "@/lib/routes";

export type SupportSummary = NonNullable<
  FunctionReturnType<typeof api.clientSupport.index.getMyConversation>
>;
export type SupportMessage = FunctionReturnType<
  typeof api.clientSupport.index.listMyMessages
>["page"][number];
export type SupportRole = "client" | "admin";

/** Targets within the documented 1–50 (history) and 1–30 (admin inbox) limits. */
export const SUPPORT_MESSAGE_PAGE_SIZE = 30;
export const SUPPORT_INBOX_PAGE_SIZE = 20;
export const SUPPORT_REQUEST_KINDS: readonly SupportRequestKind[] = [
  "free_help",
  "coordination_discussion",
];

/**
 * History pages arrive newest-first while each page is ascending, and reactive
 * pages can overlap at a boundary: deduplicate by ID, then order by sequence.
 */
export function mergeSupportMessages(messages: readonly SupportMessage[]) {
  return [...new Map(messages.map((message) => [message.id, message])).values()]
    .sort((left, right) => left.sequence - right.sequence);
}

export type SupportSendAttempt = { conversationId: string; body: string; key: string };

/** A retry of the same text in the same thread keeps its key; anything else gets a new one. */
export function resolveSendAttempt(
  previous: SupportSendAttempt | null,
  conversationId: string,
  body: string,
  createKey: () => string,
): SupportSendAttempt {
  return previous && previous.conversationId === conversationId && previous.body === body
    ? previous
    : { conversationId, body, key: createKey() };
}

type Draft = { body: string; attempt: SupportSendAttempt | null };

/** Per-thread drafts and retry attempts that survive switching between threads. */
export function createSupportDraftStore() {
  const drafts = new Map<string, Draft>();
  return {
    body: (conversationId: string) => drafts.get(conversationId)?.body ?? "",
    setBody(conversationId: string, body: string) {
      drafts.set(conversationId, { body, attempt: drafts.get(conversationId)?.attempt ?? null });
    },
    /** Starts or resumes the attempt for the current text. */
    attempt(conversationId: string, body: string, createKey: () => string) {
      const draft = drafts.get(conversationId);
      const attempt = resolveSendAttempt(draft?.attempt ?? null, conversationId, body, createKey);
      drafts.set(conversationId, { body: draft?.body ?? body, attempt });
      return attempt;
    },
    /** Clears only the draft that was actually sent; a newer draft is left alone. */
    settle(attempt: SupportSendAttempt) {
      const draft = drafts.get(attempt.conversationId);
      if (draft?.attempt?.key !== attempt.key) return;
      if (draft.body.trim() === attempt.body) drafts.delete(attempt.conversationId);
      else drafts.set(attempt.conversationId, { body: draft.body, attempt: null });
    },
  };
}
export type SupportDraftStore = ReturnType<typeof createSupportDraftStore>;

/** The newest entry the reader has actually had on screen, or null. */
export function newestVisibleMessage(
  messages: readonly SupportMessage[],
  visibleIds: ReadonlySet<string>,
) {
  return messages.reduce<SupportMessage | null>(
    (newest, message) =>
      visibleIds.has(message.id) && (!newest || message.sequence > newest.sequence) ? message : newest,
    null,
  );
}

/** Reads are acknowledged only from a foreground tab, and only forwards. */
export function shouldMarkSupportRead(input: {
  candidateSequence: number | null;
  readThroughSequence: number;
  markedSequence: number;
  documentVisible: boolean;
}) {
  return input.documentVisible
    && input.candidateSequence !== null
    && input.candidateSequence > Math.max(input.readThroughSequence, input.markedSequence);
}

const EVENT_LABELS = {
  "clientSupport.events.freeHelpRequested": "events.freeHelpRequested",
  "clientSupport.events.coordinationDiscussionRequested": "events.coordinationDiscussionRequested",
} as const;

/** Maps the stable protocol key to a `clientSupport` catalog key; never renders it raw. */
export function supportEventLabelKey(eventKey: string) {
  return (EVENT_LABELS as Record<string, (typeof EVENT_LABELS)[keyof typeof EVENT_LABELS]>)[eventKey]
    ?? "events.unknown";
}

/**
 * An empty page is not the end of a filtered inbox: only an exhausted cursor is.
 * "continue" means the next page must be requested before anything can be shown.
 */
export function supportInboxState(
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted",
  count: number,
): "loading" | "continue" | "empty" | "list" {
  if (count > 0) return "list";
  if (status === "Exhausted") return "empty";
  return status === "CanLoadMore" ? "continue" : "loading";
}

type CurrentUser = WorkspaceUser | null | undefined;

/** Only an onboarded Client may open the project/Batiplus route. Null means render. */
export function resolveClientSupportRedirect(user: CurrentUser): AppRoute | null {
  if (user === undefined) return null;
  if (user === null) return routes.signIn;
  if (user.accountType === "client" && user.onboardingStatus === "completed") return null;
  return workspaceRouteForUser(user);
}
