# Company Cover Moderation V1

Company covers follow the existing logo/portfolio moderation architecture. Company verification, name masking, Deal identity reveal, logo moderation and portfolio publication/approval rules are independent and unchanged. Cover upload remains optional; profile text saves never wait for image upload or review.

## Backend contract

- `companyCoverImages`: one immutable private Convex Storage file per successful upload; Company, content type, size, storage-derived SHA-256, uploader/time, status and moderation metadata.
- `companyCoverUploadIntents`: owner/Company-bound token, expected type/size, 10-minute expiry and atomic single-success-use claim.
- `companyCoverModerationHistory`: append-only upload/approval/rejection/hiding events committed with the corresponding image/pointer change.
- Company `submittedCoverImageId` and `approvedCoverImageId` are optional and independent. Legacy `coverMediaId` remains untouched and unreviewed.

`companyCovers.index.generateUploadIntent({ contentType, size })` requires the current active owner. The browser sends bytes directly to the configured Convex HTTP origin:

- `POST /company-covers/upload`: JWT in `Authorization`, upload token in `X-Upload-Token`, no credentials in URLs.
- JPEG, PNG or WebP; 1 byte through 10 MiB inclusive. The HTTP handler bounds the stream, checks actual length and signature, then stores a new immutable file. Binding rechecks owner, Company, expiry, unused token and storage metadata. SHA-256 comes from Convex storage, not the client.
- Failed/uncertain binding invokes cleanup that checks the image storage index before deleting the new unbound file; a committed image is preserved. No existing/legacy file is deleted by this flow.

`getMyCovers` returns current approved/submitted DTOs to the active owner only. `listMyCovers` provides bounded historical owner access. Admin reads use `listAdminCovers`, `getAdminReview` and `getHistory`. Pagination requests are restricted to 1–100 items.

## Authorization and delivery

- `GET /company-covers/private/<imageId>` reauthorizes on every request: own active Company owner or Admin. Staff, Clients (including Clients with a Deal), anonymous/SEO users and other Companies are denied. DTOs never expose storage IDs or raw storage URLs.
- `GET /company-covers/public/<imageId>` requires approval, the exact current approved Company pointer, existing public profile visibility and matching stored file metadata. Pending/rejected/superseded images are denied. Approved files can be public before a Deal, without granting verification.
- All upload/private/public responses use `no-store` and `nosniff`. Authenticated transport uses `credentials: omit`, `redirect: error`, headers for tokens and URLs constructed from the trusted configured origin. Existing strict verification CORS policy is reused.
- The shared private-file guard blocks cover IDs from other raw-URL, PDF/attachment and discard APIs. Legacy public R2 cover issuance/verification/claim paths reject new use, including still-existing legacy intents.
- `ApprovedCompanyCover` accepts only the configured public moderation endpoint, renders with `unoptimized` and uses a generic image on invalid/missing/failed delivery. No thumbnail, optimizer or proxy is added. Existing Next remote patterns exclude moderation endpoints; redirects remain disabled. Unrelated images keep normal optimization.

## Exact-file review and replacement

`approve`, `reject` and `hide` require Admin plus the reviewed `imageId` and `expectedSha256`. Approval/rejection require the current pending submission; hide requires the current approved file. Storage metadata is rechecked. Stale pointers/status/hash and concurrent conflicting decisions fail. Reject/hide reasons normalize whitespace and require 3–500 characters.

Approved A remains public while B is pending or rejected. Approving B atomically selects B; subsequent public requests for A fail. Hiding the current approved file clears its public pointer and records a rejection/history reason, without restoring an older image. Company cover DTOs also no longer fall back to a portfolio photo. Portfolio images remain available independently under their existing approval rules.

## Owner and Admin screens

- Company profile editing uses `CompanyOwnerCoverManager`: separate current approved/latest pending or rejected cards, guidance, statuses, owner-only rejection reasons, explicit upload and retry. The selected File survives recoverable errors; duplicate requests are guarded. The previous immediate R2 cover upload control is removed.
- Admin → Companies includes a pending-cover queue with 20 metadata records per page. Private downloads start only when review opens. Company detail has a Cover tab using the same review UI, with current approved cover, selected submission, upload date/status and history (10 per page).
- Human checklist: Company name/logo/identifying branding, phone/email, website/social handle, QR code and identifying watermark. No OCR or AI.
- Approve enables only after the exact preview decodes and requires confirmation. Reject/hide require a valid reason; hide requires confirmation. Changed review data or a stale backend error closes confirmation, releases previews and requires an explicit reload/review. A newer file is never substituted into a decision.
- Private previews use authenticated fetch and temporary Blob URLs. Requests are aborted and URLs revoked on image/token/account changes, retry, unmount, review close and sign-out. Disposed/late responses and stale image events cannot mark another preview ready. FR/EN uses next-intl; controls support keyboard focus and narrow mobile layouts.
- Approved delivery is used in the owner profile header, public Company profile, directory DTOs/previews, homepage/category cards and hiring-guide cards. Quote/inbox summaries do not have Company-cover fields and retain their existing approved-logo handling.

## Legacy rollout blockers

Legacy covers are neither copied/migrated/deleted nor automatically approved. Existing R2 `coverMediaId` records are preserved but never returned as Company cover URLs. They do not appear in the new review queue. An authorized ingestion/re-upload and manual per-file review is needed to restore eligible old covers.

**Stopping application URL returns does not revoke old public links.** Previously issued R2 custom-domain/r2.dev URLs, raw native Convex links, presigned uploads and Next/Vercel/CDN/browser cache variants remain a separately authorized inventory/revocation task. No bucket policy, production file/data or deployment setting is changed here. Already-downloaded copies cannot be removed.

## Validation boundaries and live checks

Backend tests execute real handlers through `convex-test` with in-memory authentication/storage. Browser/unit checks mock Convex/authentication/query/mutation and HTTP upload/preview responses; component Next Image is mocked. Chrome still performs native image decoding, Blob cleanup, keyboard and layout checks using compiled application CSS. Separate tests use Next's actual URL matcher and real local `/_next/image` requests to verify moderation endpoints are denied.

No live Convex/JWT/storage/CORS behavior is claimed. Required checks in a separately authorized development deployment:

1. Run normal development code generation/schema validation and verify new module/table registration. The generated API declaration was synchronized locally without deploying.
2. Confirm backend `CONVEX_SITE_URL` and browser `NEXT_PUBLIC_CONVEX_SITE_URL` match, and actual allowed origins/preflight/JWT behavior work.
3. Exercise real owner/Admin uploads, active membership revocation, account switching, simultaneous upload/review, replacement/hide and direct public/private HTTP delivery.
4. Verify legacy-origin/cache inventory and the separately approved rollout plan before claiming legacy files are private.

Build validation uses a temporary repository copy without environment files and with every Convex address overridden to loopback. Managed metadata uses its existing unavailable-backend fallback. No production access, deployment, staging, commits, migration, legacy deletion or URL revocation is performed. Both Site Visit stashes are preserved.

## Files to include

New files:

- `convex/companyCovers/{constants,index,http,model}.ts`, `convex/companyCovers.test.ts`
- `features/companies/components/{company-owner-cover-manager,private-company-cover-preview,approved-company-cover}.tsx`
- `features/admin/components/admin-company-cover-review.tsx`
- `lib/files/company-cover.ts`, `lib/files/company-cover.test.ts`, `lib/company-cover-delivery.test.ts`
- `features/companies/{company-owner-cover-manager,approved-company-cover}.test.tsx`
- `features/admin/admin-company-cover-review.test.tsx`
- `tests/e2e/{company-owner-cover,admin-company-cover}.spec.ts`
- This document

Existing files connect schema/routes/generated API, private-file protection, blocked R2 paths, Company readers, owner/Admin/public consumers, errors and FR/EN. Existing logo/portfolio tests now expect the legacy Company-cover path to be closed. The logo profile browser regression scopes its upload button to the logo section, since the profile now has separate cover/logo buttons. Logo behavior is unchanged. `docs/r2-public-media.md` links the cover contract. No files are staged automatically.

## Completed local validation

- Focused cover/security/profile tests: **106/106** across 7 files.
- Full `npm test`: **1,556/1,556** across 114 files.
- Chrome: **168 distinct scenarios passed** across cover, existing logo/portfolio, profile and Admin Companies suites. The final cover/Admin integration run passed **53/53** (48 cover cases plus 5 existing Companies cases). Twelve asynchronous privacy/retry/stale-review cases repeated five times passed **60/60**. FR/EN, keyboard focus, 320/375px owner layouts and 320/375/768/1024px Admin layouts were checked; desktop/mobile Admin screenshots were inspected.
- `npm run typecheck`: passed with strict settings unchanged.
- `npm run lint`: passed with 10 pre-existing generated/SEO warnings and no new warnings.
- `npm run build`: passed in the isolated loopback-only copy; the existing Google Font download needed network access. Managed metadata used the existing unavailable-backend fallback.
- `git diff --check`, `git diff --cached --check`: passed. All 18 new files also passed a separate whitespace check. The index stays empty; no staging/commit is performed.

These results have the mock/live boundaries described above. Both Site Visit stash hashes remain unchanged. No production deployment/data/storage/cache access or modification occurred.
