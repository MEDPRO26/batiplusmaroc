# GEO8.1 — Company geographic coverage UI

Source implementation on `feature/nationwide-project-intake`, 2026-10-08.
Baseline: `c484286` (GEO7 committed). Working tree was clean. No branch switch, pull, reset, commit, or deploy.
An existing `npx convex dev` watcher was already running in a user terminal. It was left untouched. This report is local source and test verification, not a deployment or release claim.

**Status: PASS WITH ISSUES.** The coverage editor, GEO7 API wiring, and selected Company regressions pass locally. Authenticated browser use and live schema/index parity were not verified.

## Files changed

- `features/companies/components/profile/geographic-coverage-editor.tsx` (new)
- `features/companies/components/company-profile-editor.tsx`
- `features/companies/components/profile/company-settings.tsx`
- `features/companies/geographic-coverage-editor.test.tsx` (new)
- `features/companies/company-profile-editor.test.tsx`
- `lib/geography/coverage-selection.ts` (new pure selection helpers)
- `lib/geography/coverage-selection.test.ts` (new)
- `lib/errors/codes.ts`
- `messages/en.json`
- `messages/fr.json`
- `docs/company-geographic-coverage-ui-geo81.md` (this report)

No Convex schema, index, or coverage API was added. `updatePublicProfile` is unchanged.

## Company coverage journey

An onboarded Company owner opens the existing profile or Settings → Company profile. The Service areas section is now **Geographic coverage**. It shows the saved declaration, or “No coverage declared” / “Aucune couverture déclarée”. Headquarters city stays in company information and is described as separate.

The owner opens **Edit geographic coverage**. The dialog does not save on each checkbox. **Save changes** sends the full ordered `coverageScopeKeys` array. **Discard changes** restores the last saved selection. Closing the dialog drops the unsaved draft. A successful mutation shows the success message only after the call resolves. A failed mutation keeps the draft and shows the mapped FR/EN error.

If the Company still has the historical ten-city `serviceAreas`, those cities appear under **Previous city selections**, with the existing city editor. Saving coverage does not write that field.

## GEO7 integration

The UI calls only:

- `api.companies.index.getMyGeographicCoverage`
- `api.companies.index.updateMyGeographicCoverage`

Neither call sends a Company ID. Before save, `validateCompanyCoverageScopes` checks the complete array. Invalid or duplicate keys are not submitted. `[]` is a valid clear. The mutation argument is the full replacement, not a delta.

A reactive snapshot replaces the draft only while it still matches the last saved baseline. Unsaved edits are kept when the query updates.

## Selection behavior

- **All Morocco** adds or removes `MA` and leaves other keys in place. If other keys remain, the dialog explains that they are already included in national coverage.
- **Entire regions** lists all 12 GEO1 regions. Checking one adds `R:<code>`. It does not add that region’s provinces.
- **Specific provinces and prefectures** uses a region menu to browse one region’s provinces. Changing that menu does not add `R:<code>`. Checking a province adds only `P:<code>`. Selections from other regions stay in the ordered array.
- Overlapping national, regional, and provincial keys are kept. A Set blocks duplicate keys. Untouched keys keep their order; a new key is appended.
- The province checklist is limited to the browsed region, with a name filter. All 75 provinces are not shown at once.

## Legacy compatibility

Historical `serviceAreas` are displayed only when present, in a separate block, and are still edited through `updatePublicProfile`. Coverage saves do not convert, delete, or overwrite them. Headquarters `city` is not used as coverage. Public directory and public profile DTOs are unchanged.

## Authorization

The profile page still loads coverage only after the existing owner gate (`canManageDocuments`). Staff, Client, and signed-out renders do not call `getMyGeographicCoverage`. Settings and the profile use the same owner profile query. Convex `requireOwnerCompany` plus completed onboarding remains the security boundary; the UI does not accept a Company ID. GEO7 backend denial tests were re-run and passed. Verification and suspension behavior was not changed.

## FR/EN, responsive layout, and accessibility

FR and EN coverage strings share the same shape. Geographic names come from the GEO1 catalogue. Validation errors for the five coverage codes are in `ux.error.codes`.

The dialog stacks on small screens (`flex-col-reverse`, `min-h-11`, `min-w-0`, `overflow-x-hidden`) and uses two columns from the `sm` breakpoint for regions and provinces. Province lists scroll vertically. Controls use associated labels, fieldsets, `aria-describedby` on the browse menu, visible focus outlines, and `type="button"` for discard and remove. The closed profile does not render the coverage checkboxes.

Keyboard and mobile behavior was checked through rendered markup and handler replay in Vitest. A signed-in browser pass was not completed.

## Verification

Final focused UI and selection tests: **27** cases across the new selection file (11), the editor file (10, including FR/EN), and the updated profile contract (6).

Broader run after the final edit: **427 tests passed in 19 files**, 0 failures. That includes those 27, GEO7 pure and backend coverage tests, Company owner/profile/onboarding/verification/operational/directory tests, public profile, logo/cover, dashboard budget, Morocco catalogue, and FR/EN error-key parity.

```sh
npm test -- --no-cache \
  lib/geography/coverage-selection.test.ts \
  features/companies/geographic-coverage-editor.test.tsx \
  features/companies/company-profile-editor.test.tsx \
  lib/geography/company-coverage.test.ts convex/companyCoverage.test.ts \
  convex/companies.test.ts convex/companyProfileManagement.test.ts \
  convex/companyDiscovery.test.ts convex/companyOperationalStatus.test.ts \
  convex/companyVerification.test.ts \
  features/companies/company-directory.test.tsx \
  features/companies/company-directory-state.test.tsx \
  features/companies/public-company-profile.test.tsx \
  features/companies/company-owner-logo-manager.test.tsx \
  features/companies/company-owner-cover-manager.test.tsx \
  features/companies/company-dashboard-budget.test.tsx \
  lib/errors/map-app-error.test.ts lib/ux-foundation.test.ts \
  lib/geography/morocco.test.ts
npm run typecheck
npx eslint features/companies/components/profile/geographic-coverage-editor.tsx \
  features/companies/components/company-profile-editor.tsx \
  features/companies/components/profile/company-settings.tsx \
  features/companies/geographic-coverage-editor.test.tsx \
  features/companies/company-profile-editor.test.tsx \
  lib/geography/coverage-selection.ts lib/geography/coverage-selection.test.ts \
  lib/errors/codes.ts
git diff --check
```

TypeScript and scoped ESLint passed with no errors. `git diff --check` passed for tracked edits. New files have no trailing whitespace. Vite still prints its existing config-loader warning.

The component-test environment is server markup plus replayed event handlers, not a browser. The coverage read-error boundary is present for the client; `renderToStaticMarkup` does not exercise it.

## Complexity

Catalogue lookups stay average O(1). Building the selected Set and validating or toggling the ordered array are O(S). Rendering the browsed province list, including the name filter, is O(K) for that region’s K provinces. There is no Company scan and no extra geographic query. The save sends one existing coverage mutation.

## GEO8.2 still open

Company directory geographic filtering is not started. GEO8.2 still needs to authorize candidate rows, dedupe Companies that match more than one scope, and define combined ordering and pagination. This UI does not filter the directory or change proposal eligibility.

## Live and browser limits

`/fr/espace-entreprise/profil` on the local Next server redirects to sign-in when unauthenticated. The open browser tab was the login page. No Company-owner session was used, so the dialog was not clicked in a browser. No Convex deploy, migration, or production check was run. GEO7’s optional field and coverage index still need a separately authorized live schema check before this UI can be treated as deployed.
