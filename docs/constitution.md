# Batiplus Engineering Constitution

This file defines how every Batiplus feature must be built, reviewed, tested, and accepted.

A feature is NOT complete only because the UI works.

Every feature must pass this constitution before it can be marked COMPLETE.

---

# 1. Read Before Coding

Before changing code:

1. Read `AGENTS.md`
2. Read this file: `docs/constitution.md`
3. For Convex work, read:
   `convex/_generated/ai/guidelines.md`
4. For Next.js work, check the local Next.js documentation when needed.
5. Inspect existing code before adding new architecture.

Do not silently change approved Batiplus business rules.

---

# 2. Architecture Rules

Batiplus uses:

- Next.js App Router
- TypeScript
- Convex
- Convex Auth
- Vercel
- next-intl
- FR / EN
- Modular Monolith

Do NOT introduce microservices for V1.

Prefer:

- KISS
- DRY
- YAGNI
- SOLID
- Composition over inheritance

Avoid unnecessary abstraction.

---

# 3. Feature Implementation

Every feature must consider:

- Backend logic
- Database/schema
- Authorization
- Validation
- Indexes/query performance
- Loading state
- Empty state
- Error state
- Success state
- FR / EN
- Mobile
- Desktop
- Accessibility
- History/audit when important

Business security rules must be enforced in Convex.

Frontend checks are UX only.

---

# 4. Authentication & Authorization

Every sensitive backend operation must verify:

- authenticated identity
- account type / role
- ownership
- company membership when needed
- entity status
- allowed state transition

Never trust IDs or roles only because they come from the browser.

Examples:

- Client A cannot edit Client B project
- Company A cannot edit Company B data
- Company A cannot read Company B private proposal
- Unverified company cannot submit proposal
- Only admin can approve company verification
- Only project owner can select winning company

---

# 5. Input Validation

Validate data on the backend.

Check:

- required fields
- allowed enum values
- numbers/ranges
- dates
- IDs
- file types
- file sizes
- status transitions

Frontend validation improves UX but does not replace backend validation.

---

# 6. Privacy

Return only the data required by the current user.

Never expose private information unnecessarily.

Examples:

Private client data:
- email
- phone
- exact address
- private files

Private company data:
- verification documents
- legal/private records when not required publicly

Use safe public DTOs for public queries.

---

# 7. History & Audit

Important changes must keep history.

Examples:

- Project status
- Proposal status
- Verification status
- Deal status
- Commission status

History should contain when relevant:

- entityId
- oldStatus
- newStatus
- changedBy
- changedAt
- reason

Important history must not be overwritten.

---

# 8. Loading UX

Prefer skeletons for loading states.

Examples:

- project cards
- company cards
- dashboards
- tables
- profiles
- messages

Avoid blank pages.

Avoid unnecessary full-screen spinners.

---

# 9. Error Handling

The application must fail safely.

Expected error:
→ friendly translated message

Unexpected error:
→ safe fallback + retry

Developer:
→ receives useful technical logging

User must NEVER see:

- stack traces
- raw Convex errors
- database IDs
- internal implementation details
- secrets

Do not use empty catch blocks.

---

# 10. i18n

Batiplus supports:

- French
- English

Use `next-intl`.

Do not hardcode visible UI strings.

Translations belong in:

- `messages/fr.json`
- `messages/en.json`

Database state should use stable keys, not translated labels.

---

# 11. Self Review

After implementation, review your own changes.

Check:

- Is the business rule correct?
- Is there duplicated code?
- Is the code simpler than necessary?
- Are permissions enforced in backend?
- Are private fields exposed?
- Are indexes missing?
- Are there table scans?
- Are visible strings hardcoded?
- Is FR / EN complete?
- Are loading/error/empty states present?
- Are there dead files/imports?
- Did the feature break existing behavior?

Fix issues before continuing.

---

# 12. Automated Tests

Every important backend feature needs tests.

Test both success and failure cases.

Example:

Verified company can submit proposal:
PASS

Unverified company can submit proposal:
FAIL expected

Company A can edit Company B proposal:
FAIL expected

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build