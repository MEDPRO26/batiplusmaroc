This project uses Convex as its backend.

Before working on Convex code, ALWAYS read:

`convex/_generated/ai/guidelines.md`

These rules override older Convex knowledge.

---

# BATIPLUS MAROC — PROJECT CONTEXT

Batiplus Maroc is a two-sided construction marketplace inspired by Upwork.

The platform connects:

- Clients who need construction work

- Verified construction companies/professionals

Batiplus earns a commission when a company wins a project.

The PROJECT is the center of the marketplace.

## CLIENT FLOW

Client can:

1. Post a project and receive proposals

2. Browse companies and invite one directly

Main flow:

Client

→ Project

→ Proposal / Invitation

→ Mutual acceptance

→ Messages

→ Site visit if needed

→ Final quote

→ Company selected

→ Deal

→ Commission

→ Review

## COMPANY FLOW

Company can:

1. Browse projects and submit proposals

2. Build profile + portfolio and receive invitations

## IMPORTANT MESSAGING RULE

Client–Company marketplace messages require mutual interest before chat unlocks.

Open project:

Company submits proposal

→ Client opens discussion

→ Chat unlocks

Direct invitation:

Client sends invitation

→ Company accepts

→ Chat unlocks

The backend must enforce these Client–Company gates. OC2 Admin–Company
operational messaging and OC3 Client–Batiplus support are separate channels
with their own access rules. Never reuse marketplace threads or broaden their
permissions for either channel.

---

# CLIENT ACCOMPANIMENT & PAID COORDINATION — OC3

## Implemented support — OC3.2–OC3.4

OC3.2 backend, OC3.3 UI (including OC3.3.1 polish) and OC3.4 in-app alerts
are implemented in the current working tree; this is not a deployment claim.

- Both services are optional; standard marketplace use stays unchanged.
  Batiplus is both the platform and the service company.
- Free help covers documents, payment dates and phone guidance. Support is
  text-only: no uploads or in-app calling feature.
- Batiplus staff deliver paid coordination. Scope, visits, availability and a
  percentage or fixed fee are discussed manually with admins. Never assume a
  payer, rate, calculation basis or payment schedule. Admins confirm availability
  and visits before agreeing to start.
- Agree coordination details when the Client has a preferred Company and clear
  final quote, before paid work starts. Opening support, requesting help or
  messaging never accepts paid services, starts work, selects a Company, accepts
  a marketplace quote, creates a Deal/payment or changes commissions. The
  coordination fee remains separate from the existing Company-paid commission.
- Support is available after saving a project, before Company selection and
  later, including accessible drafts and completed/cancelled/archived projects.
  Requests do not reopen projects.

## Channel, access and read boundaries

- One private conversation per project covers `free_help` and
  `coordination_discussion`. Only an explicit Client action creates a request;
  rendering or opening a notification must not. Duplicate requests add no events.
- Only the current owning, onboarded Client and admins authorized by
  `requireAdminUser` may access support. No Company/staff, other Client, SEO or
  anonymous access; no new support role or assignment system.
- Recheck roles and the Project/conversation/Client relationship in Convex on
  every operation, retry and notification access. Ownership mismatches fail
  closed; never transfer private history implicitly.
- Return only allowlisted support/project context. Never expose marketplace/OC2
  messages, private proposals, final quotes or attachments, or grant Company
  identity reveal through support.
- Preserve atomic requests, idempotent sends, immutable events/history, ordered
  pagination, failed drafts and independent per-user thread read positions.
  Acknowledge received messages only when visible in an active thread; inbox
  queries and hidden tabs must not mark them read.
- Use the existing bell/feed for in-app-only alerts: each kind's first request
  and new Client message notify current admins; admin replies notify only the
  current owning Client. No self-alerts, Company/SEO/other-Client recipients or
  admin-to-admin reply alerts; no email, push jobs or external delivery.
- Create alerts transactionally, deduplicate per recipient/source entry and use
  generic FR/EN copy without private content. Notification reads/clearing and
  support-thread reads stay independent. Preserve marketplace/OC2 notifications.

## Verification and coverage

The owner manually confirmed the main flow: Client request → admin alert →
support messages → Client reply alert. This is a manual functional check, not
complete authorization/security verification, full authenticated E2E or proof
of local/deployed code and schema parity. Keep remaining OC3.5 security/release
checks, including historical private-cover verification, open.

All Morocco remains the service coverage goal. Support has no city filter.
Project intake is no longer limited to ten cities: Nationwide Geography V1 adds
structured Region → Province/Prefecture locations with rural localities (see
the GEO section below). That change came from GEO, not OC3; production rollout
of GEO remains a separate step.

## CURRENT STAGE — Coordination agreement

OC3.6.1 audit and plan are complete. OC3.6.2 agreement records, versioning and
exact-version Client confirmation are implemented in the working-tree backend,
with tests. OC3.6.3 adds the Client review/confirmation UI and private admin
draft/publication UI inside existing support, with FR/EN coverage. Quote choice
stays in the authorized private Client quote UI; frozen reviews and exact retries
preserve version boundaries. Deployment and full authenticated E2E remain open;
no automatic paid work activation or pricing calculation is implemented. Do not
repeat the audit or expand into release work without an implementation request.

Approved coordination agreement rules:

- Readiness uses an accessible Batiplus final-quote revision: current submitted
  and unexpired, or accepted and matching. External quotes are deferred. Recheck
  source relationships, current ownership and selected-Company consistency;
  accepting the same eligible revision does not itself invalidate readiness.
- For the first agreement, admin declares at publication and Client at
  confirmation that paid coordination has not started. These are declarations,
  not independent proof; later amendments need no never-started declaration.
  Block new publication/confirmation on `draft`, `completed`, `cancelled` and
  `archived` projects; authorized history and free support remain accessible.
- Use MAD with centimes: fixed fee or percentage with an explicitly shared
  calculation basis. Preserve percentage precision. No assumed rate, basis,
  payer, tax treatment, automatic fee calculation or payment.
- Save payer and payment terms explicitly. Client confirmation is not another
  payer's consent; obtain that separately, without a payer portal or automatic
  third-party approval.
- Changes require a complete new version and fresh Client confirmation. The
  previous confirmed version stays current until replacement is confirmed.
  Replacements concern future work, effective no earlier than confirmation;
  never backdate terms or overwrite past work/history. Admins never confirm
  for Clients. Keep drafts private and agreement records separate from support
  message sequences, reads and alerts.

Coordination confirmation must not accept marketplace quotes, select Companies,
create Deals or change commissions. No escrow, payment collection, full
contract editor, technical guarantees or construction ERP.

## Required reading for support changes

- [OC3.2 backend and adopted V1 defaults](docs/client-support-backend-v1.md)
- [OC3.4 notifications and verification](docs/client-support-notifications-oc34.md)
- [OC3.3.1 browser comparison and open checks](docs/client-support-browser-regression-oc331.md)
- [OC3.6.2 agreement backend, API contract and verification](docs/coordination-agreement-backend-oc362.md)
- [OC3.6.3 agreement UI, verification and remaining integration limits](docs/coordination-agreement-ui-oc363.md)
- [Notification domain](docs/notifications.md)

Use these reports for changing test counts, deployment evidence/status and open
checks; do not duplicate counts here. Inspect current source, distinguish
confirmed rules, adopted defaults and proposals, and report conflicts instead
of silently changing approved behavior.

---

# TECH STACK

- Next.js App Router

- TypeScript

- Convex

- Convex Auth

- Vercel

- Tailwind CSS

- shadcn/ui

- next-intl

- French + English

Architecture:

- Modular Monolith

- Single main app

- No microservices for V1

---

# INTERNATIONALIZATION

The app supports:

- FR

- EN

Use `next-intl`.

Never hardcode visible UI text.

Keep translations in:

- `messages/fr.json`

- `messages/en.json`

Do not break locale routing.

---

# V1 ROLES

Public signup can create only:

- client

- company

Never allow public signup for:

- admin

- owner

- staff

Admins are created through controlled admin/bootstrap logic.

---

# V1 MODULES

Main modules:

- auth

- users

- clients

- companies

- company verification

- portfolio

- projects

- invitations

- proposals

- messages

- Client–Batiplus support (OC3)

- Admin–Company operational messaging (OC2)

- site visits

- deals

- commissions

- reviews

- notifications

- admin

- audit/history

- statistics

Keep modules separated.

Do not mix unrelated business logic.

---

# DESIGN PATTERNS

Use when useful:

- State Pattern

- Command Pattern

- Observer Pattern

- Strategy Pattern

- Light Chain of Responsibility

Follow:

- SOLID

- DRY

- KISS

- YAGNI

- Composition over inheritance

Do not overengineer.

---

# BACKEND RULES

Business rules belong in Convex, not only in frontend code.

Every sensitive function must validate:

- authenticated identity

- role

- ownership

- company membership

- current entity status

- permission

Never trust frontend role checks.

Examples:

- unverified company cannot submit proposal

- Company A cannot see Company B private proposal

- only project owner can select company

- Client–Company chat cannot send messages before mutual-interest unlock

- only admin can verify companies

- only valid completed deal can create a review

---

# DATABASE RULES

Use:

- normalized source-of-truth data

- indexes for real query patterns

- historical snapshots for deals/commissions

- audit/history for important changes

- statistics/aggregates only where useful

Important historical data must not be overwritten.

Examples:

- commission rate snapshot

- deal amount snapshot

- project status history

- proposal status history

- verification history

- commission history

---

# V1 SCOPE

Protect the 30-day deadline.

Do NOT add unless explicitly approved:

- microservices

- escrow

- complex payment system

- AI matching

- subscriptions

- construction ERP

- payroll

- advanced disputes

- native apps

- complex organization roles

- unnecessary abstractions

---

# EXISTING WEBSITE

Existing Batiplus SEO/content must be preserved.

Do not break public URLs without a redirect/migration plan.

S2MBOU should become a company inside the marketplace.

Example:

`/entreprises/s2mbou`

---

# WORKING RULES FOR AGENTS

Before coding:

1. Read this file

2. Read relevant Next.js local docs

3. Read Convex AI guidelines when touching Convex

4. Inspect existing code before changing structure

Do not:

- invent new product requirements

- change business model

- silently change workflows

- break FR/EN

- break SEO

- redesign approved UI without request

- add unnecessary dependencies

- introduce microservices

Prefer the simplest production-ready solution.

<!-- BEGIN:nextjs-agent-rules -->





## Nationwide Geography (GEO) — V1 development complete

Project intake and Company coverage now span all Moroccan regions,
provinces, cities, villages and douars. V1 development is closed on
`feature/nationwide-project-intake` (milestone tag `geo-v1-final`).
Production migration, data verification and rollout remain separate,
unapproved steps.

Tracked milestone record and accepted V1 limitations:
`docs/nationwide-geography-v1-closure.md`

Feature specification (planning handoff):
`docs/features/nationwide-geography.md`

That specification is a local, git-ignored file (see `.gitignore`) and is
absent from fresh clones. When it is unavailable, use the closure record and
the tracked `docs/*geo*` / `docs/*hq*` handoffs, and report the missing
specification instead of guessing its content.

### Mandatory instructions for GEO tasks

1. Read the full geography specification before starting.
2. Read `convex/_generated/ai/guidelines.md` before Convex work.
3. Verify latest `origin/main`, current branch and clean worktree.
4. Work on `feature/nationwide-project-intake`.
5. Implement ONLY the explicitly assigned GEO task.
6. Follow the task dependencies and acceptance criteria.
7. Never assume OPEN Product HQ decisions are approved.
8. Preserve historical project and Company location data.
9. Protect private locations and existing authorization rules.
10. Preserve OC3, Deals, commissions, proposals and messaging.
11. Maintain FR/EN, responsive UX and correct pagination.
12. Run focused tests and report files changed, results and risks.
13. Stop after the assigned task. Never auto-start the next task.

No production deployment, data migration or destructive
schema change without explicit authorization.

The geography specification is the feature-level source
of truth. Existing repository security rules still apply.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
