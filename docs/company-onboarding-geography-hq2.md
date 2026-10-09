# HQ2 — Company onboarding geography and enforcement

**Result: PASS WITH ISSUES.** Source implementation and local checks pass. HQ1/HQ2
development synchronization, policy activation and authenticated development
validation remain pending explicit Product HQ authorization. No deployment is
claimed. HQ2 stops here for review.

## Source and scope

Worked on `feature/nationwide-project-intake`, starting from committed HQ1
`1c7a059b7ea199fcc52779c889d347f42b6393e2`. The initial worktree was clean. Read-only
remote inspection found `origin/main` at
`7e8400d559a7f070590395ce31828e420a581e51`; no checkout, reset or merge was performed.
Existing work was preserved. No commit, push, migration, deployment or environment
change was performed.

Files changed:

| Purpose | Files |
| --- | --- |
| Optional immutable Company marker and typed activation setting | `convex/schema.ts`, `convex/convex.config.ts`, `convex/_generated/server.d.ts` |
| Creation enrollment and seed bypass protection | `convex/lib/companyHeadquartersPolicy.ts`, `convex/lib/accountFoundation.ts`, `convex/dev/seedCompanies.ts` |
| Private policy DTO and authoritative validation | `convex/companies/index.ts`, `lib/geography/company-headquarters.ts` |
| Existing onboarding form and small geographic controls/helper | `features/companies/components/company-onboarding-form.tsx`, `features/companies/components/company-onboarding-headquarters.tsx`, `features/companies/lib/onboarding-headquarters.ts` |
| Localized fields and domain errors | `messages/fr.json`, `messages/en.json`, `lib/errors/codes.ts` |
| Backend, React and browser component tests | `convex/companyOnboardingGeography.test.ts`, `features/companies/company-onboarding-geography.test.tsx`, `tests/e2e/company-onboarding-geography.spec.ts` |
| Handoff | `docs/company-onboarding-geography-hq2.md` |

The Env declaration was regenerated offline with the installed Convex codegen
template. No cloud codegen/push or watcher was used. No new dependency, table,
index, directory DTO or geographic catalogue change was introduced.

## Creation paths and policy boundary

The production Company insertion is centralized in `ensureAccountFoundation`.
Its callers cover password signup, existing-account authentication callbacks,
verified OAuth account linking, OAuth account-type finalization and
`users.ensureCurrentUserFoundation` repair/initialization. `completeOnboarding`
updates an existing Company; it does not create one. Source inspection found only
one other Company insertion: the internal fictional development seed.

`headquartersPolicyVersion?: "structured_v1"` is assigned only by the shared
server creation helper when the deployment setting
`COMPANY_HEADQUARTERS_POLICY_VERSION=structured_v1` is active. An unset setting
keeps Stage A enrollment inactive. This setting establishes the rollout boundary
at Company creation; no city inference, timestamp cutoff or backfill is used.
All creations through the common production insertion use this rule. Invalid
nonempty configuration fails closed and rolls back creation.

Existing foundation replays never assign or modify the marker. Existing
Companies without it, including unfinished onboarding records, retain legacy
compatibility after activation. Clients cannot supply the marker to either
onboarding or profile mutations, and auth signup input cannot override the
server's enrollment decision. Enforcement always reads the stored marker,
independent of the current activation setting.

The seed uses the same creation-policy helper. Its current fixtures already have
completed onboarding but only legacy cities, so creating these fixtures after
activation fails atomically with `DEV_SEED_STRUCTURED_HEADQUARTERS_REQUIRED`.
Existing fixture replays remain unchanged. No headquarters or coverage is
inferred to make the seed pass. The internal seed was exercised only in
`convex-test`, never against a deployment.

## Backend behavior and compatibility

For marked Companies, `completeOnboarding` validates a GEO1 region/province pair,
parent relationship, existing required city normalization and optional commune
before any writes. Missing or invalid inputs fail atomically. Omitting the HQ1
argument on a retry can reuse a saved valid pair; omission cannot bypass a
missing pair. The marker is preserved by retries and profile updates.

Legacy Companies can complete onboarding with the historical city-only shape or
voluntarily provide structured headquarters. HQ1 omission and all-null clearing
semantics remain valid for historical profiles. Marked Companies cannot clear a
required pair through `updatePublicProfile`; existing profile calls that omit
headquarters continue to work. No headquarters profile editor was added.

`getOnboardingProfile` adds a nullable owner-private policy version alongside the
HQ1 snapshot. No legal verification address enters this DTO. Owner, membership,
role and existing operational/verification behavior remain intact. Unexpected
country or marker mutation arguments are rejected by the validators; country is
fixed to Morocco in the UI.

## Onboarding behavior and browser evidence

The existing three-step form now includes fixed Morocco, native region/province
dropdowns from GEO1, optional commune and the existing headquarters city/locality
field. Region changes clear province; province is disabled until a region is
selected. New marked Companies require both selections. Legacy Companies can
leave both blank; partial pairs never reach the mutation.

Persisted owner-private values preload when the form mounts. Values and services
remain mounted across step changes and survive server failures. The existing
lifecycle saves at final submission; this change adds no per-step autosave or
draft mutation. Reload/resume uses persisted Company values. A synchronous
submission lock prevents duplicate calls, saving disables controls, and failures
re-enable them before focusing localized field feedback.

The new frontend detects headquarters support from the private reader. Against
the currently older backend it disables the unavailable structured controls,
shows localized guidance and submits the historical city-only shape. Against
HQ1 it offers optional geography; against HQ2 it follows the server-provided
record policy for UX. Client behavior never decides backend enrollment.

Chrome browser component tests used real React/app CSS with mocked Convex and
navigation; external browser requests were blocked. All 12 region choices and
their province children were exercised in both languages. Tests verify saved
preloads, field errors/focus, city validation, optional commune, exact retries,
same-event duplicate protection, service/catalog compatibility and old backend
argument shapes. FR/EN layouts have no horizontal overflow at 320px, 375px and
1280px. Label associations, required/invalid states, descriptive feedback, Tab
order and native keyboard typeahead were checked. Native popup arrow-key handling
and assistive-technology behavior were not independently verified. These checks
are not authenticated E2E or live development onboarding proof.

## Coverage and local checks

No changes were made to coverage logic, indexes, service areas or public directory
matching. Tests prove onboarding creates neither `coverageScopeKeys` nor
`companyCoverageIndex` rows, and preserves existing service areas, coverage rows
and private verification records. Headquarters in Souss-Massa does not declare
service coverage there. Historical public Company eligibility remains compatible.

| Check | Result |
| --- | --- |
| New HQ2 backend suite | 36 passed |
| New geography React/helper suite | 18 passed |
| Combined focused regressions: HQ1, Company onboarding/profile, GEO7/GEO8, auth, verification, directory/privacy, proposals/invitations/messages, OC2/OC3/coordination, Deals and related checks | 1,446 passed across 50 files |
| Onboarding React/route suites rerun after the browser-found focus fix | 51 passed across 3 files |
| Browser component suite | 15 passed |
| `npm run typecheck` | Passed |
| Scoped ESLint on changed TypeScript/React/test source | Passed |
| `git diff --check` | Passed |

## Watcher and development parity

Executable process checks before backend editing and after implementation found
no Convex dev/deploy watcher. No watcher was stopped, restarted or launched.
The original Next.js process, PID 7559, remained running.

Read-only metadata checks targeted development `hip-gnat-222` on 2026-10-08.
The active Company schema has none of HQ1's three optional headquarters fields.
The deployed `completeOnboarding` and `updatePublicProfile` arguments do not
accept `headquarters`; deployed private onboarding/profile readers do not return
it. HQ1 is committed locally but is **not deployed to this development target**.
HQ2 is also source-only. No live Company was created or edited for validation.

## Controlled rollout, rollback and remaining work

1. **Stage A, only after authorization:** synchronize the complete compatible
   HQ1/HQ2 backend to the intended development deployment, leaving the optional
   activation setting unset. Verify active optional schema fields, both mutation
   shapes, the private snapshot/policy DTO and legacy onboarding compatibility.
2. **Stage B:** serve the new onboarding frontend against that compatible
   backend. Verify new fields and legacy city-only behavior while enrollment is
   inactive. Refresh stale onboarding clients before activating the requirement;
   do not combine the first backend compatibility rollout with activation.
3. **Stage C, separately authorized:** activate the server setting with the exact
   value `structured_v1`, verify configuration rollout, then create a fresh
   Company through the new frontend. Confirm its marker, required pair/city,
   successful completion and absence of coverage/index writes. Exercise a
   Company that existed before activation, including pending onboarding, and
   confirm it remains unmarked and compatible. Verify auth, verification and
   directory eligibility against the actual deployment.

Removing the activation setting stops future enrollment but does not downgrade
already marked Companies. After activation, rollback must retain the compatible
schema, marker enforcement and a frontend capable of completing marked records.
Do not roll back to a pre-HQ1 schema/backend or an old form for marked Companies;
do not clear markers as a rollback shortcut. Stale old clients creating a Company
after activation must refresh to the compatible form; server enforcement fails
closed rather than accepting incomplete geography.

HQ2.1 headquarters profile editing, HQ3 and all other geography/migration/release
work remain deferred to their own approved briefs. Product HQ review is the next
step; no subsequent task or deployment starts automatically.
