# GEO6.1 — Company project geographic discovery

Source implementation on `feature/nationwide-project-intake`, 2026-10-08.
Baseline: `becb5f631749817eb91e5a1534eef00d0d1e8268` (GEO5/GEO5.1 committed).
Latest `origin/main` verified read-only: `7e8400d559a7f070590395ce31828e420a581e51`.
The baseline worktree was clean and no repository Convex dev/deploy watcher was running.
This report concerns local source and tests, not a deployment or release verification.

**Status: GEO6.1 PASS WITH ISSUES.** Source behavior and selected regressions pass.
Chronological text-search cost, historical geographic reconciliation and live
index/browser verification remain open as detailed below.

## Files changed

- `convex/projects/marketplace.ts`
- `features/projects/components/project-geographic-filters.tsx` (new shared controls)
- `features/projects/components/company-project-marketplace.tsx`
- `features/companies/components/company-dashboard.tsx`
- `lib/errors/codes.ts`
- `messages/en.json`
- `messages/fr.json`
- `convex/projects.marketplace-geography.test.ts` (new)
- `features/projects/company-project-geography.test.tsx` (new)
- `features/projects/company-project-marketplace.test.tsx`
- `docs/company-project-discovery-geo61.md` (this report)

## Filter contract

`api.projects.marketplace.listCompanyMarketplaceProjects` accepts optional
`regionCode?: string` and `provinceCode?: string`. Codes use the existing GEO1
catalogue without coercion, aliases, or free-text administrative inference.

- Neither argument: all Morocco, including city-only historical records.
- Region only: projects with that stored region, across its provinces/prefectures.
- Region and province: that province with its matching stored parent region.
- Unknown/malformed codes fail with `INVALID_PROJECT_REGION` or
  `INVALID_PROJECT_PROVINCE`; province without region fails with
  `PROJECT_REGION_REQUIRED`; a cross-region pair fails with
  `PROJECT_PROVINCE_REGION_MISMATCH`.
- Any supplied new geographic argument combined with either `city` or `cities`
  fails with `AMBIGUOUS_PROJECT_LOCATION_FILTER`, including `cities: []`.
  Company authorization runs before these semantic checks.

Legacy `city`/`cities` filtering remains based on the recorded city. The existing
array-over-scalar precedence, empty selections and category/timeline/property/
surface/date semantics remain compatible. These historical city filters do not
define the current structured location. Cards use GEO3's general projection and
display hook, which suppress an inactive city for structured records.

No Project records, location markers, publication rules, quote rules or Company
service areas are changed by discovery. City-only records without administrative
codes cannot match region/province filters until reviewed GEO10.1 reconciliation;
they remain available under All Morocco and the legacy API.

## Query strategy and pagination

Province queries use `by_status_visibility_province_publishedAt`; region queries
use `by_status_visibility_region_publishedAt`. Both fix `status=published` and
`visibility=marketplace` before selecting the area and ordering by `publishedAt`.
Posted-date lower bounds are pushed into these geographic index ranges. Without
geography, the existing city/category/timeline/property/date indexes remain used.

Other dimensions are native residual filters applied **before** pagination.
Province queries also check the stored region, excluding inconsistent historical
parent pairs. Card completeness is checked before pagination so invalid published
records cannot consume a page and hide later eligible projects.

Each request executes one native `.paginate(args.paginationOpts)` with the complete
options unchanged. Native continuation/end cursors, row/byte limits and split
metadata survive the allowlisted DTO projection. No geographic candidate cap,
full-table `.collect()`, manual cursor, or page-local reordering is introduced.
Date ties use Convex's native index ordering and its creation-time tie-break.

### Text-search compatibility and cost

The existing `search_marketplace` definition has no geographic equality fields and
orders by relevance. GEO6.1 does not alter that definition or the search-text builder.

For text queries, supported scalar equalities first constrain the existing search
index. Geographic and other residual predicates constrain its matching documents.
The query iterates these indexed matches and retains their IDs. It then intersects
those IDs with the ordered query **before** its single native pagination call.
This preserves existing full-text matching semantics and global newest/oldest
ordering, including multiple pages; sorting a relevance page locally would not.

This compatibility path has a material cost:

- Every requested/reactively recomputed text page reads the relevant search candidate
  set again. A geographic residual predicate does not eliminate those search reads.
- If `S` search candidates are examined, `M` IDs remain, and `A` ordered candidates
  are examined for a page, there are additional search reads proportional to `S`,
  ordered reads proportional to `A`, and `O(M)` transient ID/expression memory.
- The ID disjunction may require up to `O(M)` comparisons per ordered candidate;
  no optimized membership bound is claimed. Common terms and sparse combinations
  can exceed Convex transaction, expression or memory limits. Results are not
  truncated to an arbitrary candidate cap to hide this limitation.
- Native row/byte pagination limits govern the ordered page; they do not bound the
  preceding search-match iteration. This is not a high-volume search performance
  guarantee, and live read/byte/latency measurements have not been performed.

GEO6.2 must review a staged geographic search-index rollout and the chronological
search strategy before release. Adding geographic equality fields alone would
reduce candidate reads but would not turn relevance order into date order. Search
text currently retains title/category/historical-city terms; structured area-name
search and approved search-text reconciliation remain GEO6.2/GEO10.1 work. Private
locality, neighborhood and exact site addresses are not newly indexed.

## UI and authorization

The main Company marketplace and its dashboard feed share native region/province
selectors using all 12 GEO1 regions and dependent province lists. All Morocco is
the default. A single geography state update clears the province when the region
changes; selecting a province preserves its region. Other filters/search remain
unchanged by geographic selection. Clear actions preserve each surface's existing
search-clearing behavior and reset geography.

Both feeds pass changed arguments to the existing `usePaginatedQuery`, whose current
SDK resets pagination when the query or arguments change. No application-managed
cursor is retained. FR/EN labels, unique desktop/mobile label associations, disabled
province guidance, native keyboard controls, focus styles, loading, empty, split-page
continuation and load-more states are retained. Existing card layouts are unchanged.

Existing completed Company membership checks and current role/onboarding checks
remain authoritative. Pending or suspended Companies retain their existing read
access; their proposal eligibility remains restricted by the existing verification
and suspension guards. Geographic coverage does not become an authorization gate.

Only published marketplace records enter the feed. General DTOs keep the existing
four location keys, without private locality/neighborhood, contact details, site
addresses, files or internal notes. Invite-only projects stay outside general
discovery; authorized invitation/detail and mutual-interest access rules are unchanged.

## Complexity and open verification

- Administrative lookup/parent validation: `O(1)` average using existing Maps.
- Province option enumeration: `O(P_region)`; catalogue memory stays `O(R + P)`.
- Suitable geographic page: target `O(log N + K)` with `O(K)` result/DTO memory;
  residual predicates, incomplete history and Client summary reads add cost.
- Text normalization: `O(L)`; the combined-search limitations above are separate
  from the normal geographic-only path.

Focused functional/source checks use convex-test and existing server-rendered UI
conventions. UI tests replay actual rendered native-control handlers and verify
argument changes; the Convex hook is mocked there. They are not authenticated
browser E2E or measurements of real mobile layout, screen-reader behavior or live
deployment indexes. Source-defined indexes are present; live enabled-index/code
parity must be verified during a separately authorized deployment/release check.

## Verification results

Final local run on 2026-10-08: **790 tests passed in 20 files**, including 41 new
backend cases and 12 new UI cases. The selected regressions cover existing
marketplace behavior, GEO location/publication, quotes, invitations, messaging,
Client support/alerts, coordination agreements and Deals.

```sh
npm test -- --no-cache \
  convex/projects.marketplace-geography.test.ts \
  features/projects/company-project-geography.test.tsx \
  convex/projects.marketplace.test.ts \
  features/projects/company-project-marketplace.test.tsx \
  features/companies/company-dashboard-budget.test.tsx \
  convex/projects.location.test.ts \
  convex/projects.publication-geography.test.ts \
  convex/quotes.test.ts convex/invitations.test.ts convex/messages.test.ts \
  features/projects/project-location-rendering.test.tsx \
  features/quotes/company-initial-quote-workspace.test.tsx \
  features/quotes/client-received-quotes.test.tsx \
  lib/geography/morocco.test.ts lib/geography/project-location.test.ts \
  lib/errors/map-app-error.test.ts \
  convex/clientSupport.test.ts convex/clientSupportNotifications.test.ts \
  convex/coordinationAgreements.test.ts convex/deals.test.ts

npm run typecheck

npm run lint -- \
  convex/projects/marketplace.ts \
  convex/projects.marketplace-geography.test.ts \
  features/projects/components/company-project-marketplace.tsx \
  features/projects/components/project-geographic-filters.tsx \
  features/companies/components/company-dashboard.tsx \
  features/projects/company-project-marketplace.test.tsx \
  features/projects/company-project-geography.test.tsx \
  lib/errors/codes.ts

git diff --check
```

TypeScript and scoped ESLint both passed with exit code 0. Tracked-diff whitespace
checks passed; new files are also checked separately for whitespace. The existing
Vite configuration emits its future native-loader warning; it does not fail tests.

The new tests cover canonical validation and parent checks, legacy/mixed/marked
records, rural records without a city, combined filters and both date sorts.
Separate 251-project fixtures exercise common matches, rare category/search
matches and rare region/province matches beyond the 200-record boundary, with
native read limits, cursor exhaustion, no duplicates/missing results and preserved
end cursors/split metadata. Authorization and DTO privacy checks cover both text
and non-text discovery. FR/EN tests cover all 12 options, dependent control events,
argument changes/reset ownership, rural labels, mobile control associations and
loading/empty/continuation states. The UI/browser limitations above still apply.

No schema/index definition, catalogue, wizard, public discovery, migration or
OC3/Deal business logic was modified. No deployment, commit, push, merge or tag
was performed. No live code/schema/index parity or authenticated E2E is claimed.

## Dependencies and handoff

- GEO6.2: review staged geographic search filters, chronological text-search cost
  and approved general geographic search text. This implementation leaves the
  deployed search-index definition and builder unchanged.
- GEO10.1: reviewed reconciliation is needed for city-only historical records to
  participate in geographic filters and for any approved search-text backfill.
- Release verification: separately authorized checks must establish live enabled
  indexes/code parity and authenticated responsive/accessibility behavior.

The source is ready for Product HQ review and a GEO6.2 planning handoff, with these
limitations explicit. This is not release readiness or authorization to start the
next task.

GEO6.1 stops here. GEO6.2 and GEO7 require Product HQ review and a separate assignment.
