# GEO-D2 — Company service coverage reminder

Local implementation and focused validation pass. No deployment or authenticated
release claim is made.

## Base and scope

- Integration base: `feature/nationwide-project-intake` at
  `0f28526e117d4795f56dcdd3d985dd802ee64292`.
- Isolated branch: `codex/geo-d2-company-coverage-reminder`.
- Refreshed `origin/main`:
  `7e8400d559a7f070590395ce31828e420a581e51`.
- The supplied worktree was clean and detached at `7e8400d` before creating the
  isolated branch from the requested base. The integration branch stays at
  `0f28526`; this task does not merge or cherry-pick its changes.
- The feature specification is ignored and absent from the integration commit.
  Its full existing copy was read from the local-only path
  `docs/features/nationwide-geography.md` (git-ignored; absent from fresh clones).
  No specification or OPEN Product HQ decision was changed.

## Behavior

The Company dashboard and existing private profile/settings coverage section
show a FR/EN reminder only after the existing owner read model resolves to an
empty declaration. The reminder explains where Companies can declare their
willingness to accept construction Projects and that undeclared coverage can
exclude them from Client geographic searches.

`getMyGeographicCoverage` remains the existing authorized, validating read model
for `coverageScopeKeys`. Missing stored scopes and `[]` both resolve to `[]`.
Headquarters and historical `serviceAreas` are not treated as declarations.
Any saved explicit national, regional or province/prefecture coverage hides the
reminder. Loading reads do not display an undeclared warning. A failed dashboard
coverage read is contained by a local error boundary; the existing profile
coverage error UI remains in place. The profile reuses its current coverage
subscription rather than adding another read.

The localized reminder link adds `?edit=coverage` to the existing owner profile
route and opens the existing geographic coverage dialog. It waits for the
existing owner/profile access checks and coverage read. Closing clears the
opening parameter with locale-aware navigation. The ordinary pencil trigger,
dialog draft/save behavior and existing coverage mutation remain available.
Opening or displaying the reminder/dialog sends no mutation.

No onboarding, backend, schema, index, migration, search matching, Company
directory/GEO-D1 file, public URL, private location, OC3, proposal, messaging,
Deal or commission logic changed. No dependency, environment file or deployment
change was made.

## Changed files

- `features/companies/components/company-coverage-reminder.tsx`: shared reminder
  and isolated dashboard read.
- `features/companies/components/company-dashboard.tsx`: dashboard placement.
- `app/[locale]/(account)/espace-entreprise/profil/page.tsx` and
  `features/companies/components/company-profile-editor.tsx`: explicit dialog
  link and dismissal through the existing private profile.
- `features/companies/components/profile/geographic-coverage-editor.tsx`:
  reminder placement and existing dialog opening support.
- `messages/fr.json`, `messages/en.json`: four matching reminder translation keys.
- `features/companies/company-coverage-reminder.test.tsx` and
  `features/companies/geographic-coverage-editor.test.tsx`: focused unit coverage.
- `tests/e2e/company-coverage-reminder.spec.ts`: browser component checks using
  the existing harness and app CSS.
- `docs/company-service-coverage-reminder-geo-d2.md`: this report.

## Validation

**158 tests passed in 6 files:**

```sh
npm test -- \
  features/companies/company-coverage-reminder.test.tsx \
  features/companies/geographic-coverage-editor.test.tsx \
  features/companies/company-profile-editor.test.tsx \
  features/companies/company-dashboard-budget.test.tsx \
  convex/companyCoverage.test.ts \
  lib/geography/company-coverage.test.ts
npm run typecheck
npx eslint \
  'app/[locale]/(account)/espace-entreprise/profil/page.tsx' \
  features/companies/components/company-coverage-reminder.tsx \
  features/companies/components/company-dashboard.tsx \
  features/companies/components/company-profile-editor.tsx \
  features/companies/components/profile/geographic-coverage-editor.tsx \
  features/companies/company-coverage-reminder.test.tsx \
  features/companies/geographic-coverage-editor.test.tsx \
  tests/e2e/company-coverage-reminder.spec.ts
git diff --check
```

Typecheck, scoped ESLint and whitespace validation pass. Unit checks cover both
locales, localized editor links, loading, explicit scopes, cleared coverage,
legacy-only profiles, sharing the profile read, wrong dashboard roles and pending
onboarding, and rejecting unrelated or repeated editor query values. Existing
Convex coverage authorization, corruption, isolation and compatibility tests
also pass; the backend is unchanged.

**6 headless Chrome component checks passed** using an ignored, serverless local
Playwright configuration:

```sh
npx playwright test --config=design-qa-artifacts/geo-d2/playwright.config.ts
```

They render the real dashboard/profile/dialog with app CSS compiled from this
worktree. Each locale is checked at 320px, 375px and 1280px: wrapping, no horizontal
overflow, a minimum 44px reminder action, keyboard focus, direct dialog opening,
closing and reopening, a mocked explicit save hiding the reminder, and a failed
coverage read leaving the dashboard usable. Requests are intercepted locally;
Convex, authentication and navigation are mocked. The dialog request flag is
updated to emulate the route response after dismissal. This is not full
authenticated Next.js/Convex E2E. No backend write occurs.

Screenshots were visually reviewed. Stable local evidence under ignored
`design-qa-artifacts/geo-d2/`:

- `reminder-fr-mobile.png`
- `reminder-en-desktop.png`
- `coverage-editor-fr-mobile.png`

Screenshots use the app CSS with an Arial fallback and synthetic Company data.
Chrome initially aborted under the filesystem sandbox; the same isolated checks
passed after approved execution outside it. Vite's existing config-loader warning
remains unrelated to this change.

## Remaining limits

No known GEO-D2 implementation issue remains. A live owner session, actual
Next.js navigation and deployed schema/API parity were not verified. Those
release checks remain separate from this scoped task. GEO-D1 directory work is
untouched. Stop after GEO-D2.
