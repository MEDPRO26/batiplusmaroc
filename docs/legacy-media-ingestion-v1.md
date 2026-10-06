# Legacy Media Ingestion V1

This is an Admin-operated, one-item copy into the existing private moderation system. It supports Company logos, Company covers, portfolio covers and exact existing gallery slots. It never approves an image, changes verification/name/Deal/publication rules, clears legacy fields, deletes a legacy file, revokes an old URL or purges a cache.

## Sources and operations

- Company logo: `companies.logoMediaId` (R2) or `logoStorageId` (Convex).
- Company cover: `companies.coverMediaId` (R2). No legacy native Company-cover field exists.
- Portfolio cover: `portfolioProjects.coverMediaId` (R2) or `coverImageStorageId` (Convex).
- Gallery: `portfolioMedia.publicMediaId` (R2) or `storageId` (Convex), retaining the exact slot ID, project, order and caption.

`legacyMediaIngestion.index.listCandidates` requires Admin, selects one media type and paginates its existing source table, with 1–20 source records per page. Each target may have both providers; pages can contain no legacy candidates. Malformed/missing/private source associations are excluded. No images are fetched in this query. `listState` offers Admin-only Company-scoped provenance summaries, also bounded to 20. DTOs omit source keys/IDs/URLs except an opaque SHA-256 source identity and ordinary Company/project/gallery/moderation IDs.

Admin → Companies has a small FR/EN ingestion section with type selection, metadata, status, Ingest/Retry, and links to the existing Logo/Cover/Portfolio Images tabs. It contains no approval controls or image downloads. Account/session changes destroy local operation state and late responses are ignored.

`legacyMediaIngestion.actions.ingest` derives the source again from persisted target references. Its browser arguments cannot specify an arbitrary URL, R2 key or storage ID. Both reservation and finalization reauthorize the stored Admin role. Owners, staff, Clients, SEO and anonymous users cannot list, inspect, ingest or retry.

## Private copying, validation and finalization

R2 reads use the existing authenticated SDK/configuration. HEAD rejects unknown/oversized lengths; GET is conditional on the exact ETag and verifies metadata, independently caps the stream and rejects truncation/extra bytes. IO times out after 30 seconds. It does not use public delivery URLs, ranged probe bytes or presigned grants.

Native reads use only the existing stored legacy ID, reject private verification/moderation IDs, inspect bounded metadata before reading, and create a **new** storage object. The original is never reused as the moderated file.

Both paths validate actual JPEG/PNG/WebP signatures and length (5 MiB logo; 10 MiB others), compute actual-byte SHA-256, and verify the new storage metadata before binding. Provenance retains the hexadecimal actual-byte hash; the image retains the storage-derived representation used by existing moderation. Digest comparison supports equivalent hex/base64 representations without accepting a different checksum: [Convex documents hex metadata](https://docs.convex.dev/file-storage/file-metadata), while the installed convex-test emits base64 and omits optional contentType.

The three existing moderation modules expose shared pending-record/history creation helpers, also used by their normal owner binders. Finalization commits the pending image, one existing `uploaded` history event, provenance and optional submitted pointer together. The Admin who completed the copy is the actor; provenance retains both the original triggering Admin and latest attempt Admin. Approved pointers are never written. Private/public access, exact-file review and history use the existing moderation APIs unchanged.

## Idempotency and conflicts

`legacyMediaIngestions` has one transactional reservation per hash of provider + source reference + target type + Company/project/slot. It stores the private original reference internally, actor/times, fenced attempt/10-minute lease, attempt count, result, image ID and hash/size/type, plus R2 ETag when present. Only two indexes are added: `by_sourceKey` and `by_companyId_and_updatedAt`. No status queue/background migration framework is introduced.

Concurrent calls share the active reservation. Successful/conflict replay returns its existing result before any read/copy/history write. Failed/lost attempts can retry the same record, using a new fenced attempt. An expired/replaced attempt cannot finalize.

Any existing submitted **or** approved pointer causes an immediate conflict without copying or replacing it. This includes rejected/hidden moderated work whose submitted pointer remains. Finalization rechecks the source relationship/key and pointers transactionally. If an owner upload/source change raced with copying, the validated copy is retained pending but unlinked and provenance is conflict. Existing stale-decision rules prevent approving that unlinked copy. No older approved image is restored. Independent gallery slots are never created/reordered or approved together, and project publication never approves an image.

On failure, the original and pointers remain untouched. Only the newly created unbound copy is eligible for cleanup; cleanup checks private committed references and explicitly refuses the native original. An uncertain successful commit cannot lose its committed image. Cleanup failures schedule a guarded retry. Provider exception strings are neither returned nor persisted; failures use `COPY_FAILED`.

Storage IO and database transactions are separate. A process termination between storage creation and finalization can leave an unbound private orphan whose ID was never returned to the caller; this implementation does not claim atomic storage/database or automatic orphan reconciliation. Normal retry/concurrent/success paths retain one committed image/event. A separately authorized development crash/recovery check and private-orphan inventory remain necessary; do not delete any original during that work.

## Existing links and live validation

Old R2 objects/publicMedia rows, native originals and legacy fields remain intact. Previously issued direct URLs, upload grants and optimizer/CDN/browser copies may remain usable. Ingestion does not make those old links private and cannot remove downloaded copies. Revocation requires the separately authorized legacy rollout after verified private preservation and manual review.

Tests use real handlers with convex-test in-memory authentication/storage. R2 ingestion tests mock the read helper; separate read tests exercise the real bounded helper with a mocked S3 client. UI unit/browser tests mock Convex/auth/action responses, with real Chrome controls/focus/layout and no live backend. Generated API type registration is synchronized offline; no deploy/codegen command was run.

Before use, validate in an explicitly authorized development deployment: schema/API registration, real R2 credentials/ETag/stream timeout, native copy integrity, role revocation, simultaneous owner/Admin operations, uncertain outcomes/crash recovery, exact review/delivery, and legacy-link inventory. No production ingestion, deployment, migration, deletion, revocation, cache or bucket change is performed by this task.

## Local validation

- Focused ingestion/moderation/Admin checks: **150/150**, seven files. New ingestion/read/UI unit cases: **55/55**.
- Full `npm test`: **1,611/1,611**, 117 files.
- Chrome component checks: **20/20** (15 new ingestion cases and five existing Admin Companies regressions), including FR/EN, keyboard focus, 320/375px layouts, retry, duplicate actions and late account/session responses. Convex/auth/action calls are mocked; no live R2 or Convex operation is claimed.
- `npm run typecheck`: passed with strict settings unchanged. `npm run lint`: zero errors, the same ten existing generated/SEO warnings.
- `npm run build`: passed in an isolated source copy without environment files and with all Convex origins overridden to loopback. The existing Google Font was fetched; managed metadata used its existing unavailable-backend fallback. Browser tests used a separate isolated copy and local Webpack server because Turbopack refuses a dependency symlink outside its root.
- Diff checks passed. Branch stays `feature/media-legacy-rollout`; no staging/commit. Both Site Visit stash identities are preserved.

## Files changed

New runtime files:

- `convex/legacyMediaIngestion/actions.ts`
- `convex/legacyMediaIngestion/constants.ts`
- `convex/legacyMediaIngestion/index.ts`
- `convex/legacyMediaIngestion/model.ts`
- `features/admin/components/admin-legacy-media-ingestion.tsx`

Existing runtime/type/translation files:

- `convex/_generated/api.d.ts`
- `convex/companyLogos/index.ts`
- `convex/companyCovers/index.ts`
- `convex/portfolioImages/index.ts`
- `convex/schema.ts`
- `convex/storage/r2Client.ts`
- `features/admin/components/admin-companies-panel.tsx`
- `messages/en.json`
- `messages/fr.json`

Tests/handoff:

- `convex/legacyMediaIngestion.test.ts`
- `convex/storage/legacyImageRead.test.ts`
- `features/admin/admin-legacy-media-ingestion.test.tsx`
- `tests/e2e/admin-legacy-media-ingestion.spec.ts`
- `playwright.legacy-media.config.ts`
- `docs/legacy-media-ingestion-v1.md`
