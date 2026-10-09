# GEO9.2C — OC3 support and coordination location compatibility

Date: 2026-10-09. Result: **PASS for the assigned location-only implementation and local verification.** Deployment parity, authenticated E2E and existing OC3.5 release/security checks remain open. Stop after GEO9.2C.

## Baseline and isolation

- Isolated linked Codex worktree: `/Users/yassin/.codex/worktrees/d3a8/batiplusmaroc`.
- The worktree was clean before `git switch --detach 2338437`.
- Required and final HEAD: `23384374dab9f8ffea29e3ea667192177fc50a0e`, detached.
- The integration branch `feature/nationwide-project-intake` remains at that commit. The original checkout was not switched or edited.
- Read-only remote verification and cached `origin/main` agree at `7e8400d559a7f070590395ce31828e420a581e51`. No fetch or branch update was performed.
- Read `AGENTS.md`, Convex AI guidelines, local Next.js Client Component/Vitest guides, GEO3 helpers and handoff, GEO9.2A handoff, required OC3 reports and the notification domain. Ignored geography/OC3 reports were read from the original checkout without modifying them.
- The installed dependencies were copied using APFS file clones into this worktree after verifying identical lockfiles. Test caches remain local to this worktree. No dependency or configuration file was changed.
- No deployment, codegen, migration, watcher, policy activation, live data mutation, commit, push or merge was run.

## Corrected and unchanged consumers

| Consumer | Result |
| --- | --- |
| `clientSupport.getMyConversation` | Adds an allowlisted detailed GEO3 `project.location` after the existing Client/ownership/context checks. Retains nullable legacy `city`. |
| `clientSupport.getAdminConversation` | Uses the same location projection after the existing current-Admin and Project/conversation/Client checks. |
| `clientSupport.listAdminConversations` | Uses the same summary projection; native cursors, relationship filtering, ordering and read state are unchanged. |
| Client support Project card/context | Uses `useProjectLocationLabel` with the already authorized `getMyProject` DTO. Handles structured/no-city, legacy and incomplete records and wraps long labels. |
| Admin support thread Project context | Uses the existing `useAdminProjectLocationLabel`, including localized incomplete-history labels. The context also surrounds the existing coordination overview tab. |
| Admin inbox rows | They do not independently render location. Only their shared read DTO needed compatibility; no new row or UI element was added. |
| Free-help and coordination request entries/history | They contain locale-neutral request kinds/events, not a separate location display. Left unchanged; both histories are tested with the new Project shapes. |
| Coordination agreement panels, quote readiness choice, terms and version history | They display no independent Project location. Left unchanged. Only the surrounding support context is corrected. |

The backend change is exactly one import, one return-validator field and one pure location projection. Removing those three lines reproduces the baseline support module byte-for-byte. All support mutations, permission helpers, notification hooks, read positions and pagination handlers remain unchanged. All production agreement source files, schema, financial modules, marketplace messaging and Agent E files remain unchanged.

## Geography, privacy and agreement invariants

- Reuses GEO3's six-field detailed projection for the current owning Client and authorized Admin. Region/province labels come from the existing FR/EN catalogue; commune, locality and historical neighborhood remain recorded text. No administrative area is inferred from a city or a province missing its parent.
- Unknown/inconsistent historical geography remains recorded in entitled DTOs; shared formatters avoid displaying invalid administrative names. Structured intent keeps a retained historical city from overriding the active structured location.
- Older city-only responses remain renderable through the existing shared-hook fallback. Free-text locality never becomes a translation key; Unicode, dots and escaped HTML-like text are covered.
- Other Clients, Company owners/staff, SEO and anonymous callers cannot access support geography. Ownership mismatches, revoked Admin roles and missing Client onboarding fail closed. There is no implicit history transfer or Company identity reveal.
- Exact Site Visit/assessment addresses are not joined or returned by the location projection. The existing OC3 privacy fixture now distinguishes authorized Project neighborhood (`Agdal`) from actual private addresses stored on `siteAssessments` and `siteVisits`. Its `PRIVATE_` sentinel exclusion remains intact, with added address sentinels and immutable visit snapshots; the explicit Project DTO allowlist now includes the six-field `location` object.
- Rendering/reading location creates no support request, agreement, readiness declaration, quote acceptance, Company selection, Deal, commission change or notification. Request/history DTOs, immutable events, per-user reads and generic alert payloads are preserved.
- The existing same-revision acceptance regression now runs for legacy, structured/no-city and incomplete historical geography. Actual readiness, publication, explicit marketplace acceptance and exact-version confirmation run only in `convex-test`. Support reads preserve agreement and marketplace snapshots; confirmation preserves the accepted quote, Deal and commission snapshots. Publication declarations, stale-version rejection, replacements, precision, source expiry, selected-Company consistency and ordered history receive selected existing regression coverage.

## FR/EN and translation overlap

Only two existing keys change in each catalogue:

- `clientSupport.page.contextCity`: `Location` / `Localisation`.
- `clientSupport.admin.contextCity`: `Location` / `Localisation`.

All other translation keys and values remain identical to the baseline. Shared unspecified/incomplete labels and translated legacy cities are reused. There are no new translation keys. The overlap with parallel work is limited to those two `clientSupport` keys in `messages/en.json` and `messages/fr.json`.

## Exact files changed

1. `convex/clientSupport/index.ts`
2. `features/client-support/components/client-support-page.tsx`
3. `features/client-support/components/admin-support-panel.tsx`
4. `messages/en.json`
5. `messages/fr.json`
6. `convex/clientSupport.test.ts`
7. `convex/coordinationAgreements.test.ts`
8. `features/client-support/client-support.test.tsx`
9. `convex/clientSupport.location-compatibility-geo92c.test.ts`
10. `features/client-support/location-compatibility-geo92c.test.tsx`
11. `docs/oc3-location-compatibility-geo92c.md`

## Focused verification

All backend tests use in-memory Convex fixtures. React tests render real synchronous components with mocked data hooks and real FR/EN messages. They are not authenticated browser E2E or responsive browser geometry checks.

| Check | Result |
| --- | --- |
| New OC3 geography backend cases | 19 passed |
| Existing support backend lifecycle/history/privacy suite | 53 passed |
| New FR/EN Client/Admin location, history and access renders | 45 passed |
| Existing support component suite | 40 passed |
| Selected existing agreement backend/UI regressions | 19 passed; other 179 cases intentionally deselected by `-t` |
| Recheck of the strengthened geography-specific agreement snapshot cases | 3 passed, included in the preceding 19 distinct cases |
| `npm run typecheck -- --incremental false` | Passed |
| Scoped ESLint, `--max-warnings 0` | All eight changed/new TS/TSX files passed |
| Baseline support source and translation-scope comparison | Passed |
| Tracked and new-file whitespace checks | Passed |

There are **176 distinct passing tests across six files**, collected from the focused runs. This is not a claim of one combined 176-test invocation or a full OC3/repository regression run.

Commands:

```sh
npm test -- --no-cache \
  convex/clientSupport.location-compatibility-geo92c.test.ts \
  convex/clientSupport.test.ts \
  features/client-support/location-compatibility-geo92c.test.tsx \
  features/client-support/client-support.test.tsx

npm test -- --no-cache features/client-support/location-compatibility-geo92c.test.tsx

npm test -- --no-cache \
  convex/coordinationAgreements.test.ts \
  features/coordination-agreements/coordination-agreement-ui.test.tsx \
  -t 'GEO9\.2C|first publication and confirmation require|a superseded pending version|replacement leaves the current|safe DTOs exclude|both roles page ordered published history|expired blocks readiness|wrongSelectedCompany blocks readiness|percentage basis is mandatory|confirmation keeps the exact version|publication detects every changed|never writes on render|private editor without default|negotiated prose and exact percentages'

npm test -- --no-cache convex/coordinationAgreements.test.ts -t 'GEO9\.2C'

npm run typecheck -- --incremental false

npx --no-install eslint \
  convex/clientSupport/index.ts convex/clientSupport.test.ts \
  convex/clientSupport.location-compatibility-geo92c.test.ts \
  convex/coordinationAgreements.test.ts \
  features/client-support/components/client-support-page.tsx \
  features/client-support/components/admin-support-panel.tsx \
  features/client-support/client-support.test.tsx \
  features/client-support/location-compatibility-geo92c.test.tsx \
  --max-warnings 0

git diff --check
```

Initial checks are retained separately from the passing results: the first four-file run had 137 passed and 20 failed out of 157. The new UI fixture omitted `AdminShell` and addressed request copy outside the `actions` namespace. Both fixture mistakes were corrected; the subsequent new-UI run passed all 45 cases. Typecheck also caught a pagination inference annotation and an overly broad fixture city type; both were corrected. No application permission or business rule, assertion, test timeout or production configuration was relaxed. The existing Vite config-loader warning remains non-blocking and unchanged.

## Remaining dependencies and risks

- Ready for local Product HQ/integration review from the required detached baseline. Changes remain unstaged and uncommitted in this isolated worktree.
- Backend/frontend release parity and real authenticated Client/Admin/Company E2E require separate authorized integration/release work. Existing OC3.5 and historical private-cover checks are not closed by this task.
- The geography catalogue/projections/hooks supplied by GEO1–GEO3 are reused without modification. Existing geography rollout/backfill prerequisites and Agent E's Project/dashboard/Site Visit compatibility work remain separate.
- No schema/index/data migration is required by this patch. Native support pagination and authorization remain unchanged; the only additional per-summary work constructs six recorded fields without database joins.
- Long text receives wrapping classes and static render coverage. Real narrow-screen geometry, focus/scroll behavior and deployed behavior are unverified by these unit tests.

No next GEO task was started.
