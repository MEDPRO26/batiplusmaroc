# GEO9.1C — Admin Site Visit geographic filtering and pagination

Date: 2026-10-09. **Result: PASS at the local source/test level.** The implementation is deliberately inactive until a separately approved historical backfill, consistency verification and rollout. This is not a deployment or production-completeness claim.

Worktree: `/Users/yassin/.codex/worktrees/f0ff/batiplusmaroc`. The clean isolated checkout was detached at `f6032153ae101ff2b985d8503f8cb90c9c2540fc`, matching `feature/nationwide-project-intake` and including the integrated GEO9.1B source. `parallel/geo91-display` remains at `051ddd1d428bd660f346625736b023c3f70f5d7f`; `parallel/geo91b` remains at `99a6f72c06e45002c936e5701b1750f171c59dcd`. During implementation, no fetch, original-checkout modification, migration/backfill, policy activation, Convex watcher/codegen, deployment, commit, push or merge was performed. Product HQ subsequently authorized the focused safety review and local source commit recorded below.

This implements only the attached Product HQ GEO9.1C brief. AGENTS.md, local Convex AI guidelines, relevant local Next.js client-boundary guide, the [GEO9.1 investigation](admin-geography-geo91.md), [GEO9.1B handoff](admin-project-geography-pagination-geo91b.md) and existing Site Visit/Project location source and tests were consulted. The full geography audit was not repeated.

## Files changed

| File | Change |
| --- | --- |
| `convex/schema.ts` | Three optional assessment projection fields and three additive indexes. |
| `convex/siteVisits/adminProjection.ts` | Shared selected-visit lookup, validated geography projection, equality/integrity checks and transactional update helpers. |
| `lib/dates/admin-site-visit.ts` | Extract the existing Admin Morocco wall-clock conversion unchanged for the backend; share its date/time format check for live risk presentation. |
| `convex/siteVisits/index.ts` | Maintain the projection in every existing assessment/visit source-write path; share the existing selected-visit rule. |
| `convex/projects/index.ts` | Maintain associated assessment geography when structured administrative selections change or clear. |
| `convex/admin/siteVisits.ts` | Add the rollout query and one-stream native paginated reader; retain the array endpoint and private detail contract. |
| `convex/convex.config.ts` | Declare an optional, default-inactive typed rollout policy. |
| `convex/_generated/server.d.ts` | Align the checked-in environment declaration with that one optional policy; no codegen command was run. |
| `features/admin/components/admin-site-visits-panel.tsx` | Gated geography/native pagination, atomic province reset, separate geography clear, partial-page states and stable pagination during live clock refresh. |
| `messages/fr.json` | French Site Visit geography, loading, continuation and legacy-limit copy. |
| `messages/en.json` | English equivalents. |
| `convex/admin.siteVisits-pagination.test.ts` | Forty-one actual-handler/projection/authorization tests. |
| `features/admin/admin-site-visit-pagination.test.tsx` | Fourteen FR/EN rendering and rollout/pagination-state tests. |
| `tests/e2e/admin-site-visit-geography-pagination.spec.ts` | Eight FR/EN browser component cases for filters, continuation, coverage fallback, responsive layout and clock stability. |
| `docs/admin-site-visit-geography-pagination-geo91c.md` | This handoff. |

Dependency manifests, other Admin panels and existing test fixtures are unchanged. Temporary Playwright configuration/CSS server files are outside the repository under `/private/tmp/batiplus-geo91c-*`; screenshots/diagnostics are ignored under `test-results/geo91c/`.

## Derived fields and exact order

The only new stored fields are optional `siteAssessments.adminRegionCode: string`, `adminProvinceCode: string` and `adminSortAt: number`. They contain no address, directions, note, contact data or private locality text. Project and Site Visit records remain the source of truth.

Region is copied only if its recorded Project code is a canonical GEO1 region. Province is copied only when the recorded province exists and belongs to that valid recorded region. Incomplete or incompatible selections omit the province. Legacy city-only records, cleared structured records and province-only history never acquire inferred administrative membership. Unfiltered indexed reads still include these rows once their timestamp projection is ready.

Selection exactly preserves the existing `by_assessmentId_and_active` prefix query ordered descending: active visits are preferred, then native newest creation within the same active value. If all visits are inactive, the newest inactive visit is selected. This is shared by the Admin list/detail, participant assessment DTO and projection helper. Visit creation, counterproposals and transitions that change `active` recompute this selection after the source write.

The sort key is exactly:

```text
selected visit exists:
  existing Africa/Casablanca conversion of proposedDate + proposedTime
  or visit.proposedAt when the existing conversion cannot parse its strings
otherwise:
  assessment.invitedAt
```

The wall-clock conversion was moved unchanged; scheduling's separate strict future/date/DST validation is unchanged. Descending `adminSortAt` preserves the old comparator. Native assessment `_creationTime` supplies the tie-break, matching the previous creation-descending input followed by stable timestamp sorting. Assessment `createdAt` never substitutes for invitation or visit time. Ties, malformed-string fallback, no-visit records and creation/scheduling order differences are tested across page boundaries.

## Maintained source paths and bounded writes

All maintenance runs inside the existing source mutation transaction, after existing authentication/role/relationship/status checks and before its existing events/notifications complete:

| Existing mutation | Maintenance |
| --- | --- |
| `siteVisits.index.invite` | Project geography and invitation timestamp for a new assessment. |
| `siteVisits.index.respond` | Recompute after acceptance or decline. |
| `siteVisits.index.proposeVisit` | Recompute after first/new visit creation and after a counterproposal changes date/time/proposal; select from current visit records. |
| `siteVisits.index.respondToVisit` | Recompute after confirmation or decline, including changed active selection. |
| `siteVisits.index.cancelVisit` | Recompute after cancellation/active change. |
| `siteVisits.index.completeVisit` | Recompute after completion/active change. |
| `projects.index.saveStructuredLocation` | Recompute all associated active and historical assessments when recorded region/province changes or clears. |

Exact source retries retain their existing no-op returns: no extra events, notifications or lazy historical repair. The helper itself patches only when one of its three values differs and never changes business timestamps/history. Source/projection changes roll back together on an integrity or resource failure.

`saveLocation` was inspected: it can only edit legacy city/neighborhood, rejects structured intent, and changes none of the three projection inputs. Commune/locality-only or identical administrative saves likewise require no cache write. Ordinary mutations never sweep unrelated historical assessments. Only a legitimately changed source refreshes its associated projection; no automatic historical backfill reader, job or API was added.

Project geography fan-out uses the existing Project-prefix index and reads at most 257 associated assessments. Editable draft/needs-changes Projects ordinarily have no assessments because invitations require published/in-discussion status. Exceptional history of **more than 256 assessments on one editable Project** aborts the entire geography save with `SITE_ASSESSMENT_PROJECTION_UPDATE_LIMIT`; it never truncates maintenance or commits stale rows. This is a bounded transactional-write guard, not a reader/result cap. Supporting larger exceptional source edits requires separately approved coordination of that fan-out before changing those Projects. The overflow rollback is tested.

No other ordinary assessment/visit source writers or Project administrative-location writers were found. Direct database imports, repair scripts or future new source-write paths must use the helper or trigger a new consistency verification; this implementation does not intercept arbitrary out-of-band writes.

## Focused 256-assessment safety clarification — completion review

This source-only review was requested before the approved GEO9.1C save. No implementation change, test rerun, live-data query, backfill or rollout was performed.

1. **Exact operation:** `api.projects.index.saveStructuredLocation`, after existing owning/onboarded Client authorization and `draft`/`needs_changes` editability checks, only when region or province changes or clears. It calls `syncProjectAssessmentGeography`, whose indexed per-Project read includes both active and historical assessments. More than 256 throws `SITE_ASSESSMENT_PROJECTION_UPDATE_LIMIT` and rolls back the Project patch. Legacy city edits and commune/locality-only or identical administrative saves do not encounter this limit.
2. **Reachability:** an ordinary current lifecycle cannot reach this combination. `siteVisits.index.invite` requires `published` or `in_discussion`; `projects.state.isProjectEditable` accepts only `draft` or `needs_changes`. The current transition graph has no return from a published/discussion/later Project to either editable state; `admin.projects.requestProjectChanges` accepts only `pending_review`. Repeated declined invitations can grow a published Project's historical assessment count beyond 256, but do not make it editable. Nevertheless, the schema/edit authorization do not independently exclude a legacy/imported editable Project with that history: its otherwise authorized geography edit would reach the new guard. No deployed data was inspected, so absence of such records is not established. The completed overflow test manually inserts assessments on a draft; it proves rollback, not a reachable public lifecycle.
3. **Disabled reader:** projection maintenance has no rollout-policy guard. The new rejection therefore applies to an affected source edit even while `ADMIN_SITE_VISIT_GEOGRAPHY_POLICY_VERSION` is unset. Reader activation safety does not protect that edit. Before GEO9.1C, the same otherwise authorized edit would not have this assessment-count failure.
4. **Verdict and deployment condition:** no existing normal-workflow regression is confirmed from the inspected source. Retain the atomic rejection as a documented defensive limit for this local source commit, conditional on verifying before backend deployment that no existing editable Project has more than 256 linked assessments. If any such Project must retain its authorized geography-edit operation, treat the new rejection as a **release blocker** and require a separately approved bounded maintenance design before deployment; documenting the cap or leaving the reader disabled is insufficient. No redesign or migration was implemented here.

Evidence was limited to the existing Project edit/status guards, assessment invitation gate, Project status writers relevant to returning to editability, projection fan-out helper and completed overflow test. The original 303-test/12-browser verification is reused. Product HQ authorized saving only the fifteen listed repository files on `parallel/geo91c`; previous Agent B branches and the integration branch are preserved.

## Reader, relationships and native cursors

The new query is `api.admin.siteVisits.listSiteVisitsPage`. It preserves the array reader's required `status` and `now`, optional Project-title/Company substring search, recorded legacy city and inclusive date bounds, and adds optional `regionCode`, `provinceCode` and native `paginationOpts`. Canonical codes and province-parent relationships are validated; a province requires its valid parent region. Page-size targets must be integers from 1 to 100; the panel requests 25 source assessments.

| Index | Fields | Selection |
| --- | --- | --- |
| `by_adminSortAt` | `adminSortAt` | All Morocco. |
| `by_adminRegionCode_and_adminSortAt` | `adminRegionCode`, `adminSortAt` | Region without province. |
| `by_adminProvinceCode_and_adminSortAt` | `adminProvinceCode`, `adminSortAt` | Province with validated parent region. |

Each invocation calls native `.paginate()` **once** on one descending index. Options pass through unchanged, including `id`, `endCursor`, row and byte read limits. Reactive end-cursor ranges are not truncated to the initial size target. `isDone`, `continueCursor`, `splitCursor` and `pageStatus` are preserved by spreading the native result and replacing only its allowlisted `page`.

Joins/status/date/city/title/Company filters operate only on that source page. Search remains trimmed, whitespace-normalized, case-insensitive substring matching. Date filtering preserves selected visit date or the Morocco-local invitation day for no-visit assessments. Short or empty intermediate pages remain loadable until native exhaustion. There is no scan-all loop, fixed total cap, per-page sort or cursor reconstruction. Tests paginate 202 assessments, including a private late match after many empty pages, without duplicates or missing records in an unchanged dataset. During live changes, native reactive cursor ranges/splitting remain responsible for reconciliation; no custom snapshot or merge guarantee is introduced.

Every page/retry and rollout query calls `requireAdminUser`, including current stored-role rechecks. The reader reloads the current linked Project/Client/Company and selected visit; Project ownership and all selected visit Project/Client/Company/assessment/quote/conversation links must agree. Broken historical relationships remain excluded from list pages and exact details retain their existing fail-closed checks. Status, title, Company name and risk are read from current sources, not cached. Invite-only/private Projects remain available to authorized admins.

The list DTO uses the existing allowlist/detailed geography object. It excludes exact visit/assessment addresses, contact fields and projection implementation keys. Exact visit addresses remain only in the existing authorized detail DTO. Non-Admin, anonymous, Client, Company, SEO, role-revoked and deleted-Admin access tests pass. Existing Site Visit/Project private-location regressions pass; no OC3, chat, proposal, quote, Deal, commission or permission rules were expanded.

## Historical coverage and default-disabled rollout

The optional typed Convex environment policy is `ADMIN_SITE_VISIT_GEOGRAPHY_POLICY_VERSION`, with the sole accepted enabled value `indexed_v1`. It is **unset by default and was not set**. Unit tests stub it only in their isolated in-memory environment.

`getSiteVisitPaginationRollout` returns authorized `{ enabled, reason }`. With no policy it returns disabled. With an enabled policy it checks the `by_adminSortAt` equality bucket for an absent timestamp using a bounded `.first()`; any missing historical row disables rollout with `historical_projection_missing`. The reader independently repeats this guard on every call, including geographic queries whose selected index could otherwise omit unprojected history, and refuses rather than returning a complete-looking subset. This extra sentinel lookup is not another pagination operation.

Each indexed source page also recomputes its live projection before residual filtering. A mismatch throws `ADMIN_SITE_VISIT_PROJECTION_STALE`; neither the query nor gate repairs stored data. This detects stale geography/time in hydrated pages. It cannot prove whole-table consistency or detect a stale row stored outside the requested geographic bucket. Therefore setting the policy without an approved full coverage/consistency verification is not a supported rollout. Out-of-band writes require renewed verification and disabling the policy if consistency is uncertain.

Exact activation prerequisites for a later approved task:

1. Separately authorize the backend/index deployment and matching frontend release, leaving the policy unset. For a large table, plan staged index construction and make all three indexes queryable before enabling the reader.
2. Separately authorize and execute a bounded, idempotent backfill using current Project and selected-visit sources. Include every active/inactive assessment, legacy/no-visit records and all geographic groups. Change only derived fields; do not rewrite source location, statuses or history. Investigate broken relationships explicitly instead of deleting/rewriting them as part of this task.
3. Verify total assessment coverage, zero absent/nonfinite sort keys, exact selected-visit/invitation timestamps and canonical administrative projections, including legitimately absent geography. Compare counts/consistency and native ordering/continuation across all three index paths while the transactional maintenance code is in place. Missing-sort sentinel alone is not this verification.
4. Obtain Product HQ's rollout approval, then set `ADMIN_SITE_VISIT_GEOGRAPHY_POLICY_VERSION=indexed_v1`. Keep removal of that policy available as the immediate legacy-path rollback. The UI never enables it itself.

Until those conditions, the panel uses the existing array endpoint and its existing 15-row expansion. Geographic controls/new reader are skipped. FR/EN copy explicitly states that this legacy view shows up to the 100 most recently created assessments and its filters apply within those records. The historical cap remains in that compatibility path; it is not presented as nationwide complete pagination.

## Interface and live updates

Once approved rollout is enabled, controls default to All Morocco, list all twelve localized catalogue regions and expose only their dependent provinces. Province stays disabled until a region is selected. A region change clears the province in one state update. Separate Clear geography preserves Project/Company searches, city, status and date filters; the existing Clear filters action still clears its existing filters and geography without changing the active status tab.

Native `usePaginatedQuery` resets pages when filter arguments change or the gate becomes inactive. Empty partial results explain continuation and offer Load more; no-results appears only after exhaustion. Loading more preserves rows and disables repeated requests. Loaded counts are explicitly labelled as loaded, not global totals. Existing location labels, drawer/detail, keyboard controls and responsive structure are preserved.

The legacy panel's minute clock and detail risk refresh remain. The indexed query holds its initial `now` argument stable so clock ticks do not discard loaded pages. Confirmed-visit risk is refreshed in presentation from the authoritative backend epoch, shared parse-format check and live clock; browser timezone data does not determine that epoch. Malformed schedules retain their proposal-time sort fallback without acquiring overdue risk; backend DTO risk remains calculated by the existing rules. Filters/status/source changes still trigger native query behavior. The browser clock check verifies a scheduled visit becomes overdue without changing cursor-query arguments.

## Local verification

| Check | Result |
| --- | --- |
| Focused Vitest | **303 tests in 9 files passed**, including 41 new handler tests and 14 new rendering tests; those 55 passed again after the final clock-risk adjustment. |
| Chrome component checks | **12 distinct cases passed across targeted runs**: eight new FR/EN filter/continuation/coverage/clock cases and four existing Site Visit display/detail/filter regressions. |
| `npm run typecheck -- --incremental false` | Passed. |
| Scoped ESLint, eleven changed/new implementation and test TS/TSX files, `--max-warnings 0` | Passed. |
| `git diff --check` plus whitespace checks for untracked new files | Passed. |

Vitest selected `convex/admin.siteVisits-pagination.test.ts`, `features/admin/admin-site-visit-pagination.test.tsx`, `convex/admin.siteVisits.test.ts`, `convex/siteVisits.test.ts`, `convex/admin.geography-display.test.ts`, `features/admin/admin-site-visits.test.tsx`, `features/admin/admin-geography-display.test.tsx`, `convex/projects.structured-location.test.ts` and `convex/projects.location.test.ts`. The two Project location suites cover the changed source path and its authorization/privacy boundaries; the full repository suite and the completed GEO9.1B audit were not rerun.

Browser checks use actual components and compiled app CSS with mocked Convex/navigation and local Chrome. Filter checks cover FR/EN at 320px, 375px and 1280px, no horizontal overflow, keyboard focus, dependent region/province reset, preserved unrelated filters, invalid date range recovery and fresh 25-row pager arguments. They do not establish authenticated E2E, production cache coverage or deployed schema/code parity. Existing Vite configuration/terminal-color warnings are unrelated to passing checks.

No historical backfill, environment policy activation, deployment, push or merge was executed. The implementation/test evidence above predates the subsequently approved local save on `parallel/geo91c`; that save reuses completed tests and includes the focused safety clarification. Stop after committing GEO9.1C; deployment, bounded maintenance for any affected exceptional editable Project, and backfill/verification/activation require separate approval.
