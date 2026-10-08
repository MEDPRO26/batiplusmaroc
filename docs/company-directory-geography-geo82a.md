# GEO8.2A — Company directory geographic discovery

Source implementation on `feature/nationwide-project-intake`, 2026-10-08.
Baseline: `57f69cb` (GEO8.1 committed). No branch switch, pull, reset, commit, or deploy.

**Status: PASS.** GEO8.2A.1 corrects ordering. Local tests, TypeScript, and scoped ESLint pass. This is source verification, not a deployment or production-scale performance claim.

## Architecture

No schema or index change. `companyCoverageIndex` remains GEO7's explicit sync index. It is ordered by Company id, which Convex does not guarantee is creation order, so geographic discovery does not paginate that index.

`listPublicCompanies` uses the existing Company directory indexes, which sort by `_creationTime` and then `_id`. Optional `regionCode` and `provinceCode` keep a Company when its validated `coverageScopeKeys` contain an explicit matching scope. Text, city, and service searches still use the search indexes; coverage is checked on that page and search order is unchanged.

A page can be short or empty while later matches exist. `isDone` comes from the native cursor. GEO8.2B must follow `continueCursor` until `isDone` and must not treat an empty page as the end of the directory.

## Matching

| Search | Included explicit keys |
|---|---|
| Region | `MA`, `R:<region>`, every `P:` inside that region |
| Province | `MA`, `R:<parent>`, `P:<province>` |

Headquarters `city` and historical `serviceAreas` do not match. A province-only Company is returned with that province key. Overlapping keys return the Company once. Invalid codes throw `INVALID_COMPANY_DIRECTORY_REGION`, `COMPANY_DIRECTORY_REGION_REQUIRED`, `INVALID_COMPANY_DIRECTORY_PROVINCE`, or `COMPANY_DIRECTORY_PROVINCE_REGION_MISMATCH`.

The Company document is authoritative. A stale coverage-index row does not grant coverage. A saved `coverageScopeKeys` array is visible even when its index rows are missing.

## Pagination

Cursors stay on the directory cursor wrapper and include a coverage fingerprint. Changing region, province, search, city, service, verified-only, or sort rejects the old cursor. Malformed, oversized, and coverage-index cursors are rejected. Native `splitCursor` and `endCursor` still work because the page is a normal directory page. Between requests, eligibility is read again for Companies the cursor has not passed. A Company that becomes eligible behind the cursor shows up on a new first page.

## Cost

One request reads one directory or search page, then checks coverage for those rows. Scope count does not multiply index reads. A sparse region can require several requests before a match. Each request stays bounded by `numItems` and `maximumRowsRead`. This is not an O(log M + K) geographic index read.

## GEO8.2B

Read `coverageScopeKeys` for labels. Keep following `continueCursor` when a geographic or text-plus-geographic page is empty. A province key is not a region label.
