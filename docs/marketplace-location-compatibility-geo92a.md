# GEO9.2A — Marketplace Project location compatibility

Date: 2026-10-09. Result: **PASS for local source and focused verification.** Ready for Product HQ review. Deployment parity and authenticated browser E2E remain unverified.

## Baseline and isolation

- Worktree: `/Users/yassin/.codex/worktrees/f0ff/batiplusmaroc`, verified as a linked Codex worktree distinct from the original project checkout.
- The worktree was clean before switching to detached HEAD `3bd084a88c79b4f3a05813524f90f5db4472b825`. HEAD matches `feature/nationwide-project-intake`.
- Preserved branches: `parallel/geo91-display` (`051ddd1`), `parallel/geo91b` (`99a6f72`), `parallel/geo91c` (`48bf8fb`). No branch was created for this task.
- Cached `origin/main` and the read-only remote main check agree at `7e8400d559a7f070590395ce31828e420a581e51`.
- Read the repository instructions, Convex AI guidelines, local Next.js client-component/testing guides and GEO3 handoff. The untracked geography specification was absent from this baseline; its existing copy in the original checkout was read without modifying that checkout.
- No deployment, watcher, migration, commit, push, merge or backfill. Changes remain unstaged in this isolated worktree for review.

## Consumers corrected

| Consumer | Location-only correction |
|---|---|
| `invitations.listMyEligibleProjectsForCompany` | Adds the existing detailed GEO3 projection to owner-only Project choices. Keeps the legacy nullable `city` field and all eligibility, status, ownership, ordering and result limits. |
| `invitations.listMyCompanyInvitations` | Adds the existing general GEO3 projection to Company summaries. Pending, accepted and declined invitation summaries all omit locality and neighborhood. |
| `invitations.listProjectInvitations` | The shared DTO now includes a detailed projection for the current owning Client, after the existing owner and invitation relationship checks. |
| Company invitation cards | Replace city-only translation with `useProjectLocationLabel`, including structured/no-city and unspecified historical records. Existing category/status labels and actions stay unchanged. |
| Client invitation Project picker | Uses `useProjectLocationLabel` for each existing option, including the owner's saved detailed geography. No new interaction, mutation or invitation eligibility rule. |
| `proposals.listMyProposals` | Adds the existing general GEO3 projection to the Company's own initial-quote summaries, preserving statuses, estimates, workspace eligibility, conversation links, sort and 200-row result limit. |
| Company proposal rows | Replace city-only translation and cast with the shared location hook. Keep amount formatting, status filters and discussion/proposal links. |

Company list summaries deliberately remain general even after engagement. Detailed geography remains available through the existing authorized Project detail reader. Neither a submitted proposal nor an invitation status is used as a substitute for that reader's conversation authorization.

The server uses the existing `convex/projects/location.ts` validators and the pure GEO3 projections. The UI uses the existing shared hook/formatter and GEO1's FR/EN administrative names. Commune/locality text is displayed as text, never interpolated into a translation key. Existing translated legacy city names and unspecified-location copy are reused; no new translation or catalogue entries are needed.

## Quote inspection and preserved behavior

- `convex/quotes/index.ts` already supports missing legacy city from GEO4.2: `projectSummary` only requires title, category and timeline, returns `city: null` for no-city records and includes the general GEO3 projection.
- `features/quotes/components/company-initial-quote-workspace.tsx` already formats both the submission and saved-quote Project summary through the shared hook. No source correction was necessary.
- Client received-proposal/initial-quote DTOs do not contain a Project location summary. Their visible city label is Company headquarters, outside this assignment. No Company field or label was changed.
- `convex/finalQuotes/` has no Project city gate or location DTO. The final-quote panel has no Project location consumer; its commercial terms and surrounding conversation links are independent of city. These modules remain unchanged.
- Both marketplace and accepted direct-invitation paths are tested through real initial-quote submission, existing discussion unlock, final-quote request/submission, exact-revision acceptance and duplicate acceptance.
- These tests verify unchanged initial estimate `185000.25 MAD`, final price `380000.25 MAD`, one accepted revision, one Deal, Company selection, the frozen 500-basis-point commission (`19000.01 MAD`) and one due commission aggregate. No Deal is created merely by reading summaries, requesting or submitting a final quote.

No Project mutation, schema/index, Company headquarters/coverage, Admin filtering, financial implementation, OC3, authentication or messaging gate changed. All registered invitation mutations and their decision helper retain their baseline source.

## Authorization and privacy verification

- Structured no-city, legacy city-only and mixed retained-city fixtures exercise the same APIs. Stored legacy values are preserved; structured labels follow the existing projection's active-location precedence.
- Sentinel tests assert the absence of `localityName`, `neighborhood`, `siteAddress` and their private values from Company invitation/proposal/initial-quote summaries, including after discussion opens and with a linked private assessment address.
- Current owner choices and invitation DTOs retain permitted recorded geography. Another Client's picker returns no owned Projects, and another Client cannot read the owner's invitation or received-quote DTO.
- Anonymous, Client, Admin and SEO callers are denied the Company readers; Company/Admin/SEO/anonymous callers are denied owner-only invitation readers. Competitors receive only their own lists and cannot read another Company's initial or final quote. Revoked membership and mismatched invitation ownership fail closed.
- Before mutual interest, the existing Project detail reader omits private geography. After the existing discussion-opening mutation it returns authorized locality/neighborhood. This gate was tested, not changed.
- Repeated summary reads are compared with stored Project, quote, invitation, conversation, final revision, Deal, commission, activity and notification state to verify no side effects.

## Changed files

1. `convex/invitations/index.ts`
2. `convex/proposals/index.ts`
3. `features/invitations/components/company-invitations.tsx`
4. `features/invitations/components/invite-company-button.tsx`
5. `features/proposals/components/company-proposals.tsx`
6. `convex/marketplace.location-compatibility-geo92a.test.ts`
7. `features/invitations/project-location-compatibility-geo92a.test.tsx`
8. `docs/marketplace-location-compatibility-geo92a.md`

## Verification

| Check | Result |
|---|---|
| New compatibility suites | 2 files, 51 tests passed: 33 backend and 18 FR/EN render cases |
| Combined focused and affected regressions | 11 files, 252 tests passed |
| `npm run typecheck -- --incremental false` | Passed |
| Scoped ESLint with `--max-warnings 0` | All 7 changed/new TypeScript/TSX files passed |
| `git diff --check`, including new files | Passed |
| Final source/scope and worktree checks | Unchanged invitation mutations, restricted modules and preserved branch references; detached baseline retained |

The focused command was:

```sh
npm test -- --no-cache \
  convex/marketplace.location-compatibility-geo92a.test.ts \
  convex/invitations.test.ts convex/proposals.test.ts \
  convex/quotes.test.ts convex/finalQuotes.test.ts \
  features/invitations/project-location-compatibility-geo92a.test.tsx \
  features/invitations/invitations-ui.test.tsx \
  features/quotes/company-initial-quote-workspace.test.tsx \
  features/quotes/client-received-quotes.test.tsx \
  features/final-quotes/final-quote-messages.test.ts \
  lib/geography/project-location.test.ts
```

Backend tests use in-memory `convex-test` fixtures; commercial actions affect only that test database. Render tests use real FR/EN messages and static React rendering with mocked data hooks. The open-picker fixture verifies its actual option labels, not browser focus, native-select behavior or authenticated E2E. No full repository test suite or production build was run. The existing Vite config-loader future-compatibility warning remains unchanged.

## Integration readiness and remaining work

No blocking issue was found within GEO9.2A. The eight-file uncommitted change is ready for local Product HQ review from detached `3bd084a`; it adds DTO fields without removing existing city fields, and the shared hook tolerates older city-only responses.

No schema change, index rollout or historical migration is required by this task. Backend/frontend release and deployed/authenticated verification need their own authorization. Existing GEO9.1 rollout/backfill prerequisites and later compatibility work in Deals, dashboards or OC3 remain outside this assignment and are not resolved by it.

Stop after GEO9.2A. Do not start another geography task or save a commit without a separate request.
