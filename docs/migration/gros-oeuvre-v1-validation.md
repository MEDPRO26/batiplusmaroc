# `/gros-oeuvre/` V1 migration validation

**Compared against:** `migration/gros-oeuvre-live-audit.json` and `migration/gros-oeuvre-live-audit.md`  
**Implementation:** Next.js 16.3.1 App Router, Server Components, Tailwind CSS utilities  
**Validation date:** 2026-08-20

## Results

| Check | Result | Evidence |
|---|---|---|
| `/gros-oeuvre/` preserved | PASS | The protected route remains `app/gros-oeuvre/page.tsx`. |
| Permanent non-trailing → trailing behavior preserved | PASS | `/gros-oeuvre` redirects in one hop to `/gros-oeuvre/`. WordPress returned `301`; Next.js emits its framework-native permanent `308`. The slash destination and canonical form are unchanged. |
| Status `200` | PASS | `/gros-oeuvre/` returns `200`. |
| Exact title preserved | PASS | `Gros Œuvre à Agadir – construction & maçonnerie pro` was verified in the rendered document. |
| Exact meta description preserved | PASS | `Travaux de gros œuvre à Agadir : fondations, maçonnerie. Expertise et qualité pour vos projets de construction résidentiels et professionnels` was verified in the rendered document. |
| Exact canonical preserved | PASS | `https://batiplusmaroc.com/gros-oeuvre/`. |
| Robots directives preserved | PASS | `index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1`. |
| Exactly one H1 | PASS | Browser DOM inspection found one `h1`. |
| H1 remains `Gros œuvre` | PASS | Exact rendered H1 text verified. |
| Heading hierarchy corrected | PASS | Major sections use H2 and their capabilities/stages use H3. The old H5/H6 misuse was not reproduced. |
| Main gros-œuvre semantic copy retained | PASS | The audited sentence beginning `Le gros œuvre est la base de toute construction solide et durable.` is server-rendered with its full project-type meaning. |
| `maisons individuelles` retained | PASS | Present in server-rendered introduction copy and project-type content. |
| `immeubles résidentiels` retained | PASS | Present in server-rendered introduction copy and project-type content. |
| `bâtiments industriels` retained | PASS | Present in server-rendered introduction copy and project-type content. |
| `locaux commerciaux` retained | PASS | Present in server-rendered introduction copy and project-type content. |
| All five legacy project names represented once | PASS | `Amical Omolkoura`, `Particulier privé`, `Amical Annajah`, `Villa avec sous sol`, and `Alhouda Doha Iamar` each have one leaf-text DOM occurrence. |
| Duplicate WordPress portfolio removed | PASS | The new page renders one informational legacy-project list, with no duplicated masonry/non-masonry structures. |
| No `Love 0` controls | PASS | The rendered page contains no `Love 0` text. |
| No hash-only portfolio filters | PASS | Browser inspection found no `main a[href="#"]`. |
| Local WebP project images used | PASS | Ten route images come from `/images/portfolio-2026/projects/` and are rendered through `next/image`. |
| Al-Huda case study grounded in portfolio | PASS | The three supplied Al-Huda WebP stages are presented as Démarrage des travaux, Avancement gros œuvre, and État final / façade. |
| Al Farah case study grounded in portfolio | PASS | The three supplied Al Farah WebP images are presented as Fin gros œuvre, État final, and Façade et volumes. |
| No fake statistics | PASS | No counters, ratings, performance metrics, or unsupported quantities were added. |
| No invented project facts | PASS | Project claims are limited to the supplied R+5 names, Agadir locations, stage labels, and construction/gros-œuvre wording. |
| Tailwind-first | PASS | Route components use JSX utility classes; no page-specific CSS or `@apply` blocks were added to `globals.css`. |
| Server Components by default | PASS | No `/gros-oeuvre/` component contains `"use client"`. |
| Responsive layout | PASS | Browser checks found document width equal to viewport width at 1440 px and 375 px, with one-column mobile compositions. |
| Console health | PASS | A fresh rendered-page session produced no console errors or warnings after the image wrapper correction. |
| `npm run lint` | PASS | ESLint completed without errors. |
| `npm run build` | PASS | Next.js 16.3.1 compiled, type-checked, and statically generated all routes. |

## Metadata and structured data

The production Open Graph and Twitter fields were retained without inventing an image or additional social claims. The following production schema families remain server-rendered:

- `WebPage`
- `BreadcrumbList`
- `WebSite`
- `Organization`

No `AggregateRating`, review, pricing, certification, unsupported `LocalBusiness`, or fake project schema was introduced.

## Structured-data entity warning — Phase 2

The production discrepancy remains intentionally unresolved:

- Visible identity: `S2MBOU` / `S2MBOU SARL`
- `Organization` and `WebSite` schema name: `batiplusmaroc.com`

Entity normalization requires a separately approved SEO decision.

## Implementation scope

Only `/gros-oeuvre/` presentation components, its route composition/metadata, and the two requested migration records were added or changed for Step 5B. No other route was redesigned.
