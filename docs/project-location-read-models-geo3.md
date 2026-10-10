# GEO3 — Shared location read models and privacy-safe DTOs

Date: 2026-10-08. Result: **PASS for the assigned GEO3 implementation and local verification**. Deployment parity, browser verification and authenticated E2E are unverified. GEO4 has not started.

The GEO3 assignment explicitly approves public and pre-interest Company access to region, province/prefecture and commune; locality/douar and historical neighborhood require the existing mutual-interest authorization. Owning Clients and authorized Admins can read all recorded project geography. Exact site addresses remain in the authorized site-visit workflow. This approval resolves the visibility decision marked OPEN in the older local geography specification for this task. It does not approve other OPEN policies.

## Baseline and scope

- Branch: `feature/nationwide-project-intake`.
- Starting HEAD: `09ade8315cae5fca94de3c687693270e96f43826` (`feat(geo): add nationwide project schema and indexes`). GEO1 catalogue commit: `f10a3fe1e300c2ffa9f72c444ba5c895740c0a38`.
- The worktree was clean at the start of GEO3. The cached `origin/main` and the remote main ref agreed at `7e8400d559a7f070590395ce31828e420a581e51` when checked.
- GEO2's four optional geographic strings and two additive project indexes remain unchanged. No schema, generated file, index, dependency or external API was added or changed.
- No repository Convex dev/deploy process was running at the initial or final checks. No deployment, codegen, data migration or seed operation was run. Seed test suites below use the existing in-memory test conventions.
- No branch switch, pull, reset, commit, push, merge or tag was performed. The implementation is an uncommitted working-tree change.

## Read models and formatting

`lib/geography/project-location.ts` is pure TypeScript. It contains no database access or authorization logic.

```typescript
type GeneralProjectLocation = Readonly<{
  regionCode: string | null;
  provinceCode: string | null;
  communeName: string | null;
  legacyCity: string | null;
}>;

type DetailedProjectLocation = GeneralProjectLocation & Readonly<{
  localityName: string | null;
  neighborhood: string | null;
}>;
```

Both projections construct explicit allowlisted objects. Neither includes an exact address. The general model has no `localityName` or `neighborhood` property, including null placeholders. Unknown administrative codes are omitted from the general model; a known province is retained only when its recorded parent is absent or compatible. A missing parent is never inferred. The detailed model retains the six recorded strings for entitled readers, including unknown or inconsistent historical codes, without rewriting storage.

The formatter uses GEO1's existing private Maps and FR/EN catalogue names. It prefers valid structured administrative names, with the existing ten translated city keys as the legacy fallback. Commune/locality/neighborhood text is displayed directly, never used as a translation key. Unknown codes have a translated unspecified-location fallback; they are not echoed into the label. Display whitespace is normalized while DTO/storage strings, spelling, case, accents, Arabic and Amazigh Unicode remain intact. The ten-city display allowlist is frozen and tested against the existing historical validator; it creates no city-to-administrative-area mapping.

`useProjectLocationLabel` supplies labels through `next-intl`. It consumes the server's audience projection; older DTOs fall back to legacy city only and do not infer authorization from a top-level neighborhood or frontend quote eligibility flag. Minimal callers now display structured-only/no-city, mixed and legacy records without constructing `cityOptions.null` or free-text translation keys.

## Backend authorization and privacy

`convex/projects/location.ts` owns the DTO validators and Company detail authorization helper. Public queries and Company feed cards always return the general projection. Company detail returns the detailed projection only after all existing project-detail eligibility checks and the existing conversation access helper succeed. The historical top-level Company `neighborhood` key is also omitted before mutual interest.

The detail check uses the existing indexed `(projectId, companyId)` conversation lookup, capped at two records. Missing or duplicate conversations fail closed. It checks current project ownership and calls `requireConversationAccess`, which derives the caller from authenticated identity and rechecks current role, active Company membership and the original proposal/invitation relationship. Its result must match the current Project, Company and owning Client. Expected access denials produce a general projection; unexpected failures propagate without logging geographic values.

Submitting an initial proposal alone cannot unlock details. A Client-opened discussion and an accepted direct invitation use the existing source/conversation gates. An accepted invitation flag without an authorized conversation cannot reveal locality. Accepted private invitations must also belong to the current owning Client before granting the existing invitation detail path; stale or malformed ownership relationships are denied. Valid invitation behavior is preserved.

Current owning Client and Admin readers retain their existing backend guards and receive the detailed geographic model. Anonymous, other-Client, Company and SEO callers cannot substitute frontend flags for those checks. Company read eligibility for existing verification/operational statuses is preserved; proposal-write verification and suspension rules are unchanged.

Generic project readers never join site-visit addresses or private visit proposals. Private project attachments retain their existing authorization paths. No messaging helper, site-visit permission, quote/Deal transition, commission or OC3 business rule was changed. The Company quote ID expression now uses `recentQuotes.at(0)` to expose its existing nullable runtime behavior accurately in TypeScript.

Public and Company readers now represent eligible published no-city records with `city: null`. Only their read-completeness city requirement was removed. Status, visibility, ownership, invitation access, other completeness fields, existing filters, cursor handling and query ordering remain in place. All project mutations, draft resume logic, wizard submission and Admin publication writes are unchanged.

## Changed files

New implementation files:

- `lib/geography/project-location.ts`
- `convex/projects/location.ts`
- `features/projects/hooks/use-project-location-label.ts`

Backend read projections:

- `convex/projects/index.ts`
- `convex/projects/marketplace.ts`
- `convex/admin/projects.ts`

Minimal directly affected labels:

- `features/projects/components/client-project-details.tsx`
- `features/projects/components/company-project-details.tsx`
- `features/projects/components/company-project-marketplace.tsx`
- `features/projects/components/public-project-browse.tsx`
- `features/projects/components/project-discovery-empty-state.tsx`
- `features/admin/components/admin-projects-panel.tsx`
- `features/clients/components/client-dashboard.tsx`
- `features/companies/components/company-dashboard.tsx` (two existing marketplace feed labels only)
- `messages/fr.json`
- `messages/en.json`

Tests and report:

- New: `lib/geography/project-location.test.ts`, `convex/projects.location.test.ts`, `features/projects/project-location-rendering.test.tsx`.
- Updated: `convex/projects.marketplace.test.ts`, `convex/projects.geography-schema.test.ts`, `features/projects/project-workspace.test.tsx`, `features/messages/messages-inbox.test.tsx`.
- New: `docs/project-location-read-models-geo3.md` (this report).

The marketplace regression previously expected pre-interest `neighborhood`; it now asserts that both restricted geographic keys are absent. The GEO2 storage/projection regression now reflects GEO3's general nested projection and no-city read support while preserving storage/index and private-visibility assertions. The two frontend test files only add the new location field to typed fixtures.

## Verification

All verification is local against source and in-memory Convex fixtures. Results do not prove deployed schema/code parity or a live authenticated end-to-end flow.

| Check | Result |
|---|---|
| New GEO3 pure/backend/rendering suites | 3 files, 68 tests passed |
| Final combined focused and affected regression run | 30 files, 837 tests passed |
| `npm run typecheck -- --incremental false` | Passed |
| ESLint over all changed/new TypeScript and TSX, `--max-warnings 0` | 21 files passed |
| Registered-write/helper source comparison against HEAD | Passed; project/Admin mutations, marketplace backfill, wizard resume and search query helpers unchanged |
| `git diff --check`, including a separate check of untracked files | Passed |
| Final repository Convex dev/deploy process check | None running |

The final test command was:

```sh
npm test -- --no-cache \
  lib/geography/morocco.test.ts lib/geography/project-location.test.ts \
  convex/projects.location.test.ts convex/projects.geography-schema.test.ts \
  convex/projects.test.ts convex/projects.marketplace.test.ts \
  convex/admin.projects.test.ts convex/admin.siteVisits.test.ts \
  convex/quotes.test.ts convex/invitations.test.ts convex/proposals.test.ts \
  convex/messages.test.ts convex/siteVisits.test.ts convex/finalQuotes.test.ts \
  convex/deals.test.ts convex/clientSupport.test.ts \
  convex/clientSupportNotifications.test.ts convex/coordinationAgreements.test.ts \
  convex/companies.test.ts convex/companyProfileManagement.test.ts \
  convex/companyDiscovery.test.ts convex/seedProjects.test.ts convex/seedCompanies.test.ts \
  features/projects/project-location-rendering.test.tsx \
  features/projects/project-workspace.test.tsx \
  features/projects/company-project-marketplace.test.tsx \
  features/projects/public-project-browse.test.tsx \
  features/admin/admin-projects.test.tsx features/messages/messages-inbox.test.tsx \
  features/companies/company-dashboard-budget.test.tsx
```

New coverage includes legacy-only, structured-only, mixed, incomplete and invalid records; FR/EN rendering with real translations; sentinel-based DTO key/value absence; submitted-only proposals and pending invitations; actual existing discussion-open/accept-invitation mutations; other-Company isolation; revoked membership and roles; changed ownership/source Project/source Company/source status; duplicate conversations; authorized owner/Admin access; private visibility; and exact site addresses restricted to the existing visit endpoint.

The unchanged marketplace search-text builder indexes title, legacy city and category text. It does not add commune, locality, neighborhood or administrative codes. The existing geography regression verifies exclusion of the added free-text location values. The new helper emits no location logs or values in errors. Existing raw title/category text can still contain user-entered sensitive material.

Render tests use static React rendering with mocked data hooks, navigation and images. They do not verify image delivery, browser interaction, responsive layouts or authenticated E2E. A production build and full repository test run were not performed. The existing Vite config-loader future-compatibility warning remains outside GEO3.

## Complexity

- Region/province lookups and parent validation use GEO1 Map lookups: O(1) average for bounded catalogue codes.
- Each projection has a fixed number of fields and lookups. No per-project geographic database lookup or new full-table scan is introduced.
- Formatting is linear in the text processed, with at most five display parts; O(L) time and O(L) temporary/output space when L includes input and output text. Whitespace normalization necessarily reads the supplied input even when the normalized output is shorter.
- Shared catalogue storage remains O(R + P), with 12 regions and 75 provinces/prefectures. The historical-city set adds ten entries; per-projection auxiliary space is constant apart from returned strings.
- Only a Company detail read adds the bounded conversation lookup plus the existing authorization helper's reads. Feed/public cards add no conversation query. Indexed database seek cost remains the platform's cost; the number of newly inspected conversation records is at most two.

## Downstream consumer handoff

The following consumers still use historical city summaries or filters. They are identified for GEO9.2 unless their required backend/write/discovery work belongs to an earlier explicit GEO task.

| Consumer | Existing dependency and later work |
|---|---|
| `convex/invitations/index.ts`; `features/invitations/components/company-invitations.tsx`, `invite-company-button.tsx` | Invitation/eligible-project summaries and city labels need shared general or authorized location DTOs; preserve invitation access. |
| `convex/proposals/index.ts`; `features/proposals/components/company-proposals.tsx` | Proposal project summaries and labels remain city based; no new locality visibility before mutual interest. |
| `convex/quotes/index.ts`; `features/quotes/components/company-initial-quote-workspace.tsx` | Initial-quote project summary still requires city and can throw `PROJECT_INCOMPLETE` for no-city records. Backend compatibility belongs to GEO4.2; subsequent labels belong to GEO9.2. |
| `convex/deals/company.ts`; `features/deals/components/company-work.tsx` | Deal project summaries read current project city; migrate display separately without changing financial snapshots or transitions. |
| `convex/clientSupport/index.ts`; `features/client-support/components/client-support-page.tsx`, `admin-support-panel.tsx` | OC3 project context and labels remain city based. Future adaptation must preserve private support access and agreement behavior. |
| `convex/admin/siteVisits.ts`; `features/admin/components/admin-site-visits-panel.tsx` | City filters/project labels remain; filters and query design belong to GEO9.1, display to GEO9.2. Exact address authority is unchanged. |
| Final-quote views and their surrounding project context | Include in the GEO9.2 cross-domain display audit; GEO3 changed no final-quote API or revision behavior. |
| Company dashboard/profile/discovery | Only the directly affected live marketplace feed labels were adapted here. Company headquarters, coverage, filters and other workflow summaries remain for their assigned GEO tasks. |
| `components/home/marketplace-feed.tsx`; `content/marketplace.ts` | These use static sample content, not the live project DTO. Public integration is separate GEO6.2/GEO9.2 work. |
| `features/projects/components/project-wizard.tsx`; project/Admin publication and resume logic | Legacy ten-city intake remains intact. GEO4.1/GEO4.2/GEO5 must complete the new write/intake flow before nationwide launch. |

Current Company/public city filters remain the existing ten-city options. New records are visible in eligible unfiltered readers, but geographic discovery/filter redesign is deferred. Public list's existing 24-row cap and Admin list/site-visit caps remain unchanged; pagination expansion belongs to the assigned later tasks.

## Risks and GEO4 readiness

Descriptions, titles, photos and permitted free-text commune names may independently identify a site. Neither this DTO work nor the existing search builder can remove such user-entered content. The approved coarse projection blocks dedicated locality/neighborhood fields before mutual interest; it is not a content-moderation or geocoding system. Input bounds and privacy guidance remain tasks for the authorized write/UI changes.

The no-city read contract is ready, but the current wizard, publication/approval and initial-quote city gates are not nationwide intake. Do not treat read support as completed project-to-quote compatibility. Other historical city consumers above require their assigned changes before launch.

Frontend/backend source changes need a coordinated later deployment. The client hook tolerates older city-only DTOs, but local tests do not establish any deployment parity. Existing OC3 release, authenticated E2E and historical private-media checks remain open; this work makes no claim to resolve them.

GEO3 provides the read foundation for a separately authorized GEO4.1 task. Required-locality rules, exact input bounds, uncertain-area fallback, post-publication correction and multi-site policy must follow their own Product HQ decisions. GEO3 has not chosen those policies, changed write rules or started the next task. Stop here for Product HQ review.
