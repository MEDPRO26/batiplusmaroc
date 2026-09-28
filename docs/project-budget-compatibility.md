# Project budget compatibility

## Product rule

Clients no longer need to provide a budget for a Project. A Project describes the construction need; Companies provide pricing later through the Initial Quote and Final Quote flow.

The accepted Final Quote revision remains the source of the Deal's `agreedAmountMad`. Commission tiers and immutable Deal commission snapshots continue to use that accepted Deal amount. Legacy Project budget values are never converted into Proposal, Final Quote, Deal, or commission amounts.

## Phase 1 storage compatibility

New Project drafts may omit all legacy budget fields:

- `budgetRange`
- `budgetMin`
- `budgetMax`
- `budgetUnknown`
- `marketplaceBudgetRank`

Project publication, Company marketplace access, Direct Invitations, and Initial Quote submission do not require those fields.

## Phase 2 product and query behavior

The current five-step Project wizard is Category → Location → Details → Timeline → Review. It does not ask for, validate, summarize, or save a Client budget. Resume position is derived from the current required Project fields, so legacy six-step `lastCompletedStep` values cannot skip an incomplete Timeline or incorrectly jump to Review.

Current Client, Company, Invitation, Initial Quote, Admin, public Project, and homepage DTO/UI paths do not expose Project budget values. Marketplace filtering and sorting use scope fields and publication time only. Budget query arguments and budget sort literals remain accepted temporarily for stale browser bundles, but are ignored and normalize to current newest-first behavior.

The current runtime does not read or write `marketplaceBudgetRank`. Budget-specific marketplace indexes and the budget search-index filter were removed because no current query references them. The search-text backfill now updates search text only and leaves any stored legacy rank untouched.

The legacy `saveBudget` mutation remains authenticated and validated only for browser bundles opened before Phase 2. Current source code does not call it.

## Legacy data

All five budget fields remain optional in the Convex schema. Existing documents retain their stored values, but current APIs and UI ignore them. Phase 2 performs no data migration, rewrite, unset, or conversion operation.

## Remaining Phase 3 cleanup

A later, separately owner-approved phase may:

1. remove the legacy `saveBudget` API after its compatibility window;
2. remove accepted-but-ignored legacy marketplace query arguments and sort literals;
3. decide whether to unset stored legacy values with a bounded migration; and
4. remove the five legacy schema fields and their validators only after stored data is compatible.

Any physical data cleanup must be bounded, rehearsed in development, and separately authorized before production.
