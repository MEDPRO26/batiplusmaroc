# GEO6.2A — Company text search and relevance pagination

1. **Status: PASS WITH ISSUES (source only).** The unbounded GEO6.1 text-search
   intersection is removed. Geographic equality optimization is prepared but
   awaits an authorized staged-index rollout and query promotion. No live index,
   latency, production ranking or authenticated browser verification is claimed.
   Started clean on `feature/nationwide-project-intake`, GEO6.1 commit
   `46983564f5a8cf44a373a14697f3bcf4fd496afc`. Latest `origin/main` was verified
   read-only as `7e8400d559a7f070590395ce31828e420a581e51`; no Convex watcher was
   running. Branch and HEAD remain unchanged.

2. **Files changed (9).**

   - `convex/projects/marketplace.ts`
   - `convex/schema.ts`
   - `features/projects/components/company-project-marketplace.tsx`
   - `features/companies/components/company-dashboard.tsx`
   - `messages/en.json`
   - `messages/fr.json`
   - `convex/projects.marketplace-geography.test.ts`
   - `features/projects/company-project-geography.test.tsx`
   - `docs/company-project-search-geo62a.md` (this report)

3. **Index/query architecture.** Active searches paginate `search_marketplace`
   directly. Its definition, including legacy `budgetRange`, remains unchanged.
   A separate `search_marketplace_geography` uses the existing search-text field
   and eight equality fields: status, visibility, region, province, city, primary
   category, timeline and property type. It is declared `staged: true`; no source
   query uses it. Convex 1.46.0 excludes staged indexes from queryable DataModel
   types. Schema serialization and a compile-time assertion verify these boundaries.
   The search-text builder and historical documents are unchanged.

4. **Ordering and UI.** Nonblank normalized search takes native relevance
   precedence over every accepted `sortBy`, including geographic searches. Empty
   or whitespace-only search retains the existing indexed newest/oldest paths.
   Both Company feeds display “Most relevant” / “Plus pertinents” when the
   debounced query has text. The marketplace remembers its chronological choice;
   clearing text restores it. The dashboard restores its existing recent feed.
   Geography and other selections are retained. Existing responsive controls and
   pagination hooks remain in place; ordering labels use polite live regions.
   Native relevance order is Convex's contract. [Full-text search documentation](https://docs.convex.dev/search/text-search).

5. **Pagination.** One native `.paginate(args.paginationOpts)` processes each
   nonempty query. Eligibility and residual predicates run before pagination;
   there is no search iteration, matching-ID array, ID disjunction, candidate cap
   or local date sort. Full options reach the native method, including cursor,
   endCursor, id and row/byte limits; metadata survives DTO projection. Tests
   exhaust 251- and 1,205-project fixtures, including sparse matches and empty
   split pages, without loss or duplicates. UI tests exercise actual input
   handlers and changed query arguments; the installed `usePaginatedQuery`
   resets on argument changes. Previously issued chronological-search cursors
   may become invalid when this query is deployed; the hook also resets on
   InvalidCursor. Custom callers must restart with `cursor: null` in that case.

6. **Geographic efficiency.** Until promotion, text + region/province are
   residual predicates on the compatibility search index. Single category,
   timeline, property type and legacy city already use indexed equalities.
   The prepared index can narrow geography and these scalar dimensions together
   after activation and a query change. Multiple selected values, surface/date
   ranges and completeness checks still require residual predicates. Native
   search supports chained equalities, not arbitrary OR/range search filters;
   residuals examine candidates one by one. [Search filter documentation](https://docs.convex.dev/search/text-search).

7. **Security/privacy.** Existing current Company role, membership and onboarding
   checks still precede geographic validation. Negative tests cover anonymous,
   Client, admin, SEO, revoked membership, changed role and incomplete onboarding,
   with and without text. Only published marketplace projects enter discovery.
   Tests verify the four-field general location allowlist and exclusion of private
   locality, neighborhood, contact, files and invite-only/nonpublished records.
   Legacy city filters, city-only All Morocco records and structured-marker
   behavior are retained; reads leave history untouched. Proposal eligibility,
   invitation/messaging gates, OC3, Deals and commissions are unchanged.

8. **Complexity/cost limits.** Administrative validation retains average O(1)
   map lookups. Suitable geographic browsing retains its approximate O(log N + K)
   target; combined residual filters can read more than K records. Application
   page/DTO memory is O(K), plus bounded filter processing, instead of O(M)
   matching-ID/expression materialization. Native search processing and examined
   candidates have additional cost; each card also reads its Client summary.
   Common terms with rare geography can still scan many candidates or hit limits
   before index promotion. No universal text-search complexity bound is claimed.
   Current docs specify 16 search terms, 8 filter expressions, 16 indexed filter
   fields, 32 total indexes per table and up to 1,024 search results scanned per
   query. Pagination is not an application-wide 1,024-result cap. Search billing
   counts full index size per query, even with equality filters. The extra index
   also adds storage/update cost. [Search limits and costs](https://docs.convex.dev/search/text-search).

9. **Verification.** 121 focused tests passed in six files. The final broader run
   passed **828 tests in 21 files**, including GEO6.1, geography/schema/location,
   publication, quotes, invitations, messaging, support/alerts, coordination
   agreements and Deals. Typecheck, scoped ESLint and `git diff --check` passed.
   Nine cases were added to the GEO6.1 backend/UI suites; chronological-search
   expectations were updated to the approved relevance policy. A dynamic native
   query guard rejects search streaming and verifies one paginate call, complete
   options and native order across all `sortBy` values. convex-test does not model
   production BM25 scoring or prove live search-limit behavior; the 1,205 fixture
   proves cursor traversal in the emulator. UI checks are server-rendered with
   mocked Convex hooks, not browser E2E, screen-reader or layout measurements.
   Vite emits its existing future config-loader warning; checks exit successfully.

   ```sh
   npm test -- --no-cache \
     convex/projects.marketplace-geography.test.ts features/projects/company-project-geography.test.tsx \
     convex/projects.marketplace.test.ts features/projects/company-project-marketplace.test.tsx \
     features/companies/company-dashboard-budget.test.tsx convex/projects.geography-schema.test.ts \
     convex/projects.location.test.ts convex/projects.publication-geography.test.ts \
     convex/quotes.test.ts convex/invitations.test.ts convex/messages.test.ts \
     features/projects/project-location-rendering.test.tsx \
     features/quotes/company-initial-quote-workspace.test.tsx features/quotes/client-received-quotes.test.tsx \
     lib/geography/morocco.test.ts lib/geography/project-location.test.ts lib/errors/map-app-error.test.ts \
     convex/clientSupport.test.ts convex/clientSupportNotifications.test.ts \
     convex/coordinationAgreements.test.ts convex/deals.test.ts
   npm run typecheck
   npm run lint -- convex/projects/marketplace.ts convex/schema.ts \
     convex/projects.marketplace-geography.test.ts \
     features/projects/components/company-project-marketplace.tsx \
     features/companies/components/company-dashboard.tsx features/projects/company-project-geography.test.tsx
   git diff --check
   ```

10. **Later activation requirements.** In a separately authorized rollout, deploy
    the staged addition while queries still use the compatibility index; wait for
    and verify completed backfill. A subsequent authorized deployment must remove
    `staged: true` and promote the geographic search query to that enabled index,
    adding region/province equalities and preserving supported scalar equalities.
    Keep the old index and its budget compatibility. Verify enabled-index/code
    parity, native relevance/cursors, sparse read costs and privacy in the target
    deployment. This task neither enables the index nor implements the future
    promoted query. [Staged-index rollout documentation](https://docs.convex.dev/database/reading-data/indexes#staged-indexes).

11. **GEO6.2B readiness.** Ready for Product HQ source review and a separate
    GEO6.2B assignment. Public discovery, general geographic search-text changes,
    historical reconciliation and release verification remain outside this task.
    No deploy, migration, live seed, Git mutation, commit, push, merge or tag was
    performed. GEO6.2B/GEO7 have not started. Stop here for Product HQ review.
