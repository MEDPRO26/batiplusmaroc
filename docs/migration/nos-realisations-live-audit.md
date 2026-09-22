# Live SEO/content audit — `/nos-realisations/`

- Audited: 2026-08-21T11:06:35Z
- Production source: `https://batiplusmaroc.com/nos-realisations/`
- Scope: read-only production snapshot; no Next.js page, route, content, or metadata was changed.
- Technical source of truth: the successful live production HTML response.

## Executive findings

| Item | Exact production value |
|---|---|
| Requested URL | `https://batiplusmaroc.com/nos-realisations/` |
| Final URL | `https://batiplusmaroc.com/nos-realisations/` |
| HTTP status | `200` |
| Exact title | `Nos réalisations - batiplusmaroc.com` |
| Meta description | **ABSENT** |
| Canonical | `https://batiplusmaroc.com/nos-realisations/` |
| Robots | `index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1` |
| Main H1 | `Nos réalisations` |
| Indexable | Yes, based on HTTP 200, robots, and self-canonical |
| JSON-LD | Present: one Yoast graph |
| Images in source HTML | 15 total: 12 content/theme images and 3 one-pixel tracking images |
| Internal/placeholder link occurrences | 40 |
| Crawlable internal HTTP occurrences | 27 |
| Broken same-origin HTTP resources | None among the 12 unique tested resources |

The complete machine-readable inventory—including all 40 link occurrences, all 15 source `<img>` elements, exact raw JSON-LD, headings, filters, and project records—is in `migration/nos-realisations-live-audit.json`.

## HTTP and trailing slash

The slash URL returns `200` directly with no redirect.

The non-slash form behaves as follows:

1. `https://batiplusmaroc.com/nos-realisations` → `301`
2. `Location: https://batiplusmaroc.com/nos-realisations/`
3. The slash URL → `200`

The redirect response contains `x-redirect-by: WordPress`. The canonical form is the trailing-slash URL.

A minimal command-line client was rejected by the CDN with 403. A browser-identifying, read-only request and the in-app browser both returned the live page; the successful live HTML response is the audit source.

## Metadata

### Open Graph

- `og:locale`: `fr_FR`
- `og:type`: `article`
- `og:title`: `Nos réalisations - batiplusmaroc.com`
- `og:url`: `https://batiplusmaroc.com/nos-realisations/`
- `og:site_name`: `batiplusmaroc.com`
- `og:description`: absent
- `og:image`: absent
- `article:publisher`: `https://www.facebook.com/sgta.btp`
- `article:modified_time`: `2025-08-28T08:43:13+00:00`

### Twitter

- `twitter:card`: `summary_large_image`
- `twitter:label1`: `Durée de lecture estimée`
- `twitter:data1`: `5 minutes`
- Twitter title, description, and image: absent

### JSON-LD

One Yoast `application/ld+json` graph exists. Types found, including nested types:

- `WebPage`
- `ReadAction`
- `BreadcrumbList`
- `ListItem`
- `WebSite`
- `SearchAction`
- `EntryPoint`
- `PropertyValueSpecification`
- `Organization`
- `ImageObject`

There is no project-level `CreativeWork` or comparable portfolio schema. The exact raw JSON-LD block is preserved in the JSON audit.

## Exact semantic content

- H1: `Nos réalisations`
- Intro heading: `S2MBOU, un gage de qualité`
- Exact introduction: `L’expérience de S2MBOU dans le monde de travaux btp est un atout indéniable dans vos projets de construction et de rénovation.`

This wording matches the requested meaning and has not been rewritten.

## Heading order

1. H1 — `Nos réalisations`
2. H2 — `S2MBOU, un gage de qualité`
3. H3 — `Amical Omolkoura`
4. H3 — `Particulier privé`
5. H3 — `Amical Annajah`
6. H3 — `Villa avec sous sol`
7. H3 — `Alhouda Doha Iamar`
8. H1 — `Prêt à passer à l’étape suivante et à collaborer avec nous ?`
9. H4 — `Contactez-nous`
10. H6 — footer company description
11. H6 — `Nos services`
12. H6 — `Accès rapide`
13. H6 — `Contactez nous`

The page therefore has two H1 elements and an irregular H3 → H1 → H4 → H6 progression.

## Breadcrumb

Visible breadcrumb:

- `Accueil` → `https://batiplusmaroc.com/`
- `Nos réalisations` → current page, no link

Exact visible text: `Accueil » Nos réalisations`

The JSON-LD `BreadcrumbList` mirrors the same two items.

## Portfolio filters

| Label | href | data-filter | Real URL? |
|---|---|---|---|
| `All` | `#` | `*` | No |
| `aménagement extérieur` | `#` | `.amenagement-exterieur` | No |
| `aménagement intérieur` | `#` | `.amenagement-interieur` | No |
| `Gros oeuvre` | `#` | `.gros-oeuvre` | No |

These are JavaScript-dependent Salient/Isotope controls. They show or hide the five existing DOM nodes; they are not crawlable archive/category URLs and do not create duplicated hidden project markup.

## Current projects

| Project | Category | Image alt | Destination | Detail page? |
|---|---|---|---|---|
| `Amical Omolkoura` | `amenagement-exterieur` | empty | `/wp-content/uploads/2025/05/AMICAL.jpg` | No |
| `Particulier privé` | `gros-oeuvre` | empty | `/wp-content/uploads/2025/05/Particulier-prive.jpg` | No |
| `Amical Annajah` | `amenagement-interieur` | empty | `/wp-content/uploads/2025/05/Amical-Annajah.jpg` | No |
| `Villa avec sous sol` | `amenagement-exterieur` | empty | `/wp-content/uploads/2025/05/haut-founty-scaled.jpg` | No |
| `Alhouda Doha Iamar` | `amenagement-exterieur` | empty | `/wp-content/uploads/2025/05/alhouda-scaled.jpg` | No |

Every project occurs exactly once as an H3 and once as a portfolio item. There is no duplicated portfolio DOM content on this page.

Each item has an empty-text `pretty_photo` lightbox link to the original JPEG. This is the effective “View Larger” behavior, but it has no accessible name. There are no “More Details” controls and no “Love” controls. All five original-image destinations returned `200`; none is a dedicated project page.

## Links and controls

- 45 total anchors in the HTML.
- 40 are same-origin, fragment, empty, or hash-only occurrences recorded in the machine audit.
- 27 are crawlable internal HTTP-link occurrences.
- 14 distinct resolved internal URLs when fragments are retained.
- 12 distinct same-origin HTTP resources after fragments are removed.
- 8 links use exactly `href="#"`.
- 5 links have an empty `href`.
- 2 links target page fragments.

Empty links include two header/footer phone occurrences, two email occurrences, and one visible `Contactez-nous` CTA. Hash-only controls include the four filters, theme close controls, one empty social/theme icon, and the WhatsApp widget control.

All 12 unique same-origin page/media resources tested returned `200`. No broken internal HTTP link was found.

## Images

The production source contains 15 `<img>` elements:

- 3 one-pixel Facebook/PixelYourSite tracking images.
- 2 header logo occurrences.
- 5 portfolio thumbnails.
- 4 lazy-loaded content images using SVG placeholders plus `data-nectar-img-src` and `data-nectar-img-srcset`.
- 1 footer logo.

All five project thumbnails have empty `alt` attributes. The four lazy-loaded content images and footer logo also have empty alt text. Exact sources, lazy sources, source sets, and dimensions are in the JSON audit.

## Comparison with `SEO_MIGRATION.md`

Matches:

- The protected route remains `/nos-realisations/`.
- The rendered main H1 is exactly `Nos réalisations`.
- All five documented legacy project names are present.

Discrepancies: none. The migration document does not state the page’s exact title, description, canonical, robots value, or project destinations, so the live technical values do not conflict with it.

## Future portfolio context — not used as audit evidence

The supplied future redesign context records stronger client assets for Al-Huda, Al Farah, Villa Founty, interior finishes, interior layout, finishing details, decorative coatings, ceilings/lighting, stairs/circulation, exterior/pool, and façades/exterior work. None of that future material was substituted into this production audit.

## SEO and accessibility risks

1. Meta description is absent.
2. All visible project images have empty alt text.
3. All five project lightbox links are empty and lack accessible names.
4. Projects link only to JPEG files, with no crawlable detail pages or descriptive link context.
5. Two H1 elements and an irregular heading hierarchy are present.
6. Filters are hash-only, JavaScript-dependent controls rather than URLs.
7. Open Graph description/image and Twitter title/description/image are absent.
8. A visible CTA plus phone/email anchors have empty href values.
9. The viewport disables user scaling with `user-scalable=0`.
10. The page has only one short introductory paragraph and no textual project descriptions.
11. Structured data is generic and contains no portfolio-project entities.

