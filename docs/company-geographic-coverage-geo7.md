# GEO7 — Nationwide Company coverage backend

1. **Status: PASS WITH ISSUES (local source verification).** GEO7 source behavior
   and the required regression checks pass. Live schema/index parity and deployed
   authorization/concurrency remain unverified; no release claim is made. Started
   clean on `feature/nationwide-project-intake` with GEO6.2B committed at
   `d9d98de0e2102e2046c51bb1b3d42851d0e24298`. Latest `origin/main` was verified
   read-only as `7e8400d559a7f070590395ce31828e420a581e51`. No Convex deployment
   watcher was running. Branch and HEAD remain unchanged, and the existing
   Next.js development server was preserved.

2. **Files changed (6).**

   - `convex/schema.ts`
   - `convex/companies/index.ts`
   - `lib/geography/company-coverage.ts` (new pure helpers)
   - `lib/geography/company-coverage.test.ts` (new)
   - `convex/companyCoverage.test.ts` (new)
   - `docs/company-geographic-coverage-geo7.md` (this report)

   Existing Company handlers and schema definitions are byte-identical to the
   baseline after removing the GEO7 additions. Fourteen protected baseline files,
   including Company access/directory/operational rules, public profiles, Project
   discovery, quotes, Deals, the catalogue/location model and FR/EN translations,
   retain their original hashes. No dependency or generated-file change.

3. **Coverage data model.** `companies.coverageScopeKeys` is an optional string
   array and the authoritative explicit declaration. `companyCoverageIndex`
   contains only `{ companyId, areaKey }` plus Convex system fields. It has exactly
   two compound indexes: `by_companyId_and_areaKey` and
   `by_areaKey_and_companyId`; there are no redundant single-field indexes.
   `MA` declares all Morocco, `R:09` all Souss-Massa, and `P:09.541` only
   Taroudannt. A province never declares the entire parent region. Multiple valid
   scopes, including overlaps, are retained in the caller's order. Each explicit
   scope gets one derived row; national and regional selections are never
   expanded. An absent array or `[]` means unconfigured. Saving `[]` explicitly
   persists that selection and clears this Company's derived rows.

4. **Scope-validation contract.** GEO1's Map lookups validate exact `MA`,
   `R:<known two-character region code>` and
   `P:<known six-character province/prefecture code>` identifiers. Leading zeros
   and punctuation are preserved. No trimming, case conversion, padding,
   administrative-name aliases, numeric conversion or legacy-city inference.
   Distinct overlapping scopes are accepted; duplicate identical keys are
   rejected. The maximum is derived from the catalogue: 1 country + 12 regions +
   75 provinces/prefectures = **88**. The helper checks array length before
   processing identifiers; Convex also validates the API's array/string shape.

   Semantic errors are `COMPANY_COVERAGE_LIMIT_EXCEEDED`,
   `INVALID_COMPANY_COVERAGE_SCOPE` and `DUPLICATE_COMPANY_COVERAGE_SCOPE`.
   Reading malformed, duplicate or oversized stored selections fails with
   `INVALID_COMPANY_COVERAGE_STATE`; it never treats corrupt state as nationwide.
   The TypeScript template type helps callers, while runtime catalogue validation
   remains authoritative.

5. **Private API.** Both functions are registered under `api.companies.index`.

   | Function | Arguments | Return |
   |---|---|---|
   | `getMyGeographicCoverage` | `{}` | Current explicit `string[]`, or `[]` for an old Company |
   | `updateMyGeographicCoverage` | `{ coverageScopeKeys: string[] }` | `null` |

   Both derive the Company from the authenticated User's membership; neither
   accepts a Company ID. The getter returns only validated keys, without Company,
   member, legal, contact or verification documents. It reads the authoritative
   array and performs no writes or automatic repair. The mutation validates the
   entire replacement before any coverage writes and updates only this Company's
   coverage field, its `updatedAt` when the ordered selection changes, and its
   derived rows.

6. **Atomic synchronization and idempotency.** One indexed Company-prefix read
   takes at most **89 rows**: the catalogue maximum plus a corruption sentinel.
   A Set difference deletes stale rows and duplicate pairs, retains one row per
   requested key, and inserts missing rows. An exact repeat retains all row IDs
   and the Company timestamp. Reordering updates the authoritative ordered array
   while retaining its existing rows. Even an unchanged array repairs bounded
   stale, invalid, duplicate or missing derived rows. Valid replacement can also
   repair a malformed stored array without changing historical profile fields.

   More than 88 existing derived rows fails with
   `COMPANY_COVERAGE_INDEX_CORRUPTED` before writing; the mutation never reconciles
   only a capped prefix or leaves an undetected tail. Such externally corrupted
   state requires a separately authorized repair, outside GEO7.

   Company/auth reads, the coverage range read and every write are in the same
   mutation. Convex's documented atomic transactions and serializable OCC retries
   support consistency under concurrent saves and permission changes; every retry
   runs authorization again. [Convex OCC and atomicity](https://docs.convex.dev/database/advanced/occ).
   Local simultaneous-update tests establish complete selections, pair uniqueness
   and Company isolation. Fault injection wraps the real mutation handler and
   native writer, forcing failure after deletions and partial insertions, or at
   the Company patch; the entire transaction rolls back. Installed convex-test
   serializes top-level transactions, so these tests do **not** reproduce live
   OCC conflicts or prove deployed retry behavior.

7. **Authorization and legacy compatibility.** The existing `requireOwnerCompany`
   guard requires a current Company User, exactly one active owner membership and
   an existing Company. Both new endpoints require Company onboarding to be
   completed, as existing profile management does. A pending User attached to a
   completed Company remains permitted by that existing profile guard; GEO7 adds
   no separate User-onboarding restriction. Anonymous, Client, SEO, admin, staff,
   inactive/revoked membership, missing entities and duplicate membership
   foundations are denied. Supplied Company IDs and other unexpected arguments
   are rejected by validators. Other Company owners can access only their own
   declarations.

   Verification and suspension do not block existing owner profile maintenance,
   so they do not block coverage edits. Their marketplace gates remain intact:
   suspended Companies stay out of the directory and cannot submit initial
   quotes; unverified Companies cannot submit initial quotes. Verified Companies
   can still quote projects with empty/unconfigured coverage or outside their
   declared areas. Membership revocation blocks new reads and saves without
   deleting stored history.

   Headquarters `city`, legacy `serviceAreas`, verification/legal records and
   directory search/eligibility fields are untouched by coverage saves. Legacy
   `updatePublicProfile` writes preserve the new field and its rows. Public
   Company profile/directory DTOs are unchanged. No Project geography, private
   location projection, messaging gate, OC3, Deal or commission business rule is
   changed. FR/EN and existing UI/SEO routes are preserved.

8. **Lookup strategy and pure matching.** Synchronization uses the Company prefix
   of `by_companyId_and_areaKey`. A future one-scope candidate lookup can use the
   `areaKey` prefix of `by_areaKey_and_companyId`. GEO7 provides the storage and
   verifies this prefix with in-memory fixtures; it adds no public matching query
   and scans no Company/Project collection in production coverage handlers.

   `companyCoverageIncludesProjectArea(coverageSet, projectArea)` validates a
   known, matching Moroccan region/province pair and checks `MA`, `R:<region>`
   and `P:<province>` using Set membership. Build the Set once per Company. Missing
   or mismatched administrative codes fail closed, including with `MA`. Legacy
   city labels are never consulted, and legacy service-area keys cannot match.
   This helper applies only to structured administrative areas; future handling
   of city-only records is a separate decision. It supplies no permission or
   eligibility and is not wired into proposal, invitation or discovery functions.

9. **Time/space complexity.** Catalogue validation uses average O(1) Map lookups.
   Validation and duplicate detection take O(S) time and space. With S requested
   scopes and C existing Company rows, reconciliation takes O(S + C) application
   time and space, with C bounded to 89 for detection and at most 88 for writes.
   Ordered-array equality costs O(S) when lengths match. The database cost
   includes membership reads, a Company fetch, one indexed coverage-range read,
   changed-row writes and at most one Company patch. No geographic expansion.
   A project match takes average O(1) time/space after O(S) Set construction.
   One-scope indexed candidate lookup targets O(log M + K), with M indexed rows
   and K returned rows; authorization/eligibility filtering adds work. This is
   not a guarantee for combined-scope Company directory pagination.

10. **Verification results.** Final focused run: **117 tests passed in 2 files**
    (54 pure-helper cases and 63 actual-backend cases). Broader run:
    **1,436 tests passed in 39 files**, including those 117. Company owner/profile,
    onboarding, verification, operational status, directory/admin and privacy
    regressions pass, as do GEO schema/intake/location/publication/discovery,
    proposals, quotes, invitations, messaging, OC3/alerts, coordination agreements,
    Deals/commissions and relevant UI projection regressions. All 23 required
    GEO7 test groups are covered. Final failures: **0**. TypeScript, scoped ESLint
    (zero errors/warnings) and `git diff --check` pass. Vite emits its existing
    future config-loader warning. Build and live/authenticated E2E were not run;
    the active Next development server was preserved.

    ```sh
    npm test -- --no-cache lib/geography/company-coverage.test.ts convex/companyCoverage.test.ts
    npm test -- --no-cache \
      lib/geography/company-coverage.test.ts convex/companyCoverage.test.ts \
      convex/companies.test.ts convex/companyProfileManagement.test.ts \
      convex/companyDiscovery.test.ts convex/companyOperationalStatus.test.ts \
      convex/companyVerification.test.ts convex/companyNamePrivacy.test.ts convex/admin.companies.test.ts \
      convex/projects.public-discovery.test.ts features/projects/public-project-geography.test.tsx \
      features/projects/public-project-browse.test.tsx convex/projects.test.ts components/home/marketplace-feed.test.tsx \
      convex/projects.marketplace-geography.test.ts features/projects/company-project-geography.test.tsx \
      convex/projects.marketplace.test.ts features/projects/company-project-marketplace.test.tsx \
      features/companies/company-dashboard-budget.test.tsx convex/projects.geography-schema.test.ts \
      convex/projects.location.test.ts convex/projects.structured-location.test.ts convex/projects.wizard-geography.test.ts \
      convex/projects.publication-geography.test.ts convex/quotes.test.ts convex/proposals.test.ts \
      convex/invitations.test.ts convex/messages.test.ts features/projects/project-location-rendering.test.tsx \
      features/quotes/company-initial-quote-workspace.test.tsx features/quotes/client-received-quotes.test.tsx \
      lib/geography/morocco.test.ts lib/geography/project-location.test.ts lib/errors/map-app-error.test.ts \
      convex/clientSupport.test.ts convex/clientSupportNotifications.test.ts \
      convex/coordinationAgreements.test.ts convex/deals.test.ts convex/finalQuotes.test.ts
    npm run typecheck
    npm run lint -- convex/schema.ts convex/companies/index.ts convex/companyCoverage.test.ts \
      lib/geography/company-coverage.ts lib/geography/company-coverage.test.ts
    git diff --check
    ```

11. **Remaining GEO8.1/GEO8.2 dependencies.** GEO8.1 must present explicit national,
    regional and provincial selections, support clearing/unconfigured state,
    explain retained overlaps, use the private API and localize UI/errors in
    FR/EN. Headquarters and legacy cities must remain separate. GEO8.2 must
    validate authoritative coverage and current Company eligibility when using
    candidate rows, and design combined result ordering, Company deduplication
    and correct continuation across national/region/province scopes. A Company
    can occur in multiple candidate ranges. This lookup table alone does not
    solve directory pagination; multiple native `.paginate()` operations in one
    Convex query are not an approved solution, as GEO0 established. Neither task
    is implemented or started here.

12. **Schema deployment and migration risks; stop at GEO7.** The optional Company
    field and empty new table support historical Companies without a backfill.
    No automatic headquarters/service-area conversion is warranted; declarations
    require explicit owner action. No live seed, migration, deployment, code
    generation, commit, push, merge or tag was performed. All fixtures were
    confined to convex-test's in-memory backend. Schema validation/index readiness,
    deployed code parity and authenticated live checks require separate
    authorization. Existing documents are validated when a changed schema is
    pushed. [Convex schema validation](https://docs.convex.dev/database/schemas#schema-validation).

    After coverage writes, a rollback must preserve the optional field and its
    stored data; removing it from the validating Company schema can reject
    records containing that field. Keep the new table/data available until any
    separately approved retirement plan. Dashboard/internal writes can bypass
    semantic validation and row synchronization: all future coverage writers must
    preserve the invariant, and corruption beyond the bounded repair needs an
    explicit operational plan. GEO6.2A's `search_marketplace_geography` index
    remains staged and unqueried. GEO7 ends at this handoff; wait for Product HQ
    approval before GEO8.1.
