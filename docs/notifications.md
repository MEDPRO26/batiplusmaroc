# Notifications

Step 12.1 provides the backend contract for in-app notifications. Steps 12.2.1
through 12.2.6 wire Proposal, Invitation, Message, Site Visit, Final Quote,
Company Selection, Commission, Deal Completion, Review, and Company
Verification events into that contract. Step 12.3 adds the in-app UI; the
Step 12.6 delivery described below adds browser push without adding email or
SMS delivery.

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
- optional push-attempt status, timestamps, and aggregate device result counts;
  these operational fields do not replace the in-app record

`notificationRecipientStates` stores a recipient's exact transactional unread
count and the optional `readThroughAt` watermark used by mark-all. A notification
is logically read when it has `readAt`, or when it predates the recipient's
watermark. Mark-all writes one state document rather than rewriting an inbox;
OC3.4 additionally rechecks logically unread support alerts for its visible
count, as described below. New notifications are timestamped after that watermark and
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
- `getMyUnreadCount`: authenticated exact visible count; OC3.4 rechecks only indexed, logically unread support alerts
- `markNotificationRead`: authenticated, recipient-owned, idempotent
- `markAllNotificationsRead`: authenticated watermark update; visible count uses the same support access policy

All four account types (`client`, `company`, `admin`, and `seo_team`) can own
notifications. Public calls derive the recipient from Convex Auth and expose no
recipient argument. Cross-recipient IDs return `NOTIFICATION_NOT_FOUND`.

Convex queries are reactive, so a subscribed list or unread-count query updates
after a notification creation or read mutation without polling. The Step 12.3
UI translates `type` with `next-intl` and uses the structured payload only as
interpolation data.

## Indexes

- `notifications.by_recipientUserId_and_createdAt` serves the only public list
  path and its newest-first cursor pagination.
- `notifications.by_recipientUserId_and_dedupeKey` lets the trusted helper make
  retries idempotent without scanning notification history.
- `notificationRecipientStates.by_recipientUserId` reads and transactionally
  updates one recipient's unread aggregate and mark-all watermark.
- `notifications.by_recipientUserId_and_type_and_readAt_and_createdAt` selects
  only logically unread support alerts for current-access count corrections.

No notification query performs an unbounded `collect()`.

## OC3.4 — Client support notifications

Client support extends the same recipient-scoped table, counter, bell and feed.
It introduces no preferences, subscriptions, delivery channel or backfill.

| New support entry | Notification type | Recipients |
| --- | --- | --- |
| First `free_help` request | `client_support_free_help_requested` | All current admins |
| First `coordination_discussion` request | `client_support_coordination_requested` | All current admins |
| Client human message | `client_support_client_message_received` | All current admins |
| Admin human reply | `client_support_admin_reply_received` | Current owning Client only |

Each event references `{ type: "client_support_entry", id: entryId }` with an
empty payload. Server event types map to generic `notifications.events.*` FR/EN
copy. Names, titles, contact data, message text, previews, quotes and file URLs
are absent. The internal actor ID binds the alert to its immutable source;
support feed DTOs expose `actorUserId: null` and only an authorized `projectId`.

`clientSupport/notifications.ts` runs only on successful new-entry branches in
the support mutation. Notification writes and unread aggregate updates are
transactional with the entry. The existing indexed admin fan-out excludes the
actor and applies the same stored-role eligibility as `requireAdminUser`.
Deduplication uses `client-support:${entryId}:received` within each recipient.
Repeated requests and normalized send retries return before the creation hook;
read acknowledgements and queries never invoke it. No historical alerts are
created when opening a pre-existing conversation.

The four support policies are active/in-app, push-ineligible, category `null`,
and `defaultPushEnabled: false`, regardless of existing push preferences.
Support creates no push jobs. Existing marketplace/OC2 eligibility, scheduling,
provider behavior and the reserved event's legacy scheduling remain unchanged.
Push templates enumerate `PUSH_NOTIFICATION_TYPES`; `ACTIVE_NOTIFICATION_TYPES`
now also includes active in-app-only support events.

`notifications/clientSupportAccess.ts` validates the current recipient role,
source entry/type/actor, conversation, captured Client and current Project owner
before notification creation/deduplication, listing or individual reads. Missing
entities and ownership mismatches fail closed. An old conversation never
transfers to a new owner. Inaccessible support alerts disappear from the feed;
their logically unread entries are subtracted from the existing raw aggregate.
This scans indexed **unread support entries only**, not marketplace history or
all support history. It costs O(unread support entries) reads, while mark-all
still writes just one watermark state. There is no capped count or silent
recipient truncation; very large fan-outs/unread sets remain subject to Convex
transaction limits and fail rather than partially committing.

Listing retains native pagination cursors even when a page becomes empty after
access checks. The shared bell/feed advance such empty pages and show loading
until exhaustion, rather than announcing an empty inbox prematurely. Already
read support alerts recheck access via `markNotificationRead` before navigating.
Destinations use the existing localized routes:

- FR Client: `/fr/espace-client/projets/[projectId]/batiplus`
- EN Client: `/en/client/projects/[projectId]/batiplus`
- FR Admin: `/fr/admin/assistance?projectId=...`
- EN Admin: `/en/admin/support?projectId=...`

Notification reads and support-thread reads remain independent. Clearing alerts
changes only notification state; support reads change only per-reader support
positions. Clicking an alert does not request a service or create a conversation.
The existing visible-message acknowledgment behavior applies when the thread
actually opens. See `client-support-notifications-oc34.md` for verification.

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
are intentionally unwired. Notification creation remains the transactional
source of truth; browser delivery is scheduled only after that transaction and
has no email or SMS dependency.

## Step 12.3 in-app UI architecture

Authenticated Client, Company, Admin, and SEO workspace headers render one
shared `NotificationBell`. The bell subscribes directly to
`getMyUnreadCount`; it never derives the badge from the loaded list. Counts
from 1 through 99 are exact, 100 and above render as `99+`, and zero is
visually quiet. Convex query subscriptions update both count and recent items
without polling or refresh.

The accessible Radix dropdown requests only the newest eight records through
the existing cursor-paginated `listMyNotifications` API. Opening it does not
change read state. Selecting an item first awaits `markNotificationRead` and
only navigates after success. `markAllNotificationsRead` is called once for
the watermark operation; the UI never iterates through rows. Loading,
empty, and safe translated error feedback reuse Batiplus workspace styling.

`/[locale]/notifications` is the single authenticated history route for every
account type. It keeps the current Client/Company navbar or Admin/SEO shell,
loads 20 records initially, and uses cursor-based “Load more” pagination.

`features/notifications/lib/presentation.ts` is the central presentation
boundary. It maps every constrained type, including reserved `deal_created`,
to an FR/EN `next-intl` key and icon category, then resolves role-safe
destinations. Message events
can deep-link directly to the existing conversation because their entity is a
conversation. Other event entities do not expose their parent Project or
conversation in the stable notification DTO, so V1 links to the closest
existing authorized workspace surface (Project dashboard, Invitations,
Messages, Commissions, profile, or verification) rather than inventing routes
or performing unauthorized client-side lookups. Admin, SEO, and unknown-event
fallbacks remain on the shared notification history surface. Raw Convex IDs
and raw backend type strings are never displayed.

Notification copy is rendered from locale-neutral payload fields at display
time. A completeness regression compares the backend type constant with the
presentation map and both locale dictionaries, preventing newly constrained
types from silently rendering blank. Unknown future values use the localized
“Marketplace update” fallback.

Step 12.3 intentionally contains no toast fan-out or external delivery.
Step 12.4 adds preference state only, and Step 12.5 adds the separately scoped
browser/device foundation described below.

## Step 12.4 delivery policy and preferences

`convex/notifications/deliveryPolicy.ts` is the single Strategy boundary for
notification delivery rules. Every currently wired marketplace event has
`inApp: true`: user preferences never suppress the trusted domain mutation or
its in-app notification record. Push is an additive channel.

The active policy is:

| Notification Type | Category | In-app | Push Eligible |
| --- | --- | --- | --- |
| `proposal_received` | Projects | Yes | Yes |
| `proposal_accepted` | Projects | Yes | Yes |
| `invitation_received` | Projects | Yes | Yes |
| `invitation_accepted` | Projects | Yes | Yes |
| `invitation_declined` | Projects | Yes | Yes |
| `message_received` | Messages | Yes | Yes |
| `site_visit_proposed` | Site visits | Yes | Yes |
| `site_visit_confirmed` | Site visits | Yes | Yes |
| `site_visit_rescheduled` | Site visits | Yes | Yes |
| `site_visit_cancelled` | Site visits | Yes | Yes |
| `final_quote_submitted` | Commercial | Yes | Yes |
| `final_quote_accepted` | Commercial | Yes | Yes |
| `commission_due` | Commercial | Yes | Yes |
| `commission_paid` | Commercial | Yes | Yes |
| `deal_completed` | Commercial | Yes | Yes |
| `review_received` | Commercial | Yes | Yes |
| `company_verification_approved` | Account | Yes | Yes |
| `company_verification_rejected` | Account | Yes | Yes |

`deal_created` remains reserved and unwired. Its policy is fail-closed:
in-app disabled, push ineligible, and no user-facing category. Unknown future
types use the same safe result until they are explicitly reviewed and mapped.
No preference control exposes reserved or unknown types.

`notificationPreferences` stores at most one recipient-owned document:

- `userId`
- `pushEnabled`
- `pushCategories.projects`
- `pushCategories.messages`
- `pushCategories.site_visits`
- `pushCategories.commercial`
- `pushCategories.account`
- `updatedAt`

The read API returns defaults without creating a row: global push is disabled
and every category is enabled. This means push remains opt-in while a future
opt-in does not unexpectedly omit a category. `getMyNotificationPreferences`
and `updateMyNotificationPreferences` derive the user from Convex Auth, accept
no `userId`, reject anonymous callers and unknown fields, and allow only the
five boolean category keys.

The shared `/{locale}/notifications` surface contains the settings panel for
all authenticated roles. Client and Company users see the five category
controls. Admin and SEO users see only the master push preference because
their workspaces currently receive no marketplace event families. UI copy
states that these choices never disable in-app notifications and that enabling
the preference does not request browser permission.

`resolveNotificationDelivery` evaluates policy plus the stored global and
category preferences. Marketplace delivery sends Push only when all of
the following are true:

1. the event is push eligible;
2. global push is enabled;
3. its category is enabled; and
4. Step 12.5 has created a valid browser permission and push subscription.

Messages remain individually eligible but are not throttled or grouped here.
Final Quote acceptance and `commission_due` remain distinct,
useful events; no `deal_created` event was wired.

This preference step itself does not request browser permission. Step 12.5's
device control is the only explicit entry point into that browser flow.

## Step 12.5 browser push foundation

Step 12.5 added browser/device infrastructure before marketplace delivery was
connected. The architecture remains:

```text
domain event -> in-app notification -> delivery policy -> browser push delivery
```

The authenticated infrastructure test notification remains available alongside
Step 12.6 marketplace delivery.

### Subscription model and multiple devices

`pushSubscriptions` stores one private row per browser push endpoint:

- `userId`
- `endpoint`
- `p256dh`
- `auth`
- `createdAt`
- `updatedAt`
- optional `lastUsedAt`

`by_endpoint` enforces endpoint-level dedupe and `by_userId` provides bounded
recipient lookup. A user may register up to 20 browsers/devices. Re-registering
the same endpoint for the same user refreshes its keys without creating a row;
an endpoint already owned by another user cannot be claimed. Disabling one
device deletes only that endpoint and leaves the user's other devices intact.

All public functions derive the user from Convex Auth and accept no `userId`.
The current-device query returns only `registered` and `updatedAt`; endpoint and
encryption secrets are never listed by a public query. Anonymous and roleless
accounts are rejected. The VAPID private key is never stored in Convex data and
never enters the Next.js client graph.

### VAPID configuration

Generate one key pair per environment:

```bash
npx web-push generate-vapid-keys
```

Configure the development Convex deployment with:

```bash
npx convex env set NEXT_PUBLIC_VAPID_PUBLIC_KEY '<public-key>'
npx convex env set VAPID_PRIVATE_KEY '<private-key>'
npx convex env set VAPID_SUBJECT 'mailto:notifications@example.com'
```

Set the same `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in the Next.js/Vercel build
environment. It is intentionally public and build-time inlined. Keep
`VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` server-side on Convex only; neither uses
the `NEXT_PUBLIC_` prefix. Missing or invalid server configuration fails the
test action with the controlled `PUSH_NOT_CONFIGURED` error. This repository
does not create, rotate, or modify production secrets automatically.

### Permission, service worker, and device lifecycle

The existing shared `/{locale}/notifications` settings panel contains the
device controls; no second settings page exists. Loading resolves into one of
four product states: unsupported, not enabled, permission denied, or enabled on
this device. Permission is never requested during render, page load, preference
save, or support detection. It is requested only after the user activates
“Enable on this device”. A denied permission removes the enable action and
directs the user to browser settings instead of prompting repeatedly.

After permission is granted, the browser registers `/push-sw.js` with root
scope, creates or reuses a `PushSubscription` with the public VAPID key, and
persists its endpoint and encryption keys under the authenticated user.
Disabling first calls the browser subscription's `unsubscribe()`, then removes
that exact owned endpoint from Convex. Global/category preference state remains
separate: a valid device may exist while global push is off, but marketplace
delivery requires both preference approval and a valid device.

`public/push-sw.js` implements only `push` and `notificationclick`. It adds no
offline cache, installability, fetch interception, background sync, or other
PWA behavior. Payload text is type/length checked, malformed JSON falls back to
safe Batiplus values, and click URLs must resolve to the current origin.
External, protocol-relative, malformed, and missing URLs fall back to the app
default, `/fr/notifications`. A click focuses and navigates an existing Batiplus window
or opens a new same-origin window.

### Test delivery and invalid cleanup

`sendMyTestPush` is a public authenticated Convex Node action with no recipient
argument. It sends only the fixed localized EN/FR setup payload to the caller's
own bounded subscription set. It is infrastructure verification, not a
marketplace event, and it cannot target another user.

Web Push responses `404` and `410` are permanent failures and delete only the
matching caller-owned subscription. Temporary/network/5xx failures are logged
without endpoint or key material, counted in a controlled result, and preserve
the subscription. There is no retry queue, batching, digest, email, SMS, or
WhatsApp delivery in this phase.

## Step 12.6 marketplace browser push delivery

Every newly inserted in-app notification schedules
`deliverMarketplacePush` with only its notification ID. Dedupe hits do not
schedule again. Convex commits the scheduler record with the domain mutation,
but executes the internal Node action after the transaction, so a VAPID,
network, or push-provider failure cannot roll back the marketplace command,
audit history, unread count, or in-app notification.

The action has no public API and accepts no recipient or arbitrary payload. Its
internal claim mutation reloads the notification, derives the recipient only
from `recipientUserId`, applies the Step 12.4 delivery resolver, and reads that
recipient's bounded subscription set. Delivery requires all four gates:

1. the event is an active push-eligible type;
2. the recipient enabled global push;
3. the recipient enabled the event's category; and
4. at least one recipient-owned subscription exists.

All 18 active marketplace types use this same path. Reserved `deal_created`
and unknown future events fail closed. A notification is claimed once through
its optional `pushDeliveryStatus`; duplicate scheduler/action execution becomes
a no-op. Completion stores only aggregate delivered, removed, and temporary-
failure counts plus timestamps. No endpoint, encryption key, rendered copy, or
provider response is copied onto the notification.

One safe server-side presentation map mirrors the existing in-app EN/FR event
copy and derives role-safe destinations from the same shared destination
function as Step 12.3. The payload contains only title, rendered safe summary,
same-origin localized URL, and notification-specific tag. In particular,
`messagePreview`, contact information, exact site addresses, internal notes,
and arbitrary URLs are not sent. The current user model stores no reliable
locale, so marketplace delivery uses the configured app default, French. The
renderer and routes support English as soon as a reliable recipient locale is
persisted; it does not guess from browser endpoint data.

Delivery fans out to every registered device. A `404` or `410` removes only
the matching recipient-owned subscription. Network and 5xx failures preserve
the subscription. Logs contain notification ID, constrained type, aggregate
attempt/result counts, and status code only—never endpoints, keys, payload
bodies, or message content. There is
no retry queue, digest, batching, rate limiting, email, SMS, or WhatsApp in
Step 12.6.

## Step 12.7 delivery audit and launch hardening

The end-to-end audit status is **PASS WITH FIXES APPLIED**. No Critical or High
finding remains. The audit tightened VAPID subject validation, aligned the
service-worker fallback with the French default locale, added aggregate safe
delivery logging, and filled deterministic cleanup/device-cap/unread-state
regression gaps. It added no event family or delivery channel.

### Audited delivery matrix

The Step 12.2.7 matrix above remains the canonical domain source, entity,
recipient, actor, and dedupe inventory. The corresponding delivery controls
and destinations are:

| Notification type | Category | Push | Client destination | Company destination |
| --- | --- | --- | --- | --- |
| `proposal_received` | Projects | Eligible | Client dashboard | Company Projects |
| `proposal_accepted` | Projects | Eligible | Client dashboard | Company Projects |
| `invitation_received` | Projects | Eligible | Client dashboard | Company Invitations |
| `invitation_accepted` | Projects | Eligible | Client dashboard | Company Projects |
| `invitation_declined` | Projects | Eligible | Client dashboard | Company Projects |
| `message_received` | Messages | Eligible | Referenced conversation | Referenced conversation |
| `site_visit_proposed` | Site visits | Eligible | Messages | Messages |
| `site_visit_confirmed` | Site visits | Eligible | Messages | Messages |
| `site_visit_rescheduled` | Site visits | Eligible | Messages | Messages |
| `site_visit_cancelled` | Site visits | Eligible | Messages | Messages |
| `final_quote_submitted` | Commercial | Eligible | Messages | Messages |
| `final_quote_accepted` | Commercial | Eligible | Messages | Messages |
| `commission_due` | Commercial | Eligible | Client dashboard | Company Commissions |
| `commission_paid` | Commercial | Eligible | Client dashboard | Company Commissions |
| `deal_completed` | Commercial | Eligible | Client dashboard | Company dashboard |
| `review_received` | Commercial | Eligible | Client dashboard | Company profile |
| `company_verification_approved` | Account | Eligible | Client dashboard | Company Verification |
| `company_verification_rejected` | Account | Eligible | Client dashboard | Company Verification |
| `deal_created` | None (reserved) | Ineligible | Notifications fallback | Notifications fallback |

Admin and SEO recipients always resolve to the shared Notifications page. The
same pure destination resolver serves the in-app UI and Push renderer, so Push
cannot introduce an external or cross-role URL. English paths are localized
before delivery; French uses the app's canonical internal paths.

### Scheduler, idempotency, and failure boundary

`createNotification` writes the in-app row, schedules one internal action, and
updates unread state in one Convex mutation. Convex commits all three or none;
`runAfter(0)` becomes due only after the mutation completes. Dedupe hits return
the existing notification before scheduling, so a domain retry creates neither
a second in-app row nor another scheduled action.

Convex scheduled actions are **at most once** and are not automatically retried.
The internal action atomically changes an unclaimed notification to
`processing`; any repeated/manual invocation then becomes a no-op. This favors
duplicate prevention over guaranteed external delivery. There is an unavoidable
external-side-effect ambiguity if the action or process fails after claiming—or
after the push provider accepts a request but before completion is recorded.
For V1, the explicit tradeoff is that such a notification may remain
`processing` and its Push may be lost, but it is never automatically resent and
can never damage its already-committed in-app/domain state. A retry queue or
lease would trade loss for possible duplicate Push and remains intentionally
out of scope.

Successful, permanent-failure, temporary-failure, missing-configuration, and
no-subscription paths never mutate `readAt`, `readThroughAt`, or `unreadCount`.
The test-Push action remains separate: it authenticates the caller, targets only
that caller's subscriptions, intentionally bypasses marketplace preferences for
infrastructure testing, and creates no notification or recipient-state row.

### Subscription, cleanup, performance, and observability

Public subscription APIs accept no user ID and derive ownership through Convex
Auth. Endpoint registration and removal use `by_endpoint`; fan-out uses
`by_userId` and is bounded to 20 devices. Registration rejects device 21.
Delivery attempts each returned subscription once. A `404` or `410` deletes
only the exact endpoint when it is still owned by the claimed recipient; 5xx
and network failures preserve it. Ownership is rechecked during cleanup, so an
endpoint cannot be deleted after moving to another account.

Each notification performs one indexed preference lookup and one bounded
subscription lookup. Completion performs at most 20 indexed endpoint lookups.
There are no unbounded notification/Push scans. One scheduled action is created
per new recipient notification; Company fan-out therefore remains deliberately
per recipient and per device.

Logs contain only notification ID, constrained notification type, attempted
device count, delivered count, permanent-failure count, temporary-failure
count, and provider status code where available. Endpoints, encryption keys,
payload bodies, message text, and VAPID secrets are never logged.

### Push payload and locale privacy

The serialized Push object has exactly four fields: `title`, `body`, `url`, and
`tag`. Body interpolation may use only `actorDisplayName`, `projectTitle`,
`companyName`, `amountMad`, and `rating`. The persisted `messagePreview` and
`scheduledAt` values are deliberately not rendered into Push. Full Messages,
contact details, exact addresses, Admin notes, payment references, Review
comments, commission configuration, verification reasons/documents,
subscriptions, and credentials are excluded.

No reliable locale is stored on the V1 user record. Marketplace Push therefore
uses the documented app default, French, rather than guessing from a device or
endpoint. Both complete EN and FR template maps and localized routes are tested,
so adding a reliable saved recipient locale later only changes locale selection,
not the delivery architecture. Malformed service-worker payloads also fall back
to `/fr/notifications`.

### Service-worker lifecycle

`/push-sw.js` has root scope and only `push` and `notificationclick` listeners.
It has no fetch interception, cache, install, activate, offline, background-sync,
or installability behavior. Same-origin URL reconstruction rejects absolute and
protocol-relative external targets. Existing Batiplus windows are navigated and
focused; otherwise a same-origin window opens.

The browser registers the stable `/push-sw.js` URL. Browsers perform their
standard service-worker update check for controlled navigations/registrations;
the new worker activates through the standard lifecycle after old controlled
clients release it. Batiplus deliberately uses neither `skipWaiting()` nor
`clients.claim()`, avoiding forced mid-session replacement. There is no custom
cache that can pin a stale worker.

### Production environment and deployment order

Use one matching VAPID key pair per environment. Required configuration:

- **Vercel / Next.js build:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- **Convex server:** the same `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, its matching
  `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`.
- `VAPID_SUBJECT` must be a valid contact URI such as
  `mailto:notifications@batiplusmaroc.com` or an HTTPS contact page. Do not use
  a developer's personal identity.

Safe production order:

1. Generate/approve the production VAPID pair outside the repository.
2. Configure the three Convex server variables.
3. Configure the matching public key in Vercel.
4. Deploy the optional notification schema fields and Convex functions.
5. Deploy Next.js, including `/push-sw.js` and the public key.
6. Verify service-worker scope/update and subscribe a production-safe internal account.
7. Send the authenticated infrastructure test, then one approved marketplace event.
8. Verify the notification, click destination, in-app row, unread count, and safe logs.

No production environment was read or changed during Step 12.7. The local
development build did not have `NEXT_PUBLIC_VAPID_PUBLIC_KEY` configured, so a
real browser delivery was not claimed; provider behavior is covered with
deterministic mocked Web Push tests and the real service-worker browser test.

### Emergency rollback and known limitations

Removing `VAPID_PRIVATE_KEY` from Convex is the fastest configuration-only
emergency stop: marketplace transactions and in-app notifications continue,
while the delivery action records controlled failures without sending. If a
quiet stop is required, deploy a policy change that makes all types Push
ineligible; do not remove in-app notification creation. Restore the same key
pair and redeploy only after validation.

Known V1 limitations are the intentional French locale fallback, at-most-once
scheduled action/crash window, sequential bounded fan-out, lack of provider
delivery receipts, and no retry queue, digest, batching, analytics dashboard,
email, SMS, or WhatsApp channel.

Security findings after fixes:

- **Critical:** none.
- **High:** none.
- **Medium:** none remaining. VAPID subjects now require a valid `mailto:` or
  credential-free HTTPS contact URI.
- **Low / accepted:** the documented at-most-once crash window and French
  locale fallback; both preserve the authoritative in-app state.

## Boundaries and future phases

### Admin ↔ Company operations integration (OC2.8)

Four active types extend the existing delivery policy: operational messages in
the `messages` category and Company suspension/reactivation in the `account`
category. Message dedupe is derived from immutable `adminCompanyMessages` IDs;
status dedupe is derived from immutable `companyOperationalStatusHistory` IDs.
The corresponding constrained entity kinds are `admin_company_message` and
`company_operational_status`.

Admin messages fan out to active members of the target Company; Company
messages fan out to every Admin in V1. Status notifications fan out only when
crossing the suspended boundary. Private status reasons, internal notes, full
message bodies, credentials, and Push subscription data never enter Push
payloads. Company message and suspension links open Batiplus support,
reactivation opens the Company dashboard, and Admin message links open the
localized Company Messages tab. Notification watermarks and
operational-conversation sequence watermarks are intentionally independent.

Notifications answer “who needs to know?” and never replace marketplace audit
or activity records, which answer “what happened?”. Steps 12.2.1–12.2.6 are
audited and form the stable backend boundary for the Step 12.3 in-app UI,
Step 12.4 preference policy, Step 12.5 device foundation, and Step 12.6
marketplace Web Push delivery. Mandatory in-app behavior remains unchanged.

### OC2.9 privacy audit

The OC2.9 audit reconfirmed active-member/Admin recipient isolation,
`normal ↔ needs_attention` silence, role-safe destination fallbacks, and the
allowlisted Push `{title, body, url, tag}` envelope. Regression sentinels prove
that suspension reasons and Internal Notes do not enter notification rows,
in-app presentation, Push presentation, or delivery requests. Subscription
ownership and recipient-bound permanent-failure cleanup remain unchanged. See
[the consolidated OC2.9 security audit](./oc2-security-audit.md).
