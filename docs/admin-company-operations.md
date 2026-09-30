# Admin ↔ Company Operations

This document records the implementation boundary for the Owner Change 2
operations work. It is intentionally limited to behavior that exists today.

## OC2.2 — Company activity timeline

The Company activity timeline gives an authenticated Admin a compact,
newest-first view of important Company operations. It is reused in both the
Company verification review drawer and the consolidated Company detail route.

### Authoritative sources

1. `marketplaceActivity` is the primary cross-domain projection for marketplace,
   Deal, commission, and review events.
2. `companyVerificationHistory` fills the verification event family because
   verification changes are not written to `marketplaceActivity`.
3. `companyOperationalStatusHistory` provides suspension and reactivation
   events without reading the cross-domain activity projection.

No `companyActivity` table exists. Entity histories remain authoritative and
the timeline is a read-only normalized projection.

### Indexes and bounds

- Phase-two code reads `marketplaceActivity.by_companyId_and_createdAt` directly;
  it never filters the global event index by Company. Excluded event types are
  advanced through bounded windows so they cannot starve older eligible rows.
- `companyVerificationHistory.by_companyId_and_changedAt` and
  `companyOperationalStatusHistory.by_companyId_and_createdAt` remain enabled,
  Company-scoped timeline sources.
- The public query clamps logical pages to 30 items. Marketplace and
  verification reads each advance through bounded windows of at most 900
  Company-scoped rows. Same-timestamp continuation uses Convex's implicit
  `_creationTime` index tiebreaker.
- The cursor stores an independent `(timestamp, creation time, document ID)`
  boundary for each source. The backend merges the three bounded batches and
  returns the standard Convex pagination result shape used by
  `usePaginatedQuery`.

### Existing-table index rollout

Phase one staged every new index on an existing table. The nine staged indexes
were reported fully backfilled in production before this local phase-two change.
This branch promotes and queries them, but does not deploy production.

Phase one declares these indexes with `staged: true` and does not query them:

| Table | Staged index |
| --- | --- |
| `marketplaceActivity` | `by_companyId_and_createdAt` |
| `marketplaceActivity` | `by_dealId_and_createdAt` |
| `projectQuotes` | `by_companyId_and_createdAt` |
| `companies` | `by_updatedAt` |
| `companies` | `by_onboardingStatus_and_directoryListed` |
| `companies` | `by_onboardingStatus_and_verificationStatus_and_directoryListed` |
| `companies` | `by_directoryListed` |
| `companies` | `by_operationalStatus` |
| `companies` | `search_directory_v2` |

The enabled `companies.search_directory` and `projects.search_marketplace`
definitions remain identical to `origin/main` in phase one, avoiding an
implicit rebuild under an existing index name. Temporary phase-one reads use
only indexes that are already enabled on `origin/main`:

- Company activity exposes only verification and operational-status histories.
  It performs no `marketplaceActivity` query until the Company-scoped index is
  promoted in phase two.
- Deal/review audit assertions use
  `marketplaceActivity.by_projectId_and_createdAt` and filter their bounded test
  fixtures by Deal ID.
- Admin Company project history merges existing
  `projectQuotes.by_companyId_and_status` partitions and the new-table
  Invitation index.
- Admin Company filters use existing onboarding/verification indexes and
  bounded post-index operational filtering. The unfiltered Admin list uses
  built-in creation-time order; `updatedAt` is the temporary displayed activity
  fallback.
- Public Company discovery keeps the enabled `search_directory` filters and
  existing onboarding/verification indexes, then excludes suspended rows after
  the indexed read. A filtered search can return an empty progress page before
  `isDone`; callers continue with `continueCursor`.

Phase two remains a separate production deployment:

1. Confirm all nine staged indexes are fully backfilled in the target
   deployment; never infer this from a successful phase-one code push.
2. Remove `staged: true` locally and validate the schema and query changes.
3. Switch Company activity and latest-activity reads to
   `marketplaceActivity.by_companyId_and_createdAt`, Deal-scoped activity reads
   to `marketplaceActivity.by_dealId_and_createdAt`, Admin project history to
   `projectQuotes.by_companyId_and_createdAt`, and Company Admin/directory reads
   to the new Company indexes and `search_directory_v2`.
4. Run the full quality gates and verify Company activity ordering, directory
   pagination, and Admin Company filters against the target development
   deployment.
5. Remove phase-one fallbacks once replacements preserve ordering and legacy
   compatibility. Existing public-directory cursors may finish on
   `search_directory`; remove that index only in a later compatible rollout.

The public directory uses exact `directoryListed` partitions only when no
legacy row lacks materialized eligibility. Until the separately approved
operational-status backfill finishes, it keeps the legacy ordered path; its
cursor pins that choice across pages so a mid-session backfill cannot change
the underlying index. Public eligibility is filtered before pagination.

Never combine phase-one staging and phase-two query activation in one
deployment. Never use `--prod` or `convex deploy` while validating this plan.

### Included timeline events

- Verification: submitted/resubmitted, approved, rejected.
- Operational status: needs attention, suspension, reactivation, and return to
  normal.

The local phase-two implementation restores:

- Marketplace: Company invited, invitation accepted/declined, initial quote
  submitted, discussion opened.
- Site work: site assessment invited/accepted/declined/cancelled and site visit
  scheduled/proposed/rescheduled/confirmed/declined/completed/cancelled.
- Final Quote: requested, submitted, changes requested, revised, declined,
  withdrawn, accepted, and Company selected.
- Deal/commission: Deal created, commission due, commission paid, Deal completed.
- Reviews: received, hidden, restored.

The stored `review_created` activity name is normalized to the Admin-facing
`review_received` event. Other included marketplace event names remain the
canonical stored names.

### Excluded and deferred events

- Project creation/submission/review events are not Company activity unless a
  Company relationship exists.
- Initial quote viewed/shortlisted/declined events are Client triage and are too
  noisy for this operational timeline.
- Message delivery/read state, notification delivery, and background technical
  events are excluded.
- Profile/portfolio edit tracking is deferred to V1.5.
- Admin ↔ Company messaging events are deferred to OC2.4/OC2.5.

### Source precedence and duplicate handling

The three Company-scoped sources are merged. `marketplaceActivity` wins for
every event family it
represents; quote, invitation, Deal, commission, and review histories are not
merged a second time. This prevents duplicate semantic transitions.

### Normalized Admin DTO

Each row contains only:

- a stable timeline ID and constrained event/category/source keys;
- the requested Company ID;
- optional safe Project ID/title/status context;
- one constrained entity reference;
- actor role and safe display name (never email/contact data);
- server-authored occurrence timestamp and status transition keys;
- an allowlisted compact context for amount, commission, rating, revision, or
  site-visit schedule data.

Raw domain documents and arbitrary metadata are never returned.

### Authorization and isolation

`admin.companyActivity.listCompanyActivity` calls `requireAdminUser()` before
reading the requested Company. Anonymous, Client, Company, and SEO accounts are
denied. All three source queries use a Company equality constraint in their indexes;
activity for another Company cannot enter the merge.

### Privacy boundary

The timeline does not query or return message bodies, message attachment URLs,
Final Quote notes/scope, verification document URLs, rejection reasons,
commission payment notes, notification state, Push subscriptions, secrets, or
future Admin internal notes. A discussion row exposes only the existence of the
operational event and its constrained entity reference. Existing marketplace
message authorization remains unchanged.

### UI and localization

The reusable `CompanyActivityTimeline` provides loading, empty, event, and
load-more states in the current Admin visual language. All event titles,
categories, actor fallbacks, context labels, and empty/loading copy live in
`messages/en.json` and `messages/fr.json`. Existing Admin routes are used for
optional Project, Deal/commission, and review links.

## OC2.3 — Consolidated Admin Company detail

Authenticated Admins can now use the locale-aware Company directory at
`/admin/companies` (English) or `/admin/entreprises` (French), then open a
Company-scoped detail route. The previously disabled Companies sidebar entry
links to this directory.

### Company directory

`admin.companies.listCompanies` is a native paginated Convex query. It supports
bounded search and indexed verification/onboarding filters. The unfiltered path
uses `companies.by_updatedAt`; combined status filtering uses
`by_onboardingStatus_and_verificationStatus`; text search reuses the existing
`search_directory` search index. Rows contain only operational list data:
Company identity, city, statuses, services, active-member count, visible-review
aggregate, and latest recorded activity time.

### Detail sections and authoritative sources

- **Overview** uses `admin.companies.getCompanySummary` for safe profile data,
  active member display names/roles, bounded Deal and commission counts, review
  aggregates, and a small published-portfolio preview.
- **Verification** reuses `admin.verification.getCompanyVerificationReview`,
  `approveCompanyVerification`, and `rejectCompanyVerification`. Draft records
  now load safely; queue filters remain limited to pending/verified/rejected.
- **Projects & Deals** uses the bounded paginated
  `admin.companies.listCompanyProjectsDeals` projection over the existing
  Company quote and invitation indexes. A relationship that exists in both
  sources is shown once, with the quote as the canonical source.
- **Commissions** reuses `admin.deals.listCommissionObligations` with its
  `companyId` filter and the existing `markCommissionPaid` command.
- **Reviews** uses a Company/newest-first paginated projection and reuses the
  existing `admin.reviews.setReviewVisibility` moderation command.
- **Activity** mounts the unchanged OC2.2 `CompanyActivityTimeline`.

No parallel verification, commission, review, or activity business rules were
introduced.

### Bounds, authorization, and privacy

Every new query calls `requireAdminUser()` before reading Company data. Queries
are Company-index constrained, use native pagination or bounded dual-source
pagination, and return explicit DTO validators instead of raw documents.
Anonymous, Client, Company, and SEO callers remain denied.

The consolidated view never reads or returns Client↔Company message content,
message attachments, private proposal messages/scope, authentication data, or
Push subscription secrets. Verification document URLs are exposed only through
the existing Admin-only verification query. General summary and list DTOs do
not contain verification documents or private contact emails.

Draft, pending, verified, and rejected verification states and pending/completed
onboarding states are supported. Missing Companies return a translated safe
not-found view. Tables collapse into cards on narrow screens, tabs remain
keyboard-operable and horizontally scrollable, and all new copy is present in
both locale catalogs.

### Future OC2 work

Later steps may add operational messages, notes, and status events through their
own authoritative models; they must not broaden the marketplace-message privacy
boundary. OC2.3 deliberately does not implement OC2.4 messaging, internal notes,
suspension/status workflows, notification rules, or CRM features.

## OC2.4 — Admin ↔ Company operational messaging backend

Operational messaging is a separate, backend-only channel between Batiplus
Admins and the active members of one Company. It does not reuse or broaden the
Project/quote-bound Client ↔ Company conversation model.

### Data model and invariants

- `adminCompanyConversations` stores one lazily created conversation per
  Company, a monotonic message count, and the bounded last-message summary used
  by the future Admin inbox.
- `adminCompanyMessages` stores immutable, text-only messages with their target
  Company, server-derived sender identity/type, exact trimmed body, client
  idempotency key, creation time, and a conversation-local sequence.
- `adminCompanyConversationReads` stores one monotonic read-through sequence per
  conversation and authenticated user.

Conversation lookup and creation use the `by_companyId` equality range in the
same mutation that inserts the first message. Convex's optimistic transaction
conflict detection serializes competing first sends over that indexed range, so
retries converge on one Company conversation. Read-state creation uses the same
indexed get-or-create pattern for `(conversationId, userId)`.

### Authorization

Admin endpoints always use the canonical `requireAdminUser()` guard. Every
authenticated Admin may list, read, send, and maintain an independent read
position for any Company conversation.

Company endpoints derive the Company from the caller's current membership;
they never accept a caller-supplied Company as proof of access. Exactly one
active membership is required. All active owners and staff may initiate, read,
and reply in their Company's shared conversation while retaining independent
per-user read positions. Inactive, cross-Company, ambiguous-membership, Client,
SEO, and anonymous callers are denied. Cross-Company access uses an
indistinguishable operational-conversation-not-found response.

Operational support access deliberately does not depend on onboarding or
verification eligibility. This keeps the channel compatible with the future
OC2.7 suspension policy, where marketplace writes may be restricted while a
Company still needs to contact Batiplus. OC2.4 does not itself implement
suspension or reactivation.

### Sending, idempotency, and summaries

Either an Admin or an active Company member may create the conversation by
sending the first message. A send validates and trims a 1–5,000 character plain
text body and validates a bounded client idempotency key. Sender identity and
sender type are always derived server-side.

Idempotency is scoped globally to the authenticated sender. Repeating the same
key with the same normalized body and Company context returns the original
message without changing its conversation summary. Reusing that key with a
different body, Company, or sender type is rejected. Insertion, conversation
creation, sequence allocation, summary update, and sender read advancement all
occur in one Convex mutation transaction. The persisted preview is whitespace-
normalized plain text capped at 140 characters.

### Read state and same-millisecond safety

The authoritative read boundary is `readThroughSequence`, not a timestamp.
Every message receives the next monotonic sequence in its conversation, and
unread count is computed in constant time as `messageCount -
readThroughSequence`. A caller marks through a concrete message ID; the server
verifies that message belongs to the conversation and resolves its sequence.
Read positions only move forward.

Sending advances only the sender's own read boundary. It never writes every
participant's state, so another Admin, owner, or staff member continues to see
the message as unread. Because a message appended after a mark-read always has
a greater sequence, it remains unread even when both operations share the exact
same millisecond timestamp.

### Queries, pagination, and realtime

The Admin inbox is a bounded native cursor query ordered by latest conversation
activity. Company users receive a compact summary for their single Company
conversation. Message queries use the compound conversation/sequence index,
read newest pages first so the cursor loads older history, and return each page
in oldest-to-newest display order. Callers must prepend each older continuation
page. Page sizes are bounded at 50 messages and 30 conversations; no full
message-history collection is used.

All public reads are ordinary Convex queries, so OC2.5 can subscribe reactively
without polling or separate socket infrastructure. Returned DTOs are explicit
and contain only safe Company summary data or message display fields.

### Privacy and deferred work

Operational tables and APIs never read or return marketplace conversation IDs,
Client details, proposal content, marketplace message bodies or attachments,
emails, auth data, or internal Admin notes. IDs from operational and marketplace
tables are not interchangeable. Messages are immutable: edit, delete, unsend,
reactions, and conversation deletion are not implemented.

OC2.4 adds no UI, notification delivery, Push integration, attachment/storage
reuse, activity-timeline duplication, Admin assignment, tickets, SLA, CRM,
internal notes, or Company status workflow. Notifications belong to OC2.8,
attachments to V1.5, and the full Admin/Company messaging UI and browser
coverage to OC2.5. External rate limiting remains a launch/security
consideration; V1 currently relies on bounded inputs, authenticated role checks,
and deterministic retry protection.

## OC2.5 — Admin ↔ Company operational messaging UI

OC2.5 exposes the OC2.4 channel through two stable, locale-aware destinations:

- Admins use the **Messages** tab in the existing Company detail route. The
  deep-link form is `/admin/companies/[companyId]?tab=messages` in English and
  `/admin/entreprises/[companyId]?tab=messages` in French.
- Company members use `/company/batiplus` in English and
  `/espace-entreprise/batiplus` in French. The Company navigation calls this
  destination **Batiplus**, keeping it visibly separate from marketplace
  **Messages**.

The Admin route remains protected by the server-rendered Admin layout. The
Company client gate permits only Company accounts, including active members who
are still onboarding, while OC2.4 dynamically enforces active, unambiguous
membership for every query and mutation. An inactive member therefore loses
access immediately and receives a localized route error rather than a raw
Convex message. Client, SEO, and anonymous users are redirected to their safe
workspace or sign-in destination before an operational query is issued.

### Shared conversation presentation

Both wrappers use the same operational conversation, message bubble, empty
state, loading state, and composer components. Messages render as escaped plain
text with preserved line breaks, wrapping, a visible sender name and sender
role, and a locale-aware Morocco timestamp. Own-message alignment is reinforced
with text labels, so sender identity does not depend on color alone.

The OC2.4 query loads the latest cursor page in chronological order and moves
the cursor toward older messages. Since Convex's pagination hook appends loaded
pages, the UI sorts the accumulated immutable messages by authoritative
sequence. Older rows therefore appear above current rows without duplicates.
The scroll container starts near the newest message, moves to a newly appended
message, and preserves its viewport offset when older history is inserted.

All data remains in normal reactive Convex queries. A new message from the
other side updates the open thread without polling or manual refresh. Once the
latest rendered message exists, the active tab/page marks through that exact
message ID. Merely rendering Company navigation or an inactive Admin tab never
marks anything read. The Admin Messages tab displays the current Admin's unread
count; OC2.4 continues to keep every Admin and Company member's watermark
independent.

### Composer behavior

The shared composer accepts plain text only and enforces the 5,000-character UI
limit while OC2.4 remains authoritative. Whitespace-only drafts cannot submit.
Enter sends on desktop, Shift+Enter inserts a line break, and the Send button
remains the primary mobile action. An in-flight ref plus disabled controls stops
rapid duplicate submits, and every logical attempt carries a browser-generated
idempotency key.

The input clears only after success. A failed send retains both the text and
the attempt's idempotency key so **Retry** safely repeats the same request.
Errors are localized and announced without exposing backend strings. There are
no attachment, upload, Markdown, HTML, edit, delete, or rich-text controls.

### Localization, accessibility, and isolation verification

All route, navigation, empty, loading, error, sender, unread, pagination, and
composer copy lives in the aligned English and French catalogs. The tablist
supports arrow, Home, and End navigation; controls have visible focus styles
and at least 44-pixel targets; the composer has a programmatic label; errors
use alert semantics; and the message history is a labelled live ordered list.
The layout is bounded and overflow-tested at desktop, tablet, and 375×812
mobile sizes.

Component, backend, and Chrome regressions cover empty and existing threads,
first send, failed-send retention, same-key retry, rapid duplicate submission,
reactive replies, read mutations, older pagination, FR/EN copy, mobile overflow,
role redirects, and plain-text safety. Privacy sentinels prove marketplace
content does not enter the operational UI and operational content does not
enter the marketplace inbox.

OC2.5 still adds no operational notifications or Push delivery; those remain
deferred to OC2.8. Attachments, internal Admin notes, Company status or
suspension, assignment, ticketing, SLA, CRM, bulk messaging, and message
editing/deletion also remain outside this UI step.

## OC2.6 — Internal Admin notes

The consolidated Admin Company detail now includes an **Internal Notes** tab
after Messages. Its stable deep link is
`/admin/companies/[companyId]?tab=internalNotes` in English and the equivalent
localized Company detail route in French. The tab states explicitly that its
contents are visible only to Batiplus administrators.

### Model, authorization, and bounds

`companyAdminNotes` is a dedicated append-only table containing only the target
`companyId`, server-derived `authorAdminUserId`, trimmed plain-text `body`, and
server-authored `createdAt`. The compound
`by_companyId_and_createdAt` index supports Company-scoped, newest-first native
cursor pagination without a table scan. Pages are limited to 1–30 rows and the
Admin UI requests 20 at a time.

Both `admin.companyNotes.listCompanyAdminNotes` and
`createCompanyAdminNote` call the canonical `requireAdminUser()` guard before
reading or writing. Creation verifies that the target Company exists and
accepts no author argument. Bodies must contain 1–5,000 characters after outer
whitespace is trimmed. The constrained read DTO contains only note ID, body,
safe Admin display name, and timestamp; it never returns raw user/auth records
or Admin email.

There are intentionally no edit, delete, soft-delete, pin, reaction, status,
assignment, attachment, or generic update endpoints. Corrections are recorded
as new notes so the record remains immutable.

### UI, realtime, and privacy boundary

The Admin-only panel uses record cards rather than chat bubbles. It provides a
labelled text-only textarea, bounded character count, disabled/working state,
clear-on-success behavior, draft preservation with a localized alert on
failure, an empty state, and cursor-based **Load more** behavior. Results stay
newest first, overlapping cursor rows are deduplicated, and normal Convex query
reactivity lets another Admin's new note appear without polling.

Internal notes are not stored in `adminCompanyMessages` or
`adminCompanyConversations`, are never copied to `marketplaceActivity`, and do
not create notifications. Company operational messaging, Company profile and
dashboard APIs, public Company profiles, notification APIs, marketplace
activity, Client surfaces, and SEO surfaces do not query this table. Backend
role and privacy regressions plus browser sentinels enforce that separation.

All visible copy exists in aligned English and French catalogs. The existing
arrow/Home/End tab behavior includes Internal Notes, while the composer and
cards remain usable without horizontal overflow at desktop, 1024px, 768px, and
375×812 mobile sizes.

OC2.6 does not implement operational Company status, suspension/reactivation,
CRM, tickets, SLA, notifications, Push, Project/Deal linking, or note editing
and deletion. Those remain outside this append-only V1 feature.

## OC2.8 — Admin ↔ Company operational notifications

Operational messages now use the shared notification pipeline without changing
the operational conversation model. A newly inserted Admin message creates one
`admin_company_message_received` notification for every active member of that
Company, including members who are still completing onboarding. A newly
inserted Company message creates one `company_admin_message_received`
notification for every Admin user. In both directions the author is excluded,
inactive memberships are excluded, and the immutable message ID supplies the
per-recipient dedupe key. Retrying the same send idempotency key therefore
returns the original message without creating another notification.

The stored entity is the immutable `adminCompanyMessages` row. Its payload is
locale-neutral and limited to the Company ID/name, a safe sender display name,
and the existing normalized 140-character preview. In-app notifications may
show that preview; browser Push follows the existing privacy precedent and
uses generic message copy without the preview. Admin clicks resolve to the
localized Company detail Messages tab, while Company clicks resolve to the
localized Batiplus support page. Wrong-role opens fall back to the shared
notifications page.

Operational status notifications are tied to the immutable
`companyOperationalStatusHistory` row. A transition into `suspended` emits
`company_suspended`; a transition from `suspended` to either `normal` or
`needs_attention` emits `company_reactivated`. Transitions between `normal`
and `needs_attention` emit nothing. The payload contains only the Company
ID/name: the private Admin reason and internal from/to status values are never
copied into notification or Push presentation. Suspension opens Batiplus
support for remediation; reactivation opens the existing Company dashboard.

Both message types use the existing `messages` preference category and both
status types use `account`. In-app creation remains mandatory and atomic with
the domain mutation. Push is scheduled only after that transaction and remains
subject to the global and category preferences, subscription ownership, and
invalid-subscription cleanup. A provider failure cannot roll back an
operational message or status transition. Notification read state remains
independent from `adminCompanyConversationReads.readThroughSequence`.

Internal Admin notes remain strictly separate and continue to create zero
notifications. OC2.8 adds no assignment, ticketing, SLA, email, SMS, WhatsApp,
bulk messaging, or new marketplace event rules.

## OC2.9 — Security and authorization audit

The consolidated role matrix, cross-Company IDOR review, marketplace-chat privacy
boundary, suspension mutation inventory, notification/Push review, race guarantees,
and findings are recorded in [OC2.9 security and authorization audit](./oc2-security-audit.md).
Convex guards remain authoritative for every child query and mutation. The Admin
layout and Company Batiplus server page guard are defense in depth; direct function
calls still derive identity, role, membership, and Company scope on every request.
