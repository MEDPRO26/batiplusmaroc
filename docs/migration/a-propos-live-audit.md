# `/a-propos/` live SEO and content audit

**Captured:** `2026-08-20T19:29:27.425757+00:00`  
**Production source:** `https://batiplusmaroc.com/a-propos/`  
**Source of truth:** Direct production HTTP response and returned HTML.

> Workspace note: `./design.md` was not present. The available `./design (1).md` was read completely together with `SEO_MIGRATION.md` and `migration/homepage-live-audit.json`.

## Exact migration lock

- Requested URL: `https://batiplusmaroc.com/a-propos/`
- Final URL: `https://batiplusmaroc.com/a-propos/`
- HTTP status: `200`
- Redirects for the canonical slash URL: `0`
- Exact title: `À propos - batiplusmaroc.com`
- Exact meta description: `absent (no meta description tag)`
- Exact canonical: `https://batiplusmaroc.com/a-propos/`
- Robots: `index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1`
- HTML language: `fr-FR`
- H1: `À propos`
- Indexable from HTTP, robots, and canonical signals: `True`
- Structured data blocks: `1`
- Heading count: `17`
- Image count (`img` elements): `23`
- Supplemental CSS background-image URLs: `3`
- Internal link occurrences: `28`
- Unique internal URLs: `8`

## Redirect and trailing-slash behavior

- `https://batiplusmaroc.com/a-propos` returns `301` and resolves to `https://batiplusmaroc.com/a-propos/`.
- `https://batiplusmaroc.com/a-propos/` returns `200` directly with no redirect.
- The slash URL is the production canonical form and must remain `/a-propos/`.

## Open Graph metadata

```json
{
  "og:locale": "fr_FR",
  "og:type": "article",
  "og:title": "À propos - batiplusmaroc.com",
  "og:url": "https://batiplusmaroc.com/a-propos/",
  "og:site_name": "batiplusmaroc.com"
}
```

## Twitter metadata

```json
{
  "twitter:card": "summary_large_image",
  "twitter:label1": "Durée de lecture estimée",
  "twitter:data1": "22 minutes"
}
```

## JSON-LD exactly as returned

```json
{"@context":"https:\/\/schema.org","@graph":[{"@type":"WebPage","@id":"https:\/\/batiplusmaroc.com\/a-propos\/","url":"https:\/\/batiplusmaroc.com\/a-propos\/","name":"À propos - batiplusmaroc.com","isPartOf":{"@id":"https:\/\/batiplusmaroc.com\/#website"},"datePublished":"2025-05-01T16:57:41+00:00","dateModified":"2025-08-28T08:41:07+00:00","breadcrumb":{"@id":"https:\/\/batiplusmaroc.com\/a-propos\/#breadcrumb"},"inLanguage":"fr-FR","potentialAction":[{"@type":"ReadAction","target":["https:\/\/batiplusmaroc.com\/a-propos\/"]}]},{"@type":"BreadcrumbList","@id":"https:\/\/batiplusmaroc.com\/a-propos\/#breadcrumb","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":"https:\/\/batiplusmaroc.com\/"},{"@type":"ListItem","position":2,"name":"À propos"}]},{"@type":"WebSite","@id":"https:\/\/batiplusmaroc.com\/#website","url":"https:\/\/batiplusmaroc.com\/","name":"batiplusmaroc.com","description":"","publisher":{"@id":"https:\/\/batiplusmaroc.com\/#organization"},"potentialAction":[{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"https:\/\/batiplusmaroc.com\/?s={search_term_string}"},"query-input":{"@type":"PropertyValueSpecification","valueRequired":true,"valueName":"search_term_string"}}],"inLanguage":"fr-FR"},{"@type":"Organization","@id":"https:\/\/batiplusmaroc.com\/#organization","name":"batiplusmaroc.com","url":"https:\/\/batiplusmaroc.com\/","logo":{"@type":"ImageObject","inLanguage":"fr-FR","@id":"https:\/\/batiplusmaroc.com\/#\/schema\/logo\/image\/","url":"https:\/\/batiplusmaroc.com\/wp-content\/uploads\/2025\/05\/home-build-construction-logo-153-x-40-px.png","contentUrl":"https:\/\/batiplusmaroc.com\/wp-content\/uploads\/2025\/05\/home-build-construction-logo-153-x-40-px.png","width":153,"height":40,"caption":"batiplusmaroc.com"},"image":{"@id":"https:\/\/batiplusmaroc.com\/#\/schema\/logo\/image\/"},"sameAs":["https:\/\/www.facebook.com\/sgta.btp","https:\/\/share.google\/j5BiBjLTGpFdjD3f8"]}]}
```

## Breadcrumbs

### Visible DOM breadcrumb

```json
{
  "text": "Accueil » À propos",
  "items": [
    {
      "name": "Accueil",
      "href": "https://batiplusmaroc.com/",
      "current": false
    },
    {
      "name": "À propos",
      "href": null,
      "current": true
    }
  ]
}
```

### JSON-LD breadcrumb

```json
[
  {
    "@type": "BreadcrumbList",
    "@id": "https://batiplusmaroc.com/a-propos/#breadcrumb",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Accueil",
        "item": "https://batiplusmaroc.com/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "À propos"
      }
    ]
  }
]
```

## Heading structure in DOM order

1. `H1` — À propos
2. `H5` — S2MBOU SARL
3. `H3` — Qui sommes-nous?
4. `H2` — Construction de Bâtiments
5. `H3` — S2MBOU bâtit des structures solides et durables ,de la fondation à la finition. Nos prestations comprennent :
6. `H2` — Travaux Intérieurs & Finitions
7. `H3` — S2MBOU soigne chaque détail intérieur. Nous réalisons :
8. `H2` — Menuiserie & Fermetures :
9. `H3` — S2MBOU conçoit et installe vos menuiseries avec précision et esthétisme. Nous proposons :
10. `H2` — Installations Techniques :
11. `H3` — S2MBOU équipe votre bâtiment en garantissant sécurité et performance. Nous réalisons :
12. `H2` — Un projet ? Contactez-nous, nous sommes à votre écoute.
13. `H4` — Contactez-nous
14. `H6` — S2MBOU Construction – Votre partenaire de confiance dans la réalisation de projets de construction durables et sur mesure. Nous mettons notre expertise et notre engagement au service de vos idées, pour bâtir ensemble un avenir solide.
15. `H6` — Nos services
16. `H6` — Accès rapide
17. `H6` — Contactez nous

## Crawlable content blocks in DOM order

1. `heading` / `H5` — S2MBOU SARL
2. `heading` / `H3` — Qui sommes-nous?
3. `paragraph` / `P` — S2MBOU est une entreprise marocaine spécialisée dans les travaux de Bâtiment et Travaux Publics (BTP) , la construction et l’ aménagement d’espaces résidentiels, commerciaux et industriels. Forte d’une équipe expérimentée et passionnée, notre société accompagne ses clients de l’idée à la réalisation, avec un engagement constant envers la qualité , la sécurité et le respect des délais .
4. `paragraph` / `P` — Notre mission est de bâtir des structures solides, durables et esthétiques, en répondant aux normes les plus strictes et aux besoins spécifiques de chaque projet. Grâce à notre savoir-faire et notre écoute, nous transformons vos visions en réalisations concrètes et pérennes.
5. `heading` / `H2` — Construction de Bâtiments
6. `heading` / `H3` — S2MBOU bâtit des structures solides et durables ,de la fondation à la finition. Nos prestations comprennent :
7. `paragraph` / `P` — Gros œuvre
8. `paragraph` / `P` — Maçonnerie
9. `paragraph` / `P` — Fondations
10. `heading` / `H2` — Travaux Intérieurs & Finitions
11. `heading` / `H3` — S2MBOU soigne chaque détail intérieur. Nous réalisons :
12. `paragraph` / `P` — Plâtrerie
13. `paragraph` / `P` — Peinture
14. `paragraph` / `P` — Carrelage
15. `paragraph` / `P` — Étanchéité
16. `paragraph` / `P` — Installation de climatisation
17. `heading` / `H2` — Menuiserie & Fermetures :
18. `heading` / `H3` — S2MBOU conçoit et installe vos menuiseries avec précision et esthétisme. Nous proposons :
19. `paragraph` / `P` — Menuiserie bois
20. `paragraph` / `P` — Menuiserie PVC
21. `paragraph` / `P` — Menuiserie aluminium
22. `heading` / `H2` — Installations Techniques :
23. `heading` / `H3` — S2MBOU équipe votre bâtiment en garantissant sécurité et performance. Nous réalisons :
24. `paragraph` / `P` — Électricité
25. `paragraph` / `P` — Plomberie
26. `heading` / `H2` — Un projet ? Contactez-nous, nous sommes à votre écoute.
27. `heading` / `H4` — Contactez-nous
28. `cta_link` / `A` — Contactez-nous → `mailto:hello@themenectar.com`

## Semantic topics that must be preserved

- [x] S2MBOU SARL
- [x] Qui sommes-nous?
- [x] Bâtiment et Travaux Publics (BTP)
- [x] construction
- [x] aménagement d’espaces résidentiels, commerciaux et industriels
- [x] qualité
- [x] sécurité
- [x] respect des délais
- [x] Construction de Bâtiments
- [x] Gros œuvre
- [x] Maçonnerie
- [x] Fondations
- [x] Travaux Intérieurs & Finitions
- [x] Plâtrerie
- [x] Peinture
- [x] Carrelage
- [x] Étanchéité
- [x] Installation de climatisation
- [x] Menuiserie & Fermetures
- [x] Menuiserie bois
- [x] Menuiserie PVC
- [x] Menuiserie aluminium
- [x] Installations Techniques
- [x] Électricité
- [x] Plomberie
- [x] Contact CTA

## Internal links in DOM order

1. `Skip to main content` — `#ajax-content-wrap` → `https://batiplusmaroc.com/a-propos/#ajax-content-wrap` — status `200`
2. `phone` — `` → `https://batiplusmaroc.com/a-propos/` — status `200`
3. `email` — `` → `https://batiplusmaroc.com/a-propos/` — status `200`
4. `Close Search` — `#` → `https://batiplusmaroc.com/a-propos/#` — status `200`
5. `` — `https://batiplusmaroc.com` → `https://batiplusmaroc.com` — status `200`
6. `Menu` — `#sidewidgetarea` → `https://batiplusmaroc.com/a-propos/#sidewidgetarea` — status `200`
7. `À propos` — `https://batiplusmaroc.com/a-propos/` → `https://batiplusmaroc.com/a-propos/` — status `200`
8. `Nos services` — `https://batiplusmaroc.com/nos-services/` → `https://batiplusmaroc.com/nos-services/` — status `200`
9. `Gros oeuvre` — `https://batiplusmaroc.com/gros-oeuvre/` → `https://batiplusmaroc.com/gros-oeuvre/` — status `200`
10. `Second oeuvre` — `https://batiplusmaroc.com/second-oeuvre/` → `https://batiplusmaroc.com/second-oeuvre/` — status `200`
11. `Nos réalisations` — `https://batiplusmaroc.com/nos-realisations/` → `https://batiplusmaroc.com/nos-realisations/` — status `200`
12. `Contactez-nous` — `https://batiplusmaroc.com/contactez-nous/` → `https://batiplusmaroc.com/contactez-nous/` — status `200`
13. `Accueil` — `https://batiplusmaroc.com/` → `https://batiplusmaroc.com/` — status `200`
14. `À propos` — `https://batiplusmaroc.com/a-propos/` → `https://batiplusmaroc.com/a-propos/` — status `200`
15. `Nos services` — `https://batiplusmaroc.com/nos-services/` → `https://batiplusmaroc.com/nos-services/` — status `200`
16. `Gros oeuvre` — `https://batiplusmaroc.com/gros-oeuvre/` → `https://batiplusmaroc.com/gros-oeuvre/` — status `200`
17. `Second oeuvre` — `https://batiplusmaroc.com/second-oeuvre/` → `https://batiplusmaroc.com/second-oeuvre/` — status `200`
18. `Nos réalisations` — `https://batiplusmaroc.com/nos-realisations/` → `https://batiplusmaroc.com/nos-realisations/` — status `200`
19. `Close Menu` — `#` → `https://batiplusmaroc.com/a-propos/#` — status `200`
20. `À propos` — `https://batiplusmaroc.com/a-propos/` → `https://batiplusmaroc.com/a-propos/` — status `200`
21. `Nos services` — `https://batiplusmaroc.com/nos-services/` → `https://batiplusmaroc.com/nos-services/` — status `200`
22. `Gros oeuvre` — `https://batiplusmaroc.com/gros-oeuvre/` → `https://batiplusmaroc.com/gros-oeuvre/` — status `200`
23. `Second oeuvre` — `https://batiplusmaroc.com/second-oeuvre/` → `https://batiplusmaroc.com/second-oeuvre/` — status `200`
24. `Nos réalisations` — `https://batiplusmaroc.com/nos-realisations/` → `https://batiplusmaroc.com/nos-realisations/` — status `200`
25. `Contactez-nous` — `https://batiplusmaroc.com/contactez-nous/` → `https://batiplusmaroc.com/contactez-nous/` — status `200`
26. `phone` — `` → `https://batiplusmaroc.com/a-propos/` — status `200`
27. `email` — `` → `https://batiplusmaroc.com/a-propos/` — status `200`
28. `` — `#` → `https://batiplusmaroc.com/a-propos/#` — status `200`

## Images in DOM order

WordPress lazy-loaded images may expose an SVG placeholder in `src`; the real current asset is retained separately in `lazy_source` / `data-nectar-img-src`.

1. `src=https://www.facebook.com/tr?id=1713767920020441&ev=PageView&noscript=1`; `srcset=None`; `alt=None`; `width=1`; `height=1`; `lazy_source=None`; `lazy_srcset=None`
2. `src=https://www.facebook.com/tr?id=26723692560601650&ev=PageView&noscript=1`; `srcset=None`; `alt=fbpx`; `width=1`; `height=1`; `lazy_source=None`; `lazy_srcset=None`
3. `src=https://batiplusmaroc.com/wp-content/uploads/2025/05/home-build-construction-logo-153-x-40-px.png`; `srcset=None`; `alt=batiplusmaroc.com`; `width=153`; `height=40`; `lazy_source=None`; `lazy_srcset=None`
4. `src=https://batiplusmaroc.com/wp-content/uploads/2025/05/home-build-construction-logo-153-x-40-px.png`; `srcset=None`; `alt=batiplusmaroc.com`; `width=153`; `height=40`; `lazy_source=None`; `lazy_srcset=None`
5. `src=https://batiplusmaroc.com/wp-content/uploads/2025/05/Beige-and-Dark-Brown-Simple-Minimalist-Bookstore-Circle-Logo-2.png`; `srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/Beige-and-Dark-Brown-Simple-Minimalist-Bookstore-Circle-Logo-2.png 500w, https://batiplusmaroc.com/wp-content/uploads/2025/05/Beige-and-Dark-Brown-Simple-Minimalist-Bookstore-Circle-Logo-2-300x300.png 300w, https://batiplusmaroc.com/wp-content/uploads/2025/05/Beige-and-Dark-Brown-Simple-Minimalist-Bookstore-Circle-Logo-2-150x150.png 150w, https://batiplusmaroc.com/wp-content/uploads/2025/05/Beige-and-Dark-Brown-Simple-Minimalist-Bookstore-Circle-Logo-2-100x100.png 100w, https://batiplusmaroc.com/wp-content/uploads/2025/05/Beige-and-Dark-Brown-Simple-Minimalist-Bookstore-Circle-Logo-2-140x140.png 140w, https://batiplusmaroc.com/wp-content/uploads/2025/05/Beige-and-Dark-Brown-Simple-Minimalist-Bookstore-Circle-Logo-2-350x350.png 350w`; `alt=`; `width=500`; `height=500`; `lazy_source=None`; `lazy_srcset=None`
6. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%201000%20667'%2F%3E`; `srcset=None`; `alt=`; `width=1000`; `height=667`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/2983.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/2983.jpg 1000w, https://batiplusmaroc.com/wp-content/uploads/2025/05/2983-600x400.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/2983-300x200.jpg 300w, https://batiplusmaroc.com/wp-content/uploads/2025/05/2983-768x512.jpg 768w, https://batiplusmaroc.com/wp-content/uploads/2025/05/2983-900x600.jpg 900w`
7. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20667%201000'%2F%3E`; `srcset=None`; `alt=`; `width=667`; `height=1000`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/2873.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/2873.jpg 667w, https://batiplusmaroc.com/wp-content/uploads/2025/05/2873-600x900.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/2873-200x300.jpg 200w`
8. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20667%201000'%2F%3E`; `srcset=None`; `alt=`; `width=667`; `height=1000`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/construction-agadir.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/construction-agadir.jpg 667w, https://batiplusmaroc.com/wp-content/uploads/2025/05/construction-agadir-600x900.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/construction-agadir-200x300.jpg 200w`
9. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%201000%20667'%2F%3E`; `srcset=None`; `alt=`; `width=1000`; `height=667`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/2983.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/2983.jpg 1000w, https://batiplusmaroc.com/wp-content/uploads/2025/05/2983-600x400.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/2983-300x200.jpg 300w, https://batiplusmaroc.com/wp-content/uploads/2025/05/2983-768x512.jpg 768w, https://batiplusmaroc.com/wp-content/uploads/2025/05/2983-900x600.jpg 900w`
10. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20970%201000'%2F%3E`; `srcset=None`; `alt=`; `width=970`; `height=1000`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/travaux-interieure.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/travaux-interieure.jpg 970w, https://batiplusmaroc.com/wp-content/uploads/2025/05/travaux-interieure-600x619.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/travaux-interieure-291x300.jpg 291w, https://batiplusmaroc.com/wp-content/uploads/2025/05/travaux-interieure-768x792.jpg 768w`
11. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20703%201000'%2F%3E`; `srcset=None`; `alt=`; `width=703`; `height=1000`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/peinture-maroc-.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/peinture-maroc-.jpg 703w, https://batiplusmaroc.com/wp-content/uploads/2025/05/peinture-maroc--600x853.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/peinture-maroc--211x300.jpg 211w`
12. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20667%201000'%2F%3E`; `srcset=None`; `alt=`; `width=667`; `height=1000`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/travaux-etancheite.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/travaux-etancheite.jpg 667w, https://batiplusmaroc.com/wp-content/uploads/2025/05/travaux-etancheite-600x900.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/travaux-etancheite-200x300.jpg 200w`
13. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%201000%20667'%2F%3E`; `srcset=None`; `alt=`; `width=1000`; `height=667`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/14756.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/14756.jpg 1000w, https://batiplusmaroc.com/wp-content/uploads/2025/05/14756-600x400.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/14756-300x200.jpg 300w, https://batiplusmaroc.com/wp-content/uploads/2025/05/14756-768x512.jpg 768w, https://batiplusmaroc.com/wp-content/uploads/2025/05/14756-900x600.jpg 900w`
14. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%201000%201500'%2F%3E`; `srcset=None`; `alt=`; `width=1000`; `height=1500`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/pvc.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/pvc.jpg 1000w, https://batiplusmaroc.com/wp-content/uploads/2025/05/pvc-600x900.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/pvc-200x300.jpg 200w, https://batiplusmaroc.com/wp-content/uploads/2025/05/pvc-683x1024.jpg 683w, https://batiplusmaroc.com/wp-content/uploads/2025/05/pvc-768x1152.jpg 768w`
15. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20766%201000'%2F%3E`; `srcset=None`; `alt=`; `width=766`; `height=1000`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/menuiserie-maroc-.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/menuiserie-maroc-.jpg 766w, https://batiplusmaroc.com/wp-content/uploads/2025/05/menuiserie-maroc--600x783.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/menuiserie-maroc--230x300.jpg 230w`
16. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20667%201000'%2F%3E`; `srcset=None`; `alt=`; `width=667`; `height=1000`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/travaux-aluminum.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/travaux-aluminum.jpg 667w, https://batiplusmaroc.com/wp-content/uploads/2025/05/travaux-aluminum-600x900.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/travaux-aluminum-200x300.jpg 200w`
17. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20667%201000'%2F%3E`; `srcset=None`; `alt=`; `width=667`; `height=1000`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/menuiserie.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/menuiserie.jpg 667w, https://batiplusmaroc.com/wp-content/uploads/2025/05/menuiserie-600x900.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/menuiserie-200x300.jpg 200w`
18. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%201000%20667'%2F%3E`; `srcset=None`; `alt=`; `width=1000`; `height=667`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/amenagement-cuisine.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/amenagement-cuisine.jpg 1000w, https://batiplusmaroc.com/wp-content/uploads/2025/05/amenagement-cuisine-600x400.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/amenagement-cuisine-300x200.jpg 300w, https://batiplusmaroc.com/wp-content/uploads/2025/05/amenagement-cuisine-768x512.jpg 768w, https://batiplusmaroc.com/wp-content/uploads/2025/05/amenagement-cuisine-900x600.jpg 900w`
19. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20893%201500'%2F%3E`; `srcset=None`; `alt=`; `width=893`; `height=1500`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/electricite-maroc.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/electricite-maroc.jpg 893w, https://batiplusmaroc.com/wp-content/uploads/2025/05/electricite-maroc-600x1008.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/electricite-maroc-179x300.jpg 179w, https://batiplusmaroc.com/wp-content/uploads/2025/05/electricite-maroc-610x1024.jpg 610w, https://batiplusmaroc.com/wp-content/uploads/2025/05/electricite-maroc-768x1290.jpg 768w`
20. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20667%201000'%2F%3E`; `srcset=None`; `alt=`; `width=667`; `height=1000`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/plomberie-maroc.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/plomberie-maroc.jpg 667w, https://batiplusmaroc.com/wp-content/uploads/2025/05/plomberie-maroc-600x900.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/plomberie-maroc-200x300.jpg 200w`
21. `src=data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20667%201000'%2F%3E`; `srcset=None`; `alt=`; `width=667`; `height=1000`; `lazy_source=https://batiplusmaroc.com/wp-content/uploads/2025/05/electricite-maroc-.jpg`; `lazy_srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/electricite-maroc-.jpg 667w, https://batiplusmaroc.com/wp-content/uploads/2025/05/electricite-maroc--600x900.jpg 600w, https://batiplusmaroc.com/wp-content/uploads/2025/05/electricite-maroc--200x300.jpg 200w`
22. `src=https://batiplusmaroc.com/wp-content/uploads/2025/05/home-build-construction-logo-153-x-40-px-334-x-65-px.png`; `srcset=https://batiplusmaroc.com/wp-content/uploads/2025/05/home-build-construction-logo-153-x-40-px-334-x-65-px.png 334w, https://batiplusmaroc.com/wp-content/uploads/2025/05/home-build-construction-logo-153-x-40-px-334-x-65-px-300x58.png 300w`; `alt=`; `width=334`; `height=65`; `lazy_source=None`; `lazy_srcset=None`
23. `src=https://www.facebook.com/tr?id=1713767920020441&ev=PageView&noscript=1&cd%5Bpage_title%5D=%C3%80+propos&cd%5Bpost_type%5D=page&cd%5Bpost_id%5D=18&cd%5Bplugin%5D=PixelYourSite&cd%5Buser_role%5D=guest&cd%5Bevent_url%5D=batiplusmaroc.com%2Fa-propos%2F`; `srcset=None`; `alt=`; `width=1`; `height=1`; `lazy_source=None`; `lazy_srcset=None`

## Supplemental CSS background images

```json
[
  "https://batiplusmaroc.com/wp-content/uploads/2025/05/570-1.jpg",
  "https://batiplusmaroc.com/wp-content/uploads/2025/05/2149278557.jpg",
  "https://batiplusmaroc.com/wp-content/uploads/2025/05/Amenagement-agadir.png"
]
```

## Comparison with `SEO_MIGRATION.md`

### Matches

- SEO_MIGRATION.md records the rendered H1 as ‘À propos’; production matches exactly.
- SEO_MIGRATION.md records no meta description for /a-propos/; production has no meta description tag.
- SEO_MIGRATION.md lists the four current service families; all four are present in production HTML.
- The protected route and canonical remain https://batiplusmaroc.com/a-propos/.

### Discrepancies and notes

- No exact-value conflict was found between SEO_MIGRATION.md and the current production HTML for /a-propos/.
- The requested ./design.md file is absent from the workspace; the existing design (1).md was read as the available design specification.

## SEO and accessibility problems

- **P1 — SEO:** The page has no meta description tag.
- **P2 — Social metadata:** Open Graph metadata is missing: og:description, og:image.
- **P2 — Social metadata:** Twitter metadata is missing: twitter:description, twitter:image, twitter:title.
- **P2 — Heading structure:** Heading levels skip hierarchy steps in the production DOM.
- **P2 — Accessibility / images:** Images include 1 missing alt attributes and 19 empty alt attributes; decorative intent requires manual validation.
- **P2 — Image migration:** WordPress lazy-loaded images expose SVG placeholders in src and real asset URLs in data-nectar-img-src; migration must use the real asset URLs.
- **P2 — Structured data / entity consistency:** Visible content identifies S2MBOU, while Organization schema names the entity batiplusmaroc.com.
- **P1 — Contact CTA:** The visible Contactez-nous CTA points to the WordPress theme placeholder mailto:hello@themenectar.com instead of the protected /contactez-nous/ route or verified business email.

## Migration instruction

Do not redesign or rewrite this page from this audit. At implementation time, preserve `/a-propos/`, its canonical/indexability, exact title, H1, service-family coverage, internal-link relationships, breadcrumb relationship, and the exact crawlable content unless an intentional SEO change is separately approved.
