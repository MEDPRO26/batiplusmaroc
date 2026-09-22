# `/a-propos/` V1 migration validation

**Compared against:** `migration/a-propos-live-audit.json`  
**Implementation:** Next.js App Router, Server Components, Tailwind CSS utilities  
**Validation date:** 2026-08-20

## Results

| Check | Result | Evidence |
|---|---|---|
| `/a-propos/` preserved | PASS | The existing App Router route remains `app/a-propos/page.tsx`. |
| Trailing-slash behavior preserved | PASS | `/a-propos` permanently redirects to `/a-propos/`; `/a-propos/` returns `200`. Next.js emits its framework-native `308` permanent redirect, while WordPress returned `301`. The canonical slash destination is unchanged. |
| Title exact | PASS | Rendered title is `À propos - batiplusmaroc.com`. |
| Meta description remains absent | PASS | No `<meta name="description">` is rendered. |
| Canonical exact | PASS | `https://batiplusmaroc.com/a-propos/`. |
| `index, follow` preserved | PASS | Robots output begins `index, follow` and retains the production preview/snippet directives. |
| Exactly one H1 | PASS | Rendered DOM contains one H1. |
| H1 remains `À propos` | PASS | Exact rendered H1 text verified. |
| All four original service groups preserved | PASS | Construction de bâtiments; Travaux intérieurs & finitions; Menuiserie & fermetures; Installations techniques. |
| Construction / gros-œuvre semantics preserved | PASS | Construction, gros œuvre, maçonnerie and fondations are server-rendered. |
| Interior / finishing semantics preserved | PASS | Travaux intérieurs, finitions, plâtrerie, peinture, carrelage, étanchéité and installation de climatisation are server-rendered. |
| Joinery semantics preserved | PASS | Menuiserie bois, PVC and aluminium are server-rendered. |
| Electricity / plumbing semantics preserved | PASS | Électricité and plomberie are server-rendered. |
| Theme-placeholder email removed | PASS | `hello@themenectar.com` is absent from the new page and About components. |
| New CTA targets `/contactez-nous/` | PASS | The About CTA is a crawlable Next.js link to the protected contact route. |
| Real local WebP portfolio images used | PASS | Hero, progression, activities and gallery use `/public/images/portfolio-2026/` WebP assets through `next/image`. |
| No fake metrics | PASS | No counters or quantitative company-performance claims were added. |
| No fake project claims | PASS | Project proof is limited to Immeuble R+5, Quartier Al-Huda, Agadir and the supported construction/gros-œuvre scope. |
| Tailwind-first implementation | PASS | New page styling is expressed in JSX utility classes; no About-specific rules or `@apply` blocks were added to `globals.css`. |
| Responsive layout | PASS | Verified at 1440×900 and 375×812; document width equals viewport width at both sizes. |
| Console health | PASS | No browser console errors or warnings were recorded on the rendered page. |
| `npm run build` | PASS | Next.js 16.3.1 production build compiled, type-checked and statically generated all routes. |

## Structured-data migration warning

The production entity discrepancy remains intentionally unresolved:

- Visible business identity: `S2MBOU` / `S2MBOU SARL`
- `Organization` schema identity: `batiplusmaroc.com`

The V1 About-page schema preserves `batiplusmaroc.com` as the `Organization` and `WebSite` name. Entity normalization must be handled as a separate approved SEO decision.

The same production schema families remain represented: `WebPage`, `BreadcrumbList`, `WebSite`, and `Organization`. No unrelated schema type was introduced.

## Intentional production defect repair

The old CTA target `mailto:hello@themenectar.com` was replaced with `/contactez-nous/`. See `migration/a-propos-v1-link-fixes.md`.
