# GEO-R1 — English public routing

Status: **PASS**. The redirect loop was caused by the local QA server hostname.
No application routing defect was confirmed; application code is unchanged.

## Baseline and isolation

- Base: `543d7f19f217830861e53d7dc7d3fae113a9d836`.
- Branch: `codex/geo-r1-english-public-routing`.
- Worktree: `/Users/yassin/.codex/worktrees/geo-r1-english-public-routing/batiplusmaroc`.
- Installed versions: Next.js 16.3.6, next-intl 4.14.5, Playwright 1.63.0.
- Latest fetched `origin/main`: `7e8400d559a7f070590395ce31828e420a581e51`.
- GEO-D3 remains separate at `60d6c40511519c24eb8bcd699c53311924c042b0`.

## Confirmed cause

The GEO-D3 QA harness started Next.js with `--hostname 127.0.0.1`. Repeating
that setup on the unchanged integration baseline reproduced every affected
English route in installed Chrome, while French routes loaded successfully.

The installed Next.js source explains the response chain:

1. `server/lib/router-utils/resolve-routes.js` builds the initial request origin
   from the server's configured hostname: `http://127.0.0.1:3341`.
2. `server/web/next-url.js` normalizes loopback IP hostnames to `localhost`.
3. next-intl correctly rewrites `/en/browse-projects/` to the internal
   `/en/projets/`, and `/en/companies/` to `/en/entreprises/`. Those rewrites use
   `http://localhost:3341`.
4. Next's `shared/lib/router/utils/relativize-url.js` compares origins exactly.
   `localhost` differs from `127.0.0.1`, so the router treats the rewrite as
   external and requests it through the proxy again.
5. next-intl canonicalizes that English internal pathname back to its public
   English URL with a 307. The original request therefore redirects to itself,
   including its query, and Chrome reports `ERR_TOO_MANY_REDIRECTS`.

French discovery paths already match the internal templates, so they do not
need this rewrite. Changing only the server hostname to `localhost` makes the
English rewrites internal and removes the loop without an application edit.

`next.config.ts`, `proxy.ts`, locale routing/navigation/request configuration
and localized page implementations were inspected. There are no custom config
redirects or rewrites involved. `trailingSlash: true` and
`skipTrailingSlashRedirect: true` remain unchanged; both slash variants work.

## Before and after

| Direct URL | Server bound to `127.0.0.1` | Server bound to `localhost` |
| --- | --- | --- |
| `/en/browse-projects/` | 307 to itself; Chrome redirect loop | 200; Browse projects |
| `/en/browse-projects/?q=Villas` | 307 to itself, retaining `q`; Chrome redirect loop | 200; search initialized to Villas |
| `/en/companies/` | 307 to itself; Chrome redirect loop | 200; company directory |
| `/fr/projets/` | 200 | 200 |
| `/fr/projets/?q=Villas` | 200 | 200; search initialized to Villas |
| `/fr/entreprises/` | 200 | 200 |

With `localhost`, English response rewrite headers are relative
(`/en/projets/?q=Villas`, `/en/entreprises/`) and have no redirect Location.
Canonical direct navigation and refresh do not redirect.

## Scoped changes

- `playwright.config.ts`: explicitly start the browser-test server with
  `--hostname localhost`, matching its existing base URL.
- `tests/e2e/public-localized-routing.spec.ts`: exercise real Next.js/proxy/
  next-intl behavior, covering direct routes, queries, navbar links, the existing
  Company-mode Explore link, Client search navigation and refresh. Check 375px
  touch input, 1280px desktop input, keyboard activation and both slash variants.
- This report.

Public SEO paths, application routing, FR/EN messages, homepage implementation,
Project search semantics, Convex, authentication and permission code are unchanged.
No dependency, environment file, deployment or integration-branch change was made.

## Validation

- **28/28 focused Playwright checks passed**: 14 per locale, comprising 26 Chrome
  browser cases and 2 HTTP cases that exercise 8 trailing-slash/query URLs.
- All three affected English URLs were also checked directly in Chrome during
  the unchanged-baseline hostname comparison; all returned 200 with `localhost`.
- FR/EN Project search and company directory screenshots at 375px were reviewed.
- **9/9 existing route-matching unit tests passed**:
  `npx vitest run lib/auth/protected-routes.test.ts`.
- `npm run typecheck`: passed.
- `npx eslint playwright.config.ts tests/e2e/public-localized-routing.spec.ts`: passed.
- `git diff --check`: passed.

The first regression run was stopped after two test assumptions failed: the
existing French HTML tag is `fr-FR`, and opening the mobile menu changes its
button label from Menu to Close. Assertions were corrected; the final 28-case
run passed with no retries. The full suite was not run.

Local QA used process-only backend URLs pointing to a localhost metadata stub,
a local font fixture, and browser traffic limited to loopback hosts. Real pages,
router, links and refresh were tested; live query data and authenticated workflows
were not tested. Artifacts are in the ignored `design-qa-artifacts/geo-r1/`
directory, including both hostname diagnoses and the final browser screenshots.
The isolated run used:
`npx playwright test --config design-qa-artifacts/geo-r1/playwright.config.ts`.

## Remaining P1/P2 and stop boundary

No remaining P1/P2 was confirmed within GEO-R1. Explicit IP-bound Next.js QA
servers still encounter the installed framework's hostname mismatch; use
`localhost` consistently for these routing checks. This is local evidence,
not a production verification claim.

GEO-D3 was not modified, merged, cherry-picked or revalidated as a combined
integration in this task. No integration or main merge was performed. Stop
after GEO-R1.
