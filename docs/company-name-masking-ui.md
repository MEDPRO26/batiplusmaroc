# Company Name Masking V1 — Step 3 UI audit

Convex remains the identity/privacy boundary. Client/public components render
the supplied `name`, `companyName` and `otherPartyName` verbatim. No React masking,
private Company lookup or Deal-based reveal is added.

## Bypasses fixed

The homepage category cards, homepage featured-company feed and Client hiring
guide previously rendered static Company fixtures, including a real Company
name. All three now use `companies/directory.listPublicCompanies` through
`features/companies/hooks/use-public-company-preview.ts`. The obsolete Company
fixtures and their lookup functions are removed from `content/marketplace.ts`.

Previews request verified public companies only, with bounded first pages of
5/6/2 rows respectively. Category filtering and eligibility stay in Convex.
Loading/empty states never fall back to static identities. Names, descriptions,
image labels, service labels and rating data come from the safe DTO; existing
localized labels and profile URLs are preserved. No backend/schema change.

## Surfaces audited

| Surface | Safe identity source | Outcome |
| --- | --- | --- |
| Homepage category/feed and hiring cards | `companies/directory.listPublicCompanies` | Static-identity bypasses fixed. |
| Find Companies cards and profile preview | Public directory / public profile DTO | Already renders safe `name`. |
| Public Company profile, portfolio/realisations and reviews | `portfolio/index.getPublicCompanyProfile` | Already renders safe name/text/alt labels. |
| Client proposals, detail and shortlist | Received-initial-quote DTOs | Already renders safe `company.name` and description. |
| Client invitations | Project invitation DTO | Already renders safe `companyName`. |
| Messages inbox, header and context | Thread/conversation DTOs | Already renders safe `otherPartyName`, preview and body. |
| Message attachments and Final Quote download links | Authorized message/revision DTOs | Safe filename/URL used; no original-name fallback. |
| Site visits, Final Quote sheet and workflow | Authorized assessment/Final Quote DTOs | Already renders safe `companyName` and commercial text. |
| Client project current-step Company card | Thread / received-quote DTO | Already renders safe counterpart/Company name. |
| Notification page and bell | Notification DTO / shared presentation | Already interpolates safe payload names and previews. |
| Admin Company views | Existing authorized Admin DTOs | Full identity retained; production code unchanged. |
| Own Company profile/settings/dashboard/navbar | Existing own-Company DTOs | Full identity retained; production code unchanged. |

## Scope and tests

Legacy SEO/brand pages, static editorial content and marketing testimonials are
not marketplace Company DTO views and are preserved. Slugs/contact/logo/image
protection and Client/Deal identity reveal remain later approved steps. Existing
marketplace actions, authorization and FR/EN routing are unchanged.

`features/marketplace/company-identity-ui.test.tsx` exercises real components with
mocked Convex responses and actual FR/EN messages. Coverage includes safe names
and image labels, no recovery endpoints/static-name fallbacks, profile/portfolio,
proposals/shortlist, invitations, inbox/context/attachments, visits/Final Quotes,
notifications, current-step cards and loading/empty states. It also checks that
promotional previews deduplicate rows without reconstructing identity. Separate
Admin and own-Company regressions preserve privileged full names. The existing
homepage Project-feed test verifies that the Company query stays skipped until
the Company tab is selected.

All checks run locally. Builds use process-local localhost Convex URL overrides
to avoid production reads; environment files are not changed. No deployment,
live Convex operation, migration or production write is part of this step.

## Files changed and verification

Production UI/data modules:

- `components/home/category-marketplace.tsx`
- `components/home/marketplace-feed.tsx`
- `components/how-it-works/client-hiring-guide.tsx`
- `components/how-it-works/hiring-company-previews.tsx` (new)
- `features/companies/hooks/use-public-company-preview.ts` (new)
- `content/marketplace.ts`

Tests/report:

- `features/marketplace/company-identity-ui.test.tsx` (new, 30 tests)
- `features/admin/admin-companies.test.tsx` (2 additional tests)
- `features/companies/company-profile-editor.test.tsx` (1 additional test)
- `components/home/marketplace-feed.test.tsx` (existing FR/EN checks updated)
- `docs/company-name-masking-ui.md` (this report)

Results:

- Focused suite: 12 files, 143 tests passed.
- `npm test`: 96 files, 1,223 tests passed.
- `npm run typecheck`: passed before and after the build.
- `npm run lint`: passed; 0 errors and 10 existing generated-file/SEO warnings.
- `npm run build`: passed; expected managed-metadata fallback warnings because
  live Convex endpoints were replaced with process-local localhost URLs.
- `git diff --check`: passed.

No changes are staged or committed automatically. Include the four new files
listed above when staging this Step 3 change so a clean checkout has its required
UI/helper/test/report modules.
