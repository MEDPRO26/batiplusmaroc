# GEO-D3 — Homepage Company project chips

**Status: BLOCKED for acceptance by English browser navigation.** The scoped
handler fix is implemented and French navigation passes. The English destination
has a local redirect loop that also reproduces with the exact integration-base
homepage component. This is not a deployment or production finding.

## Base and scope

- Integration base: `543d7f19f217830861e53d7dc7d3fae113a9d836`.
- Isolated branch: `codex/geo-d3-homepage-project-chips`.
- Refreshed `origin/main`: `7e8400d559a7f070590395ce31828e420a581e51`.
- The new worktree started clean at the supplied integration commit. The
  integration branch stays at `543d7f1`; no merge or cherry-pick was performed.
- The full ignored geography specification was read from the primary checkout.
  OPEN policies remain unchanged.

## Supported interaction and behavior

`app/[locale]/(public)/projets/page.tsx` already accepts `q`, trims it and
passes it to `PublicProjectBrowse.initialSearch`, keyed by that value.
The browse component already sends this text through its existing paginated
search query. A text-search shortcut is therefore supported without adding
category, property-type or geography filters.

Before GEO-D3, Company chips were buttons with no selection callback and clicking
them left the user on the homepage. The new French Villas regression reproduced
this before the fix.

CompanyPanel now uses the existing locale-aware router and supplies the missing
callback. Activating a chip pushes `routes.browseProjects` with only
`{ q: displayedChipLabel }`. In French this reaches `/fr/projets/`; the
English route resolves to `/en/browse-projects/`.

| Chip | French q | English q |
| --- | --- | --- |
| Villas | Villas | Villas |
| Buildings | Immeubles | Buildings |
| Renovation | Rénovation | Renovation |
| Fit-out | Aménagement | Fit-out |

These labels use the existing native text-search semantics. They do not promise
category-wide or synonym matching. The existing Explore projects link remains
unfiltered. ClientPanel and ChipRow are unchanged, including native button
keyboard activation, focus styling and the horizontally scrolling mobile row.
Existing translation files and localized routes are unchanged.

## Changed files

- `components/home/hero-search.tsx`: the Company-panel callback.
- `tests/e2e/home-company-project-chips.spec.ts`: 14 focused regressions.
- `docs/home-company-project-chips-geo-d3.md`: this report.

## Validation

**25 focused unit regressions passed in three files:**

```sh
npm test -- components/home/marketplace-feed.test.tsx \
  features/projects/public-project-browse.test.tsx \
  features/projects/public-project-geography.test.tsx
npm run typecheck
npx eslint components/home/hero-search.tsx \
  tests/e2e/home-company-project-chips.spec.ts
git diff --check
```

Typecheck and scoped lint pass. The initial parallel typecheck overlapped a
Next dev restart removing generated type files; the sequential rerun after the
servers stopped passed. The existing Vite config warning remains unchanged.

**22 focused Chrome checks: 11 passed, 11 failed.** Seven new French checks pass:
all four chips by touch at 375px, unfiltered Explore projects, and Tab/Enter/Space
with visible focus and no page overflow at 375px and 1280px. Four existing French
Client hero regressions also pass, including native pre-hydration form submission.
The corresponding seven English Company and four English Client checks fail on
the existing destination redirect loop. These failures remain visible in the new
tests; they are not skipped.

The combined run used the ignored local Playwright config with a Webpack dev
server. The repository's default Turbopack server also reproduced the English
Villas navigation failure. A separate Turbopack run restored hero-search.tsx to
its exact `543d7f1` contents (`git diff --exit-code` passed for that file),
then reproduced the unchanged English Explore projects link failure. The scoped
chip fix was restored afterward.

```sh
npx playwright test --config=design-qa-artifacts/geo-d3/playwright.config.ts \
  --grep 'GEO-D3|GEO-D1 hero|GEO-D1 blank|GEO-D1 native hero fallback'
```

The local checks use real Next pages, translations, CSS and navigation with a
local backend stub returning null metadata. Browser requests stay on localhost;
backend WebSockets are closed. An offline font fixture uses the bundled Geist
font. No connected Convex deployment or live project results were tested.
French mobile and desktop screenshots were reviewed. Evidence remains under the
ignored `design-qa-artifacts/geo-d3/` directory, including `browser-results/`,
`browser-results-default/` and `browser-results-baseline/`.

## Remaining P1/P2 and next boundary

**P2: English localized public navigation loops in local dev.** Direct requests
to `/en/browse-projects/?q=Villas` return HTTP 307 with a Location pointing to
that same external destination and an internal rewrite to `/en/projets/`.
Chrome reports `ERR_TOO_MANY_REDIRECTS`. The English Company directory behaves
similarly. This predates the chip handler in the verified local baseline; its
cause and production impact are unverified.

No P1 was found within this task. English end-to-end acceptance remains blocked.
The smallest next action is to investigate and revalidate the existing localized
public routing separately, then rerun these focused checks. Keep the supported
`q` shortcut; do not invent backend filters or switch to private Company routes
as a workaround.

No backend, schema, authentication, permissions, deployment, migration,
environment file, OC3, Deal, commission, proposal or messaging changes are
included. Next dev's generated AGENTS.md edit was restored. No full suite was
run. Stop after GEO-D3.
