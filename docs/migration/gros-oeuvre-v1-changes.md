# `/gros-oeuvre/` V1 intentional corrections

**Scope:** Step 5B redesign of the protected `/gros-oeuvre/` route.  
**SEO intent:** unchanged.  
**Canonical route:** `https://batiplusmaroc.com/gros-oeuvre/`.

## Corrections made

1. **Removed duplicate project rendering**  
   The WordPress page rendered all five legacy project names in both masonry and non-masonry portfolio structures. The Next.js page presents each name once in a single informational list.

2. **Corrected heading hierarchy**  
   The old `H1 → H5 → H2 → H3 → H4 → H6` sequence was replaced with one exact H1, H2 section headings, and H3 capability/stage headings.

3. **Removed empty portfolio filters and theme controls**  
   The `All`, category, empty phone/email, close-control, and other hash-only WordPress interactions were not recreated. Project names without valid individual destinations remain non-clickable information.

4. **Removed `Love 0` UI**  
   The theme-specific portfolio love controls were omitted.

5. **Improved meaningful image alt text**  
   Genuine project imagery now has concise, factual French descriptions tied to the visible Al-Huda, Al Farah, and Villa Founty construction states.

6. **Replaced legacy presentation with verified local WebP imagery**  
   The redesigned hero, structural expertise, project progression, case study, and execution sections use the migrated S2MBOU 2026 portfolio WebP files through `next/image`. No WordPress or PDF image is hotlinked at runtime.

## What did not change

- `/gros-oeuvre/` slug
- trailing-slash canonical form
- `200` status for the canonical route
- exact title
- exact meta description
- exact canonical
- effective robots directives
- exact H1 `Gros œuvre`
- French language and core gros-œuvre intent
- coverage of maisons individuelles, immeubles résidentiels, bâtiments industriels, and locaux commerciaux
- existing `WebPage`, `BreadcrumbList`, `WebSite`, and `Organization` schema semantics
- the documented S2MBOU / `batiplusmaroc.com` entity discrepancy

These changes repair WordPress UX, accessibility, and DOM defects; they are not URL or SEO-intent changes.
