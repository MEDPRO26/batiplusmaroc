# GEO9.1D — Admin geography filter cleanup

Date: 2026-10-09. Local implementation and focused verification only.

Working branch: `codex/geo91d-admin-geography-filter-cleanup`, created in the
existing isolated worktree from `feature/nationwide-project-intake` at
`543d7f19f217830861e53d7dc7d3fae113a9d836`. The worktree was initially clean and
detached at main. `git fetch origin` verified latest `origin/main` at
`7e8400d559a7f070590395ce31828e420a581e51`, which is an ancestor of the feature
baseline. The ignored full GEO specification was read from the original
checkout. No OPEN Product HQ policy was adopted.

## Behavior and files changed

| File | Change |
| --- | --- |
| `features/admin/components/admin-projects-panel.tsx` | Remove the ten-city control, state and query argument; keep the existing Region → Province/Prefecture selectors together on desktop and stacked on mobile. |
| `features/admin/components/admin-site-visits-panel.tsx` | Show the city control only while the existing rollout query does not enable the indexed reader; send city only to the legacy reader and exclude hidden city state from active-filter detection. Adjust the wide filter grid for the removed control. |
| `features/admin/admin-project-pagination.test.tsx` | Assert the nationwide default and absence of the city control/argument. |
| `features/admin/admin-site-visit-pagination.test.tsx` | Assert city visibility for inactive/unknown rollout and absence for active rollout. |
| `tests/e2e/admin-project-geography-pagination.spec.ts` | Update filter interactions; verify the default, dependent provinces, paired desktop controls, mixed legacy/new records and pagination. |
| `tests/e2e/admin-site-visit-geography-pagination.spec.ts` | Update indexed filter interactions; cover unknown/disabled/incomplete rollout, preserved legacy city filtering, live reader transitions and mixed legacy/new results. |
| `docs/admin-geography-filter-cleanup-geo91d.md` | This verification record. |

Both geography selectors default to the existing translated “All Morocco” /
“Tout le Maroc” option. Province choices use the shared catalogue and remain
disabled until a region is selected; changing region clears the province.
Existing search, status, date and pagination behavior is preserved. An indexed
Site Visit request cannot inherit a city selected before activation. If rollout
becomes inactive again, legacy city filtering remains available.

The existing FR/EN messages and historical location display fallbacks are reused.
No translation, Convex source, schema, permission, marketplace workflow or data
change is required. No administrative codes are inferred from city strings.
Unfiltered readers continue to include legacy city-only records. No rollout
policy was set, migration/backfill run, deployment performed, or merge made.

## Validation

- **127 tests passed across nine files:** the two admin pagination UI suites,
  admin Projects, Site Visits and geography display UI suites, and the existing
  Convex Project/Site Visit pagination and admin handler suites. Run with
  `npm test --` followed by those nine paths. The pagination handlers exercise
  201+ record boundaries, legacy visibility, no inferred geography and current
  authorization checks, including anonymous/non-Admin and revoked/deleted Admin
  denials.
- **26 Chrome browser component tests passed:**
  `admin-project-geography-pagination.spec.ts`,
  `admin-site-visit-geography-pagination.spec.ts` and
  `admin-geography-display.spec.ts`. The real controls and application CSS were
  exercised with mocked Convex/navigation in an isolated localhost server.
  Checks cover FR/EN, keyboard interactions, dependent provinces, clear/search/
  status/date arguments, invalid-date recovery, continuation/loading/exhaustion,
  legacy visibility and rollout transitions. Relevant layout cases pass at
  320, 375, 1280 and 1600 pixels without horizontal overflow.
- `npm run typecheck`: passed.
- `npm run lint --` with the six changed TypeScript/TSX files: passed.
- `git diff --check`: passed.

The browser runner used a temporary Playwright config on localhost:3117 with
placeholder localhost Convex URLs, leaving the repository configuration intact.
Vite/terminal-color warnings and the offline homepage managed-metadata warning
were non-blocking. The Next.js-generated removal of the custom GEO instructions
in `AGENTS.md` was reverted after the local server stopped.

Browser evidence is component-level, not authenticated live E2E or deployed
schema/code parity. Production rollout coverage, activation and release checks
remain outside GEO9.1D. Existing readers retain their documented pagination and
legacy-rollout limits; no backend behavior is broadened by this cleanup.
