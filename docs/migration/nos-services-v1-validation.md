# `/nos-services/` V1 validation

**Validation date:** 2026-08-21  
**Production source of truth:** `https://batiplusmaroc.com/nos-services/`  
**Local route tested:** `http://127.0.0.1:3000/nos-services/`

## SEO lock

| Check | Result | Evidence |
|---|---|---|
| `/nos-services/` preserved | PASS | Route remains `/nos-services/`. |
| Trailing slash preserved | PASS | Slash URL returns `200`; no-slash URL redirects to `/nos-services/`. Production uses `301`; the existing Next.js `trailingSlash` configuration emits `308`. The final route and canonical form are unchanged. |
| Status `200` | PASS | Local slash route returned `200`. |
| Exact production title preserved | PASS | `Nos services - batiplusmaroc.com` |
| Production meta-description behavior preserved | PASS | No meta description is rendered; production value is absent. |
| Canonical preserved | PASS | `https://batiplusmaroc.com/nos-services/` |
| Robots/indexability preserved | PASS | `index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1`; page remains indexable. |
| Exactly one H1 | PASS | Rendered H1 count: `1`. |
| Exact H1 preserved | PASS | `Nos services` |
| Production structured-data graph retained | PASS | WebPage, BreadcrumbList, WebSite and Organization entities are rendered through JSON-LD using the audited production identifiers and dates. The migrated local logo replaces the WordPress-hosted logo asset. |

## Content and architecture

| Check | Result | Evidence |
|---|---|---|
| No unsupported service claims | PASS | Copy is limited to the supplied 2026 portfolio service scope. |
| Construction & Gros Œuvre present | PASS | Dedicated primary bento card and feature gateway. |
| Rénovation & Extension present | PASS | Informational card; no invented route. |
| Finitions intérieures present | PASS | Dedicated bento card and second-œuvre feature. |
| Aménagement intérieur & façades present | PASS | Informational card. |
| Cuisines & rangements present | PASS | Informational card. |
| Travaux particuliers present | PASS | Informational image card using verified examples. |
| `/gros-oeuvre/` linked | PASS | Hero, service card and feature block use the protected route. |
| `/second-oeuvre/` linked | PASS | Service card and feature block use the protected route. |
| `/nos-realisations/` linked | PASS | Project-proof CTA uses the protected route. |
| `/contactez-nous/` linked | PASS | Hero and final CTA use the protected route. |
| No fake service URLs | PASS | No `href="#"` and no invented service-detail slug appears in rendered links. |
| Real local WebP imagery | PASS | All page imagery resolves from `/images/portfolio-2026/`; 17 portfolio image references were found in rendered HTML. |
| Tailwind-first implementation | PASS | All new route styling is expressed as utilities in route-scoped React components. No page-specific CSS block or `@apply` was added. |
| Server Components by default | PASS | All new components are Server Components; no `use client` boundary or carousel dependency was introduced. |
| No WordPress UI artifacts | PASS | Rendered HTML contains no `wp-content`, `wp-block`, or WordPress UI classes. |

## Responsive and accessibility checks

| Check | Result | Evidence |
|---|---|---|
| Mobile layout | PASS | Tested at `390 × 844`; document width and viewport width were both `390px`. |
| Desktop layout | PASS | Tested at `1440 × 1000`; document width and viewport width were both `1440px`. |
| Intentional gallery overflow | PASS | Gallery client width `1440px`, scroll width `2680px`; page itself has no horizontal overflow. |
| Heading hierarchy | PASS | One H1, major sections use H2, service/process/project items use H3; no skipped H5/H6 levels. |
| Image alternatives | PASS | Every new image has factual, non-keyword-stuffed alt text. |
| Real links and focus visibility | PASS | Interactive calls to action use protected URLs and inherit visible focus styles. Non-linked service cards are not wrapped in fake links. |
| Browser console | PASS | No errors or warnings were reported during responsive verification. |

## Build verification

- `npm run lint` — **PASS**
- `npm run build` — **PASS**
- Next.js `16.3.1` generated `/nos-services` as a static route.

## Scope

Only `/nos-services/`, its route-scoped components, and the requested migration audit/validation files were created or changed for this step. `/second-oeuvre/` was not redesigned.
