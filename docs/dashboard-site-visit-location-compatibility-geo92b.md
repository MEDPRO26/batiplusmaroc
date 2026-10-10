# GEO9.2B — Dashboards, Project details and Site Visit locations

Date: 2026-10-09. Result: **PASS for the assigned local implementation and focused verification.** Ready for Product HQ integration review; deployment parity and authenticated E2E remain unverified.

## Isolation and baseline

- Worktree: isolated Codex worktree (local-only path omitted), verified as a clean linked Codex worktree distinct from the original integration checkout before editing.
- Switched only this worktree to detached `23384374dab9f8ffea29e3ea667192177fc50a0e`, the required integration baseline. HEAD remains there. The original `feature/nationwide-project-intake` reference also remains at that commit.
- The cached `origin/main` and a read-only remote main check agree at `7e8400d559a7f070590395ce31828e420a581e51`.
- Read AGENTS.md, Convex AI guidelines, relevant local Next.js client-component/testing guides, the GEO3/GEO9 handoffs and current assigned consumers. The ignored nationwide specification was read from its existing original-checkout copy because it was absent here. GEO3's adopted privacy policy takes precedence over that older document's OPEN visibility proposal.
- Existing dependencies were accessed through a temporary worktree-local symlink for checks; dependency manifests were unchanged. The symlink was removed after verification.
- Changes are unstaged and uncommitted. No Convex watcher, deployment, codegen, schema/index change, migration, commit, push or merge was performed. A temporary loopback-only server served generated app CSS for mocked browser component checks, then was stopped.

## Consumer findings and corrections

The required baseline already supports structured Projects without `city` in both dashboards and both Project detail readers. Those consumers already call `useProjectLocationLabel`, using GEO3 audience projections and GEO1 FR/EN names. There was no remaining city completeness gate or arbitrary locality translation key in these assigned consumers. No shared DTO, formatter, translation or catalogue change was needed.

Browser checks confirmed a separate nationwide presentation defect: long recorded commune/locality text and authorized visit addresses overflowed at 320px. The changes address only this observed defect.

| Consumer | Result |
| --- | --- |
| Client dashboard `ClientProjectCard`, grid and list | Verified unchanged: structured/no-city, legacy and incomplete labels use the existing shared hook. Existing truncation, draft/view links, grid/list actions and responsive layout are preserved. |
| Company dashboard `ProjectRow` | Existing general projection verified; its two location-bearing paragraphs now wrap long recorded commune text without horizontal overflow. Feed filtering, eight-row load-more requests and Project links are unchanged. |
| Client `ClientProjectDetailsView` | Existing owning-Client detailed projection verified; the header label now fits its container and wraps long Unicode/free-text location parts. |
| Company `ProjectDetailsView` | Existing pre-interest general and mutually engaged detailed projections verified; the header label now wraps within its container. Proposal eligibility does not grant location access. |
| `ProjectSiteAssessment`, `ConversationSiteAssessment`, `SiteAssessmentPanel` | These already have no city-dependent Project summary. They consume the existing authorized visit DTO and do not need a new Project-location field. Scheduled/proposed and historical visit address display branches now wrap long addresses. |
| Conversation context Site Visit progress summary | Inspected unchanged: it passes visit status/date/time to the progress timeline and renders no location or address. |

The implementation consists of six presentation edits across four existing components. General geography still excludes private locality/neighborhood; authorized Project details still exclude visit addresses. Exact addresses and directions remain in the existing Site Visit detail workflow. No address is substituted for a missing Project location, and no geography is inferred from legacy city.

## Exact files changed

1. `features/companies/components/company-dashboard.tsx`
2. `features/projects/components/client-project-details.tsx`
3. `features/projects/components/company-project-details.tsx`
4. `features/site-assessments/components/site-assessment-panel.tsx`
5. `convex/project-site-visit-location-geo92b.test.ts`
6. `features/projects/project-location-compatibility-geo92b.test.tsx`
7. `tests/e2e/dashboard-site-visit-location-geo92b.spec.ts`
8. `docs/dashboard-site-visit-location-compatibility-geo92b.md`

Client dashboard implementation, `convex/siteVisits/index.ts`, all existing Project read/write implementations, shared location helpers, messages, schema/indexes, Admin Project/Site Visit filtering/pagination, Company headquarters/coverage, invitations/proposals/quotes, OC3/coordination and financial implementation files are unchanged.

## Authorization, history and workflow verification

The new backend suite uses existing public handlers in isolated `convex-test` fixtures. It covers structured/no-city, legacy city-only, incomplete historical and mixed structured/retained-city records.

- Owning Client summaries/details receive the existing detailed allowlist; Company dashboard/feed summaries remain general before and after engagement.
- A submitted initial quote does not unlock private locality. The existing Client discussion-opening mutation unlocks the participant Company's Project details. Existing GEO3 regressions also cover accepted direct invitations, stale sources, duplicate conversations, private Project visibility and revoked roles/membership.
- Private sentinel values and `localityName`/`neighborhood` keys are absent from general Company summaries. Exact visit addresses/directions are absent from both dashboard DTOs and both Project detail DTOs, including after a visit exists.
- Both authorized participants can read the separate visit address/directions through `getForProject` and `getForConversation`. Anonymous, another Client, another Company and SEO callers retain their existing denials or null assessment result. Tests recheck access after membership, role and ownership revocation; locked conversation reads remain denied.
- Repeated reads leave stored Project, initial quote, assessment, visit/proposal history, notifications, activity, Deals and commission records unchanged.
- Real existing mutations exercise invitation/assessment acceptance, visit proposal, exact retry, Company rescheduling, Client confirmation, future completion rejection and Company completion for each location shape. One visit and ordered immutable proposal history are preserved. Project geography/status and retained city values remain unchanged; no Deal, commission summary or commission history is created.
- Existing Site Visit regressions cover cancellation, suspension, participant isolation, confirmation/rescheduling authority, notification recipients and idempotency.

These are focused local checks against valid fixture relationships plus existing security regressions. They are not a complete historical integrity audit, authenticated E2E or evidence of deployed code/schema parity. No additional access permission was introduced.

## FR/EN and responsive checks

The new 58-case rendering suite uses real FR/EN messages and the existing location hook. It checks Client grid/list cards, Company dashboard, owning Client details, pre-interest and authorized Company details, historical/fallback labels and authorized Site Visit wrappers/status displays. Locality text is rendered directly; translation errors and render-time mutations fail the tests. Company headquarters text is a separate fixture value and is never treated as Project geography.

Ten Chrome component cases check both locales at 320px, 375px and 1280px with actual components and freshly compiled `app/globals.css`, mocked Convex/navigation and blocked external requests. They verify no page/location-text overflow, Client grid/list keyboard interaction and Project links, Company load-more page size, pre-interest locality/address absence, detailed Company geography, owner details and both participants' authorized addresses. Visit cancellation forms open and close without sending a mutation. Mobile screenshots were inspected. The baseline had eight overflow failures; the corrected cases all pass.

Existing Client card truncation remains intentional and passed both layouts. Browser checks are component checks, not authenticated end-to-end tests or certification of all devices/assistive technology. Evidence and generated CSS are ignored under `test-results/geo92b/`; the browser launcher configuration is temporary `/private/tmp/batiplus-geo92b-playwright.config.cjs`. No application or Convex development watcher was needed.

## Focused verification results

| Check | Result |
| --- | --- |
| New focused suites | **78 tests passed**: 20 backend and 58 rendering cases. |
| Final focused/affected Vitest run | **216 tests in 10 files passed**, including the 78 new cases. |
| Chrome component checks | **10 tests passed**, FR/EN and 320/375/1280px. |
| `npm run typecheck -- --incremental false` | Passed. |
| Scoped ESLint, seven changed/new TS/TSX files, `--max-warnings 0` | Passed. |
| `git diff --check`, plus whitespace checks for the four new files | Passed. |

Focused test command:

```sh
npm test -- --no-cache \
  convex/project-site-visit-location-geo92b.test.ts \
  convex/projects.location.test.ts convex/siteVisits.test.ts \
  features/projects/project-location-compatibility-geo92b.test.tsx \
  features/projects/project-location-rendering.test.tsx \
  features/projects/project-workspace.test.tsx \
  features/projects/company-project-marketplace.test.tsx \
  features/companies/company-dashboard-budget.test.tsx \
  features/site-assessments/site-assessment-panel.test.tsx \
  lib/geography/project-location.test.ts
```

The tracked browser test uses the existing `tests/e2e/support/component-harness.ts`. Its normal invocation can use that harness's existing stylesheet server setup; this run used the temporary static server/configuration described above. The full repository suite and production build were not run. Existing Vite config-loader and terminal-color warnings did not fail the checks.

## Integration readiness and remaining dependencies

The eight-file change is ready for local integration review against detached `2338437`. It needs no backend DTO deployment, schema/index rollout or data migration. The original integration branch was not changed.

Agent F's OC3/support and coordination location compatibility remains independently owned. Any remaining GEO9.2 Deal/work or other consumer compatibility identified in the GEO3 handoff still needs its assigned owner's verification; this task does not claim those modules complete. Combined integration tests, authenticated E2E, historical integrity/private-media checks and frontend/backend deployment parity remain release work. GEO9.1B/C's separately authorized historical backfill, consistency verification and rollout-policy prerequisites remain unchanged.

Stop after GEO9.2B. No next geography task was started.
