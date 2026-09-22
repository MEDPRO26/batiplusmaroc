# Homepage V1 validation

Validated against `migration/homepage-live-audit.json` and the locally rendered Next.js homepage.

| Check | Result | Evidence |
|---|:---:|---|
| Homepage URL preserved | PASS | Homepage remains `/`; production base is `https://batiplusmaroc.com/`. |
| Exact title preserved | PASS | `Entreprise BTP et aménagement à Agadir – Construction pro` |
| Exact meta description preserved | PASS | Matches the audited production value byte-for-byte. |
| Exact canonical preserved | PASS | `https://batiplusmaroc.com/` |
| index/follow preserved | PASS | Rendered meta robots is `index, follow`. |
| Exact H1 preserved | PASS | `Aménagement Agadir : Intérieur & extérieur sur mesure` |
| Exactly one H1 | PASS | Rendered HTML contains one H1. |
| Correct heading hierarchy | PASS | Major sections use H2; service, expertise, project and article titles use H3. |
| All 10 expertise topics present | PASS | All audited topics are server-rendered. |
| All 5 project names present | PASS | All audited names are server-rendered. |
| All 4 article links present | PASS | All four protected article URLs are linked. |
| `/hello-world/` preserved | PASS | Existing slug is linked unchanged. |
| No link to `/prestations-metallerie` | PASS | Not present in rendered links. |
| No link to `/realisations-metallerie` | PASS | Not present in rendered links. |
| No link to `/charpente-metallique` | PASS | Not present in rendered links. |
| No link to `/bardage-metallique/` | PASS | Not present in rendered links. |
| No link to `/serrurerie/` | PASS | Not present in rendered links. |
| No link to `/construction-parasismique/` | PASS | Not present in rendered links. |
| No link to `/ossature-metallique/` | PASS | Not present in rendered links. |
| Protected existing slugs unchanged | PASS | All 13 protected routes are emitted by the production build. |
| Server-rendered SEO content present | PASS | Headings, service topics, projects, testimonials and articles are present in initial HTML. |
| Actual S2MBOU logo used | PASS | `/brand/s2mbou-logo.webp` is rendered in header and footer through `next/image`. |
| Structured data preserved | PASS | Server-rendered graph includes WebPage, BreadcrumbList, WebSite and Organization. |
| S2MBOU blue/charcoal design system applied | PASS | Central tokens use the approved blue, navy, charcoal and neutral palette. |
| No yellow/orange legacy accent remains | PASS | Legacy accent variables and values were removed. |
| Responsive implementation | PASS | Mobile-first rules cover 320px+, tablet, and desktop layouts; navigation switches at 1080px. |
| Visual browser inspection | WARNING | Browser-control runtime was unavailable; a final human visual review remains recommended before launch. |
| `npm run lint` | PASS | ESLint completes without errors. |
| `npm run build` | PASS | Next.js 16.3.1 production build completes and statically renders all routes. |

## Remaining review items

- Confirm the locally migrated production photographs are the final owner-approved media.
- Perform a visual review on representative physical iOS and Android devices before cutover.
- Social image metadata remains intentionally unchanged: no `og:image` or Twitter image was invented.
