# BatiPlus Maroc / S2MBOU — `design.md`

**Document:** V1 Landing Page + SEO-preserving Next.js migration design specification  
**Status:** V1 — approved visual direction pending implementation  
**Primary domain:** `https://batiplusmaroc.com/`  
**Visual reference:** Dribbble — *Construction Company Website Design*  
**Implementation target:** Next.js **16.3.x** (App Router), TypeScript  
**Primary language:** French  
**Primary business location:** Agadir, Morocco

---

## 1. Purpose

Rebuild the existing WordPress website as a modern, premium, code-first Next.js website while preserving the SEO signals that Google already knows.

This is **not** a rebrand, URL migration, or SEO rewrite in V1.

The V1 goal is:

1. Replace WordPress with Next.js.
2. Redesign the homepage with a premium construction-company UI inspired by the approved Dribbble reference.
3. Preserve existing SEO-critical URLs and page semantics.
4. Preserve existing public business/entity signals unless an explicit rebrand is approved.
5. Improve performance, UX, accessibility, responsiveness, and conversion paths without creating unnecessary SEO risk.

### Core migration principle

> Change the technology and presentation first. Do not simultaneously change URLs, search intent, indexability, core page content, brand/entity identity, and SEO metadata.

---

## 2. Business Understanding

The current website represents **S2MBOU / S2MBOU Bâtiment**, a Moroccan BTP company based in Agadir.

The company serves residential, commercial, and industrial projects and positions itself as a partner capable of taking a project from planning through construction and finishing.

### Core service families

- Gros œuvre
- Construction / maçonnerie / fondations
- Second œuvre
- Travaux intérieurs and finishes
- Plâtrerie
- Peinture
- Carrelage
- Étanchéité
- Climatisation
- Menuiserie bois
- Menuiserie aluminium
- Menuiserie PVC
- Électricité
- Plomberie
- Aménagement intérieur
- Aménagement extérieur

### Current trust themes to preserve

- Bureau d’étude intégré
- Matériaux durables
- Respect des délais et des normes
- Maîtrise complète du projet
- Solutions sur mesure
- Accompagnement du projet de A à Z

### Current public contact data

- Phone: `+212 766-018650`
- Email: `sgta.btp@gmail.com`
- Location: `Hay Dakhla, Agadir`

Do not invent company history, years of experience, number of employees, number of completed projects, certifications, awards, ratings, or other quantitative claims unless verified.

---

## 3. Brand Rule for V1

The domain is `batiplusmaroc.com`, but the current public website repeatedly presents the business as **S2MBOU**, **S2MBOU SARL**, and **S2MBOU Bâtiment**.

V1 must **not silently rename the company to “BatiPlus Maroc” inside SEO content**.

Until the owner explicitly approves the final brand architecture:

- Preserve current S2MBOU entity wording in migrated SEO content.
- Use the existing logo/brand asset where applicable.
- `BatiPlus Maroc` may remain the internal project/repository name.
- Do not change Organization/LocalBusiness schema naming without approval.
- Do not change title tags merely to force the domain name into the brand.

A future rebrand can be handled as a separate controlled SEO phase.

---

# 4. Technology Stack

## Required

- Next.js **16.3.x**
- App Router
- React version supported by the selected Next.js 16.3 release
- TypeScript with strict mode
- Server Components by default
- Client Components only where interaction requires them
- `next/image`
- `next/font`
- Next.js Metadata API
- `app/sitemap.ts`
- `app/robots.ts`
- JSON-LD rendered server-side
- Semantic HTML
- CSS variables for design tokens

Tailwind CSS may be used for implementation, but the design system defined in this document remains the source of truth.

## Avoid

- Pages Router
- Full-site client rendering
- unnecessary `"use client"`
- SEO content loaded only after hydration
- heavy animation frameworks for basic UI
- page builders
- WordPress frontend dependencies
- iframe-based main content
- duplicate SEO plugins or runtime meta injection

---

# 5. SEO Preservation Contract — NON-NEGOTIABLE

The visual redesign is allowed to be significant.

The following are **migration-protected** unless explicitly approved in an SEO change log:

- Public URL
- trailing-slash behavior
- HTTP status
- canonical URL
- index/noindex state
- title tag
- meta description
- H1
- core search intent
- substantial SEO copy
- important H2/H3 topics
- internal links
- image alt text where the image is migrated
- structured data that is currently valid
- breadcrumb relationships
- category/archive URLs that Google currently knows
- existing article URLs
- XML sitemap inclusion
- robots behavior

### Migration rule

For a page whose URL is unchanged:

```txt
OLD WordPress URL === NEW Next.js URL
```

No redirect should be needed.

If an unavoidable URL change occurs, create an explicit one-to-one permanent redirect and document it before release.

Never redirect multiple unrelated old pages to the homepage.

---

# 6. Protected Existing Routes

At minimum, the following routes have been discovered and must retain the same public slug in V1:

```txt
/
/a-propos/
/nos-services/
/gros-oeuvre/
/second-oeuvre/
/nos-realisations/
/contactez-nous/
/hello-world/
/les-nouvelles-tendances-dans-la-construction-en-2025/
/category/general/
/category/gros-oeuvre/
```

`/hello-world/` must **not** be deleted simply because the slug looks like a WordPress default. It currently contains the real article:

> Construction sur-mesure : quels avantages pour votre projet ?

### Important

This list is **not the final migration manifest**.

Before production cutover, crawl/export the full WordPress site and compare against Google Search Console and the WordPress sitemap. Every currently indexable URL must be accounted for as one of:

```txt
KEEP  -> same URL, 200
301   -> explicit one-to-one redirect
410   -> only when removal is intentional and approved
NOINDEX -> only when intentionally approved
```

There must be **zero unexplained legacy 404s** at launch.

---

# 7. Homepage SEO Lock

Current homepage URL:

```txt
https://batiplusmaroc.com/
```

### Existing title

```txt
Entreprise BTP et aménagement à Agadir – Construction pro
```

Preserve for V1 unless an SEO change is explicitly approved.

### Existing H1

```txt
Aménagement Agadir : Intérieur & extérieur sur mesure
```

Preserve this exact H1 in V1.

It can be styled in a much more premium way, but it should remain the single principal `<h1>`.

### Meta description

Do **not** invent a replacement during implementation.

Extract the live WordPress meta description into the migration manifest and reproduce it exactly in the new homepage metadata.

### Current homepage semantic themes to retain

- S2MBOU
- BTP in Agadir
- construction
- aménagement intérieur
- aménagement extérieur
- menuiserie
- project from A to Z
- quality
- durable materials
- deadlines and standards
- service expertise
- projects
- construction-related blog content

The redesign may shorten visible paragraphs above the fold, but important current content must remain represented in crawlable HTML on the page.

---

# 8. Visual Direction

## Reference

Use the approved Dribbble construction-company concept as the **visual direction**, not as an asset source and not as a literal copyrighted clone.

Reproduce the design language:

- large construction photography
- spacious composition
- strong editorial typography
- off-white/white backgrounds
- pale cool-toned section backgrounds
- dark charcoal typography
- warm yellow/orange construction accent
- large rounded image frames
- clean service cards
- strong visual hierarchy
- premium but practical BTP feeling
- confident CTA treatment
- restrained motion

Do not reproduce proprietary logos, copy, illustrations, photos, or unique assets from the reference.

---

# 9. Design Personality

The website should feel like:

> Established Moroccan construction contractor + modern architectural studio + reliable technical execution.

The interface should communicate:

```txt
SOLIDITY
EXPERTISE
PRECISION
PROJECT PROOF
TRUST
CONTACT
```

It should **not** feel like:

- a SaaS dashboard
- a generic ThemeForest construction template
- a handyman landing page
- an over-decorated luxury real-estate page
- a site full of small rounded cards
- an animation showcase

---

# 10. Design Tokens

These are V1 starting tokens. They may be refined after the real logo/assets are inspected.

```css
:root {
  --color-bg: #f7f7f4;
  --color-surface: #ffffff;
  --color-surface-muted: #eef3f4;
  --color-text: #171717;
  --color-text-muted: #626262;
  --color-border: #deded8;
  --color-accent: #f2b632;
  --color-accent-hover: #dda01d;
  --color-dark: #151515;

  --radius-sm: 10px;
  --radius-md: 18px;
  --radius-lg: 28px;
  --radius-xl: 36px;

  --container: 1280px;
  --page-padding-desktop: 32px;
  --page-padding-tablet: 24px;
  --page-padding-mobile: 18px;

  --section-space-desktop: 120px;
  --section-space-tablet: 88px;
  --section-space-mobile: 64px;
}
```

### Color rule

Accent yellow/orange is used intentionally for:

- primary CTA
- small labels
- key icons
- step numbers
- subtle highlights

Do not flood entire pages with accent color.

### Typography

Use a clean modern grotesk/sans family available through `next/font` or a properly licensed local font.

Desired feeling:

- architectural
- modern
- readable
- not playful
- strong French diacritics

Recommended hierarchy:

```txt
Hero H1 desktop: 64–80px / tight leading
Hero H1 mobile: 40–48px
Section H2 desktop: 44–58px
Section H2 mobile: 32–38px
Body desktop: 17–18px
Body mobile: 16px
Small labels: 12–14px uppercase, increased tracking
```

Use fluid `clamp()` sizing where practical.

---

# 11. Grid and Layout

Desktop:

- max content width: ~1280px
- 12-column grid
- generous negative space
- section rhythm: 100–140px
- asymmetrical image/text compositions are encouraged

Tablet:

- simplify 12-column compositions into 6/8-column equivalents
- preserve breathing room
- avoid shrinking desktop cards unnaturally

Mobile:

- single-column-first layout
- edge padding 16–20px
- important CTAs full-width or large touch targets
- imagery remains visually strong
- do not simply stack every desktop component without reconsidering hierarchy

---

# 12. V1 Homepage Architecture

The landing page should follow this sequence:

```txt
01 Header
02 Hero
03 Trust / proof strip
04 About / positioning
05 Core services
06 Expertise grid
07 Selected projects
08 Process
09 Why choose S2MBOU
10 Testimonials
11 Latest articles
12 Final CTA
13 Footer
```

The existing content may be reorganized into this architecture without changing the page's primary search intent.

---

# 13. Header

## Desktop

Layout:

```txt
[LOGO]    Accueil  À propos  Services  Réalisations  Blog  Contact    [Demander un devis]
```

### Behavior

- clean white/light surface
- initially static or lightly transparent over hero only if readability remains excellent
- sticky after scroll
- subtle border/shadow only when needed
- no oversized mega-navigation in V1

### Services menu

Links must point to existing SEO routes:

```txt
Nos services  -> /nos-services/
Gros œuvre    -> /gros-oeuvre/
Second œuvre  -> /second-oeuvre/
```

Any new future service pages are Phase 2, not invented in V1.

### CTA

`Demander un devis` -> `/contactez-nous/`

---

# 14. Hero

The hero should strongly resemble the *layout philosophy* of the approved construction reference:

- very large rounded image
- high-impact typography
- clear CTA
- premium spacing
- construction/project image as the visual anchor

## Content hierarchy

Eyebrow:

```txt
S2MBOU — ENTREPRISE BTP À AGADIR
```

H1 — **SEO locked**:

```txt
Aménagement Agadir : Intérieur & extérieur sur mesure
```

Supporting brand line may use:

```txt
Construire. Aménager. Valoriser.
```

Supporting copy should preserve the existing idea that S2MBOU provides construction and interior/exterior development solutions and supports projects from A to Z.

Primary CTA:

```txt
Demander un devis
```

Target:

```txt
/contactez-nous/
```

Secondary CTA:

```txt
Voir nos réalisations
```

Target:

```txt
/nos-realisations/
```

### Hero image

Preferred order:

1. real S2MBOU project photo
2. real construction site photo supplied by business
3. licensed high-quality Morocco-relevant construction photo

Avoid generic North American skyscraper photography if real company material is available.

Use `next/image`, correct dimensions, responsive `sizes`, and a priority loading strategy only for the actual LCP image.

---

# 15. Trust Strip

Immediately after the hero or overlapping its lower edge on desktop.

Use the existing trust claims:

```txt
Bureau d’étude intégré
Matériaux durables
Respect des délais et des normes
Maîtrise complète du projet
```

Presentation:

- one horizontal strip on desktop
- two-by-two grid tablet
- compact vertical/two-column arrangement mobile
- minimal icons or small graphic marks
- no giant cards

---

# 16. About / Positioning Section

Small label:

```txt
À PROPOS
```

Suggested display heading:

```txt
Construire, aménager, valoriser.
```

This can be an H2.

Use the existing homepage business explanation as the semantic source:

- S2MBOU is an Agadir BTP company
- construction
- interior/exterior development
- joinery
- private and professional clients
- reliable, tailor-made, quality solutions

Layout:

```txt
[Large project/team image]   [Label]
                             [Large H2]
                             [2 short paragraphs]
                             [trust bullets]
                             [Découvrir l’entreprise →]
```

CTA:

```txt
/a-propos/
```

Do not replace crawlable copy with text embedded in an image.

---

# 17. Core Services Section

Background: light muted/pale cool surface.

Label:

```txt
NOS SERVICES
```

Suggested H2:

```txt
Des solutions complètes pour chaque étape de votre projet.
```

Use image-led service cards inspired by the approved reference.

Primary cards:

### Gros œuvre

- fondations
- maçonnerie
- structure

Target:

```txt
/gros-oeuvre/
```

### Second œuvre

Use the current service concepts:

- isolation
- électricité
- plomberie
- cloisons/plafonds
- revêtements
- menuiserie intérieure
- peinture/finitions

Target:

```txt
/second-oeuvre/
```

### Construction & aménagement

Use existing business copy; link to:

```txt
/nos-services/
```

Do not create a new slug only for visual symmetry.

Cards should use:

- large image
- concise title
- short body
- arrow action
- hover image zoom no greater than subtle 1.02–1.04
- strong focus state for keyboard users

---

# 18. Expertise Grid

This section preserves the current homepage's 10 areas of expertise.

Keep all ten concepts visible in crawlable HTML:

```txt
Plâtre
Carrelage
Menuiserie
Aluminium
Électricité / Plomberie
Climatisation
Étanchéité
Jardinage
PVC
Peinture
```

Design:

- clean editorial grid
- 2 columns mobile
- 3/5 columns depending on desktop composition
- optional small material/project thumbnails
- avoid ten identical oversized cards

This section is useful for SEO preservation because it retains the service-topic coverage currently present on the homepage.

---

# 19. Selected Projects

Label:

```txt
NOS RÉALISATIONS
```

Suggested H2:

```txt
Des projets qui témoignent de notre savoir-faire.
```

Current project names to preserve where real project media exists:

```txt
Amical Omolkoura
Particulier privé
Amical Annajah
Villa avec sous sol
Alhouda Doha Iamar
```

Design:

- asymmetric editorial grid on desktop
- large image cards
- strong photography
- project name below/over image
- project category only when known
- no invented locations, budgets, dates, areas, or technical scopes

CTA:

```txt
Voir toutes les réalisations
```

Target:

```txt
/nos-realisations/
```

---

# 20. Statistics

Do **not** include fake counters such as:

```txt
15+ years
250+ projects
98% satisfaction
```

unless the owner provides verifiable values.

For V1, either:

- omit statistics entirely, or
- replace with qualitative proof points

Example:

```txt
Construction
Aménagement
Finitions
Installations techniques
```

---

# 21. Process Section

Suggested label:

```txt
NOTRE MÉTHODE
```

Suggested H2:

```txt
Un accompagnement clair, de l’idée à la réalisation.
```

Four stages:

```txt
01 — Étude
Analyse du besoin, visite et définition du projet.

02 — Planification
Solutions techniques, matériaux, organisation et calendrier.

03 — Réalisation
Coordination des travaux et suivi du chantier.

04 — Livraison
Contrôle, finitions et remise du projet.
```

This is presentation copy, not a contractual promise.

Use subtle step lines, accent numbers, and restrained scroll reveals.

---

# 22. Why Choose S2MBOU

Use the existing trust narrative rather than generic claims.

Potential layout:

```txt
[Large construction image]

POURQUOI S2MBOU

Une maîtrise complète de votre projet.

- savoir-faire multidisciplinaire
- solutions sur mesure
- matériaux de qualité
- respect des délais et des normes
- accompagnement à chaque étape

[Parler de mon projet]
```

CTA -> `/contactez-nous/`

---

# 23. Testimonials

The current homepage already contains client testimonial content.

V1 may migrate those testimonials exactly as currently published.

Presentation:

- large quote typography
- one primary testimonial at a time on mobile
- 2–3 visible/controlled layout desktop if readable
- names and cities retained only as already published
- no fabricated Google rating or review count
- do not add `Review` schema unless eligibility and source requirements are verified

If carousel behavior is used:

- must be keyboard accessible
- do not auto-rotate aggressively
- respect `prefers-reduced-motion`

---

# 24. Latest Articles

The homepage currently surfaces construction articles.

Keep blog discovery visible.

Label:

```txt
CONSEILS & ACTUALITÉS
```

Show the latest or selected three/four migrated articles.

Known existing content includes:

- Les nouvelles tendances dans la construction en 2025
- Comment bien préparer son budget de construction ?
- Comment choisir les bons matériaux pour votre maison ?
- Construction sur-mesure : quels avantages pour votre projet ?

Each card must link to its **existing WordPress slug**, not a new Next.js-style slug.

Important example:

```txt
Construction sur-mesure : quels avantages pour votre projet ?
-> /hello-world/
```

Do not “clean up” that slug during V1.

---

# 25. Final CTA

Large visual CTA near the bottom of the page.

Suggested copy:

```txt
Vous avez un projet de construction ou d’aménagement ?
```

Supporting copy:

```txt
Échangeons sur vos besoins et votre projet.
```

Primary CTA:

```txt
Demander un devis
```

Target:

```txt
/contactez-nous/
```

Optional phone action:

```txt
+212 766-018650
```

Use a high-quality construction image with accessible contrast/overlay.

---

# 26. Footer

Footer should preserve crawlable navigation and current business information.

Suggested structure:

```txt
[Logo / S2MBOU]
Short business description

Navigation
- À propos
- Nos services
- Nos réalisations
- Contactez-nous

Services
- Gros œuvre
- Second œuvre

Contact
- +212 766-018650
- sgta.btp@gmail.com
- Hay Dakhla, Agadir
```

Preserve important internal links.

Do not add empty social icons.

---

# 27. Responsive UX

## Desktop >= 1200px

- full editorial layout
- large image compositions
- 12-column grid
- 64–80px hero typography
- header navigation fully visible

## Tablet 768–1199px

- reduce image/text asymmetry
- service cards 2 columns
- project grid 2 columns
- navigation may switch to compact menu at the point content no longer fits

## Mobile < 768px

- one primary column
- hero image remains large and meaningful
- 40–48px H1 target
- CTA buttons large/touch-friendly
- no tiny horizontal carousels for essential content
- project cards full width
- services easy to scan
- menu must trap/focus correctly when open

Optional mobile conversion bar:

```txt
[Appeler] [Demander un devis]
```

Only add WhatsApp if the business confirms the WhatsApp-enabled number.

---

# 28. Motion

Motion should make the site feel premium, not distract from construction content.

Allowed:

- 150–300ms hover transitions
- subtle image scale
- opacity/translate section reveals
- navigation state transition
- restrained menu animation

Avoid:

- scroll-jacking
- parallax that damages readability
- continuous decorative animation
- loading screens
- long intro animations
- motion required to reveal SEO content

Always respect:

```css
@media (prefers-reduced-motion: reduce)
```

---

# 29. Accessibility

Minimum V1 requirements:

- semantic landmarks
- one H1 per page
- logical heading hierarchy
- keyboard-operable navigation
- visible focus states
- alt text migrated accurately
- decorative images use empty alt
- WCAG-conscious color contrast
- buttons are buttons; links are links
- form labels are programmatically associated
- tap targets sized appropriately
- mobile menu correctly announces state
- no information communicated by color alone

Target: WCAG 2.2 AA where practical.

---

# 30. Image Strategy

Preferred assets:

1. real S2MBOU projects
2. real worksites
3. real teams/equipment
4. final buildings/interiors
5. licensed contextual photography only where gaps exist

Do not use the Dribbble reference images in production.

### Next.js rules

- use `next/image`
- specify correct intrinsic dimensions/aspect ratio
- define `sizes`
- do not mark all images `priority`
- prioritize only true above-the-fold/LCP imagery
- AVIF/WebP where supported by pipeline
- avoid huge original uploads in cards
- preserve current SEO-important image alt semantics during migration

---

# 31. Performance

Target a fast server-rendered homepage.

Implementation principles:

- Server Components by default
- minimal client JS
- lazy-load below-fold heavy media
- optimize fonts
- avoid third-party scripts unless required
- load analytics after core page rendering where possible
- reserve image dimensions to avoid layout shifts
- no giant background video in V1
- no unoptimized animation libraries

Performance budgets should be checked on representative mobile hardware/network, not only local desktop.

---

# 32. Next.js Project Architecture

Recommended initial structure:

```txt
app/
├── layout.tsx
├── page.tsx
├── globals.css
├── robots.ts
├── sitemap.ts
│
├── a-propos/
│   └── page.tsx
├── nos-services/
│   └── page.tsx
├── gros-oeuvre/
│   └── page.tsx
├── second-oeuvre/
│   └── page.tsx
├── nos-realisations/
│   └── page.tsx
├── contactez-nous/
│   └── page.tsx
│
├── hello-world/
│   └── page.tsx
│
├── les-nouvelles-tendances-dans-la-construction-en-2025/
│   └── page.tsx
│
├── category/
│   ├── general/
│   │   └── page.tsx
│   └── gros-oeuvre/
│       └── page.tsx
│
└── [additional-preserved-wordpress-slugs]/

components/
├── layout/
│   ├── site-header.tsx
│   ├── mobile-nav.tsx
│   └── site-footer.tsx
│
├── home/
│   ├── hero.tsx
│   ├── trust-strip.tsx
│   ├── about-preview.tsx
│   ├── services.tsx
│   ├── expertise-grid.tsx
│   ├── projects.tsx
│   ├── process.tsx
│   ├── why-us.tsx
│   ├── testimonials.tsx
│   ├── articles.tsx
│   └── final-cta.tsx
│
├── seo/
│   ├── json-ld.tsx
│   └── breadcrumbs.tsx
│
└── ui/

content/
├── site.ts
├── services.ts
├── projects.ts
└── articles/

lib/
├── seo.ts
├── routes.ts
└── utils.ts

public/
├── images/
├── icons/
└── brand/
```

---

# 33. Route Handling

Use actual Next.js directories matching the legacy URL paths where practical.

Do not create routes such as:

```txt
/services/gros-oeuvre
/company/about
/projects
/contact
```

if doing so replaces established paths.

Existing paths win:

```txt
/gros-oeuvre/
/a-propos/
/nos-realisations/
/contactez-nous/
```

### Trailing slash

Audit the live production behavior and configure Next.js consistently.

If the existing canonical/public URLs use trailing slashes, use a global configuration that avoids unnecessary redirect chains and produces the same canonical form.

Verify this in production before DNS cutover.

---

# 34. Metadata Implementation

Use the Next.js Metadata API.

Example pattern:

```ts
export const metadata: Metadata = {
  title: "...exact migrated title...",
  description: "...exact migrated description...",
  alternates: {
    canonical: "https://batiplusmaroc.com/...",
  },
  openGraph: {
    // migrate existing values or intentionally define approved replacements
  },
};
```

For dynamic article content, use `generateMetadata`.

### Rules

- no duplicate titles caused by layout templates
- no accidental title suffix added to existing migrated titles
- no self-canonical pointing to preview/staging
- canonical must use production hostname
- metadata must be deterministic and server-rendered

---

# 35. Sitemap

Implement:

```txt
app/sitemap.ts
```

The sitemap must contain all intended canonical/indexable production URLs.

During migration, compare generated sitemap URLs against the WordPress migration manifest.

Do not omit legacy articles/categories merely because they are not prominent in the new navigation.

---

# 36. Robots

Implement:

```txt
app/robots.ts
```

Production must allow normal crawling of indexable content.

Staging/preview deployments must not become substitute indexed copies.

Preferred staging protection:

- authentication/platform deployment protection
- and/or strict noindex controls

Before launch, verify that no production-wide `noindex` survives from staging.

---

# 37. Structured Data

Migrate only valid structured data and improve conservatively.

Potentially relevant types:

- Organization
- LocalBusiness / appropriate subtype where valid
- BreadcrumbList
- Article

Do not add schema solely because it exists as a type.

Do not fabricate:

- aggregate ratings
- reviews
- awards
- prices
- service areas
- opening hours

Schema entity name must follow the approved brand/entity rule.

---

# 38. Internal Linking

Preserve important existing links.

Header/footer/navigation should continue linking to:

```txt
/a-propos/
/nos-services/
/gros-oeuvre/
/second-oeuvre/
/nos-realisations/
/contactez-nous/
```

Homepage project and blog sections should link directly to their canonical detail URLs.

Do not rely on JavaScript click handlers without anchor `href` for crawlable navigation.

---

# 39. Contact UX

The existing contact page asks for service type and client details.

The homepage CTA should route to `/contactez-nous/`.

V1 may also provide `tel:` action for the verified phone.

Do not expose a fake instant quote estimator.

Do not promise response times not confirmed by the business.

---

# 40. Landing Page Content Rule

The landing page is a redesign of the existing homepage, not a blank marketing rewrite.

Implementation should use the **current WordPress homepage as the content source of truth**.

Allowed:

- reorganize sections
- split long paragraphs
- improve visual hierarchy
- introduce presentation headings
- improve microcopy for CTAs
- remove obvious WordPress UI debris
- make projects/services easier to scan

Not allowed in migration V1 without approval:

- replacing the existing H1
- changing primary keyword intent
- deleting substantive service coverage
- removing all project names
- removing blog discovery
- rewriting all SEO copy
- adding unverified business claims

---

# 41. V1 Component Acceptance Criteria

Every homepage section must:

- be responsive
- have semantic HTML
- render meaningful content on the server
- have no horizontal overflow at 320px width
- have visible keyboard focus
- work without motion
- avoid CLS caused by images/fonts
- use real internal routes
- contain no `#` placeholder production links
- contain no lorem ipsum
- contain no fake metrics
- contain no copied Dribbble assets

---

# 42. SEO Migration Acceptance Tests

Before switching production traffic from WordPress to Next.js, run an automated old-vs-new comparison.

For every legacy URL, record:

```txt
URL
Old status
New status
Old title
New title
Old meta description
New meta description
Old canonical
New canonical
Old robots
New robots
Old H1
New H1
Old indexability
New indexability
Old structured data
New structured data
Important internal links
```

### Launch blocker conditions

Do not launch if:

- priority legacy pages return 404
- canonical points to staging
- production is noindex
- title/H1 unexpectedly changed
- key page content is missing
- category/article URLs disappeared unintentionally
- old sitemap URLs are unaccounted for
- site requires client JS before main content appears
- internal navigation produces broken URLs

---

# 43. V1 Definition of Done

V1 is complete when:

- Next.js 16.3.x project is production-ready
- approved visual direction is implemented
- homepage is fully responsive
- existing homepage SEO intent is preserved
- existing public route slugs are preserved
- metadata is migrated
- sitemap and robots are correct
- priority content is server-rendered
- project/service/blog internal links work
- contact CTA works
- no important unexplained 404 exists
- staging cannot be indexed as a duplicate
- production crawl comparison passes
- Core Web Vitals are tested and major regressions are addressed

---

# 44. Out of Scope for V1

Do not mix these into the initial migration unless separately approved:

- full rebrand from S2MBOU to BatiPlus Maroc
- domain change
- wholesale URL restructuring
- mass content rewrite
- hundreds of new SEO service/location pages
- changing `/hello-world/` to a cleaner slug
- deleting category archives without SEO review
- publishing unverified business statistics
- adding an unverified Google rating
- multilingual architecture
- complex customer portal
- heavy CMS/admin system

These can be Phase 2+ items after the migration stabilizes.

---

# 45. Phase 2 Opportunities

After the migration is stable and Search Console confirms normal crawling/indexing, consider:

- clean rebrand/entity strategy if desired
- dedicated local/service SEO pages
- richer project case studies
- service clusters
- improved article taxonomy
- selective content refreshes
- stronger structured data
- better local SEO integration
- GEO/AEO content improvements
- new contact/lead workflows
- a lightweight CMS if frequent publishing is required

Any change to an existing ranking URL should be treated as a separate SEO decision.

---

# 46. Implementation Priority

Build in this order:

```txt
1. Global design tokens
2. Root layout + fonts
3. Header / mobile navigation
4. Homepage hero
5. Trust strip
6. About
7. Services
8. Expertise grid
9. Projects
10. Process
11. Why us
12. Testimonials
13. Blog
14. Final CTA
15. Footer
16. Homepage metadata
17. Legacy route shells/pages
18. robots.ts
19. sitemap.ts
20. old-vs-new SEO validation
```

---

# 47. Final Rule for Coding Agents

When implementation conflicts with SEO preservation, **SEO preservation wins during V1**.

When implementation conflicts with accessibility, **accessibility wins**.

When visual similarity to the Dribbble reference requires copying proprietary assets or compromising usability, **use the design language rather than copying the artifact**.

When business data is missing, **do not invent it**. Use a clearly marked verification item or omit the claim.

The goal is not to reproduce WordPress visually.

The goal is to create a premium modern Next.js construction website that Google can recognize as the same established site at the same URLs.

---

## Source references used for this specification

- Existing production site: `https://batiplusmaroc.com/`
- About: `https://batiplusmaroc.com/a-propos/`
- Services: `https://batiplusmaroc.com/nos-services/`
- Gros œuvre: `https://batiplusmaroc.com/gros-oeuvre/`
- Second œuvre: `https://batiplusmaroc.com/second-oeuvre/`
- Projects: `https://batiplusmaroc.com/nos-realisations/`
- Contact: `https://batiplusmaroc.com/contactez-nous/`
- Existing article: `https://batiplusmaroc.com/hello-world/`
- Approved UI reference: Dribbble shot `24553741-Construction-Company-Website-Design`
- Next.js official release/docs: Next.js 16.3 and App Router metadata conventions
