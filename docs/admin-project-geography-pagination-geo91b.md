# GEO9.1B — Admin Project geography filtering and pagination

Date: 2026-10-09. **Result: PASS at the local source/test level.** Admin Projects now use an additive cursor reader with recorded GEO1 region/province filters. Site Visit filtering remains outside this task.

Worktree: `/Users/yassin/.codex/worktrees/f0ff/batiplusmaroc`. The initially clean worktree was detached at `7a0cae95d99e60409342b52afcbc045816566a43`, matching `feature/nationwide-project-intake`. The original integration checkout was not switched or modified. `parallel/geo91-display` still points to `051ddd1d428bd660f346625736b023c3f70f5d7f`. Changes remain unstaged and uncommitted.

At final verification the integration ref had independently advanced to `62e3d91d038ee8c3e80850a07d6879e8f91b7f89`. This worktree remains on the assigned `7a0cae9` baseline; validation applies to that baseline plus these changes. No rebase or integration against the newer tip was performed.

This implements the explicitly approved Project-only follow-up to [the GEO9.1 investigation](admin-geography-geo91.md). The prior display handoff remains historical evidence; its Project filtering blocker is resolved in this source change. The full audit was not repeated.

## Files changed

| File | Change |
| --- | --- |
| `convex/schema.ts` | Four additive Project indexes; no new fields or changes to other tables. |
| `convex/admin/projects.ts` | Add `listProjectsPage`; share the existing allowlisted list projection with the unchanged array contract. |
| `features/admin/components/admin-projects-panel.tsx` | Use the native pager; add region, dependent province, clear and continuation controls. |
| `messages/fr.json` | French Admin Project filter and pagination copy. |
| `messages/en.json` | English Admin Project filter and pagination copy. |
| `convex/admin.projects-pagination.test.ts` | Thirty backend pagination, ordering, geography, compatibility and authorization tests. |
| `features/admin/admin-project-pagination.test.tsx` | Eight FR/EN rendering and pagination-state tests. |
| `features/admin/admin-projects.test.tsx` | Adapt the existing Project panel mock to the native pager. |
| `features/admin/admin-geography-display.test.tsx` | Adapt Project display fixtures; Site Visit fixtures and behavior remain unchanged. |
| `tests/e2e/admin-project-geography-pagination.spec.ts` | Four FR/EN browser component tests for filters, dependency reset, keyboard access and partial-page continuation. |
| `tests/e2e/admin-geography-display.spec.ts` | Adapt the existing Project browser fixture to the new reader. |
| `docs/admin-project-geography-pagination-geo91b.md` | This handoff. |

## Reader, ordering and compatibility

The new public query is `api.admin.projects.listProjectsPage`. It requires `status` and native `paginationOpts`, with optional `search`, `city`, `regionCode` and `provinceCode`. Every page and retry calls `requireAdminUser`; the role is read from the current stored user. Anonymous, Client, Company, SEO, deleted-Admin and revoked-Admin callers are denied.

The existing `listProjects` array endpoint retains its arguments, bounded behavior, filters, ordering and output shape for compatibility. The Admin panel uses the new reader. Mutations and review/detail behavior were not changed.

| Index | Ordered fields | Selection |
| --- | --- | --- |
| `by_submittedAt` | `submittedAt` | All statuses without geography. |
| `by_status_and_submittedAt` | `status`, `submittedAt` | A specific status without geography. |
| `by_regionCode_and_submittedAt` | `regionCode`, `submittedAt` | Region without province. |
| `by_provinceCode_and_submittedAt` | `provinceCode`, `submittedAt` | Province with its validated parent region. |

Each call paginates one descending native index stream. Submission time determines global order across all loaded pages; native `_creationTime` supplies the tie-break. Historical projects without `submittedAt` remain accessible at the end and return `submittedAt: null`. No creation/publication-time fallback, per-page re-sort, field rewrite, inferred geography or data migration is used.

The query accepts integer page-size targets from 1 to 100; the panel requests 25 source Projects. Native `paginationOpts` are passed unchanged, including `id`, `endCursor`, row limits and byte limits. Reactive cursor ranges can exceed the page-size target; native split metadata is retained rather than truncating those ranges.

Title search retains the existing trimmed, whitespace-normalized, case-insensitive substring semantics; it does not switch to marketplace relevance search. Status, recorded legacy city and any geographic equality not supplied by the selected index are checked within that source page. These filters intersect. Both `marketplace` and `invite_only` Projects remain accessible to authorized admins.

Residual filtering may return an empty or short page. The reader preserves native `isDone`, `continueCursor`, `splitCursor` and `pageStatus`; an empty intermediate page does not declare exhaustion. There is no scan-all loop or fixed total-result cap. Only matching rows hydrate a safe Client display name. The DTO is the existing allowlist, with the existing detailed location object; contact data and exact site addresses are not added.

Canonical GEO1 codes are required. Province selection requires a region, and its catalogue parent must match. A province-index result must also match the recorded Project region; inconsistent stored pairs are not silently repaired. Unfiltered reads retain legacy city-only and cleared structured history without guessing region/province codes.

## Admin interface

All twelve regions use catalogue FR/EN names. Province choices belong only to the selected region. Changing or clearing the region clears its province in the same state update; province selection is disabled until a region is selected. Existing title, city, status, tabs, review actions and location display remain available.

Native `usePaginatedQuery` resets its cursor/pages when query arguments change. Clearing filters resets title, city, geography and status to All. Empty partial results show a continuation message and an enabled Load more action. The no-results message appears only after native exhaustion. Loading more preserves existing rows and disables duplicate button requests. Controls remain usable at 320px, 375px and 1280px.

## Verification

| Check | Result |
| --- | --- |
| Focused Vitest | **105 tests in 7 files passed**, including 38 new tests. |
| Targeted Chrome component tests | **6 passed**: four new filter/pagination tests and two Project display/review regressions. |
| `npm run typecheck -- --incremental false` | Passed. |
| Scoped ESLint, nine changed/new TS/TSX files, `--max-warnings 0` | Passed. |
| `git diff --check` plus whitespace checks for new files | Passed. |

Vitest selected `convex/admin.projects-pagination.test.ts`, `features/admin/admin-project-pagination.test.tsx`, `features/admin/admin-projects.test.tsx`, `features/admin/admin-geography-display.test.tsx`, `convex/admin.projects.test.ts`, `convex/admin.geography-display.test.ts` and `convex/projects.geography-schema.test.ts`.

Backend fixtures include 202 Projects, an older private Project omitted by the old 200-record cap, a later match behind many empty pages, submission/creation/publication order differences, equal timestamps, missing submission dates in every index path, all twelve regions, canonical/mismatched pairs, combined filters, native end-cursor ranges and split metadata, role revocation/deletion, exact DTO keys and unchanged historical documents. Existing array-reader, review, display and geography-schema regressions pass.

Browser checks use actual components and app CSS with mocked Convex/navigation. A temporary loopback-only stylesheet server and config reside in `/private/tmp/batiplus-geo91b-*`; generated evidence is ignored under `test-results/geo91b/`. These checks cover dependent province reset, clear and existing filters, 25-row pager arguments, empty intermediate pages, keyboard interactions, retained rows during loading and responsive overflow. They do not prove authenticated E2E or deployed schema/code parity. Existing Vite configuration and terminal-color warnings did not fail checks.

## Remaining dependencies and scope boundaries

- Live use needs a separately authorized Convex deployment/index build that makes all four indexes and the new query available before the matching frontend release. No deployment, Convex watcher/codegen or rollout was performed here. No document migration is required for these indexes.
- Sparse residual filters can require multiple Load more requests. Additional status/geography composites or different search semantics are not required for correctness and were not added.
- Site Visit filtering, assessment projections, historical backfills and location-correction workflows remain separate tasks. No Site Visit source or assessment fields changed.
- No commit, push, merge, original integration-branch modification, dependency-manifest change or live migration was performed. Stop after GEO9.1B.
