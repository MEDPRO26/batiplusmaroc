# OC2.9 security and authorization audit

This document records the repository-backed security boundary for Owner Change 2
(OC2.1–OC2.8). Convex authorization is authoritative; route redirects and hidden
controls are defense in depth. The audit was performed against the current code,
negative backend tests, browser regressions, and the development deployment only.

## Authorization matrix

`Allow (own)` means the caller's current, unique, active Company membership derives
the Company scope. No Company-side operational API accepts a Company ID as proof of
access.

| Surface | Admin | Target active Company | Other Company | Inactive member | Client | SEO | Anonymous |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Admin Company list/detail and child queries | Allow | Deny | Deny | Deny | Deny | Deny | Deny |
| Company activity timeline | Allow | Deny | Deny | Deny | Deny | Deny | Deny |
| Operational messages | Allow any Company | Allow (own) | Deny/not found | Deny | Deny | Deny | Deny |
| Internal notes | Allow | Deny | Deny | Deny | Deny | Deny | Deny |
| Operational status/history | Allow | Deny | Deny | Deny | Deny | Deny | Deny |
| Company safe restriction state | Admin sees status/history | `accountRestricted` only | N/A | N/A | N/A | N/A | N/A |
| Public Company eligibility | Allow public DTO | `marketplaceAvailable` only | Same | Same | Same | Same | Same |
| Operational notification destination | Admin message tab | Batiplus support/dashboard | Safe fallback | Existing owned notifications only | Notifications fallback | Notifications fallback | Authentication required |

The Admin Company route is protected by the server-rendered Admin layout and every
child query independently calls `requireAdminUser`. The Company Batiplus route now
also performs a server-side role redirect before rendering; all of its queries and
mutations independently re-evaluate current membership.

## Object isolation and private data boundaries

- Operational conversations are keyed by Company, but Company callers derive their
  Company from current membership. Cross-Company conversation/message/read IDs use
  indistinguishable not-found errors. Ambiguous multi-Company membership fails closed.
- Sender user/type are server-derived. Idempotency is scoped to the authenticated
  sender and includes Company, sender type, and normalized body; conflicting reuse is
  rejected.
- Marketplace conversations accept only the owning Client or an active member of the
  participating Company. Admin, SEO, unrelated Company, inactive member, and anonymous
  callers cannot list messages, send, mark read, create attachment intents, or obtain
  attachment metadata/download authorization.
- Operational and marketplace IDs are table-typed and revalidated against their parent
  relationship. They are not interchangeable.
- `companyAdminNotes` is referenced only by the Admin notes module, schema, tests, and
  documentation. There is no public note-by-ID endpoint. Notes never enter activity,
  operational messages, notifications, Push, Company/public/Client DTOs, or SEO data.
- Activity queries constrain every source by `companyId` and return an allowlisted DTO.
  They exclude message/proposal bodies, documents, note bodies, suspension reasons,
  emails/auth data, and Push secrets.

## Suspension enforcement inventory

| Operation family | Suspended policy | Authoritative boundary |
| --- | --- | --- |
| Initial Quote / Proposal submit | Block | `requireVerifiedCompanyMarketplaceUser` |
| Initial Quote withdrawal | Allow | Safe disengagement |
| Client invitation create | Block | target Company operational guard |
| Invitation accept / decline | Block / allow | accept-only guard |
| Site assessment invite / accept / decline | Block / block / allow | target Company guard on progression |
| Site visit propose/reschedule/confirm/complete | Block | target Company guard on every progression path |
| Site visit decline/cancel | Allow | Safe disengagement |
| Final Quote request/prepare/upload/submit | Block | target or authenticated Company guard |
| Final Quote accept/change request/decline/withdraw | Block / allow / allow / allow | Deal-creating accept guard; remediation/disengagement allowed |
| Company selection and Deal creation | Block | Final Quote acceptance revalidates Company eligibility and participation |
| Marketplace messaging and PDF attachments | Allow | Existing unlocked relationship/support context |
| Batiplus operational messaging/read state | Allow | Current active membership only |
| Profile, portfolio, verification, account settings | Allow | Remediation; no acquisition transition |
| Existing Deal/commission/completion/history reads | Allow | Existing obligations remain visible |

`needs_attention` follows the same marketplace policy as `normal`. Only `suspended`
blocks acquisition/progression. Convex transactions re-read Company and membership
documents, so a concurrent membership/status change conflicts and the operation retry
uses current state. Concurrent status mutations serialize: the second history row's
`fromStatus` is the first row's `toStatus`, never the original status twice.

## Notifications and Push

- Admin operational messages notify only unique active members of the target Company;
  Company messages notify Admin users. The sender is excluded and inactive/ambiguous
  memberships receive nothing.
- Only transitions into or out of `suspended` create status notifications.
  `normal ↔ needs_attention` creates no notification and therefore schedules no Push.
- Status notification payload is exactly Company ID/name. The private reason and
  internal from/to values are absent from stored notification, UI interpolation, and
  Push presentation. Internal notes create no notification.
- Push output is an allowlisted `{title, body, url, tag}` object. Operational message
  Push uses generic copy and excludes the in-app preview. Destinations are internal,
  localized, and role-gated; mismatched roles fall back to Notifications.
- Push subscription public APIs derive the owner from authentication. Cross-user
  lookup/register/remove fails safely. Permanent-failure cleanup is internal and
  deletes an endpoint only when it still belongs to the claimed notification recipient.

## Input, DTO, race, and error review

All OC2 text and idempotency inputs are bounded and normalized. Operational messages,
conversations, notes, status history, Company list, Company reviews, activity, and
Projects/Deals have bounded pagination (either rejection or a documented server clamp).
The audit added explicit integer/min/max rejection to Company list, Company reviews,
and operational status history.

DTOs are explicit validators rather than raw documents. No OC2 DTO returns auth
provider records, password/OAuth metadata, session tokens, Push keys, or storage
secrets. Verification documents remain limited to the pre-existing Admin verification
query. Unauthorized cross-tenant probes use generic not-found errors where existence
would otherwise leak; UI components translate failures without rendering raw backend
messages.

High-impact writes remain auditable in their authoritative histories: verification,
commission payment, operational status, append-only Admin notes, and immutable
operational messages. No duplicate audit stream was introduced.

## Findings

- Critical: none found.
- High: none found.
- Medium, fixed: inconsistent explicit page-size validation on Admin Company list,
  Company review list, and operational status history.
- Low, fixed as defense in depth: Company Batiplus relied on a client redirect in
  addition to authoritative Convex checks; it now has a server-side page guard too.
- Deferred low-risk limitation: V1 has no external per-user send rate limiter for
  operational messages. Authentication, bounded bodies, deterministic idempotency,
  and transaction isolation remain in force. Rate limiting does not broaden data access
  and is a launch hardening item rather than an OC2 feature.

