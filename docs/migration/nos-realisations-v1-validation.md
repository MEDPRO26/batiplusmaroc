# `/nos-realisations/` V1 migration validation

Validated against:

- `migration/nos-realisations-live-audit.json`
- `migration/nos-realisations-live-audit.md`
- the production build rendered locally from the current workspace

| Requirement | Result | Evidence |
|---|---|---|
| `/nos-realisations/` preserved | PASS | App Router page remains at `app/nos-realisations/page.tsx`. |
| Status 200 | PASS | Built slash route returns HTTP 200. |
| Non-slash → slash 301 preserved | PASS | `/nos-realisations` returns 301 with `Location: /nos-realisations/`. |
| Exact title preserved | PASS | `Nos réalisations - batiplusmaroc.com`. |
| Meta description remains absent | PASS | No description is supplied by the page or root metadata; rendered HTML contains no `meta[name="description"]`. |
| Canonical preserved | PASS | `https://batiplusmaroc.com/nos-realisations/`. |
| Robots/indexability preserved | PASS | `index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1`; route returns 200 with a self-canonical. |
| Exactly one H1 | PASS | Rendered DOM contains one H1. |
| H1 = `Nos réalisations` | PASS | Exact rendered H1 verified. |
| `S2MBOU, un gage de qualité` retained | PASS | Retained as an H2 in crawlable HTML. |
| Five legacy project names retained once each | PASS | All five names occur once in the rendered main content. |
| Old hash filters removed | PASS | No `a[href="#"]` remains on the rendered page. |
| Five empty href attributes removed | PASS | No empty href remains on the rendered page. |
| Unnamed JPEG lightbox links removed | PASS | No lightbox or direct legacy JPEG project link is rendered. |
| No fake project detail pages created | PASS | All case studies remain on `/nos-realisations/`; no project routes were added. |
| Project imagery uses local WebP assets | PASS | All portfolio imagery comes from `/public/images/portfolio-2026/`. |
| Al-Huda uses verified portfolio facts | PASS | R+5, Al-Huda/Agadir, démarrage, gros œuvre, and état final/façade only. |
| Al Farah uses verified portfolio facts | PASS | R+5, Al Farah/Agadir, fin gros œuvre, façade/volumes, and état final only. |
| Villa Founty uses verified portfolio facts | PASS | Construction and final-state comparison only. |
| Interior portfolio uses real client imagery | PASS | Six local WebPs cover the verified interior and finishing groups. |
| Exterior portfolio uses real client imagery | PASS | Local WebPs cover exterior/pool and façade/exterior work. |
| Meaningful alt text provided | PASS | Every portfolio image has concise factual alt text. |
| User scaling not disabled | PASS | No page-specific viewport override is present; Next.js emits its normal scalable viewport. |
| Heading hierarchy corrected | PASS | One H1 followed by descriptive H2 sections and H3 item/stage headings; no meaningless H5/H6. |
| Tailwind-first | PASS | Page components use Tailwind utilities directly; no page-specific rules were added to `globals.css`. |
| Server Components by default | PASS | No portfolio component uses `use client`. |
| No horizontal overflow at tested desktop viewport | PASS | At 1280px, `scrollWidth` equals `clientWidth` (1280px). |
| Production build | PASS | `npm run build` completed successfully with TypeScript and static generation. |

## Rendered SEO snapshot

- Title: `Nos réalisations - batiplusmaroc.com`
- Description: absent
- Canonical: `https://batiplusmaroc.com/nos-realisations/`
- Robots: `index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1`
- H1 count: 1
- H1: `Nos réalisations`
- JSON-LD top-level graph types: `WebPage`, `BreadcrumbList`, `WebSite`, `Organization`

The visible S2MBOU / schema `batiplusmaroc.com` entity discrepancy remains intentionally unchanged for Phase 2.
