# Project budget compatibility

## Product rule

Clients no longer need to provide a budget for a Project. A Project describes the construction need; Companies provide pricing later through the Initial Quote and Final Quote flow.

The accepted Final Quote revision remains the source of the Deal's `agreedAmountMad`. Commission tiers and immutable Deal commission snapshots continue to use that accepted Deal amount. Legacy Project budget values are never converted into Proposal, Final Quote, Deal, or commission amounts.

## Phase 1 compatibility behavior

New Project drafts may omit all legacy budget fields:

- `budgetRange`
- `budgetMin`
- `budgetMax`
- `budgetUnknown`
- `marketplaceBudgetRank`

Project publication, Company marketplace access, Direct Invitations, and Initial Quote submission do not require those fields. Existing budget filters and sort options remain temporarily available; a no-budget Project remains visible in unfiltered discovery and is excluded only when a specific budget range is requested.

The legacy `saveBudget` mutation and the existing six-step wizard numbering remain during this phase for already-open frontend bundles and resumable drafts. Numeric `lastCompletedStep` values have not been reinterpreted.

## Legacy data

All five budget fields remain optional in the Convex schema. Existing documents retain their stored values and continue to render those values where the Phase 1 UI still exposes budget. Phase 1 performs no data migration, rewrite, or unset operation.

## Later phases

A later owner-approved phase will:

1. remove the Client Project budget step and remaining budget presentation;
2. replace numeric wizard resume assumptions safely;
3. remove budget filters, budget sorts, and their unused indexes;
4. remove the legacy `saveBudget` API after its compatibility window; and
5. optionally unset stored legacy fields before removing their schema declarations.

Any physical data cleanup must be bounded, rehearsed in development, and separately authorized before production.
