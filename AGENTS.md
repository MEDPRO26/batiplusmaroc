# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.

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

No free chat before mutual interest.

Open project:

Company submits proposal

→ Client opens discussion

→ Chat unlocks

Direct invitation:

Client sends invitation

→ Company accepts

→ Chat unlocks

The backend must enforce this rule.

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

- chat cannot send messages before unlock

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

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
## Engineering Constitution

Before implementing any feature, read:

`docs/constitution.md`

Every feature must follow its full implementation, security, testing, browser validation, and regression checklist before it can be marked complete.

<!-- END:nextjs-agent-rules -->
