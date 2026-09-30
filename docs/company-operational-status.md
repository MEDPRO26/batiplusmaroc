# Company operational status

OC2.7 adds an Admin-controlled operational boundary for Companies. It does not
replace verification and it does not alter historical marketplace or Deal data.

## Model and compatibility

`companies.operationalStatus` is optional for deployment compatibility and has
three values: `normal`, `needs_attention`, and `suspended`. All authorization,
query, and presentation code resolves a missing value through
`getCompanyOperationalStatus`; missing means `normal`. New account foundations
and development seed Companies explicitly store `normal`.

Every change writes one immutable `companyOperationalStatusHistory` row in the
same Convex transaction as the Company patch. The row records the previous and
new statuses, a trimmed 10–1,000 character internal reason, the authenticated
Admin, and the time. No-op transitions are rejected. Only Admins can read this
history or make a change.

The Company-facing surface receives only `accountRestricted: boolean`. Public
profiles receive only `marketplaceAvailable: boolean`. Internal status names,
reasons, and `needs_attention` are never exposed on those surfaces.

## Enforcement policy

The centralized `assertCompanyMarketplaceWriteAllowed` guard treats `normal`
and `needs_attention` identically and rejects only `suspended`. The guard is
applied to new acquisition or pre-selection progression from either side, so a
Client cannot bypass suspension by initiating the write.

| Module / operation | Suspended behavior | Reason |
| --- | --- | --- |
| Initial Proposal submission | Blocked | New acquisition |
| Proposal withdrawal | Allowed | Safe disengagement |
| Client Invitation creation | Blocked | New acquisition targeting Company |
| Company Invitation acceptance | Blocked | Acquisition progression |
| Company Invitation decline | Allowed | Safe disengagement |
| Site Assessment invitation / acceptance | Blocked | Pre-selection progression |
| Site Visit proposal / reschedule / confirmation / completion | Blocked | Pre-selection progression |
| Site Assessment / Visit decline or cancellation | Allowed | Safe disengagement and cleanup |
| Final Quote request / prepare / upload / submit | Blocked | Pre-selection commercial progression |
| Final Quote Client acceptance | Blocked | Creates Company Selection and a new Deal |
| Final Quote change request / decline / Company withdrawal | Allowed | Remediation or disengagement |
| Marketplace message send and attachment flow | Allowed | Existing unlocked relationship; preserves support/context |
| Admin ↔ Company operational messaging | Allowed | Required remediation and support channel |
| Company onboarding/profile/portfolio/verification writes | Allowed | Account remediation and public-profile maintenance |
| Notifications, preferences, push subscription, read markers | Allowed | Account operations, not acquisition |
| Existing Deal, commission, completion, review and history reads | Allowed | Historical/active obligations must remain visible |
| Client Deal completion and review | Allowed | Client rights and existing Deal lifecycle |
| Admin commission, review, verification and notes operations | Allowed | Admin operations are independent of Company acquisition |

The Company directory filters suspended Companies. Their public profile remains
readable for historical links and SEO continuity, but invitation availability is
disabled. `needs_attention` remains discoverable and behaves exactly like
`normal` in marketplace flows.

## UI behavior

The Admin Company Overview shows the current status, a controlled transition
dialog, and bounded newest-first history. Suspension and reactivation use an
explicit high-impact confirmation. The general Admin activity timeline projects
safe status-transition summaries from the authoritative history table and never
copies the private reason.

Suspended Company workspaces show a localized FR/EN banner linking to the
existing Batiplus operational support conversation. Protected Client and Company
CTAs are disabled where the current query already supplies Company availability;
the backend guard remains authoritative for every write.

Only transitions into `suspended` or out of `suspended` emit the OC2.8 account
notification and eligible browser Push. Transitions between `normal` and
`needs_attention` are silent. No email event is emitted.

## OC2.9 audit note

The repository-wide suspension inventory confirmed that every acquisition and
pre-selection progression path above reaches the centralized guard, including
Client-initiated operations targeting a Company. Concurrent Admin transitions are
serialized by Convex document conflict detection and produce a contiguous history
chain. Company/public projections and notification/Push payloads were regression-
tested with private sentinels. See [the OC2.9 audit](./oc2-security-audit.md).
