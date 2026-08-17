# BatiPlus Maroc — SEO Migration Manifest (Step 2)

**Status:** Homepage audit started  
**Captured:** 2026-08-17  
**Production source:** https://batiplusmaroc.com/  
**Purpose:** Preserve the current WordPress SEO footprint while rebuilding the site in Next.js.

---

## 1. Migration rule

For V1, the redesign may substantially change the visual presentation, but it must not unintentionally change:

- existing public URLs
- canonical URL form
- indexability
- title tags
- meta descriptions
- primary H1
- page search intent
- substantial crawlable content
- important internal links
- article/category URLs
- valid structured data
- image alt semantics
- sitemap inclusion

Any intentional SEO change must be documented separately.

---

## 2. Homepage — verified live data

**URL:** `https://batiplusmaroc.com/`

**Current title:**

`Entreprise BTP et aménagement à Agadir – Construction pro`

**Current H1:**

`Aménagement Agadir : Intérieur & extérieur sur mesure`

### Main semantic topics currently present

The homepage currently establishes the following topics and entities:

- S2MBOU
- entreprise de BTP à Agadir
- construction
- aménagement intérieur
- aménagement extérieur
- menuiserie
- accompagnement du projet de A à Z
- bureau d’étude intégré
- matériaux durables
- respect des délais et des normes
- maîtrise complète du projet

### Existing expertise topics

All of these should remain represented in crawlable HTML in the V1 homepage:

1. Plâtre
2. Carrelage
3. Menuiserie
4. Aluminium
5. Électricité / Plomberie
6. Climatisation
7. Étanchéité
8. Jardinage
9. PVC
10. Peinture

### Existing project names

Keep these visible where corresponding real project media/content is available:

- Amical Omolkoura
- Particulier privé
- Amical Annajah
- Villa avec sous sol
- Alhouda Doha Iamar

### Existing article discovery

The current homepage links to these articles:

- `/les-nouvelles-tendances-dans-la-construction-en-2025/`
- `/comment-bien-preparer-son-budget-de-construction/`
- `/comment-choisir-les-bons-materiaux-pour-votre-maison/`
- `/hello-world/`

Important: `/hello-world/` is a real published article and must not be renamed during V1.

### Existing category discovery

Known category routes:

- `/category/general/`
- `/category/gros-oeuvre/`

---

## 3. Homepage heading/content structure — verified at rendered-page level

The rendered page currently includes:

- H1: current Agadir aménagement target
- About/positioning section
- H2 around the “Construire, aménager, valoriser” positioning
- ten service/expertise headings
- S2MBOU choice/trust section
- project section with five project names
- blog section
- H2 “Nouveautés du blog”
- article titles
- client testimonials
- footer business description and contact information

During the redesign, the exact visual order may change, but these semantic topic groups must remain present unless an SEO change is approved.

---

## 4. Important internal navigation — verified

Protected primary routes:

- `/`
- `/a-propos/`
- `/nos-services/`
- `/gros-oeuvre/`
- `/second-oeuvre/`
- `/nos-realisations/`
- `/contactez-nous/`

Protected content routes discovered so far:

- `/hello-world/`
- `/les-nouvelles-tendances-dans-la-construction-en-2025/`
- `/comment-bien-preparer-son-budget-de-construction/`
- `/comment-choisir-les-bons-materiaux-pour-votre-maison/`
- `/category/general/`
- `/category/gros-oeuvre/`

This is still a minimum manifest. Before production cutover, the complete sitemap and Search Console URL inventory must be reconciled.

---

## 5. Broken internal links found on the current homepage

Two current homepage “En savoir plus” links resolve to 404 pages:

- `/prestations-metallerie`
- `/realisations-metallerie`

These are current-site defects and should not be recreated as broken links in Next.js.

Recommended V1 treatment:

- identify the exact source section for each broken link
- retarget the visible CTA to the most appropriate existing canonical page
- do not create a new SEO page solely to imitate a current 404
- do not add a redirect from these 404 URLs unless Search Console/backlink data shows they have meaningful external value

Likely existing destinations should be selected from:

- `/nos-services/`
- `/nos-realisations/`
- `/a-propos/`

The final destination must be chosen according to the CTA context.

---

## 6. Current public business details — verified on rendered pages

- Brand/entity currently displayed: S2MBOU / S2MBOU Bâtiment
- Phone: `+212 766-018650`
- Email: `sgta.btp@gmail.com`
- Location text: `Hay dakhla, Agadir`

Do not silently replace the public entity name with “BatiPlus Maroc” during V1 without an explicit rebrand decision.

---

## 7. Known page title/H1 samples

### `/a-propos/`

Rendered H1: `À propos`

Page describes S2MBOU as a Moroccan BTP company working across construction and residential/commercial/industrial development.

Key sections currently cover:

- Construction de Bâtiments
- Travaux Intérieurs & Finitions
- Menuiserie & Fermetures
- Installations Techniques

### `/gros-oeuvre/`

Current search/page title observed:

`Gros Œuvre à Agadir – construction & maçonnerie pro`

Rendered H1:

`Gros œuvre`

### `/second-oeuvre/`

Current search/page title observed:

`Second Œuvre à Agadir – rénovation & finitions Pro`

Rendered H1:

`Second œuvre`

### `/nos-realisations/`

Rendered H1:

`Nos réalisations`

The page currently presents the five known project names listed above.

### `/nos-services/`

Rendered H1:

`Nos services`

Current page body is very thin. Do not assume this authorizes changing the URL or removing the page.

### `/contactez-nous/`

Current main heading:

`FORMULAIRE DE CONTACT`

The live form currently includes service selection, city, name and phone fields.

---

## 8. Exact-head extraction still required

The web-rendered audit does not expose every raw `<head>` value reliably enough for an exact migration lock.

Before homepage coding, extract directly from the production HTML:

- exact `<meta name="description">`
- exact canonical `<link rel="canonical">`
- exact robots meta
- exact Open Graph title
- exact Open Graph description
- exact Open Graph image
- Twitter metadata, if any
- all JSON-LD blocks
- current favicon/site icons
- all image `src`, `srcset`, `alt`, width and height values
- all internal anchor `href` values
- exact heading tag levels from raw DOM
- current trailing-slash behavior
- HTTP response status/redirect chain

Do not use a Google search-result snippet as a replacement for the actual meta description.

---

## 9. Cursor task — exact homepage extraction

Run this task from the local Next.js repository before building the redesigned homepage:

1. Fetch `https://batiplusmaroc.com/` directly.
2. Do not modify production.
3. Parse the returned HTML/DOM.
4. Extract:
   - HTTP final URL and status
   - title
   - meta description
   - canonical
   - robots meta
   - Open Graph
   - Twitter metadata
   - all JSON-LD
   - H1–H6 in DOM order
   - all internal links
   - all images and alt attributes
5. Save the machine-exact audit to `migration/homepage-live-audit.json`.
6. Save a readable summary to `migration/homepage-live-audit.md`.
7. Compare the results against this `SEO_MIGRATION.md`.
8. Do not rewrite any page content yet.
9. Flag discrepancies rather than guessing.
10. Confirm whether production canonical URLs include trailing slashes.
11. Test the two known broken current links:
    - `/prestations-metallerie`
    - `/realisations-metallerie`
12. Run `npm run build` after adding any audit tooling only if repository code was changed.

The audit script/tooling must not become a production runtime dependency unless it is actually needed by the application.

---

## 10. Homepage redesign lock after exact audit

Only after section 8 is completed should Cursor build the new homepage.

The new UI may:

- use the approved premium construction-company visual direction
- reorganize the old content into the new section architecture
- improve visual hierarchy
- replace broken CTA destinations with valid existing pages
- improve accessibility and mobile UX
- optimize image delivery

The new UI must not, unless explicitly approved:

- change `/`
- change the existing title
- change the existing H1
- change canonical/indexability
- remove the core service-topic coverage
- remove the project names
- remove existing article discovery
- rename `/hello-world/`
- change the public business entity from S2MBOU to BatiPlus Maroc
- invent metrics, certifications, reviews, opening hours, or other claims

---

## 11. Production-cutover checklist for this page

Before switching the domain from WordPress to Next.js:

- [ ] `/` returns 200
- [ ] final hostname is `https://batiplusmaroc.com/`
- [ ] title matches approved migration value
- [ ] meta description matches approved migration value
- [ ] canonical matches production URL
- [ ] no accidental `noindex`
- [ ] single intended H1 remains present
- [ ] core service topics remain in server-rendered HTML
- [ ] project discovery remains present
- [ ] blog links use preserved slugs
- [ ] no homepage CTA points to the two old broken routes
- [ ] all important internal links use real anchor hrefs
- [ ] structured data validated
- [ ] image alt migration reviewed
- [ ] mobile layout checked
- [ ] production sitemap includes intended canonical URL
- [ ] production robots rules allow intended indexing
- [ ] staging/preview deployment is not indexable

---

## 12. Next action

Complete the raw-live HTML extraction described in section 8.

Once `migration/homepage-live-audit.json` and `migration/homepage-live-audit.md` exist and have been reviewed, proceed to **Step 3: implement the redesigned V1 homepage from `design.md` while using this migration manifest as the SEO source of truth.**
