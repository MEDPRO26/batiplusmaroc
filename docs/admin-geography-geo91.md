# GEO9.1 — Admin Project and Site Visit geography

Date: 2026-10-09. **Result: BLOCKED for geographic filtering and pagination; location display is implemented and locally verified.** GEO9.1 is not complete or ready for full-feature integration. The display changes are ready for Product HQ review.

Worktree: `/Users/yassin/.codex/worktrees/f0ff/batiplusmaroc`, detached HEAD `a43a0feecbad22b6cd1a3ae971cd6fefcb4dca58`. The integration ref `feature/nationwide-project-intake` still resolves to that commit. No commit, push, merge, deployment, Convex watcher/codegen, migration or deployment-environment change was performed. The existing dependency tree was copied into this worktree for local tests; dependency manifests were unchanged.

The owner's attached GEO9.1 brief expressly replaces the missing ignored geography specification for this task. AGENTS.md, Convex AI guidelines, relevant local Next.js guides, tracked GEO3 helpers/handoff, schema and existing Admin source/tests were consulted. Other geographic tasks and correction workflows were not started.

## Files changed

| File | Change |
| --- | --- |
| `convex/admin/siteVisits.ts` | Add the existing detailed GEO3 location projection to Admin list rows and the detail's Project context. |
| `features/admin/components/admin-projects-panel.tsx` | Use the Admin location label in rows/review; label the column as Location; wrap long recorded text. |
| `features/admin/components/admin-site-visits-panel.tsx` | Format location in desktop rows, mobile cards, detail header and overview using the same helper. |
| `features/admin/hooks/use-admin-project-location-label.ts` | Reuse GEO3 formatting with a neutral incomplete-location label. |
| `messages/fr.json` | French incomplete/location copy. |
| `messages/en.json` | English incomplete/location copy. |
| `convex/admin.geography-display.test.ts` | Twelve focused DTO, compatibility, authorization and privacy tests. |
| `features/admin/admin-geography-display.test.tsx` | Twelve FR/EN rendering tests, including all twelve catalogue regions. |
| `tests/e2e/admin-geography-display.spec.ts` | Six Chrome component checks for FR/EN, responsive layouts and keyboard interactions. |
| `docs/admin-geography-geo91.md` | This handoff. |

`convex/admin/projects.ts`, schema/index definitions, public/Company DTOs and every marketplace/support write workflow are unchanged.

## Display, compatibility and privacy

Structured records show catalogue-localized Region and Province/Prefecture, followed by recorded commune, locality/douar and neighborhood from the existing authorized detailed DTO. Arbitrary recorded text never becomes a `cityOptions` translation key. Known legacy city-only records and older city-only DTOs retain their translated fallback without inferred geography.

Missing administrative selections, incompatible/unknown pairs and missing structured locality are marked “Location incomplete” / “Localisation incomplète”. Available recognized names and authorized text can remain beside that neutral label. A cleared structured record does not revert to its leftover legacy city. No location or project status is rewritten.

The additive site-visit location object has exactly `regionCode`, `provinceCode`, `communeName`, `legacyCity`, `localityName` and `neighborhood`. It has no address, directions, notes or contact fields. Exact visit street addresses remain solely in the pre-existing authorized detail's `visit.siteAddress`. Existing `requireAdminUser`, relationship checks, private-project visibility and detail integrity failures are preserved. Tests deny anonymous, Client, Company, SEO, revoked-role and deleted Admin callers and retain fail-closed ownership handling.

## Filtering and pagination blockers

**Admin Projects:** `listProjects` returns an array, not a cursor page. It reads at most 200 source Projects using `by_createdAt`, `by_status` or `by_status_and_city`, then applies remaining filters and sorts by `submittedAt`. The existing geographic indexes begin with `(status, visibility)` and end with `publishedAt`. They support marketplace discovery, but not this unrestricted Admin queue's submission-time ordering. Filtering a capped source page loses later matches. Taking a fixed number from each geographic status/visibility bucket and re-sorting cannot guarantee submission-time ordering when submission, publication and creation timestamps differ.

**Admin Site Visits:** `listSiteVisits` reads at most 100 assessments, joins each latest visit and associated Project, applies workflow/search/city/date filters, then sorts by visit time or assessment invitation time. The UI's 15-row expansion only slices that array; there is no backend continuation. Neither assessment nor visit indexes contain Project geography or the combined workflow sort key. A source cursor in assessment creation order cannot preserve the current global visit/invitation-time ordering without exhausting and sorting all matches.

An ignored in-memory diagnostic with **202 Projects and 202 assessments** reproduced the existing issue: unfiltered lists contained 200/100 records, both title searches for the earlier rural record returned empty arrays, and exact authorized review/detail reads still found those records. This is blocker evidence, not a passing geographic-pagination regression.

Per the brief's instruction to stop the affected backend portion if indexes/denormalization are needed, **region/province query arguments and UI controls were not added**. No capped-page geographic filter or unbounded `.collect()` was introduced. Existing non-geographic filters and list contracts remain intact. Region dependency/reset/clear behavior and geographic sparse-page acceptance are consequently open, not verified as implemented.

### Smallest follow-up requiring approval

- Projects: approve geographic-leading indexes that cover the Admin ordering and optional status filtering, using the existing recorded fields. The `publishedAt` discovery indexes cannot substitute for the Admin sort key. Validate canonical GEO1 region/province codes and the parent relationship on every filtered request.
- Site visits: approve a derived, indexed Admin assessment projection (or optional assessment fields) containing source IDs, recorded Project region/province and the existing workflow sort key. Keep addresses out of it; atomically maintain derived values with source updates and recheck current relationships when reading. Existing historical data requires a separately authorized population/compatibility strategy.
- Approve a bounded cursor contract where continuation is necessary for residual search/date/workflow filters. Empty partial pages must not mean exhausted results. Keep the existing array endpoints compatible if new paginated readers are chosen, and reset dependent UI pagination on filter changes.

These are focused proposals, not approved schema, API, write-workflow or migration changes. No new correction button, correction mutation, backfill or automatic location fix is implemented. Post-publication correction remains a separate Product HQ decision.

## Verification

| Check | Result |
| --- | --- |
| Final focused Vitest run | **92 tests in 8 files passed**; includes 24 new tests. |
| Chrome component suite | **6 tests passed**, both locales; 320px, 375px and 1280px views. |
| Separate ignored 202-record diagnostic | One diagnostic passed; demonstrates the existing source-cap blocker. |
| `npm run typecheck -- --incremental false` | Passed. |
| Scoped ESLint, seven changed/new TS/TSX files, `--max-warnings 0` | Passed. |
| `git diff --check` and separate new-file whitespace check | Passed. |

The final Vitest run selected `convex/admin.geography-display.test.ts`, `features/admin/admin-geography-display.test.tsx`, `convex/admin.projects.test.ts`, `convex/admin.siteVisits.test.ts`, `features/admin/admin-projects.test.tsx`, `features/admin/admin-site-visits.test.tsx`, `convex/projects.location.test.ts` and `convex/siteVisits.test.ts`. The existing lifecycle, approval, scheduling and public/Company location-privacy regressions passed. The full repository suite was not run.

Browser checks use real components and app CSS with mocked Convex/navigation and blocked external browser requests. A temporary loopback-only static stylesheet server and Playwright config lived in `/private/tmp`; no Next.js or Convex watcher was started. Both screens wrap long Unicode/locality text without page overflow; drawers have no horizontal overflow at 320px. Keyboard Enter opens existing review/detail actions, Escape closes them, and existing site-visit search/Company/city filter Tab order and values were checked. Mobile review/detail screenshots were visually inspected. Evidence is in ignored `test-results/geo91/`; the diagnostic source is ignored `test-results/geo91-pagination-diagnostic.test.ts`.

These are local source, in-memory backend and browser component checks. They do not prove deployed schema/code parity, authenticated E2E, assistive-technology certification or geographic filter acceptance. Existing Vite configuration and terminal-color warnings did not fail the checks. The additive Admin reader needs a separately authorized synchronization before live site-visit geography can appear; old city-only DTOs retain the display fallback.

Leave all changes uncommitted in this isolated worktree for Product HQ review. Stop after GEO9.1; GEO9.2, GEO10 and migrations remain untouched.
