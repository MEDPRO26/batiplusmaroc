# Admin ↔ Company Operations

This document records the implementation boundary for the Owner Change 2
operations work. It is intentionally limited to behavior that exists today.

## OC2.2 — Company activity timeline

The Company activity timeline gives an authenticated Admin a compact,
newest-first view of important Company operations. Until OC2.3 provides a
consolidated Company detail route, the reusable timeline is shown in the
existing Company verification review drawer.

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
optional Project, Deal/commission, and review links; no OC2.3 route is invented.

### Future OC2 work

OC2.3 should move the same component to the consolidated Admin Company detail
page and may add simple category filters. Later steps may add operational
messages, notes, and status events through their own authoritative models; they
must not broaden the marketplace-message privacy boundary.
