# Notifications

Step 12.1 provides the backend contract for in-app notifications. Step 12.2.1
wires Proposal and Invitation events into that contract. This module does not
create notification UI or send email/SMS/push messages.

## Data model

`notifications` stores one recipient-scoped item:

- `recipientUserId`: the only user allowed to read or mutate the item
- `type`: a constrained product event such as `proposal_received`
- `entity`: a discriminated reference to a project, proposal, invitation,
  conversation, site visit, final quote, deal, review, or company verification
- `payload`: locale-neutral interpolation values such as `projectTitle` or
  `companyName`; it never stores rendered French or English copy
- `actorUserId`: optional trusted actor reference
- `dedupeKey`: optional retry key, unique in practice per recipient
- `createdAt`: ordering timestamp
- `readAt`: timestamp for an individual read

`notificationRecipientStates` stores a recipient's exact transactional unread
count and the optional `readThroughAt` watermark used by mark-all. A notification
is logically read when it has `readAt`, or when it predates the recipient's
watermark. This makes mark-all O(1) instead of scanning or rewriting an
unbounded inbox. New notifications are timestamped after that watermark and
increment the counter in the same transaction.

## Creation contract

Product domain mutations import `createNotification` from
`convex/notifications/model.ts` and call it directly in their mutation:

```ts
await createNotification(ctx, {
  recipientUserId,
  actorUserId,
  type: "proposal_received",
  entity: { type: "proposal", id: quoteId },
  payload: { projectTitle },
  dedupeKey: `proposal:${quoteId}:received`,
});
```

This is deliberately not a public mutation. The frontend cannot choose a
recipient, forge an actor, or manufacture a notification. Calling the helper
inside the domain mutation keeps the domain transition, audit records, and
notification writes atomic.

Use a deterministic `dedupeKey` for operations that may be retried. Repeating
the same key for the same recipient returns the existing notification without
incrementing unread count. The same key may be used for a different recipient.

## Public API and authorization

- `listMyNotifications`: authenticated, recipient-derived cursor pagination,
  newest first, maximum 50 per page
- `getMyUnreadCount`: authenticated exact count without scanning history
- `markNotificationRead`: authenticated, recipient-owned, idempotent
- `markAllNotificationsRead`: authenticated O(1) watermark update

All four account types (`client`, `company`, `admin`, and `seo_team`) can own
notifications. Public calls derive the recipient from Convex Auth and expose no
recipient argument. Cross-recipient IDs return `NOTIFICATION_NOT_FOUND`.

Convex queries are reactive, so a subscribed list or unread-count query updates
after a notification creation or read mutation without polling. The future UI
must translate `type` with `next-intl` and use the structured payload only as
interpolation data.

## Indexes

- `notifications.by_recipientUserId_and_createdAt` serves the only public list
  path and its newest-first cursor pagination.
- `notifications.by_recipientUserId_and_dedupeKey` lets the trusted helper make
  retries idempotent without scanning notification history.
- `notificationRecipientStates.by_recipientUserId` reads and transactionally
  updates one recipient's unread aggregate and mark-all watermark.

No notification query performs an unbounded `collect()`.

## Step 12.2.1 event map

| Authoritative domain event | Notification type | Recipient |
| --- | --- | --- |
| Initial Proposal submitted | `proposal_received` | Project-owning Client |
| Client opens Proposal discussion | `proposal_accepted` | Every active member of the Proposal Company |
| Direct Invitation created | `invitation_received` | Every active member of the invited Company |
| Direct Invitation accepted | `invitation_accepted` | Project-owning Client |
| Direct Invitation declined | `invitation_declined` | Project-owning Client |

The repository has a real Proposal engagement transition:
`reviewInitialQuote({ action: "open_discussion" })`. This transition, rather
than the passive `viewed` state, emits `proposal_accepted`. An accepted direct
Invitation's Proposal opens discussion as part of the Company's own submission;
that path does not notify the Company about its own action.

Company-directed events notify all active members. This matches the current
authorization model: every active Company member can access the shared Company
workspace and can list or decide Invitations. Inactive members and members of
other Companies are excluded by the indexed membership query.

All event data is derived from authenticated domain relationships. Payloads
contain only optional `projectTitle` and `companyName` snapshots. The exact
dedupe keys are:

- `proposal:{proposalId}:received`
- `proposal:{proposalId}:accepted`
- `invitation:{invitationId}:received`
- `invitation:{invitationId}:accepted`
- `invitation:{invitationId}:declined`

The domain mutation, immutable history/activity writes, and all recipient
notifications commit in one Convex transaction. A notification validation or
recipient-integrity failure rolls back the entire transition. Domain retries
either fail their existing state guard or resolve through the per-recipient
dedupe key without producing another notification.

## Boundaries and future phases

Notifications answer “who needs to know?” and never replace marketplace audit
or activity records, which answer “what happened?”. Later Step 12.2.x work will
wire messages, site visits, final quotes, deals, commissions, completion,
reviews, and verification. Step 12.3 will add the in-app UI, Step 12.4
preferences, and Step 12.5+ browser push and delivery. This foundation has no
coupling to those delivery channels.
