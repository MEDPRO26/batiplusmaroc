# Nationwide Geography V1 — milestone closure (GEO-CLOSE)

Date: 2026-10-10. Product HQ accepted **GEO-FINAL: PASS WITH ISSUES** and
declared Nationwide Geography V1 development complete. This record changes no
application code and is not a deployment or production-completeness claim.

- Integration branch: `feature/nationwide-project-intake`
- Last application commit: `7203d51a8954880759f580cca399d7b5b9199eb5`
- Milestone tag: `geo-v1-final` (on the documentation commit adding this file)
- Development Convex: `dev:hip-gnat-222`

## Delivered scope

- Client Project intake with structured Region → Province/Prefecture
  locations and rural localities; no major-city prerequisite.
- Company headquarters and declared service coverage.
- Geographic Company and Project discovery.
- Admin Projects and Admin Site Visits geography filters with indexed
  pagination (GEO9.1B/C/D).
- GEO-D1, GEO-D2, GEO-D3 and GEO-R1 follow-ups.

Per-task detail stays in the existing tracked handoffs (`docs/*geo*.md`,
`docs/*hq*.md`); this file does not restate them.

## Closure evidence (GEO-FINAL, 2026-10-10)

| Check | Result |
| --- | --- |
| Focused geography Vitest | 48 files, 1,531 tests passed |
| `tsc --noEmit` | Passed |
| `next build --webpack` | Passed |
| Development assessment projections | 3 examined, 3 ready, 0 missing, 0 stale, 0 integrity failures |
| Authenticated development checks | Admin Site Visits Region/Province filters, status, search, date, FR/EN and 375px passed; Client redirected from Admin pages; anonymous backend calls denied |

Playwright was not re-run for closure; earlier GEO-R1 and GEO9.1C browser
evidence was reused.

## Development activation

`ADMIN_SITE_VISIT_GEOGRAPHY_POLICY_VERSION=indexed_v1` is enabled on
`dev:hip-gnat-222` only. Removing the variable restores the legacy Site Visit
list.

## Accepted V1 limitations

1. **Legacy city-only records** remain visible under All Morocco. They never
   acquire inferred Region or Province membership and therefore do not match
   those filters.
2. **Structured Region/Province Site Visit matching** is covered by automated
   tests against the real handlers, but has not been demonstrated with live
   Site Visit fixtures: development holds only three legacy assessments. The
   same applies to pagination beyond one page and ordering against stored sort
   values.
3. **Production migration, data verification and rollout remain separate** and
   require their own approval. See the activation prerequisites in
   [GEO9.1C](admin-site-visit-geography-pagination-geo91c.md), including the
   check that no editable Project has more than 256 linked assessments.

## Specification reference

`AGENTS.md` names `docs/features/nationwide-geography.md` as the feature
specification. That file is deliberately git-ignored as a local planning
handoff, so it is absent from fresh clones and from this commit. It was left
untracked here: it contains OPEN Product HQ decisions and tracking it was not
requested. `AGENTS.md` now states this and points to this record and the
tracked handoffs.
