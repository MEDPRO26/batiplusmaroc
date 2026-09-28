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

No `companyActivity` table exists. Entity histories remain authoritative and
the timeline is a read-only normalized projection.

### Indexes and bounds

- `marketplaceActivity.by_companyId_and_createdAt` provides the primary
  Company/newest-first access path.
- `companyVerificationHistory.by_companyId_and_changedAt` is reused.
- The public query clamps logical pages to 30 items and reads at most three
  page sizes from either source per request. Same-timestamp continuation uses
  Convex's implicit `_creationTime` index tiebreaker, so dense timestamp groups
  remain bounded without skipping rows.
- The cursor stores an independent `(timestamp, creation time, document ID)`
  boundary for each source. The backend merges the two bounded batches and
  returns the standard Convex pagination result shape used by
  `usePaginatedQuery`.

### Included V1 events

- Verification: submitted/resubmitted, approved, rejected.
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
- Operational status and suspension events are deferred to OC2.7.
- Admin ↔ Company messaging events are deferred to OC2.4/OC2.5.

### Source precedence and duplicate handling

`marketplaceActivity` wins for every event family it already represents.
Quote, invitation, Deal, commission, and review histories are therefore not
merged a second time. Verification history is merged only because no equivalent
marketplace activity exists. This prevents two rows for the same semantic
transition, such as a discussion opening or a commission payment.

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
denied. Both source queries use a Company equality constraint in their indexes;
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
