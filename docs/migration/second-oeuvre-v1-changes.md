# `/second-oeuvre/` V1 migration changes

## Scope

Only the existing `/second-oeuvre/` page was redesigned. The global trailing-slash handler received one route-specific SEO rule so this route matches the production 301 behavior. No other page content or metadata was redesigned.

## Architecture

`app/second-oeuvre/page.tsx` now composes focused, server-rendered sections from `components/second-oeuvre/`:

- `second-oeuvre-hero.tsx`
- `second-oeuvre-intro.tsx`
- `second-oeuvre-services.tsx`
- `interior-finishes.tsx`
- `technical-installations.tsx`
- `ceilings-lighting.tsx`
- `joinery-circulation.tsx`
- `finishing-portfolio.tsx`
- `legacy-projects.tsx`
- `finishing-quality.tsx`
- `second-oeuvre-cta.tsx`

The page uses Tailwind utilities directly in JSX and keeps Server Components as the default.

## Content and UI changes

1. Removed duplicate WordPress portfolio rendering. Each legacy project name now appears once in a restrained historical-reference list.
2. Removed all `Love 0` controls.
3. Removed hash-only portfolio filters and empty theme links.
4. Removed obsolete `View Larger` and `More Details` theme UI where it was not tied to a useful real route.
5. Corrected the heading hierarchy to one H1 followed by semantic H2 sections and H3 service/category headings.
6. Improved image alt handling with concise descriptions of the visible interior, material, lighting, stair, and finishing subject. Decorative overlays remain hidden from assistive technology.
7. Replaced generic/legacy imagery with verified local S2MBOU 2026 WebP imagery from `public/images/portfolio-2026/interiors/`.
8. Preserved the exact production meta description, including its existing punctuation/spacing anomaly.

## Design decisions

- Established a distinct second-œuvre visual language focused on surfaces, light, materials, circulation, and detail rather than reusing the structural/gros-œuvre page composition.
- Presented all seven service topics as spacious editorial rows instead of small repeated cards.
- Added dedicated sections for interior finishes, technical installations, ceilings and lighting, joinery and circulation, portfolio evidence, historical references, execution quality, and a page-specific CTA.
- Used restrained off-white, pale blue-grey, and navy surfaces with small blue/gold editorial details; the primary CTA remains S2MBOU blue.
- Used `next/image` with responsive `sizes`, stable aspect containers, and a priority hero image to limit layout shift and avoid shipping a production client-side gallery dependency.

## SEO and migration preservation

- Route: `/second-oeuvre/`
- Title, description, canonical, robots, Open Graph, Twitter metadata, H1, language, schema types, and production schema dates are preserved from the live audit.
- All seven audited service topics and the closing trust meaning remain server-rendered and crawlable.
- The five historical project names are preserved once each without reproducing WordPress plugin duplication.
- `/second-oeuvre` now returns the production-equivalent 301 to `/second-oeuvre/`; the final route returns 200.

## Verification

- ESLint: passed.
- Responsive browser checks: passed at mobile, tablet, and desktop widths with no horizontal overflow.
- Production image optimization: passed.
- `npm run build`: passed.
