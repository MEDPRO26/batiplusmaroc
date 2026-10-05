# Company Name Masking V1 — Step 4

## Deal/reveal rule

An authenticated, onboarded Client receives the full Company display name only
when a persisted Deal matches both their authenticated user ID and that exact
Company ID. The Deal remains the source of truth. Active, completed and cancelled
Deals all qualify, including when the same Client views another authorized
project with that Company. A Deal with another Company does not qualify.

Proposal, shortlist, accepted invitation, message, assessment, site visit,
submitted Final Quote and project selection flags alone do not grant reveal.
Existing authorization and Deal lifecycle commands are unchanged. Public
directory/profile/portfolio endpoints retain their explicit masked policy for
every audience, including the Client with a Deal, Admin and Company members.
Admin and active own-Company members retain their existing authenticated access.

## Backend policy and DTOs

`convex/lib/companyName.ts` extends the shared audience with `deal_client`.
`resolveCompanyIdentityAudience(ctx, companyId)` derives the requester from
Convex Auth and their stored user. Its server-only recipient counterpart,
`resolveCompanyIdentityAudienceForUser`, receives a database-loaded user for
notification delivery. Neither is a registered public endpoint. There are no
new request arguments for Client identity or reveal, no Company-wide flag and
no application-level shared identity cache.

The policy uses a bounded `.first()` over both equality keys. Convex queries
read the Deal index within their transaction, so Deal creation invalidates the
affected authenticated subscriptions through the normal reactive data flow.
`companyNamesToMask` also applies the audience to Company-name references in
authorized commercial text, while the existing filename redactor still runs.

Updated authenticated boundaries:

| DTO | Identity fields and related context |
| --- | --- |
| Received initial quotes and detail | `company.name`, message/scope and history reasons |
| Project invitations | `companyName`, invitation/project context |
| Threads, conversation and messages | `otherPartyName`, body/title/preview |
| Site assessment/visit | `companyName`, notes and visit proposal history |
| Final Quote | `companyName`, revision commercial text and change-request reason |
| Deal by project | New safe `companyName` display field, after existing participant authorization |
| Notification inbox and push claims | Company names and sender aliases resolved separately for each stored recipient |

Notification Company IDs come from their referenced stored entity, never a
payload alias, payload Company ID or delivery caller's auth. The internal push
claim carries the resolved audience only to the delivery action/presenter, so
FR/EN rendering preserves the authorized full name. That audience is neither
stored as reveal state nor exposed in the public inbox DTO or push payload.

## UI surfaces

The existing proposal, invitation, message/context, visit, Final Quote and
notification components already render backend display values verbatim. Their
FR/EN rendering is covered by additional regressions; no frontend reveal logic,
private identity lookup, new visible copy or redesign is needed.

The Client project current-step card now uses the Deal's Company name and exact
quote/conversation references after selection, so a different discussion cannot
be mistaken for the hired Company. It waits for the Deal query while selection
loads. The active/completed Deal area also renders that safe Company name.

## Index/schema changes

The existing Deal indexes cover project, Client and Company separately, plus
Company/status/time/commission lookups. None supports an efficient exact
Client-and-Company lookup across all their projects and Deal statuses.

Added only `deals.by_clientUserId_and_companyId` on
`[clientUserId, companyId]`. No new persisted fields, data migration/backfill,
reveal flag or financial/history rewrite. The index definition has not been
pushed to any deployment.

## Filename and contact privacy

`deal_client` reveals names only. Attachment and Final Quote descriptors and
HTTP download headers continue to use generated safe filenames. Full filename
aliases are still replaced in message/proposal/visit/Final Quote text and inbox/
push previews, with the existing bounded relationship lookup and fail-closed
legacy path rules. Admin/own-Company original-file access is unchanged.

No additional phone, email, website, social, exact Company address, verification
document or hidden metadata field is exposed. Existing public branding, URLs,
contact policy and document contents remain subject to the earlier scope; this
step does not introduce Step 5 contact/media handling.

## Tests and verification

Added 24 regression cases across `convex/companyNamePrivacy.test.ts`,
`convex/lib/companyName.test.ts` and
`features/marketplace/company-identity-ui.test.tsx`:

- Real Deal creation switches all authenticated identity surfaces from masked
  to full; another Client's authorized relationship stays masked.
- Another Company's Deal, proposal/shortlist/discussion and accepted invitation
  do not reveal the Company; cross-Client entity access remains denied.
- Completed/cancelled Deals retain visibility, and another authorized project
  for the same Client/Company uses the same relationship policy.
- Public/anonymous/profile/portfolio audiences stay masked; Admin and owner/
  staff retain full authenticated names.
- Request arguments cannot impersonate a Client or supply a reveal boolean.
- Inbox/push recipient isolation, untrusted payload IDs, FR/EN rendering,
  filenames/download headers, retained aliases, legacy fail-closed paths,
  historical visit notes, unchanged stored records and contact-field exclusion.
- FR/EN components render supplied full names, safe PDF links, the exact hired
  Company/conversation, and active/completed Deal names.

Results:

- `npm test`: 96 files, 1,259 tests passed.
- `npm run typecheck`: passed, including a separate post-build check.
- `npm run lint`: passed, 0 errors and 10 pre-existing generated-file/SEO warnings.
- `npm run build`: passed using process-local localhost overrides for all
  Convex URLs. Expected managed-metadata fallback warnings were logged.
- `git diff --check`: passed.

Tests use in-memory Convex only; scheduled external delivery in the new group
is disabled with fake timers. No environment file was changed, deployment was
performed, live Convex data was accessed, or production was touched. Changes
remain available in the working tree for review.
