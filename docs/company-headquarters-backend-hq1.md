# HQ1 — Nationwide Company Headquarters Backend

Status: **PASS for local implementation and verification**. HQ1 is complete in the working tree; deployment, live schema/code parity and authenticated deployment checks remain unverified. HQ2, HQ3 and GEO9 have not started.

## 1. Preparation and scope

- Branch: `feature/nationwide-project-intake`; starting and final HEAD: `4a5552e299a42be29a7a955c3304808160714aa8`.
- Read-only remote verification returned `origin/main` = `7e8400d559a7f070590395ce31828e420a581e51`. No fetch, checkout, commit, push, merge or tag was performed.
- The worktree was clean at HQ1 resumption. The previously reported change to `convex/projects.public-discovery.test.ts` was already in starting HEAD; its contents remain unchanged.
- Reviewed AGENTS.md, the complete nationwide geography specification, the HQ1 brief, Convex AI guidelines, GEO1 catalogue/helpers, Company schema/access/directory/onboarding/profile code, relevant tests and GEO8 reports.
- Product HQ's development audit reported 24 listed Companies, seven Agadir headquarters, zero structured coverage declarations and zero coverage-index rows. These are supplied audit findings, not fresh live measurements from this implementation.

## 2. Files changed

| File | Change |
| --- | --- |
| `convex/schema.ts` | Three optional Company headquarters strings. |
| `convex/companies/index.ts` | Optional snapshot on two existing mutations; headquarters preload on two owner-private queries. |
| `lib/geography/company-headquarters.ts` | Pure snapshot validation/normalization and private DTO projection. |
| `convex/companyHeadquarters.test.ts` | 114 focused tests using actual backend handlers. |
| `docs/company-headquarters-backend-hq1.md` | This handoff. |

No UI, translations, generated API files, dependencies, geography catalogue, public DTOs, directory matching or coverage handlers were changed.

## 3. Schema and mutation contracts

The existing `companies` table retains `city: v.optional(v.string())` and gains:

```typescript
headquartersRegionCode: v.optional(v.string()),
headquartersProvinceCode: v.optional(v.string()),
headquartersCommune: v.optional(v.string()),
```

Both `companies.index.completeOnboarding` and `companies.index.updatePublicProfile` now accept:

```typescript
headquarters?: {
  regionCode: string | null;
  provinceCode: string | null;
  communeName: string | null;
}
```

- Omission preserves all existing headquarters fields.
- All three values `null` clears the three optional stored fields. Convex patch removal uses `undefined`; `null` is never stored in them.
- A supplied location needs a valid region and its matching province; commune is optional. Blank commune with a valid pair clears only the commune.
- The object is a complete snapshot: outer `null`, missing properties, numeric codes, extra address/country properties and arbitrary Company IDs are rejected by argument validators.
- Validation completes before any service or Company writes. Existing mutation return contracts are unchanged.
- Morocco remains fixed for V1. No country field, table, index, migration or backfill was added.

## 4. GEO1 validation and text rules

Validation reuses `validateAdministrativePair` from the verified `hcp-rgph-2024-v1` catalogue. Known codes and region/province parent relationships are mandatory. Codes are matched exactly, including leading zeros and punctuation; names, padded codes and codes inferred from city are not accepted.

Commune uses the existing shared location-text normalizer after rejecting all Unicode `Cc` control characters, including tabs, CR and LF. The shared normalizer also rejects bidi embedding/isolate controls U+202A–U+202E and U+2066–U+2069. It trims/collapses Unicode whitespace and preserves spelling, case, accents, Arabic and Tifinagh. The maximum is **100 UTF-16 code units after normalization**, matching the existing location-text contract. There is no village/commune database lookup or geocoding.

New domain errors:

```text
COMPANY_HEADQUARTERS_REGION_REQUIRED
COMPANY_HEADQUARTERS_PROVINCE_REQUIRED
INVALID_COMPANY_HEADQUARTERS_REGION
INVALID_COMPANY_HEADQUARTERS_PROVINCE
COMPANY_HEADQUARTERS_PROVINCE_REGION_MISMATCH
INVALID_COMPANY_HEADQUARTERS_COMMUNE
```

## 5. Onboarding compatibility

Older callers remain valid without `headquarters`; no region/province requirement was introduced for new onboarding. Existing required city normalization, service selection/catalogue behavior, active-owner authorization, verification-draft guard, Company completion and User completion remain in place. Valid structured headquarters can be saved in the same existing transaction. Supplied location data does not infer coverage or modify legacy service areas.

## 6. Profile updates and private preloads

The active owner can update headquarters alone or alongside existing allowed profile fields. Company onboarding must still be completed. Omitted city and other profile fields remain preserved; explicitly supplied city retains its existing normalization. Existing explicit legacy `serviceAreas` updates remain unchanged and separate from headquarters.

`getOnboardingProfile` and `getProfileManager` now always include `headquarters` with exactly three nullable keys matching the input snapshot. Missing stored fields read as `null`. The projection reads only the Company's three headquarters fields. The existing authorized private `legal.address` section in the profile manager is preserved; it is never a headquarters fallback. No public Company profile/directory headquarters projection was introduced.

## 7. Authorization and privacy

Both mutations retain `requireOwnerCompany`, deriving Company identity from the authenticated current Company's single active owner membership. Tests deny anonymous, Client, admin, SEO, staff, inactive/revoked owners, missing/duplicate memberships, deleted Users/Companies, foreign Company IDs and forged coverage arguments. Anonymous onboarding preload retains its existing `null` behavior; other unauthorized private reads fail closed.

Completed Company onboarding remains the profile guard; a pending User with a completed Company retains existing profile access. Profile maintenance remains available across existing verification/operational statuses, including suspension; it does not change verification, suspension, public listing eligibility or marketplace availability. Legal verification records and portfolio locations are unchanged. Tests compare public directory/profile output before and after private headquarters edits.

## 8. Coverage independence and source preservation

Tests save and clear headquarters with absent, empty, national, regional and province coverage. Stored coverage arrays and complete coverage-index records, including IDs, remain unchanged. Stale/duplicate index rows are also preserved without implicit repair. An Agadir Company with `coverageScopeKeys: []` remains absent from Souss-Massa/Agadir coverage searches. Headquarters in region 09 does not replace independently declared region 01/province 01.511 service coverage.

The existing GEO7 coverage reader/writer block is byte-for-byte unchanged. SHA-256 comparisons confirm all 13 protected baseline files outside the two edited production files are unchanged, including access, directory, operational status, portfolio, quotes, deals, GEO1 data, coverage/text helpers, FR/EN and the previously reported project test. Removing only the four additive schema lines reproduces the exact original schema, confirming no table/index/other validator change. Git diff contains no unrelated source changes.

## 9. Local verification

- Baseline Company/GEO7/GEO8 regressions: **124 tests in five files passed** before edits.
- Focused HQ1 suite: **114 tests passed**.
- Final HQ1 plus relevant regressions: **1,375 tests across 46 files passed**. This includes Company onboarding/profile, verification, operational status, authorization, directory/GEO7/GEO8, portfolio/logo/cover moderation, privacy, proposals, quotes/final quotes, invitations, marketplace/operational/support messaging, support alerts/coordination agreements, Deals and commissions/settings, notifications and existing Company UI/geography tests.
- `npm run typecheck`: passed.
- `npm run lint -- convex/schema.ts convex/companies/index.ts convex/companyHeadquarters.test.ts lib/geography/company-headquarters.ts`: passed without warnings.
- `git diff --check` and new-file whitespace checks: passed.

The focused suite includes invalid snapshots without partial writes, other invalid fields with valid headquarters, and fault injection immediately after the real Company patch to verify rollback of both Company and preceding service writes. Concurrent calls verify complete snapshots and coexistence with explicit coverage edits in the local emulator. These are local convex-test results, not live OCC contention or authenticated browser/deployment evidence.

The only test-run warning was the existing Vite notice about future native config loading of `vitest.config.ts`; all selected suites passed.

Reproduce the combined run:

```sh
npm test -- --no-cache \
  convex/companyHeadquarters.test.ts \
  convex/companies.test.ts \
  convex/companyProfileManagement.test.ts \
  convex/companyCoverage.test.ts \
  convex/companyDiscovery.test.ts \
  convex/companyDirectoryGeography.test.ts \
  convex/companyOperationalStatus.test.ts \
  convex/companyVerification.test.ts \
  convex/companyNamePrivacy.test.ts \
  convex/admin.companies.test.ts \
  convex/admin.verification.test.ts \
  convex/portfolio.test.ts \
  convex/companyLogos.test.ts \
  convex/companyCovers.test.ts \
  convex/portfolioImages.test.ts \
  convex/auth.security.test.ts \
  convex/proposals.test.ts \
  convex/quotes.test.ts \
  convex/finalQuotes.test.ts \
  convex/invitations.test.ts \
  convex/messages.test.ts \
  convex/clientSupport.test.ts \
  convex/clientSupportNotifications.test.ts \
  convex/coordinationAgreements.test.ts \
  convex/adminCompanyMessaging.test.ts \
  convex/deals.test.ts \
  convex/marketplaceSettings.test.ts \
  convex/notifications.test.ts \
  lib/geography/morocco.test.ts \
  lib/geography/company-coverage.test.ts \
  lib/geography/coverage-selection.test.ts \
  lib/geography/coverage-labels.test.ts \
  lib/geography/directory-coverage.test.ts \
  features/companies/lib/directory-geography.test.ts \
  features/companies/geographic-coverage-editor.test.tsx \
  features/companies/company-directory-geography.test.tsx \
  features/companies/company-onboarding-services.test.tsx \
  features/companies/company-onboarding-route.test.tsx \
  features/companies/company-profile-editor.test.tsx \
  features/companies/public-company-profile.test.tsx \
  features/companies/company-directory.test.tsx \
  features/companies/company-directory-state.test.tsx \
  features/companies/company-verification-screen.test.tsx \
  features/companies/company-owner-logo-manager.test.tsx \
  features/companies/company-owner-cover-manager.test.tsx \
  features/marketplace/company-identity-ui.test.tsx
```

## 10. Complexity

The GEO1 Maps give average O(1) region/province lookups and parent checks. Commune control checks/normalization take O(L) time and O(L) temporary string space for input length L; stored normalized text is capped at 100 code units. The nullable three-field projection and snapshot patch are O(1).

HQ1 adds **zero database reads and zero separate writes**: its three fields join the existing Company patch. Existing indexed owner/service reads and service reconciliation remain unchanged, including their current caps and slug-creation behavior. No Company-wide scan, coverage lookup/write, geocoding, GPS/map API or dependency was added.

## 11. Watcher and deployment status

The earlier audit identified repository Convex development watcher PIDs `56921` and `56940`. After Product HQ authorized SIGTERM, the identity recheck found both already absent, so **no signal was sent and no process was terminated by this implementation**. No Convex dev/deploy process was present at resumption, before Convex edits or at the final process check. No automatic restart was observed. The repository's existing Next.js development server, PID `7559`, remained running and was not stopped.

No Convex watcher was restarted. No development/production deployment, live mutation, migration, codegen command, commit, push, merge or tag was performed for HQ1. Historical deployment activity before this resumed implementation was not audited; this is not a claim about it.

A separately authorized rollout must deploy the additive optional schema and updated existing functions together to the intended deployment, verify schema/code parity and check old/new owner calls plus coverage/public privacy there before frontend integration relies on the contract. Existing city-only Companies need no data migration/backfill and HQ1 introduces no index rollout. If rollback is needed after headquarters values exist, retain the optional schema fields until stored data is handled through a separately approved plan.

## 12. Remaining Product HQ dependencies

- **HQ2:** Owner/onboarding controls and preloads, FR/EN error handling and responsive UI; the policy making region/province mandatory for all new onboarding remains OPEN and needs Product HQ approval. Morocco stays fixed without a country selector.
- **HQ3:** Future public headquarters presentation subject to Product HQ decisions, legacy city-search semantics and any legacy service-area editor retirement. These remain outside HQ1.
- The supplied audit's zero declared coverage remains a separate service-coverage configuration issue. Headquarters must never populate coverage automatically.
- Development/production deployment and live verification require separate authorization. Stop after HQ1 for Product HQ review; do not begin HQ2, HQ3 or GEO9.
