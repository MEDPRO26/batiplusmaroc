# `/nos-realisations/` V1 change log

## Scope

Only the `/nos-realisations/` page, its new portfolio section components, the route-specific 301 handling, and migration documentation were changed. No other page was redesigned.

## Intentional migration fixes

1. Reduced the production page’s two H1 elements to one correct H1: `Nos réalisations`.
2. Removed the JavaScript/hash-only WordPress portfolio filters.
3. Removed empty-href controls.
4. Removed inaccessible JPEG lightbox project links.
5. Reorganized the portfolio into semantic, crawlable case-study sections.
6. Preserved the five legacy project names once each without inventing detail pages.
7. Added verified 2026 portfolio projects and local WebP imagery for Al-Huda, Al Farah, Villa Founty, interiors, finishes, façades, and exterior/pool work.
8. Added factual, concise alt text to every portfolio image.
9. Kept normal browser scaling and avoided any viewport zoom restriction.
10. Preserved the production page’s absent meta description for migration V1.

## Architecture

`app/nos-realisations/page.tsx` now composes Server Components from `components/portfolio/`:

- `portfolio-hero.tsx`
- `portfolio-intro.tsx`
- `al-huda-project.tsx`
- `al-huda-progression.tsx`
- `al-farah-project.tsx`
- `villa-founty-project.tsx`
- `interior-portfolio.tsx`
- `exterior-portfolio.tsx`
- `legacy-projects.tsx`
- `portfolio-cta.tsx`

No portfolio component adds client-side JavaScript. The only same-page anchor is the valid `#projets` hero CTA.

## SEO preservation

- Route: `/nos-realisations/`
- Title: `Nos réalisations - batiplusmaroc.com`
- Meta description: absent
- Canonical: `https://batiplusmaroc.com/nos-realisations/`
- Robots: production-equivalent index/follow extended directives
- Schema semantics: `WebPage`, `BreadcrumbList`, `WebSite`, and `Organization`
- Organization name remains `batiplusmaroc.com` to avoid silently normalizing the audited entity discrepancy.

## Visual direction

The WordPress gallery was replaced with a restrained architectural-editorial composition: large real project imagery, project progression, asymmetric case studies, navy/off-white surfaces, brand-blue actions, and small gold project markers. No filter plugin, masonry gallery, carousel, lightbox, or animation dependency was introduced.
