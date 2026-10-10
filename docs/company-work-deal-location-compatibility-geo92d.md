# GEO9.2D — Company Work / Deal location compatibility

Date: 2026-10-09. Result: **PASS for the assigned implementation and focused local checks**.

## Baseline and isolation

- New managed Codex worktree (local-only path omitted).
- Clean, detached starting HEAD: `7a96e6a63b65cab0187ab57a91c4f70788228a74`. This matches the required `7a96e6a` baseline and differs from the original checkout path.
- Remote `main` was checked with `git ls-remote`; it matched cached `origin/main` at `7e8400d559a7f070590395ce31828e420a581e51`.
- The original checkout and `feature/nationwide-project-intake` started at `7a96e6a63b65cab0187ab57a91c4f70788228a74`. During final verification, another integration operation advanced them to `a02cd28dd55a7ed5ce7ffb8323896433c3610f8a` (site-assessment projection backfill); the original checkout remained clean. This agent did not modify that checkout or branch. None of this fix's production files or GEO3 dependencies changed between those commits. The explicit task's detached-worktree instruction overrides the general GEO feature-branch instruction.
- The ignored nationwide specification was read from the original checkout. GEO3's approved visibility rules and current source were used; no OPEN product policy was selected.
- Existing dependencies were copied into this worktree; no packages or dependency declarations changed.

## Change and permissions

`convex/deals/company.ts` adds an allowlisted GEO3 `location` to `listMyDeals`. Detailed locality/neighborhood is returned only when `canAccessDetailedProjectLocation` validates the authenticated Company's existing marketplace conversation, its quote/invitation source and current Project/Client relationship. A Deal alone grants no detail access. Missing, duplicate, locked or mismatched relationships fall back to the general projection. Missing historical Projects return an empty general projection and retain the existing Deal row.

`features/deals/components/company-work.tsx` uses the existing `useProjectLocationLabel` FR/EN formatter. Structured geography takes priority over historical city, old city-only responses remain readable, and incomplete geography uses available safe detail or the translated unspecified-location fallback. Free text is rendered as escaped text. Existing active/history layout, status, dates, amount formatting and workspace links remain intact.

Company membership/onboarding authorization, Company isolation, the existing `by_companyId` query, 200-row bound and creation-time ordering are preserved. This endpoint had a bounded list rather than cursor pagination; this task adds no pagination behavior. No Deal creation/selection, quote, commission, payment, support or messaging mutation changed. No schema, index, generated file or translation changed.

The new projection contains no site-visit address, Client identity/contact fields, private quote terms or payment references. Site addresses remain solely in their existing authorized workflow. Closed-conversation history retains its existing read authorization.

## Changed files

- `convex/deals/company.ts`
- `features/deals/components/company-work.tsx`
- `convex/deals.location-compatibility-geo92d.test.ts`
- `features/deals/company-work-location-compatibility-geo92d.test.tsx`
- `docs/company-work-deal-location-compatibility-geo92d.md`

## Verification

Before the implementation, four selected regression tests failed as expected: rural no-city Deals lacked the backend location in both marketplace/invitation paths, and the React row omitted location in both EN/FR.

Final focused run: **5 files, 168 tests passed**, including **26 new backend tests and 30 new React tests**:

```sh
npm test -- convex/deals.location-compatibility-geo92d.test.ts features/deals/company-work-location-compatibility-geo92d.test.tsx convex/deals.test.ts convex/projects.location.test.ts lib/geography/project-location.test.ts
npm run typecheck -- --incremental false
npm run lint -- convex/deals/company.ts features/deals/components/company-work.tsx convex/deals.location-compatibility-geo92d.test.ts features/deals/company-work-location-compatibility-geo92d.test.tsx
git diff --check
```

All checks passed; new files also passed whitespace checks with `git diff --no-index --check /dev/null <file>`. Vite emitted its existing informational config-loader warning; it did not fail verification.

Backend tests create Deals through real invitation/proposal, final-quote submission and Client acceptance commands in `convex-test`. They cover rural no-city, structured/historical conflicts, legacy city-only, cleared structured location, inaccessible conversation/source relationships, unauthorized roles/Companies, inactive membership, pending onboarding and historical rows. Whole-document comparisons preserve accepted quote/revision, MAD/centime financial snapshots, commission tiers/configuration/debtor/beneficiary, payment metadata, notifications and independent conversation read positions. The explicit commission-payment command is also exercised on both paths. Fixtures settle existing scheduled notifications before comparing state, avoiding background-delivery timing races.

React tests render the actual component with real FR/EN messages and mocked Convex/navigation. They verify active/history labels, general/detailed projections, older DTOs, incomplete fallbacks, escaping, query skips, counts, ordering, amounts, statuses and links. These are static render tests, not browser or authenticated E2E evidence. The existing Deal suite covers the 201-record list boundary.

## Integration readiness

Ready for integration review against `7a96e6a`; all changes remain uncommitted in the isolated detached worktree. The complete patch also passes read-only `git apply --check` against the newer clean integration checkout at `a02cd28`; tests were run at the required detached baseline, not on that newer commit. No full repository suite, watcher, deployment, migration, policy activation, commit, push or merge was performed. Deployment parity, full authenticated E2E and nationwide release verification remain with their separately assigned tasks. GEO9.2D is complete; no next task was started.
