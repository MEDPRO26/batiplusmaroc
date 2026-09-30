# Project budget removal

## Product rule

Clients do not provide a budget for a Project. A Project describes the construction need; Companies provide pricing through the Initial Quote and Final Quote flow.

The accepted Final Quote revision remains the source of the Deal's `agreedAmountMad`. Commission tiers and immutable Deal commission snapshots continue to use that accepted Deal amount. No removed Project field is converted into Proposal, Final Quote, Deal, or commission pricing.

## Phase 1 and Phase 2

Phase 1 made new no-budget Projects schema-compatible and removed Project-budget requirements from publication and downstream marketplace flows.

Phase 2 removed the Budget step and all Client Project budget display, filtering, sorting, DTO exposure, and Project-specific FR/EN copy. The wizard remains Category → Location → Details → Timeline → Review, and draft resume position is derived from current required fields rather than legacy numeric progress.

## Phase 3A: migration deploy

Phase 3A removes the remaining runtime compatibility implementation:

- the public `projects.index.saveBudget` mutation;
- Project budget range constants, value mappings, and validators;
- ignored `budgetRange` and `budgetRanges` marketplace arguments;
- legacy `budget_high` and `budget_low` sort literals;
- development seed generation of Project budget values;
- stale budget fields in current test/UI fixtures.

The five obsolete fields intentionally remain optional in the `projects` schema for this deploy only. Production documents may still contain them, so the migration function and this compatibility validator must be deployed together before cleanup runs. Current product code does not read or write these fields.

Budget-specific marketplace indexes and search-index filters had already been removed in Phase 2. Phase 3 confirmed that no current query or migration depends on such an index. Category, city, timeline, property type, surface, posted-date, text search, and newest/oldest behavior remain unchanged.

General construction-budget editorial/SEO content remains intentionally available. Company `estimatedPrice`, Final Quote revision price, Deal `agreedAmountMad`, and commission fields are unrelated and remain unchanged.

## Development rehearsal

The migration `migrations:clearLegacyProjectBudgetFields` was rehearsed on development using `@convex-dev/migrations` with batches of 10. For any Project that contains at least one obsolete field, it unsets exactly:

- `budgetRange`
- `budgetMin`
- `budgetMax`
- `budgetUnknown`
- `marketplaceBudgetRank`

The migration does not patch ownership, status, required Project details, publication fields, Company Selection references, search text, timestamps, or pricing-chain records. Clean Projects are no-ops, and the component records completion so an ordinary rerun is also a no-op.

Development deployment `hip-gnat-222` was audited before mutation:

- 33 total Projects; 33 contained at least one legacy field;
- field counts were 32 / 32 / 28 / 33 / 26 in the order listed above;
- affected statuses were 20 published, 4 company selected, 3 draft, 3 pending review, 1 needs changes, 1 in discussion, and 1 completed.

A development snapshot was exported before execution. The dry run processed one 10-row batch and committed nothing. The tracked migration then completed successfully with 33 processed rows. Post-migration verification found all five field counts at zero, with 33 Projects and the same status distribution. A normal rerun returned `Migration already done`.

After verification, the narrowed schema was successfully rehearsed against the cleaned development data. It is deliberately not part of the production migration deploy represented by this repository state.

## Phase 3B: narrowing deploy

Only after the production migration reports completion and a separate audit verifies that all five legacy field counts are zero may a follow-up change remove the compatibility fields and `legacyProjectBudgetRange` from `convex/schema.ts`. That removal is a separate deploy; it must not be combined with `clearLegacyProjectBudgetFields` becoming available in production.

## Production safety and rollout

Production data was not inspected, exported, migrated, or deployed during Phase 3. No command used `--prod`.

The final narrowed schema must not be deployed directly to production until a separately approved production migration is performed. This repository state is deploy 1 of the rollout. The rollout must repeat the proven sequence:

1. deploy this migration-ready schema while the five fields are still optional;
2. export a production snapshot and document the restore window;
3. audit counts, dry-run, execute, and verify zero remaining fields;
4. prepare a separate follow-up change that removes the five fields and their validator;
5. only then deploy the narrowed schema as deploy 2.

A snapshot restore replaces deployment data and can discard writes made after the snapshot. Keep any future production migration window short, preserve the snapshot as sensitive data, and require fresh explicit production approval for every production read or write.
