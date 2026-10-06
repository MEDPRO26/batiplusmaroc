# Legacy URL Revocation V1

This extends Legacy Media Ingestion V1. One authenticated Admin explicitly retires one preserved, reviewed legacy origin. It does not migrate, approve, republish, remove provenance/legacy references, change bucket/domain settings, or purge caches. No production operations are performed by implementation or local validation.

## Findings used from the three read-only subagents

- R2: the old publicMedia reference helper is incomplete. Reverse-reference indexes and a physical-source provenance guard are required. A claimed PUT grant remains usable until expiry. Conditional SDK DELETE support alone does not prove R2 enforces it.
- Native: retire only the original ID, with a different verified private copy. Check every native reference, including verification, moderation, message attachments, Final Quote revisions and project attachments. Native deletion belongs in the final guarded mutation.
- Admin/cache: reuse Companies → Legacy Media. Paginate provenance so retired native rows remain visible. Capture actual native URLs before deletion and derive only the configured R2 alias. No safe purge integration exists in this repository.

## Gates and permitted environments

`LEGACY_MEDIA_REVOCATION_ENABLED` must equal the exact string `true`; unset/other values reject new destructive reservations. Readiness/listing/history continue to work. A retired replay is read-only and returns the prior result even when the gate is disabled. The value is never sent to the browser.

R2 also requires `LEGACY_MEDIA_R2_CONDITIONAL_DELETE_VERIFIED=true`. Keep this unset until an explicitly authorized **disposable development bucket/object** test proves mismatched If-Match returns 412 without deleting, matching If-Match deletes exactly one object, bucket checks work, and origin HEAD confirms absence. Never fall back to unconditional deletion. [Cloudflare’s S3 compatibility table](https://developers.cloudflare.com/r2/api/s3/api/) does not document conditional DELETE; the installed SDK type alone is insufficient evidence.

Neither gate was configured in any deployment by this task. Tests enable gates only through isolated test environment stubs. No R2 provider request or live Convex retirement is part of local tests.

Before enabling even in development, verify the configured R2 account/endpoint/bucket is the same source namespace used for ingestion, with no external writers or unknown outstanding PUT grants. Ingestion provenance predates a recorded bucket identity; a provider configuration change must be treated as an operational blocker, not evidence that a source is absent. Do not change provider configuration while retirement is running.

## Readiness and exact confirmation

`legacyMediaIngestion.retirement.getReadiness` takes an ingestion ID and a `checkedAt` display-time hint. Each explicit Admin check supplies a fresh timestamp so cached/reactive queries do not keep an expired lease locked. The hint is never destructive authorization: reservation and deletion always use server time. It is Admin-only and performs indexed metadata/relationship checks, without fetching file bytes or contacting R2. It returns Company/project/slot context, ingestion/moderation/public state, dependency outcome, blockers, known old aliases and a SHA-256 readiness fingerprint. It never returns preserved private storage IDs/URLs or operative raw source references.

All of the following must hold:

1. Ingestion is `ingested`, with image ID, completion time, actual-byte SHA-256, bounded size, JPEG/PNG/WebP type and R2 ETag when relevant. Conflicts and pending copies are blocked.
2. The private copy exists under a different native ID and its image/storage/provenance hashes, sizes and types match. Its image table, Company, project, purpose and gallery slot must match.
3. The original persisted Company/project/slot relationship, publicMedia row/key where applicable, and recomputed source identity still match. Missing original native metadata is allowed only after all other preservation checks; different original metadata is blocked.
4. The preserved image reached approved or rejected/hidden through the existing moderation workflow. A current approved replacement must itself be valid. Without one, the preserved image must be rejected/hidden, intentionally yielding generic cover/logo or omitted gallery. Current submitted and approved references are independently validated; a newer pending submission does not change the deletion target.
5. The exact-source dependency guard is clear. The retained confirmed target's own legacy field is historical; every other reference is blocked, including inactive/historical protected files. Duplicate physical-source provenance is ambiguous and blocked.
6. Admin explicitly confirms the exact readiness fingerprint. Changed pointers, moderation, source, slot order, URLs or dependencies invalidate it. No browser URL/key/storage ID is accepted.

Readiness is live information, not deletion authorization. Reservation and the last deletion check independently reauthorize Admin, recheck server gates, and recompute readiness. The Admin UI loads readiness only on request, keeps a reactive subscription after that, and offers a typed FR/EN confirmation with irreversible warning. Stale fingerprints close the dialog. Account/token changes unmount operational state; late results are ignored. Decisions stay in existing image review screens.

## Dependencies, schema and history

Existing `legacyMediaIngestions` gains optional retirement status, fenced attempt/lease/actor, attempt count, confirmation fingerprint, generic failure code, retired actor/time, captured aliases and `cacheVerification=verification_required`. No mandatory field is added to existing rows. Ready/not-ready is computed; operational retiring/failed/retired state is persisted.

A small append-only `legacyMediaRetirementHistory` stores requested/failed/retired events with ingestion/source identity, recovery image, attempt and actor/time. Successful replay adds no event. Admin history/list pages are limited to 1–20 using native pagination.

New exact-source indexes:

- companies: logoStorageId, logoMediaId, coverMediaId
- portfolioProjects: coverImageStorageId, coverMediaId
- portfolioMedia: storageId, publicMediaId
- messageAttachments: storageId
- finalQuoteRevisions: pdfStorageId
- projectAttachments: storageId
- legacyMediaIngestions: provider + sourceRef
- retirement history: ingestionId + changedAt

Existing indexes check all moderated/verification files, publicMedia object keys, Company PUT intents, project media/intents, client avatar references/intents, and SEO media/intents. Permitted singleton relationships use take(2); forbidden aliases use take(1). Duplicate or malformed grant provenance fails closed. Claimed-but-live Company grants block retirement. Trusted source creation must also be older than the entire configured issuance TTL; external writers/grants remain a manual pre-enable prerequisite.

Indexes on existing production tables will require a separately authorized deployment/backfill review. This task does not deploy or backfill. Do not treat an unavailable index as a clear dependency result.

## Provider operations and races

R2 uses the existing authenticated server client and a 30-second abort deadline. It HEADs exactly the persisted object and verifies ETag, size and MIME, performs the last transactional authorization/dependency/fingerprint check, then sends exact-key DELETE with IfMatch. It records origin retirement only after a successful provider response followed by confirmed absence. Generic HEAD 404 requires successful authenticated HeadBucket (actual 200); missing-bucket/auth/gateway errors are not success. A provider-not-found replay still rechecks preservation and authorization. Source rows and legacy fields remain untouched.

R2 IO and Convex transactions cannot be atomic. Existing application legacy grant issuance/claim paths are closed; new owner uploads only affect moderated pointers. Confirmation rechecks catch those changes and never retarget an operation. The ETag condition protects against origin overwrites after the database check, provided the separately verified provider capability is enabled. Out-of-band data/config/provider writers must remain quiescent; database checks cannot lock external writers.

One physical source may have only its own provenance record. A transactional reservation with a random attempt and ten-minute lease fences concurrent calls; active replay returns retiring without another delete. An expired known lease is displayed as ready/retryable only after all readiness checks pass; expiry never marks success or changes stored state. Failed attempts remain retryable under the same safety checks. Admin sees Retry retirement after a fresh check. Missing/malformed leases stay locked. A retry reserves a new random attempt, increments the attempt count and starts a new ten-minute lease. Old attempts cannot finalize after expiry or finalize/fail a replacement reservation, including after its success. Successful replay returns retired without new history.

Native deletion rechecks the original storage metadata, verified recovery file, role/gate, exact relationship, pointers, dependency indexes and attempt inside the same mutation that deletes the original and writes success/history. It never deletes the preserved copy or any protected file. Absent originals are idempotent only with all other prerequisites satisfied.

Provider exceptions are not exposed or persisted. Failure retains copy, references, provenance and public moderation pointers, and records only RETIREMENT_FAILED. An uncertain R2 delete/commit outcome can be retried: the same exact source is checked again and a verified not-found outcome is recorded. A hard action crash leaves retiring until its lease expires; recovery requires a fresh Admin readiness check. No automatic cleanup or republishing runs.

## Cache/manual recovery checklist

Origin retired always leaves **cache verification required**. There is no cache-complete control or automated purge in V1.

1. Verify captured original source URL and separately inventoried historic domain/r2.dev aliases. A current configured alias is not a complete historical inventory.
2. Separately authorize exact Cloudflare/Vercel cache handling. Do not change bucket/domain policy globally.
3. Verify observed old Next optimizer URLs, app origins, widths, qualities and negotiated formats. Hypothetical combinations are not claimed to be issued URLs; no optimizer restriction or unrelated optimization is changed.
4. Check the current approval-checked image or intentional generic/omitted display.
5. Keep unknown aliases/cache scope recorded as outstanding. Origin deletion cannot remove browser/downloaded copies.

The private preserved image is the recovery source. Never automatically republish rejected/hidden bytes or restore an old public object. Native deletion cannot promise restoration of the same URL/ID. If public display disappears, verify current pointers/visibility and normal review state; use existing Admin review rather than restoring stale media. If preservation or review fails, do not retire. Recovery copies/public reinstatement, gate changes, real development/provider testing and any production rollout require separate explicit authorization.

## Runtime files to include

New runtime modules:

- convex/legacyMediaIngestion/retirement.ts
- convex/legacyMediaIngestion/retirementActions.ts
- convex/legacyMediaIngestion/retirementConstants.ts
- convex/legacyMediaIngestion/retirementDependencies.ts
- convex/legacyMediaIngestion/retirementModel.ts
- features/admin/components/admin-legacy-media-retirement.tsx

Existing schema/API/R2 helper, Admin ingestion component, FR/EN messages and the legacy-media Playwright config also change. New tests cover real registered handlers with convex-test in-memory authentication/storage; R2 copy/delete is mocked. The R2 helper tests exercise the real helper with a mocked SDK. Chrome component tests use real controls/focus/CSS with mocked Convex/auth/query/action responses in an isolated loopback-only source copy, with no environment files or remote browser requests.

Live development checks remain: deployment/schema/index registration; real native delete and crash transaction behavior; R2 conditional DELETE/bucket/ETag/not-found handling in disposable dev storage; source namespace/grant inventory; concurrent owner/Admin operations; uncertain outcome/crash/lease recovery; real current public endpoints; historical URL/cache inventory. No live production behavior is claimed.

## Initial implementation validation results

- Focused ingestion/retirement/moderation/UI checks: 182/182, eight files.
- Full npm test: 1,667/1,667, 120 files (56 new retirement unit/backend/helper cases).
- Chrome component/browser checks: 35/35, including 15 new retirement scenarios, FR/EN, keyboard focus, 320/375px, stale confirmation, error/retry, duplicates and account/sign-out late results.
- npm run typecheck passed with strict settings unchanged.
- npm run lint: zero errors; the same ten existing generated/SEO warnings.
- npm run build passed in an isolated source copy without environment files, with all Convex origins forced to loopback and both retirement gates false. Existing Google Font download was allowed; managed metadata used the existing unavailable-backend fallback.
- git diff --check, git diff --cached --check and new-file whitespace checks passed.
- Branch: feature/legacy-media-revocation-v1. Nothing staged or committed. Both Site Visit stashes remain unchanged.

No production data/media/cache was queried, deleted, revoked, purged or changed. No deployment, real-provider deletion, bulk cleanup, migration or provider-setting change occurred.

## Expired lease recovery fix validation

The former readiness rule locked every retiring record regardless of expiry. Readiness now distinguishes an active lease from an expired known lease, exposes retry eligibility after all safety checks, and keeps persisted state unchanged until a new guarded reservation. R2 completion also rejects an expired or replaced attempt. The fresh check timestamp affects display only; a future browser timestamp cannot unlock an active server lease or bypass any destructive gate/check.

- Added 23 unit/backend regression cases: active/expired lease boundaries for both providers, fresh attempts/leases/counts, expired/replaced finalization and late failure fencing, one terminal audit event, concurrent retry, provider failure, and safety checks at reservation and immediately before deletion; FR/EN Retry controls.
- Added two Chrome scenarios: an active lease exposes no Retry, then an explicit fresh check at expiry exposes Retry with exact typed confirmation in both languages.
- Focused retirement/backend/helper/UI tests: 79/79 across three files.
- Full npm test: 1,690/1,690 across 120 files.
- Chrome retirement component checks: 17/17, including existing mobile, keyboard, duplicate, stale-confirmation and account/sign-out coverage.
- npm run typecheck and npm run build passed. Build ran in an isolated source copy without environment files, with loopback Convex origins and both gates false; only Google Font downloads required external access.
- npm run lint: zero errors and the same ten existing generated/SEO warnings. Diff and new-file whitespace checks passed.

Backend tests use registered handlers with convex-test in-memory auth/storage; R2 IO is mocked. Browser Convex/auth/query/action transport is mocked, with real Chrome controls/focus/CSS. No live Convex/provider retirement was tested or executed. Production and both Site Visit stashes remain untouched; nothing staged or committed.
