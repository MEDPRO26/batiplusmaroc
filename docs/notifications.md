# Notifications

Step 12.1 provides the backend contract for in-app notifications. Steps 12.2.1
through 12.2.6 wire Proposal, Invitation, Message, Site Visit, Final Quote,
Company Selection, Commission, Deal Completion, Review, and Company
Verification events into that contract. This module does not create
notification UI or send email/SMS/push messages.

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

## Step 12.2.2 message event map

| Authoritative domain event | Notification type | Recipient |
| --- | --- | --- |
| Client sends an unlocked user message | `message_received` | Every active member of the conversation Company |
| Company sends an unlocked user message | `message_received` | Project-owning Client |

The message sender is never notified. Company-to-Client messages do not notify
other members of the sender's Company; notifications always cross to the
opposite marketplace side. Client-to-Company fan-out matches the existing
conversation authorization model, where every active Company member can access
the shared Company conversation. Inactive and unrelated Company members are
excluded.

`sendAuthorizedMessage` remains the authoritative write boundary for text and
PDF-attachment messages. Its existing conversation and `discussion_open` quote
checks run before the message write, so pre-engagement open Projects and pending
or declined direct Invitations cannot create messages or message notifications.
The current `messages` table contains only Client- or Company-authored messages;
there is no system-message type to notify for.

Each notification references the `conversation`, which is the future navigation
target, and uses `message:{messageId}:received` as its per-recipient dedupe key.
The locale-neutral payload contains safe available snapshots of `projectTitle`,
`companyName`, `actorDisplayName`, and a whitespace-normalized plain-text
`messagePreview` capped at 120 characters. It contains no rendered FR/EN copy,
HTML, contact details, or full message body.

Message persistence, attachment claiming, conversation metadata, recipient
notifications, and unread-count increments share one Convex transaction. A
notification validation or recipient-integrity failure therefore rolls back the
entire message write. Idempotent retries resolve the existing message before
notification creation, while distinct messages with identical text retain
distinct message-derived notification keys.

## Step 12.2.3 Site Visit event map

| Authoritative domain event | Notification type | Recipient |
| --- | --- | --- |
| Client proposes a Site Visit | `site_visit_proposed` | Every active member of the conversation Company |
| Company proposes a Site Visit | `site_visit_proposed` | Project-owning Client |
| Either side confirms the other side's proposal | `site_visit_confirmed` | Opposite marketplace side from the confirming actor |
| Either side submits a counter-proposal | `site_visit_rescheduled` | Opposite marketplace side from the rescheduling actor |
| Either side cancels a confirmed Site Visit | `site_visit_cancelled` | Opposite marketplace side from the cancelling actor |

Site Visit notifications follow the same workspace rule as messages: Client
actions fan out to all active members of the authorized Company, while Company
actions notify only the Project Client. The actor is never notified, and an
outbound Company action does not notify that actor's teammates. Inactive and
unrelated members are excluded.

The notification entity is the `site_visit` itself. Payloads contain only safe,
locale-neutral `projectTitle`, `companyName`, `actorDisplayName`, and
`scheduledAt` snapshots. Exact site addresses, notes, cancellation reasons,
contact details, and rendered FR/EN copy are not copied into notifications.

The exact dedupe keys are:

- `site_visit:{siteVisitId}:proposed`
- `site_visit:{siteVisitId}:confirmed`
- `site_visit:{siteVisitId}:rescheduled:{siteVisitProposalId}`
- `site_visit:{siteVisitId}:cancelled`

Each reschedule is an immutable `siteVisitProposals` row. Its ID is therefore a
stable per-transition dedupe component: a retry returns the existing proposal
without another notification, while a later legitimate counter-proposal gets a
new ID and notification. The domain transition, proposal/activity history,
notification fan-out, and unread counts commit in one Convex transaction.
Declining or completing a Site Visit does not emit a notification in this step.

## Step 12.2.4 Final Quote and Deal event map

| Authoritative domain transition | User-visible notification | Recipient |
| --- | --- | --- |
| A Company submits a Final Quote revision | `final_quote_submitted` | Project-owning Client |
| Client accepts the current Final Quote + selects the Company + creates the Deal | `final_quote_accepted` | Every active member of the selected Company |
| Deal creation caused by the Client's acceptance | none | Client actor is excluded |

Acceptance, Company Selection, and Deal creation are one atomic marketplace
success moment. They intentionally produce one Company-facing notification,
not separate `final_quote_accepted`, `company_selected`, and `deal_created`
items. The accepting Client is not notified about their own synchronous action,
and `deal_created` remains an available notification type rather than being
wired redundantly here. Step 12.2.5 adds a separate `commission_due`
notification because the financial obligation is distinct from winning the
Project; it is not folded into the selection notification.

The submission and acceptance notifications both reference the Final Quote.
This preserves the foundation's strict `final_quote_*` to `final_quote` entity
contract and gives future UI a canonical view of the accepted commercial offer.
Payloads contain only safe locale-neutral snapshots of `projectTitle`,
`companyName`, and `amountMad`; they exclude quote terms, PDF data, contact
details, and commission fields.

Submission uses `final_quote_revision:{finalQuoteRevisionId}:submitted`. The
immutable revision ID makes a retry idempotent while allowing a later requested
revision to create a new notification. Acceptance uses
`final_quote:{finalQuoteId}:accepted`, so a repeated acceptance cannot create a
second item for any recipient.

Company-directed acceptance notifications fan out to every active member of
the selected Company, matching the shared workspace authorization model.
Inactive members, unrelated Companies, the Client actor, Admins, and SEO users
are excluded. Both open-Project and direct-Invitation participation paths have
already converged on the same Final Quote mutation, so they produce the same
notification behavior without path-specific logic.

Final Quote revision persistence, activity, Client notification, and unread
count commit in one transaction. On acceptance, quote acceptance, Project
selection, Deal and commission snapshot creation, lifecycle history/activity,
Company notification fan-out, and unread counts also commit in one transaction.
Notification recipient or validation failure therefore rolls back the entire
corresponding domain transition.

## Step 12.2.5 Commission, Completion, and Review event map

| Authoritative domain event | Notification type | Recipient |
| --- | --- | --- |
| Deal creation establishes the commission obligation as due | `commission_due` | Every active member of the debtor Company |
| Admin records the commission as paid | `commission_paid` | Every active member of the debtor Company |
| Client completes the Deal | `deal_completed` | Every active member of the selected Company |
| Client submits the Deal Review | `review_received` | Every active member of the reviewed Company |

Company Selection and commission due intentionally produce two useful
Company-facing items: `final_quote_accepted` says the Company won the Project,
while `commission_due` communicates the separate Company-to-Batiplus financial
obligation. No `deal_created` notification is emitted, so the acceptance
transaction produces two notifications per active Company member rather than
three overlapping success messages.

All four events use the established shared-workspace recipient strategy. Every
active member of the authoritative Company is notified; inactive members,
unrelated Companies, the Client or Admin actor, SEO users, and public users are
excluded. `commission_due` has no actor because it is a system consequence of
Deal creation. `commission_paid` records the Admin actor, while
`deal_completed` and `review_received` record the Client actor.

Commission and completion notifications reference the `deal`; review
notifications reference the immutable `review`. Locale-neutral payloads contain
only the available `projectTitle` and `companyName` snapshots, plus `amountMad`
for the commission amount on due/paid events or `rating` for a received review.
Payment references, Admin notes, Review comments, contact details, commission
configuration internals, and rendered FR/EN text are excluded.

The exact dedupe keys are:

- `deal:{dealId}:commission_due`
- `deal:{dealId}:commission_paid`
- `deal:{dealId}:completed`
- `review:{reviewId}:received`

Commission due is written inside the existing Final Quote acceptance and Deal
creation transaction. Commission payment notification creation shares the
Admin `due -> paid` mutation with payment metadata, history, and activity. Deal
completion notification creation shares the Client completion mutation with
Deal/Project state and history. Review notification creation shares the Review
mutation with the immutable Review, Company rating aggregate, and activity.
Recipient or notification validation failure rolls back the corresponding
domain transition; rejected retries and invalid state transitions create no
notification or unread-count increment.

Open-Project and direct-Invitation paths have already converged on the same
Deal. Their commission-due, completion, and review behavior is therefore
identical and contains no acquisition-path branch. Review hide/restore
moderation deliberately emits no notification. No UI, push delivery, or
preferences are part of this step.

## Step 12.2.6 Company Verification event map

| Authoritative domain event | Notification type | Recipient |
| --- | --- | --- |
| Admin approves a pending Company verification | `company_verification_approved` | Every active member of the verified Company |
| Admin rejects a pending Company verification | `company_verification_rejected` | Every active member of the rejected Company |
| Company submits or resubmits verification | none | Admin queue remains the authoritative V1 work surface |

Approval and rejection notifications are emitted by the existing Admin
moderation mutations after their state and immutable-history writes. They
reference the current `company_verification` record, record the moderating
Admin as actor, and contain only the locale-neutral `companyName` snapshot.
The rejection reason is deliberately omitted: the current Company verification
API does not expose it to Company members, while the Admin review API does, so
it remains Admin-only data rather than becoming notification payload data.

Company-directed events use the established shared-workspace rule: every
active member of the authoritative Company is notified. Inactive members,
unrelated Companies, Clients, SEO users, public callers, and the moderating
Admin are excluded. Each intended recipient's unread count increases exactly
once. A retry is rejected by the existing pending-state guard and cannot add a
second notification.

The current model updates one `companyVerifications` record across
`rejected -> pending` resubmission cycles. Dedupe keys therefore include the
immutable moderation history row ID:

- `company_verification:{verificationId}:approved:{historyId}`
- `company_verification:{verificationId}:rejected:{historyId}`

This makes a retry of one transition idempotent without suppressing a later
legitimate approval or rejection of the same verification record. Company
status, immutable verification history, all Company-member notifications, and
unread aggregates share one Convex transaction; recipient or entity validation
failure rolls the whole moderation transition back.

Submission-to-Admin notification is intentionally not implemented. The
indexed Admin verification queue already exposes pending submissions, and the
current account model has only a broad `admin` type with no operational
verification assignment or active/inactive Admin audience. Broadcasting to all
Admins would invent recipient policy and require a new notification type
without a demonstrated V1 need. Company submission authorization and behavior
remain unchanged.

## Step 12.2.7 audited canonical event matrix

This matrix is the backend source of truth for the Step 12.3 UI. “Excluded”
means the actor cannot receive the event through its authoritative recipient
derivation; Company fan-out also has an explicit actor guard.

| Domain event | Notification type | Entity | Recipient | Actor behavior | Dedupe key |
| --- | --- | --- | --- | --- | --- |
| Company submits an initial Proposal | `proposal_received` | `proposal` | Project-owning Client | Company submitter excluded | `proposal:{proposalId}:received` |
| Client opens Proposal discussion | `proposal_accepted` | `proposal` | Active Proposal-Company members | Client actor excluded | `proposal:{proposalId}:accepted` |
| Client creates a direct Invitation | `invitation_received` | `invitation` | Active invited-Company members | Client actor excluded | `invitation:{invitationId}:received` |
| Company accepts an Invitation | `invitation_accepted` | `invitation` | Project-owning Client | Company actor excluded | `invitation:{invitationId}:accepted` |
| Company declines an Invitation | `invitation_declined` | `invitation` | Project-owning Client | Company actor excluded | `invitation:{invitationId}:declined` |
| Client sends an unlocked Message | `message_received` | `conversation` | Active conversation-Company members | Client actor excluded | `message:{messageId}:received` |
| Company sends an unlocked Message | `message_received` | `conversation` | Project-owning Client | Sender and Company teammates excluded | `message:{messageId}:received` |
| Either side proposes a Site Visit | `site_visit_proposed` | `site_visit` | Opposite marketplace side | Actor side excluded | `site_visit:{siteVisitId}:proposed` |
| Either side confirms a Site Visit | `site_visit_confirmed` | `site_visit` | Opposite marketplace side | Actor side excluded | `site_visit:{siteVisitId}:confirmed` |
| Either side counter-proposes a Site Visit | `site_visit_rescheduled` | `site_visit` | Opposite marketplace side | Actor side excluded | `site_visit:{siteVisitId}:rescheduled:{proposalId}` |
| Either side cancels a Site Visit | `site_visit_cancelled` | `site_visit` | Opposite marketplace side | Actor side excluded | `site_visit:{siteVisitId}:cancelled` |
| Company submits a Final Quote revision | `final_quote_submitted` | `final_quote` | Project-owning Client | Company actor excluded | `final_quote_revision:{revisionId}:submitted` |
| Client accepts a Final Quote and selects the Company | `final_quote_accepted` | `final_quote` | Active selected-Company members | Client actor excluded | `final_quote:{finalQuoteId}:accepted` |
| Deal creation establishes commission due | `commission_due` | `deal` | Active debtor-Company members | System consequence; no actor | `deal:{dealId}:commission_due` |
| Admin records commission paid | `commission_paid` | `deal` | Active debtor-Company members | Admin actor excluded | `deal:{dealId}:commission_paid` |
| Client completes a Deal | `deal_completed` | `deal` | Active selected-Company members | Client actor excluded | `deal:{dealId}:completed` |
| Client creates a Review | `review_received` | `review` | Active reviewed-Company members | Client actor excluded | `review:{reviewId}:received` |
| Admin approves Company verification | `company_verification_approved` | `company_verification` | Active verified-Company members | Admin actor excluded | `company_verification:{verificationId}:approved:{historyId}` |
| Admin rejects Company verification | `company_verification_rejected` | `company_verification` | Active rejected-Company members | Admin actor excluded | `company_verification:{verificationId}:rejected:{historyId}` |

### Audited cross-cutting guarantees

- Client recipients always come from the authoritative Project or conversation;
  no notification mutation accepts a recipient from the frontend.
- Company recipients use `companyMembers.by_companyId_and_status` and include
  every active member whose current account type is `company`, whose onboarding
  is complete, and whose single membership resolves to that workspace. Inactive
  or duplicate memberships, stale cross-role memberships, unrelated Companies,
  Admins, SEO users, Clients, and the actor are excluded; a dangling user
  reference aborts the transaction rather than silently losing a recipient.
- Payload fields are constrained snapshots: Proposal and Invitation use
  `projectTitle`/`companyName`; Message additionally uses
  `actorDisplayName`/a normalized 120-character `messagePreview`; Site Visit
  additionally uses `actorDisplayName`/`scheduledAt`; Final Quote uses
  `amountMad`; commission uses only the commission `amountMad`; completion uses
  project/company names; Review additionally uses `rating`; verification uses
  only `companyName`.
- Message markup and control characters are removed before preview storage.
  Text is capped at 120 characters; a PDF-only Message uses its normalized file
  name as the preview. Exact addresses, contact data, quote terms, payment
  references/notes, Review comments, commission configuration, verification
  documents/reasons, and rendered FR/EN copy are not notification payloads.
- Type-to-entity compatibility is enforced centrally before insertion. The
  domain transition, its history/activity, notifications, and unread counters
  execute in the same Convex transaction, so a notification failure rolls the
  entire authoritative command back.
- Recipient listing, dedupe lookup, recipient state, and Company fan-out all
  use their matching indexes. Inbox history is cursor-paginated and no public
  notification query performs an unbounded scan. Final Quote and Deal active-
  member preconditions also use the composite Company/status index.
- Open-Project and direct-Invitation entry paths converge on the same unlocked
  conversation, Final Quote, Deal, commission, completion, and Review logic.
  The acceptance moment intentionally emits `final_quote_accepted` plus the
  distinct financial `commission_due`, but not redundant `company_selected` or
  `deal_created` notifications.

`deal_created` remains a constrained, UI-translated notification type reserved
for a future explicitly approved product event; it is deliberately unwired to
avoid acceptance spam. The `project` entity variant is likewise reserved and
has no currently mapped notification type. Verification submission, Site Visit
decline/completion, Final Quote change/decline/withdrawal, and Review moderation
are intentionally unwired. Notification creation remains database-only with no
email, SMS, Web Push, service-worker, queue, or network-delivery dependency.

## Boundaries and future phases

Notifications answer “who needs to know?” and never replace marketplace audit
or activity records, which answer “what happened?”. Steps 12.2.1–12.2.6 are
audited and form the stable backend boundary for Step 12.3 in-app UI. Step 12.4
will add preferences, and Step 12.5+ will add browser push and delivery. This
foundation has no coupling to those delivery channels.
