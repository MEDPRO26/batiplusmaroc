# `/second-oeuvre/` V1 validation

Validated on 2026-08-21 against `migration/second-oeuvre-live-audit.json` and the locally built Next.js production output.

## Result

| Check | Result | Evidence |
|---|---|---|
| `/second-oeuvre/` preserved | PASS | Route remains `app/second-oeuvre/page.tsx`. |
| Non-slash URL redirects to slash with 301 | PASS | Local production request to `/second-oeuvre` returns `301` with `Location: /second-oeuvre/`; one redirect leads to a `200`. |
| Slash route returns 200 | PASS | Local production request to `/second-oeuvre/` returns `200`. |
| Exact title preserved | PASS | `Second Œuvre à Agadir – rénovation & finitions Pro` |
| Exact production meta description preserved character-for-character | PASS | `Travaux de second œuvre à Agadir : électricité, plomberie, peinture, carrelage. Des finitions de qualité pour vos projets résidentiels .` The existing space before the final period remains intentional for the migration lock. |
| Canonical preserved | PASS | `https://batiplusmaroc.com/second-oeuvre/` |
| Robots directives preserved | PASS | `index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1` |
| Indexable | PASS | HTTP 200, index/follow robots directives, and self-referencing canonical. |
| Exact H1 preserved | PASS | Exactly one H1: `Second œuvre`. |
| All seven original service items preserved | PASS | Each service appears once as an H3 in server-rendered HTML. |
| Comfort/function/aesthetic meaning preserved | PASS | Intro states that the work makes the building `confortable, fonctionnel et esthétique`. |
| Closing quality/norms meaning preserved | PASS | The audited sentence about `travaux soignés`, `conformes aux normes`, `confort`, and `qualité du bien` is present. |
| Five legacy project names present once only | PASS | Amical Omolkoura, Particulier privé, Amical Annajah, Villa avec sous sol, and Alhouda Doha Iamar each occur exactly once. |
| Duplicate WordPress portfolio removed | PASS | Only one semantic legacy-reference list remains; the former duplicated H3/H4 plugin structures are not reproduced. |
| `View Larger` controls removed | PASS | No occurrence or control in the route. |
| `More Details` controls removed | PASS | No obsolete theme control; page CTAs point only to valid protected routes. |
| `Love 0` controls removed | PASS | No occurrence or control in the route. |
| Hash-only filters removed | PASS | Zero empty or hash-only links inside the page content. |
| Heading hierarchy corrected | PASS | One H1, section H2s, service/category H3s, and no H4–H6 skips. |
| Meaningful image alt text improved | PASS | All 20 rendered image occurrences, including the shared header/footer logos, have non-empty alt text. |
| Real local WebP portfolio images used | PASS | The route uses 18 verified files from `public/images/portfolio-2026/interiors/`; no remote or stock image is introduced. |
| No unsupported project claims | PASS | The page identifies work categories and visible portfolio subjects without adding dates, quantities, clients, or unverified project specifications. |
| No fake statistics | PASS | No counters or invented performance figures are rendered. |
| Tailwind-first | PASS | All route styling is expressed with Tailwind utilities in JSX; no route-specific global CSS or `@apply` was added. |
| Server Components by default | PASS | All new `/second-oeuvre/` components are Server Components; no `use client` directive is present. |
| Responsive UX | PASS | Browser checks at 375×812, 768×1024, and 1440×900 found no horizontal overflow. Layouts resolve to one, two, and editorial multi-column compositions as specified. |
| Optimized images | PASS | Local production image optimizer returns 200; the hero has intrinsic loaded dimensions and uses `priority` plus responsive `sizes`. |
| Structured data types preserved | PASS | WebPage, BreadcrumbList, WebSite, and Organization remain present. The audited visible-brand/schema-name discrepancy is preserved rather than silently normalized. |
| Open Graph/Twitter technical values preserved | PASS | Audited OG fields and `summary_large_image`/reading-time Twitter fields are preserved; no invented social image or Twitter title/description was added. |
| ESLint | PASS | `npx eslint app/second-oeuvre/page.tsx components/second-oeuvre next.config.ts proxy.ts` completed without errors. |
| `npm run build` | PASS | Next.js 16.3.1 production build compiled, type-checked, prerendered all 18 static pages, and emitted the Proxy successfully. |

## Preserved service topics

1. Isolation thermique et acoustique
2. Installation électrique
3. Plomberie et sanitaires
4. Pose de cloisons et plafonds
5. Revêtements de sols et murs
6. Menuiserie intérieure (portes, escaliers, rangements)
7. Peinture et finitions

## Rendered content summary

- Main-content headings: 21 total — 1 H1, 10 H2s, and 10 H3s.
- Page-specific portfolio image occurrences: 18.
- Full rendered image occurrences including shared header/footer logos: 20.
- Empty image alt attributes: 0.
- Page-content links: 3, all valid protected routes (`/`, `/contactez-nous/`, `/nos-realisations/`).
- Full rendered internal-link occurrences including global navigation/footer: 21.
- Empty/hash-only page links: 0.

## Redirect implementation note

Next.js uses 308 for its automatic trailing-slash normalization. Production WordPress uses 301 for this protected URL, so `skipTrailingSlashRedirect` and the root `proxy.ts` provide an exact route-specific 301 for `/second-oeuvre`. The proxy reproduces the existing 308 behavior for other non-file, non-slash routes, so this SEO correction does not silently change their current Next.js behavior.

## Intentional production values retained

- The meta description’s extra space before its final period remains unchanged.
- Open Graph has no `og:image` because production has none.
- Twitter has no title, description, or image because production has none.
- Visible branding remains S2MBOU SARL while Organization schema remains named `batiplusmaroc.com`, matching the audited production discrepancy pending a separately approved SEO change.
