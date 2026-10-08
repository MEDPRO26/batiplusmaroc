# GEO8.2B — Company directory filters and coverage labels

Status: implemented in the working tree. No deployment, migration, or commit.

## What changed

The public directory at `/entreprises` now sends optional `regionCode` and `provinceCode` to the existing `listPublicCompanies` query. All Morocco sends neither argument. Region and province codes come only from the GEO1 catalogue. Changing region clears the province. Headquarters city, service, verified-only, text search, and newest/oldest sorting are unchanged.

Each result card formats `coverageScopeKeys`. `MA` is national, `R:` is the entire region, and `P:` is that province or prefecture. Empty or invalid keys show “Coverage not declared”. A province declaration is not labeled as the whole region. More than two declarations use a native disclosure.

## Sparse pages

GEO8.2A.1 can return an empty page while `isDone` is false. `usePaginatedQuery` then stays `CanLoadMore`. The directory does not show “No companies match your search.” until `Exhausted`. It automatically requests up to four further pages when a page adds no companies, then leaves Load more available. A loading failure shows an alert and keeps the current filters.

A sparse geographic search may take several bounded backend pages. This is not an O(log N) search.

The connected Convex deployment rejected `regionCode` (`ArgumentValidationError: extra field regionCode`). That deployment does not yet include the committed GEO8.2A query arguments. The directory keeps the selected filters and shows a load error instead of replacing the page. Geographic results on that deployment need the existing directory function to be running there. This task does not deploy it.

## Left for later

GEO9 and GEO10 are not started. Public company profiles still do not show coverage. Coverage is not a proposal gate.
