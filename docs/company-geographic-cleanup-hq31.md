# HQ3.1 — Company geographic cleanup

**Result: PASS WITH ISSUES.** Both assigned changes pass local verification.
Deployment parity and authenticated integration remain unverified; one focused
run emitted scheduled-function teardown diagnostics described below. No release
or production-scale performance claim is made.

## Worktree and scope

Work took place only in
`/Users/yassin/.codex/worktrees/e332/batiplusmaroc`, on 2026-10-09.
The initial worktree was clean at detached HEAD `7e8400d`. As explicitly
instructed, it was switched to detached
`a43a0feecbad22b6cd1a3ae971cd6fefcb4dca58` before editing. That remains HEAD.
`feature/nationwide-project-intake` also remains at that commit; its checkout
and branch were not changed. The local `origin/main` ref is `7e8400d`; no fetch
or pull was performed, so this is not a fresh remote verification.

Read AGENTS.md, Convex AI guidelines, installed Next.js server/client guidance,
and the tracked GEO7/GEO8.1/GEO8.2A/GEO8.2B/HQ2.1 handoffs. The ignored nationwide
specification was absent; tracked implementation and handoffs were used as the
assignment permits. Next.js rewrote its managed AGENTS.md block during browser
testing; that incidental edit was restored to the baseline afterward.

No Convex watcher, deployment, code generation, migration, policy activation,
commit, push or merge was performed. HQ3.2, GEO9.2 and GEO10 were not started.

## Files changed

| File | Change |
| --- | --- |
| `convex/companies/directory.ts` | Match headquarters against the actual city on each native page. |
| `convex/portfolio/index.ts` | Add validated coverage keys to the existing public allowlist. |
| `features/companies/components/company-coverage-label.tsx` | Shared coverage labels and native disclosure, extracted from the directory. |
| `features/companies/components/company-directory.tsx` | Use the shared display; keep filters and continuation behavior. |
| `features/companies/components/public-company-profile.tsx` | Replace historical areas with a dedicated declared coverage section. |
| `messages/en.json`, `messages/fr.json` | Add only `publicCompany.declaredCoverage`, one string per locale. |
| `convex/companyDirectoryGeography.test.ts` | Headquarters, combined filters, legacy and sparse pagination regressions. |
| `convex/portfolio.test.ts` | Coverage validation, public allowlist and read-only behavior tests. |
| `convex/companyCoverage.test.ts` | Adapt four existing compatibility cases for the newly public declaration. |
| `features/companies/public-company-profile.test.tsx` | FR/EN scope presentation, fallback and non-inference tests. |
| `tests/e2e/company-profile-coverage.spec.ts` | New browser component coverage, wrapping and keyboard checks. |
| `tests/e2e/company-profile-headquarters.spec.ts` | Update public-section assertions and retain headquarters regressions. |
| `docs/company-geographic-cleanup-hq31.md` | This handoff. |

Fourteen files total. Translation files are an integration overlap with Agent B:
merge the single additive key in each locale without replacing other changes.
No Admin geography file was edited.

## Headquarters-city search

The city argument no longer becomes a token in `directorySearchText`, which
combines Company name, city, historical service areas and service terms.
Headquarters matching now checks only `company.city`, with the existing trim,
whitespace-collapse, NFKC and lowercase conventions. It is a normalized
substring match, compatible with free-text cities and localities. It does not
write or normalize stored historical data.

An Agadir headquarters matches Agadir. A Rabat headquarters does not match
because its name contains Agadir or its historical service areas include Agadir.
A legacy city-only Company remains searchable even without directory search
text. The main text search retains its original indexed fields and tokens.

Without text or service terms, the existing eligibility indexes provide
newest/oldest order. With text or service terms, the existing search indexes
retain their relevance order. City filtering preserves a subsequence of that
source order. Verification, service membership, suspension, listing and
onboarding rules are unchanged. Region/province matching still uses explicit
coverage, independently of headquarters.

## Pagination and performance

Each request consumes one existing indexed native page, then checks its city
and coverage fields before public DTO hydration. No unbounded collection,
multi-page backend loop, fixed candidate cap or first-page-only filtering was
added. The directory cursor wrapper, geographic fingerprint and native
pagination options/boundaries remain intact. `isDone`, continuation and split
metadata come from the native source even when all candidates on a page are
excluded.

The UI retains GEO8.2B's automatic advancement limit of four empty pages and
its available Load more control. It shows the exhausted empty state only at
`Exhausted`. This lets later matches remain reachable without an indefinite
automatic request loop.

Sparse cities can require several bounded requests, just as sparse geographic
coverage does. There is no city index lookup and no O(log N) city-search claim;
walking the entire directory can require O(N) candidates across requests.
Two new 251-Company cases verify both sort directions, empty intermediate
pages, later matches, exact retries, native end boundaries and a one-row read
limit. The existing 251-Company GEO8.2A.1 case also passes.

**Schema/index blocker: none for this bounded continuation design.** No schema,
index, backfill or Company coverage mutation change is required or included.

## Public coverage, legacy data and privacy

`getPublicCompanyProfile` adds only `coverageScopeKeys: string[]` to its
explicit return validator and projection. It reuses `publicCoverageScopeKeys`
on the authoritative Company document. Missing, empty, unknown or duplicate
declarations return `[]`; stale derived index rows cannot supply coverage.
Valid overlapping selections retain their order.

The profile reuses the directory's GEO1 labels and disclosure:

- `MA`: All Morocco / Tout le Maroc.
- `R:`: the entire named region.
- `P:`: the exact named province or prefecture, with FR/EN wording.
- Empty/invalid declarations: Coverage not declared / Couverture non déclarée.
- More than two scopes: a keyboard-operable native disclosure with all names.

Coverage carries no verification badge or claim. Headquarters and historical
service areas never create or expand it. Historical `serviceAreas` remain
stored, available in the existing DTO and editable through the existing owner
editor; they are no longer presented on the public profile as current coverage.
This task does not retire that editor or convert any Company's declaration.

The reader does not spread Company documents or expose members, commune text,
legal addresses, verification records, private contacts or policy markers.
Tests assert its exact public key set, private-field exclusion and unchanged
stored state. Existing owner/staff, other-role, inactive-membership, Company
isolation, identity masking and suspension regressions pass. Schema, coverage
mutations/index synchronization, onboarding, marketplace gates, Project
privacy, messaging, OC3, Deals and commissions remain unchanged in source.

## Verification

| Check | Result |
| --- | --- |
| Focused Vitest backend, component and privacy regressions | **483 passed across 16 files**, zero failed assertions; includes **31 new cases**. |
| Chrome browser component checks | **20 passed across two files**: 16 new coverage cases and four existing public headquarters cases. |
| `npm run typecheck` | Passed, exit 0. |
| ESLint on all 11 changed TS/TSX production/test files | Passed without warnings, exit 0. |
| Tracked and new-file whitespace checks | Passed. |

Vitest files:

```text
convex/companyDiscovery.test.ts
convex/companyDirectoryGeography.test.ts
convex/companyCoverage.test.ts
convex/companyHeadquarters.test.ts
convex/companyProfileManagement.test.ts
convex/companyNamePrivacy.test.ts
convex/companyOperationalStatus.test.ts
convex/portfolio.test.ts
features/companies/public-company-profile.test.tsx
features/companies/company-directory-geography.test.tsx
features/companies/company-directory.test.tsx
features/companies/company-directory-state.test.tsx
features/companies/lib/directory-geography.test.ts
lib/geography/directory-coverage.test.ts
lib/geography/coverage-labels.test.ts
features/marketplace/company-identity-ui.test.tsx
```

FR and EN passed at **320px, 375px and 1280px** without page or coverage-section
horizontal overflow. Browser checks include native disclosure focus/Enter,
province-only wording, absent/invalid keys, independent headquarters and
private-field exclusion. French mobile and English desktop screenshots were
visually inspected. Screenshot evidence is under ignored `test-results/hq31/`.

The temporary `/private/tmp/batiplus-hq31-playwright.config.cjs` starts Next.js
only in this worktree at loopback port 3103, with placeholder endpoints and
server reuse disabled. Components and CSS are real; Convex/auth/navigation are
mocked and external browser requests are blocked. The test server exited after
the checks. These are browser component results, not authenticated E2E or a
mobile-device/accessibility certification. No full repository suite was run.

The first runs found and corrected new fixture/order expectations, four older
public-coverage contract assertions and one expected catalogue spelling; final
checks above passed. Vite emitted its existing config-loader notice. The final
Vitest run also emitted `EnvironmentTeardownError` diagnostics for
`notifications/pushDelivery:deliverMarketplacePush`, scheduled by the existing
quote compatibility checks. All 483 assertions passed and the process exited 0;
scheduled push delivery is not verified by this result. Notification source was
not changed. Browser runs emitted placeholder metadata and terminal-color
warnings without failing the checks.

## Integration readiness

Uncommitted HQ3.1 changes are ready for Product HQ review at detached
`a43a0feecbad22b6cd1a3ae971cd6fefcb4dca58`. Review the two minimal locale-key
overlaps during integration. The two changed Convex readers require separately
authorized synchronization before deployed behavior can be claimed. An older
public profile DTO safely renders the undeclared fallback, but it cannot show
stored declarations until the reader is synchronized. Deployment/schema parity,
authenticated live reads and production-scale costs remain unverified.

Stop after HQ3.1; no commit or integration was performed.
