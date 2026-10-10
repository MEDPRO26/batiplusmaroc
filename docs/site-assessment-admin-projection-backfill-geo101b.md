# GEO10.1B — Historical Site Assessment projections

2026-10-09. **PASS WITH ISSUES:** local implementation and focused tests pass; the additional Convex-specific compiler check has two pre-existing GEO9.2C errors described below. This report does not establish deployment or live-data readiness.

The isolated Codex worktree (local-only path omitted) was clean before detaching to the required integration baseline `7a96e6a63b65cab0187ab57a91c4f70788228a74`. The original integration checkout and other branches were preserved. Existing GEO10.1A findings were reused as previous measurements, without another deployment audit.

## Exact source changes

| File | Purpose |
| --- | --- |
| `convex/migrations.ts` | Internal preview-first batch backfill and read-only verifier. Existing component migrations are unchanged. |
| `convex/siteVisits/adminMigration.ts` | Bounded source inspection, aggregate diagnostics and patches containing only differing approved projection fields. |
| `convex/siteAssessments.admin-migration.test.ts` | Actual-handler migration, retry, integrity, privacy and preservation tests. |
| `docs/site-assessment-admin-projection-backfill-geo101b.md` | This handoff. |

No schema, generated API, projection helper, ordinary source writer, UI, translation, dependency manifest or deployment configuration changes are required. Installed dependencies were copied into this isolated worktree for local checks; no install or watcher was started.

## Entry points and continuation

`internal.migrations.backfillSiteAssessmentAdminProjections` accepts optional `cursor`, `batchSize` and `dryRun`. Omitted cursor starts at the beginning; omitted `dryRun` means **preview with zero writes**. Applying one page requires explicit `dryRun: false`. `internal.migrations.verifySiteAssessmentAdminProjections` accepts only cursor and batch size and is read-only. Both are internal registrations with argument/return validators, absent from the public API; they require privileged operator/server invocation, not an application-user role. No public wrapper, HTTP route, scheduler or import/startup/deployment hook calls them.

Each call performs one ascending native creation-index pagination operation, requesting ten assessments by default. Integer batch sizes 1–10 are accepted; row reads are capped at that size and assessment-page reads at 1,000,000 bytes. Source joins are bounded by the page. Very large source documents can still hit Convex transaction limits: failure commits nothing; an approved operator can retry the same input cursor with a smaller batch.

The existing migration component is retained for existing migrations. Its installed dry-run implementation logs complete before/after documents, including private source fields, so this migration uses private, aggregate-only output and caller-held native cursors instead of its background runner. There is no component status/checkpoint row for this migration.

An approved operator must save the returned `continueCursor` after each successful **apply** call and continue until `isDone`. If interrupted or the response is lost, repeat the last input cursor; already matching rows cause zero writes. Starting again with null is also safe. An integrity failure returns aggregate counts in a `SITE_ASSESSMENT_BACKFILL_INTEGRITY_ERROR` and advances no checkpoint. Do not skip that page. Investigating/repairing source history requires separate scope and authorization.

Preview and verification cursors are independent of apply checkpoints. A preview continuation must never be used to skip unapplied records. Mutating projections, assessment status or activity does not move the creation-index scan. Every retry/page reads current sources in its own transaction; a multi-page sweep is not one historical snapshot. Out-of-band changes to previously scanned sources require a fresh sweep and full verification.

## Integrity and preservation

The migration reuses GEO9.1C `selectedVisitForAssessment`, `assessmentAdminProjection`, `assessmentProjectionMatches` and `visitMatchesAssessment`. Active visits win, followed by newest native creation within that active value; if all are inactive, the newest inactive visit wins. Sorting uses the existing Casablanca wall-clock conversion, malformed-string `proposedAt` fallback, or `invitedAt` when no visit exists.

Preflight checks current Project ownership; existence of referenced Project, Client, Company, initial Quote and Conversation; Quote/Conversation Project and Company relationships; Conversation Client/initial Quote relationships; and every selected Visit identity link checked by GEO9.1C. Historical inactive/completed records, closed conversations and withdrawn quotes remain eligible without applying present-day participation/status/membership gates. Nonselected visit history is not swept. Missing or inconsistent links, or a nonfinite derived source sort, reject the entire write page before patches; transaction failures also roll back the page.

Only differing `adminRegionCode`, `adminProvinceCode` and `adminSortAt` fields are patched. Stale optional geography is removed when the approved helper omits it. Canonical recorded region and compatible province codes are the only geography inputs; legacy city strings never infer codes. Partial/invalid administrative pairs retain the helper's existing omission behavior and are reported, without changing Projects. All source fields, system creation times, statuses, timestamps, histories, notifications, Quotes, Deals and commissions are preserved. No business event or scheduled work is generated. Applying is refused while the reader policy equals `indexed_v1`; previews/verification remain available.

## Aggregate consistency contract

Both results contain `scope: "page"`, `counts`, `wouldUpdate`, `continueCursor` and `isDone`. Backfill also returns `dryRun` and `updated`. Counts describe **stored values before this call's writes**. Outputs/errors contain no source documents, private addresses, personal information or explicit record IDs.

| Counter | Definition |
| --- | --- |
| `examined` | Assessments in this source page. |
| `missingProjections` | Missing sort, or missing expected canonical geography when source integrity permits comparison. Legitimately absent geography is not missing. |
| `missingOrNonfiniteAdminSortAt` | Stored sort is undefined, NaN or infinite. |
| `staleProjections` | A comparable, nonmissing projection differs from current sources. Missing rows are counted separately. |
| `invalidProjectAdministrativePairs` | At least one recorded Project code exists but the complete canonical pair is invalid/partial. Counted per assessment; city-only Projects are excluded. |
| `sourceIntegrityFailures` | Assessments failing one or more source identity/existence checks; counted once per assessment. |
| `nonfiniteSourceSortAt` | Intact sources derive a nonfinite ordering value; applying is blocked. |
| `readyForIndexedDiscovery` | Intact sources, finite derived sort and exact stored projection match. This includes legitimate missing geography for unfiltered discovery. |

Counters can overlap; they are not a partition of `examined`. `wouldUpdate` counts valid finite differing projections, including those on a preview page that has another integrity failure. It does not authorize partial application.

**Full verification requires a fresh null-cursor scan, summing every page through native exhaustion.** Neither a clean first page nor `isDone` on a supplied tail cursor proves global completeness. Require zero missing/nonfinite/stale projections, zero source failures/nonfinite source sorts, zero proposed updates and ready count equal to examined count. Review all invalid/partial administrative pairs; ready count alone does not certify geographic membership. Preserve GEO9.1C's separate full index/order/continuation and release checks before activation. Concurrent out-of-band source changes invalidate earlier-page verification and require repeating it.

## Local verification and open issue

- Focused run: **111 tests in five files passed**, including **35 new tests** plus `migrations.test.ts`, `admin.siteVisits-pagination.test.ts`, `admin.siteVisits.test.ts` and `siteVisits.test.ts`. The final focused migration test rerun also passed.
- Repository `tsc --noEmit --incremental false`: passed.
- Scoped ESLint for all three changed TypeScript files: passed.
- `git diff --check`: passed.
- Additional `tsc --noEmit --incremental false -p convex/tsconfig.json`: fails at unchanged `convex/clientSupport.location-compatibility-geo92c.test.ts:131` and `:209`. Both use `Object.hasOwn`, while that baseline config declares `lib: ["ES2021", "dom"]`. The same lines/config exist at `7a96e6a`; this task leaves OC3 and compiler configuration untouched. Resolve this existing compiler issue before a later backend release.

Tests cover write-free defaults, city-only preservation, structured projection, invitation/visit ordering, active/inactive selection, closed historical sources, all three indexes, more than two batches, lost-response retry, interruption/resumption, idempotency, changed sources, missing/broken links, whole-page failure, aggregate accuracy, nonfinite data, batch limits, disabled-reader enforcement, public API exclusion, and unchanged application tables/system scheduling. The complete repository suite was not run.

## Separate authorization still required

Product HQ must separately authorize development backend/index deployment and then development backfill execution against the explicitly selected deployment. Recheck current data and original GEO9.1C prerequisites, including the editable-Project assessment fan-out limit, because GEO10.1A measurements were point-in-time. Keep the policy disabled through approved preview, bounded application and exhaustive verification; activation requires another rollout decision. Production execution, Project conversion/GEO10.1C and search-index promotion remain separate tasks.

No deployment access, live backfill, environment-variable change, policy activation, watcher, commit, push or merge occurred in GEO10.1B. Source changes remain uncommitted on the detached required baseline, ready for review/integration after the existing compiler issue is accounted for. Work stops at this assigned task.
