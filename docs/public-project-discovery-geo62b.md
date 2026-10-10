# GEO6.2B — Nationwide public project discovery

1. **Status: PASS WITH ISSUES (local source verification).** Public browsing now
   uses geographic filters and native pagination. Source tests pass; sparse text
   search still has geographic residual costs and live deployment/index parity
   remains unverified. Started clean on `feature/nationwide-project-intake`, with
   GEO6.2A committed at `15142561a8e0ab04339565bc6cbd7238f71165fe`. Latest
   `origin/main` was verified read-only as
   `7e8400d559a7f070590395ce31828e420a581e51`. No Convex deployment watcher was
   running. Branch and HEAD remain unchanged.

2. **Files changed (8).**

   - `convex/projects/index.ts`
   - `convex/projects.public-discovery.test.ts` (new)
   - `features/projects/components/public-project-browse.tsx`
   - `features/projects/public-project-browse.test.tsx`
   - `features/projects/public-project-geography.test.tsx` (new)
   - `messages/en.json`
   - `messages/fr.json`
   - `docs/public-project-discovery-geo62b.md` (this report)

3. **Public-query contract.**
   `api.projects.index.listPublicProjectsPaginated` accepts native
   `paginationOpts` and optional `regionCode`, `provinceCode`, `category`,
   `search`, `sortBy` (`newest` or `oldest`). Anonymous access is intentional;
   signed-in roles receive the same public projection. The result retains native
   `page`, `continueCursor`, `isDone`, `splitCursor` and `pageStatus`. Each row
   explicitly contains only `id`, `title`, `description`, `city`, `location`,
   `primaryCategory`, `timeline`, `publishedAt`, `thumbnailUrl`. Completeness
   matches the old API: nonempty title/description and a primary category;
   historical timeline and publication date may be null. Geographic errors are
   `INVALID_PROJECT_REGION`, `INVALID_PROJECT_PROVINCE`,
   `PROJECT_REGION_REQUIRED`, `PROJECT_PROVINCE_REGION_MISMATCH`.

4. **Geographic query strategy.** Every source restricts status to `published`
   and visibility to `marketplace`. Without text, precedence is the existing
   province index, region index, category index, then global published-date
   index. Geographic equality prefixes narrow candidates. Remaining category,
   parent consistency and completeness predicates precede pagination. With text,
   the active `search_marketplace` supplies indexed status/visibility/category
   equalities; region/province remain residual predicates. No schema, index,
   catalogue or shared geographic component changes were needed.

5. **Ordering and search scope.** Blank/whitespace-only text browses native
   publication-date order, newest by default or oldest when selected, including
   native tie handling. Nonblank normalized text uses native relevance regardless
   of `sortBy`; pages are never reordered locally. The UI remembers the browsing
   sort and restores it when text is cleared. The unchanged builder indexes
   title, category terms/custom category and historical city, not description or
   structured administrative names. Search copy therefore describes title and
   category. Private locality, neighborhood and address are never added to search
   text. Geographic selection works independently of administrative-name text
   indexing. [Native text-search behavior](https://docs.convex.dev/search/text-search).

6. **Pagination verification.** The new query makes one native paginate call and
   passes the entire options object, including end cursor, id and row/byte
   limits. It applies no application candidate cap, search streaming, matching-ID
   intersection or post-pagination filter. Tests traverse 301 records and sparse
   matches without omissions/duplicates, reach 31 eligible rows beyond 45
   incomplete leading candidates, and verify date order, end cursors and split
   metadata. A native-query guard checks index choice, complete options, native
   search order and one paginate call. Public browsing uses `usePaginatedQuery`
   with 12 initially requested items and Load More. Changed filter/search/sort
   arguments reset the native hook; tests replay rendered handlers and assert
   those changed arguments. Empty intermediate pages retain continuation copy
   and Load More until exhausted. [Native pagination contract](https://docs.convex.dev/database/pagination).

7. **Historical compatibility.** All Morocco includes city-only, rural,
   structured-only, mixed and cleared structured-mode projects. The persistent
   structured marker suppresses stale city display even when new fields were
   cleared. No codes are inferred from historical cities and no records are
   rewritten. City-only records need reviewed mapping before structured filters
   can find them. Eligible records missing search text remain visible in non-text
   browsing. The old `listPublicProjects` remains unchanged with its bounded
   array contract for existing preview callers; the public browse page no longer
   uses that 24-candidate API. `getPublicProject` remains unchanged.

8. **Privacy and authorization.** The GEO3 general projection allows only
   region, province, commune and active legacy city. The new DTO also nulls its
   compatibility `city` for structured intent. Tests exclude private locality,
   neighborhood, Client identity/contact and attachment fields; the query does
   not fetch Client summaries or project attachments. Existing safe thumbnail
   lookup is reused. Anonymous and Client/Company/admin/SEO identities see the
   same DTO. Draft, pending-review, other nonpublished, incomplete and invite-only
   records are excluded. Company discovery still rejects unauthenticated users;
   its full authorization regression suite passes. Publication, wizard, support,
   agreements, proposals, messaging, Deals and commissions are unchanged.

9. **FR/EN and responsive UX.** Existing branding, row/preview layout and CTA
   routing are retained. Shared GEO6.1 controls provide all 12 canonical regions,
   localized names and dependent provinces on desktop and mobile. Region changes
   clear the province and preserve search/category; province changes retain the
   parent. Categories use separate desktop/mobile radio groups. Counts describe
   loaded rows. Loading, continuation, exhausted and empty copy, chronological
   controls and relevance labels are translated. Native labels, disabled province
   hints, visible focus styles and polite/busy announcements are tested. The
   mobile filter dialog adds initial focus, Tab containment, Escape dismissal and
   focus restoration. Query errors reach the existing localized route fallback
   with retry; error content stays out of rendered copy. Proposal CTAs retain
   signup, Company onboarding and workspace routing. Browser focus, screen-reader
   behavior and measured mobile layout remain unverified.

10. **Exact local checks.** Focused: **56 tests passed in 3 files** (33 new
    backend cases, 16 new UI cases, 7 existing public-browse cases). Broader:
    **900 tests passed in 26 files**, covering geography/schema/location, Company
    discovery, publication, quotes, invitations, messaging, OC3/alerts,
    coordination agreements, Deals and the unchanged homepage feed. Typecheck,
    scoped ESLint (zero errors/warnings) and `git diff --check` pass. Vite emits
    its existing future config-loader warning. Production build was skipped
    because a Next.js development server is active. No deployment, code
    generation, live seed, migration or Git mutation was performed.

    ```sh
    npm test -- --no-cache \
      convex/projects.public-discovery.test.ts features/projects/public-project-geography.test.tsx \
      features/projects/public-project-browse.test.tsx convex/projects.test.ts components/home/marketplace-feed.test.tsx \
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
    npm run lint -- convex/projects/index.ts convex/projects.public-discovery.test.ts \
      features/projects/components/public-project-browse.tsx features/projects/public-project-browse.test.tsx \
      features/projects/public-project-geography.test.tsx
    git diff --check
    ```

    convex-test does not model production BM25 scores or prove live search limits.
    Its search implementation errors on an absent search-text field; the genuine
    missing-field fixture is therefore verified through non-text browsing, while
    search tests use indexed fixtures. Split cursors can be null for a one-row
    emulator split; tests cover null and populated metadata. UI tests use server
    rendering and mocked Convex hooks; they verify handlers/arguments, not actual
    browser debounce timing or hook subscriptions. No live/public or authenticated
    E2E claim is made.

11. **Complexity and search costs.** GEO1 validation retains average O(1) map
    lookups; province options take O(K) for the selected region's children.
    Suitable geographic index paging targets approximately O(log N + K), where
    N is table size and K is returned rows. Completeness and combined residual
    filters can examine more than K candidates. Normalization is O(L) in input
    length. Server page projection uses O(K) application memory, excluding native
    search processing; the browser accumulates O(R) loaded rows. Each card also
    performs the existing indexed media lookup and optional safe storage-URL
    lookup. Common text with rare geography can still read many candidates or hit
    query limits. Current docs specify up to 1,024 search results scanned per
    query, 16 terms and 8 search filter expressions; cursor pagination is not an
    application-wide result ceiling. Search billing counts full index size per
    query even with equality filters. No universal search or multi-filter
    O(log N + K) guarantee is claimed. [Search costs and limits](https://docs.convex.dev/search/text-search).

12. **Remaining dependencies; stop here.** `search_marketplace_geography` stays
    staged and unqueried. Geographic search equality optimization requires a
    separately authorized rollout, completed index backfill, enablement and query
    promotion; the compatibility index remains intact. GEO10.1 must review legacy
    mapping and any structured administrative-name search-text reconciliation.
    The new function and UI require separately authorized deployment and live
    schema/code/privacy/cursor verification. The static homepage feed is outside
    this task and unchanged. GEO7 has not started. No deploy, commit, push, merge
    or tag was performed; GEO6.2B stops at this handoff.
