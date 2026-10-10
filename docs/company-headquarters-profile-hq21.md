# HQ2.1 — Company headquarters profile editor and public display

**Result: PASS WITH ISSUES.** Local HQ2.1 implementation and focused checks pass.
The two additive reader DTO changes remain source-only; they were not deployed.
Authenticated development edit/refresh and public-read verification remain open.
No onboarding policy activation was performed.

## Worktree and scope

Work took place only in an isolated Codex worktree (local-only path omitted).
The initial clean detached HEAD was `7e8400d559a7f070590395ce31828e420a581e51`.
After the owner explicitly authorized correcting this mismatch, the worktree was
switched with `git switch --detach feature/nationwide-project-intake`.
Both HEAD and the feature ref then matched
`ef5e3bbb189bdf648c754678e0cc700e06c78c74`, which remains the implementation baseline.
The original checkout and integration branch were not modified.

Read AGENTS.md, the local Next.js client/form guidance, Convex AI guidelines,
HQ1/HQ2 handoffs and the relevant tracked profile, onboarding, GEO1 and test code.
The ignored nationwide geography specification was unavailable in this worktree;
tracked implementation and handoffs were used as authorized. The user's HQ2.2
development synchronization update supersedes the older HQ2 handoff's deployment
status; this task performed no new deployment audit or synchronization.

No schema, mutation contract, directory, service coverage, legacy service-area
presentation, verification workflow, OC3, Deals, commissions or messaging change
was made. No fetch, pull, Convex watcher/deployment/codegen, migration, commit,
push or merge was performed. HQ3 and GEO9 were not started.

## Files changed

| File | Purpose |
| --- | --- |
| `convex/companies/index.ts` | Add the stored policy marker to the existing owner-only profile preload. |
| `convex/portfolio/index.ts` | Add region/province codes to the allowlisted public profile projection. |
| `features/companies/components/profile/profile-editors.tsx` | Reuse HQ2 controls/validation in the existing name/location dialog. |
| `features/companies/components/company-profile-editor.tsx` | Display saved headquarters in the owner profile header. |
| `features/companies/components/public-company-profile.tsx` | Display public headquarters with responsive wrapping. |
| `features/companies/lib/headquarters-label.ts` | Resolve saved administrative codes to GEO1 names; retain city fallback. |
| `messages/fr.json`, `messages/en.json` | Headquarters labels, city/locality label and coverage distinction. |
| `convex/companyHeadquarters.test.ts` | Policy preload/public allowlist and legacy clearing tests; adapt the former private-only public-output assertion. |
| `features/companies/public-company-profile.test.tsx` | FR/EN display, city fallback and private-field exclusion tests. |
| `features/marketplace/company-identity-ui.test.tsx` | Update typed public profile fixtures for the additive DTO. |
| `tests/e2e/company-profile-headquarters.spec.ts` | Fourteen focused Chrome browser component tests. |
| `docs/company-headquarters-profile-hq21.md` | This handoff. |

The changes comprise eight source/translation files, four test files and this
handoff. Next.js regenerated its managed AGENTS.md block during browser testing;
that incidental change was restored to the baseline after testing.

## Editor and save behavior

The existing name/location pencil dialog now includes fixed, read-only Morocco;
native GEO1 region and dependent province/prefecture selects; optional commune;
and the existing headquarters city/locality field. All current private values
preload. Changing region clears province, and province stays disabled without a
region. The city is not derived from either selection.

The editor reuses `CompanyOnboardingHeadquarters` and `onboardingHeadquarters`.
It sends a complete normalized headquarters snapshot through the existing
owner-authorized `updatePublicProfile` mutation. An unchanged city is omitted
from the patch, preserving its stored value; an edited city follows the existing
backend validation/normalization. No coverage/service-area or policy argument
is sent. No new save endpoint or role/ownership rule was introduced.

Saved values reappear through the reactive profile preload and on reopening the
dialog. Browser tests also remount against the saved mocked DTO to exercise
refresh preloads. Backend tests use the actual handlers to verify persistence
and independence from coverage. Server errors leave the dialog and draft values
intact, permit an exact retry and show localized feedback. Cancel discards edits.

The private DTO exposes `headquartersPolicyVersion: "structured_v1" | null` to
drive required-field UX. Existing backend enforcement remains authoritative:
marked Companies cannot clear the required pair. Legacy Companies may retain
city-only data, add structured headquarters voluntarily or explicitly clear
their optional snapshot. Partial snapshots and commune-only input are rejected.
The existing pre-HQ1 capability fallback remains available through the reused
helper/controls; it omits unsupported headquarters arguments.

## Public headquarters and privacy

The public profile displays a localized headquarters label followed by saved
city, province/prefecture and region names when available. City-only profiles,
older DTOs and unknown catalogue codes retain the existing city fallback.
Labels use GEO1 `nameFr`/`nameEn`; GEO1 deliberately retains the French-source
proper names in its English catalogue rather than inventing English translations.

The only new public fields are:

```typescript
headquarters: {
  regionCode: string | null;
  provinceCode: string | null;
}
```

The public projection reads these two Company fields explicitly. It does not
spread private profile data, expose commune text or the policy marker, read a
verification/legal address, or use an address fallback. Existing masking,
eligibility, invitation and public portfolio/review rules remain unchanged.
Directory DTOs and queries are unchanged. Backend tests verify that headquarters
edits still create no coverage results or index rows.

## Verification

| Check | Result |
| --- | --- |
| Focused Vitest backend/component regressions | **453 tests across 12 files passed**. |
| HQ2.1, existing profile and HQ2 onboarding Chrome component suites | **35 tests across three suites passed**, including **14 new HQ2.1 tests**. |
| Public profile checks after the final wrapping adjustment | **16 component tests and all 14 HQ2.1 Chrome tests passed again**; these are repeat checks, not additional unique tests. |
| `npm run typecheck` | Passed. |
| ESLint scoped to the ten changed TS/TSX production/test files | Passed without warnings; the final public-profile adjustment was also linted. |
| Tracked and new-file whitespace checks | Passed. |

Focused Vitest files:

```text
convex/companyHeadquarters.test.ts
convex/companyOnboardingGeography.test.ts
convex/companyProfileManagement.test.ts
convex/companyNamePrivacy.test.ts
convex/companyDiscovery.test.ts
convex/companyDirectoryGeography.test.ts
convex/companyCoverage.test.ts
convex/portfolio.test.ts
features/companies/company-profile-editor.test.tsx
features/companies/public-company-profile.test.tsx
features/companies/company-onboarding-geography.test.tsx
features/marketplace/company-identity-ui.test.tsx
```

The existing authorization/privacy suites cover owner membership, other roles,
inactive owners and public Company identity boundaries. The new backend cases
verify marker preloads, exactly two public headquarters keys, absence of private
address/commune/policy data, city-only fallbacks and clearing compatibility.

Chrome tests use real React components and app CSS, with Convex/auth/navigation
mocked and external browser requests blocked. The temporary runner
`/private/tmp/batiplus-hq21-playwright.config.cjs` started Next.js only in this
worktree, on loopback port 3100 with placeholder endpoints and server reuse
disabled. Browser saves never changed a live Company. There was no Convex watcher.

Both locales passed at **320px, 375px and 1280px** without horizontal overflow
in the page/dialog. Native labels, required states, dependency resets, Tab order,
visible save controls and all GEO1 province options were checked. Screenshots
were inspected for desktop and mobile; evidence is in the ignored
`test-results/hq21/` directory. Existing profile/settings and onboarding browser
regressions also passed. These are Chrome layout and browser component results,
not mobile-device/assistive-technology certification or authenticated E2E.

The runs emitted the existing Vite configuration notice and local placeholder
metadata/terminal-color warnings. These did not fail the selected checks.
The full repository suite was not run.

## Integration readiness and remaining limits

Uncommitted changes are ready for integration review at detached HEAD
`ef5e3bbb189bdf648c754678e0cc700e06c78c74`.
The two changed Convex readers must be synchronized through a separately
authorized deployment before development can display the new public fields and
the owner editor can preload the stored required-field marker. Older public
DTOs still render the saved city, and backend mutation enforcement remains in
place independently of frontend required-field hints.

Live owner edit/save/refresh, public DTO/privacy checks and deployed code parity
remain unverified for HQ2.1. The existing development policy setting was not
activated or changed. Stop after HQ2.1.
