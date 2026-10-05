# Company logo moderation V1 — backend and owner UI handoff

This change covers the backend, Company-owner upload UI, Admin review UI and approved-logo display for new Company logos only. Company verification, identity/NAME masking, Company covers and portfolio image workflows keep their existing rules. No AI, OCR or message detection is involved. No production data has been accessed or changed, and no deployment, migration or existing-file deletion is part of this work.

## Data and decisions

- `companyLogoImages`: one immutable private file reference per successfully received upload; Company, uploader/time, validated MIME type, size, storage-derived SHA-256, status (`pending`, `approved`, `rejected`), latest moderator/time/reason.
- `companies.submittedLogoImageId`: newest submitted image. Uploading never changes the approved reference.
- `companies.approvedLogoImageId`: the only image eligible for public delivery.
- `companyLogoUploadIntents`: owner/Company-bound, random, ten-minute, single-success-use intents with exact expected MIME type/size and the resulting image ID.
- `companyLogoModerationHistory`: append-only upload/approve/reject/hide events with actor, time, previous/new status and reason. File metadata is never patched by a moderation command.

Admin commands require both `imageId` and `expectedSha256` from the review DTO. Approve/reject also require that this image is the current pending submission. Hide requires that this image is the current approved logo. A mutation reads and updates the image, Company pointer and history in one Convex transaction; a concurrent replacement or decision causes the check to be retried against current state. Superseded pending files cannot be approved. Rejection and hiding require a trimmed reason of 3–500 characters.

Approved A remains public while B is pending or rejected. Approving B changes the public reference atomically; A is retained privately for history and its public endpoint stops serving it. Hiding the current approved image clears that reference and marks the image rejected, even if a newer submission is pending. No older image is restored. The owner UI renders a generic image when no approved image is available.

## Upload and delivery contract

1. Active Company owner calls `companyLogos.index.generateUploadIntent({contentType, size})`. JPEG, PNG and WebP are allowed, maximum 5 MiB. Onboarding and verification are not prerequisites for uploading a logo.
2. Owner sends the actual file bytes directly to `POST <CONVEX_SITE_URL>/company-logos/upload`, with their Convex JWT in `Authorization: Bearer …`, `X-Upload-Token` and the exact `Content-Type`. This is an authenticated HTTP upload, not a presigned storage upload.
3. The handler reuses image signature validation and the verification flow's narrow CORS/JWT pattern. It bounds the stream independently of Content-Length, validates received size/type/signature, stores a new private Convex Blob, and rechecks ownership/expiry/use while binding the exact stored file and its hash. Native metadata MIME is checked when present; the recorded type comes from the validated HTTP bytes. The response contains only `{imageId}`, never a storage ID or raw storage URL.
4. Failed binds clean up only the newly stored file. Cleanup first checks whether the bind actually committed and never deletes a referenced logo; transient cleanup failures schedule another attempt.

Owner APIs: `getMyLogos` for current submitted/approved DTOs; paginated `listMyLogos` for older/hidden images; paginated `getHistory` for one image. Admin APIs: paginated `listAdminLogos({status, paginationOpts})`, `getAdminReview({imageId})`, `getHistory`, `approve`, `reject`, `hide`. Pagination is limited to 1–100 entries. Owner/Admin DTOs have authenticated preview URLs and reasons, with no private storage reference.

`GET /company-logos/private/<imageId>` authorizes the current active owner of that Company or Admin on every request. It requires the JWT; the owner UI uses authenticated fetch and a local Blob URL. A copied URL alone grants no access. Staff, Clients, SEO and other Company owners are denied.

`GET /company-logos/public/<imageId>` checks current approval and Company visibility on every request, then streams private storage bytes. It serves only the exact current approved logo, with no redirects or raw storage URLs. It preserves the existing public-profile conditions (completed onboarding and slug/name/city/description); existing suspension rules continue to hide directory participation while permitting historical public profiles. Company verification and Deals have no effect on image approval.

Upload/download/error/preflight responses use `no-store`. The new endpoints are excluded from Next image optimization; optimizer redirects are disabled to prevent an allowed origin redirecting into a logo endpoint. Later public UI must use an unoptimized image or ordinary image element. Do not create cached thumbnails, alternate versions or proxies without enforcing the same image/pointer/access checks. No derivatives are created by this backend.

All existing backend logo readers now use the approved reference, without legacy fallback. Public/general DTOs expose only an approved endpoint URL or null. The shared private-file guard also protects logo storage IDs from raw URL helpers, attachment/PDF reuse, downloads and attachment discard. The legacy R2 logo request/claim routes are closed; cover and portfolio routes remain unchanged.

## Company-owner UI completed

- Onboarding's contact step and profile editing share `CompanyOwnerLogoManager`. File selection is followed by an explicit **Upload for review** button; normal onboarding/profile saves do not wait for or require a logo. The old R2 logo calls and onboarding's legacy logo URL fallback have been removed. Cover uploads keep the existing R2 flow.
- Current approved and latest pending/rejected images appear in separate cards. Only the approved backend URL is used in the profile header and Company navbar. Both bypass Next image optimization. Uploading or rejecting B leaves approved A visible; uploading never changes verification badges.
- The existing active-membership capability query gates owner-only queries and controls (`canManageDocuments` identifies the owner; its verification status is not used as a prerequisite). Staff never subscribe to `getMyLogos` or request private previews, and never render rejection reasons. Profile/onboarding/navbar owner-only queries use the same gate.
- `lib/files/company-logo.ts` constructs authenticated upload/preview endpoints from `NEXT_PUBLIC_CONVEX_SITE_URL`; returned URLs cannot choose the credential destination. Files go directly to Convex with JWT/upload tokens in headers, `credentials: omit`, `redirect: error` and `cache: no-store`. The UI checks JPEG/PNG/WebP and the 5 MiB limit; backend byte validation remains authoritative.
- Private previews fetch authenticated bytes and create temporary Blob URLs. Image replacement, retries, unmount, sign-out and account changes abort requests and release old URLs. Previews hide stale results immediately when their image/token changes; the owner editor is keyed by account ID to clear selected files and reasons on account changes.
- Loading/upload/success/error states and retry controls are translated in FR/EN. Duplicate clicks are guarded before React updates. Recoverable failures retain the selected `File`; retry creates a fresh upload intent. The pre-upload guidance names Company branding/contact details, websites/social handles, QR codes and identifying watermarks.

## Admin review and approved-logo display completed

- Admin → Companies includes a metadata-only, paginated pending-logo queue (20 per page). Open a row to fetch its authenticated preview. Superseded submissions are labelled and cannot be decided. Company detail has a Logo tab using the same review component; existing navigation and verification controls remain in place.
- The review shows full Admin-authorized Company identity, upload date/status, the selected immutable image, current approved image, and paginated history (10 per page). The manual checklist covers identifying branding/name, phone/email, website/social handle, QR codes and identifying watermarks.
- Approval requires the exact selected image to decode successfully in the browser and an explicit confirmation. Reject/hide require a normalized 3–500 character reason; hide requires confirmation and explains that older logos will not be restored. Decisions send the captured `imageId` and `expectedSha256` from the reviewed DTO. Duplicate requests are blocked.
- A changed DTO, status or Company logo pointer closes the old confirmation, releases previews and disables decisions. A stale backend response also requires an explicit reload/review. Reload queries the selected image again; a newer submission is offered as a separate explicit selection and never substituted into a decision.
- Owner/Admin previews share `PrivateCompanyLogoPreview` and the existing authenticated fetch helper. Cleanup aborts requests and revokes Blob URLs on image changes, close/unmount and sign-out/account changes. Only Admin can subscribe to the review functions. Query failures and decision/preview errors have localized retry states.
- `getAdminReview` adds Company identity, current-submission ID and current-approved DTO; the indexed paginated Admin list adds Company name/current-submission flag; the existing Admin Company summary adds nullable logo pointers. These are Admin-only metadata extensions. Upload, storage, moderation mutations and visibility rules are reused.
- All Company logo consumers use `ApprovedCompanyLogo`: directory cards and preview sheet, public profile, category/homepage and hiring-guide cards, initial proposal/quote cards and detail, inbox/context Company summaries, owner profile/dashboard/navbar and Admin detail header. It accepts only the configured approval-checked public endpoint, uses `unoptimized`, and switches to a generic Company image for missing/hidden/failed URLs. Legacy/private URLs are never a fallback. Client avatars, covers and portfolio images keep their existing image behavior; optimizer restrictions remain in place.
- FR/EN strings use next-intl. Company names are still the backend-supplied display names, and badges, verification, permissions and Deal rules are unchanged. Optional owner history for older hidden/superseded files remains later work; portfolio and cover moderation remain separate.

## Existing-file rollout blockers — separate work required

Legacy `logoMediaId` (R2) and `logoStorageId` (native Convex) references are preserved. Missing moderation information is unreviewed: these logos are no longer returned by Company logo readers. They are neither automatically approved nor copied, migrated or deleted. They do not yet appear in the new moderation queue; existing-image ingestion/review requires a separately authorized rollout.

**This implementation does not make old public links private.** R2 public bucket/custom-domain/r2.dev URLs, native `/api/storage/…` bearer URLs, already issued presigned R2 PUTs and existing Next/Vercel/browser caches need inventory and an explicit storage/cache revocation plan. Stopping application URL returns does not revoke an issued URL. Native links generally require retiring the original object to revoke, which this task does not authorize. R2 access changes must account for still-public Company covers and portfolio images in shared storage; a folder or database status is not a storage ACL. Allow already-issued public upload grants to expire as part of rollout planning.

Plan a separately authorized private ingestion/re-upload and per-file Admin review before re-exposing legacy logos. Any reviewed copy must become its own immutable image record. Inventory origins, variants, optimizer URLs and cache invalidation, and confirm that old objects can no longer be fetched before claiming they are private. Previously downloaded copies cannot be removed by this feature. Portfolio moderation remains a separate step and must approve each exact image/derivative individually.

## Validation limits

Security tests run against `convex-test`, with no live deployment or storage provider calls. They cover role/ownership denial, real HTTP upload bytes, expiry/reuse/late membership changes, cleanup, concurrent decisions, safe DTOs/file reuse, replacement/hide/history, legacy preservation and unchanged verification/name masking. They do not verify live JWT/CORS/storage behavior or revoke legacy origins/caches. Generated API type references were updated locally; no deployment/codegen command requiring deployment access was used.

Backend-step validation before the owner UI: focused suite 107/107; dedicated logo security suite 24/24; full `npm test` 1,284/1,284 across 98 files; typecheck/lint/build/diff checks passed. Lint reported 10 warnings in unchanged generated/SEO files. The local build used localhost Convex overrides and managed metadata's existing fallback; a network-enabled retry fetched the existing Outfit font. No deployment was performed.

Owner-step checks use real components against the existing mocked browser harness, plus transport/access unit tests. `playwright.company-logo.config.ts` starts a separate loopback server/build directory with all Convex origins overridden to localhost; external browser requests are blocked and upload/preview responses are intercepted. These checks do not exercise a live Convex session, storage provider or production environment. The temporary Next-generated TypeScript include changes were removed after the browser run.

Owner validation: focused unit tests 77/77; browser suite 26/26 (20 owner-logo cases and 6 profile regressions), including FR/EN, keyboard access and 320/375/1024px layouts; five asynchronous privacy/retry cases repeated five times, 25/25; full `npm test` 1,328/1,328 across 100 files; `npm run typecheck` passed; `npm run lint` passed with the same 10 existing warnings; `npm run build` passed with all Convex origins overridden to localhost; `git diff --check` passed. Managed metadata used its existing fallback. The initial sandbox build could not reach Google Fonts; the network-enabled retry fetched the existing Outfit font successfully. No production access, deployment, commit, migration or old-file deletion was performed.

## Changed files

- Backend module: `convex/companyLogos/constants.ts`, `convex/companyLogos/index.ts`, `convex/companyLogos/http.ts`, `convex/companyLogos/model.ts`, `convex/schema.ts`, `convex/http.ts`, `convex/_generated/api.d.ts`.
- Existing logo readers/legacy writers: `convex/companies/index.ts`, `convex/companies/directory.ts`, `convex/admin/companies.ts`, `convex/portfolio/index.ts` (logo reader only), `convex/quotes/index.ts`, `convex/messages/index.ts`.
- Storage/reuse protection: `convex/storage/imageValidation.ts`, `convex/storage/publicMedia.ts`, `convex/storage/publicMediaModel.ts`, `convex/storage/r2.ts`, `convex/storage/verificationPrivacy.ts`, `convex/projects/index.ts`, `convex/finalQuotes/index.ts`.
- Tests: `convex/companyLogos.test.ts`, `convex/companies.test.ts`, `convex/companyProfileManagement.test.ts`, `lib/company-logo-delivery.test.ts`.
- Delivery configuration/errors: `next.config.ts`, `lib/errors/codes.ts`, `messages/en.json`, `messages/fr.json`.
- Handoff and legacy URL issue: `docs/company-logo-moderation-v1.md`.

Owner-step files (no backend edits in this step):

- Shared manager/transport: `features/companies/components/company-owner-logo-manager.tsx`, `lib/files/company-logo.ts`.
- Owner screens and cover-only helper: `features/companies/components/company-onboarding-form.tsx`, `features/companies/components/company-profile-editor.tsx`, `features/companies/components/profile/profile-editing.tsx`.
- Owner navbar/approved delivery: `components/layout/company-navbar.tsx`, `components/layout/profile-menu.tsx`; `next.config.ts` adds only an optional local-test build directory in this step.
- FR/EN: `messages/en.json`, `messages/fr.json`.
- Unit/regression tests: `lib/files/company-logo.test.ts`, `features/companies/company-owner-logo-manager.test.tsx`, `features/companies/company-onboarding-services.test.tsx`, `features/companies/company-profile-editor.test.tsx`, `components/layout/navbar.test.tsx`.
- Browser tests/harness: `tests/e2e/company-owner-logo.spec.ts`, `tests/e2e/company-profile.spec.ts`, `tests/e2e/support/component-harness.ts`, `playwright.company-logo.config.ts`.

## Admin/public-step validation and files

Focused unit/security/regression checks: **199/199** across 11 files. Full `npm test`: **1,365/1,365** across 102 files. Browser checks: **55 distinct scenarios passed** across Admin logos/public delivery, existing Admin Companies, owner upload/privacy and profile editing. The full regression run passed 52/52; nine async/error cases were repeated five times (45/45, including three additional scenarios), with one additional mobile visual check and five approval/reject/hide style regressions. Keyboard focus, FR/EN, 320/375/768/1024px layouts, mobile dialog bounds and the primary confirmation color were checked.

`npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`, `git diff --cached --check` all passed. Lint retains the same 10 existing generated/SEO warnings. The build used localhost overrides for every Convex origin and the existing managed-metadata fallback. The test server used a separate build directory; its automatic TypeScript include/format changes were removed without changing compiler/security settings. The branch stays `feature/company-media-moderation-v1`; nothing was staged or committed.

**Mock boundaries:** backend/security tests execute real Convex handlers in `convex-test` with in-memory storage/authentication. UI unit/browser tests mock Convex subscriptions, queries/mutations, authentication and HTTP preview/upload responses; Next Image is mocked for component tests. Browser checks render real feature components in Chrome using compiled application CSS and native image decoding/Blob cleanup. The separate optimizer restriction test uses Next's actual URL-matching implementation. No live Convex/JWT/CORS/storage behavior was exercised. Live session/CORS checks, deployment-origin alignment (`NEXT_PUBLIC_CONVEX_SITE_URL` vs backend `CONVEX_SITE_URL`), actual visibility/HTTP delivery and legacy-origin/cache inventory remain release checks in an authorized non-production environment. Legacy public links remain a blocker for declaring old files private; no existing image was migrated, deleted or automatically approved.

New untracked files added in this step:

- `features/admin/components/admin-company-logo-review.tsx`
- `features/admin/admin-company-logo-review.test.tsx`
- `features/companies/components/approved-company-logo.tsx`
- `features/companies/components/private-company-logo-preview.tsx`
- `features/companies/approved-company-logo.test.tsx`
- `tests/e2e/admin-company-logo.spec.ts`

Modified files in this step:

- Admin integration: `app/[locale]/(admin)/admin/companies/[companyId]/page.tsx`, `features/admin/components/admin-companies-panel.tsx`, `features/admin/components/admin-company-detail-panel.tsx`.
- Admin metadata/security tests: `convex/companyLogos/index.ts`, `convex/admin/companies.ts`, `convex/companyLogos.test.ts`.
- Public/Company renderers: `features/companies/components/company-directory.tsx`, `features/companies/components/public-company-profile.tsx`, `features/companies/components/company-profile-editor.tsx`, `features/companies/components/company-dashboard.tsx`, `components/home/category-marketplace.tsx`, `components/home/marketplace-feed.tsx`, `components/how-it-works/hiring-company-previews.tsx`, `features/quotes/components/client-received-quotes.tsx`, `features/messages/components/messages-inbox.tsx`, `features/messages/components/conversation-context-panel.tsx`, `components/layout/profile-menu.tsx`.
- Shared transport/preview reuse: `lib/files/company-logo.ts`, `features/companies/components/company-owner-logo-manager.tsx`.
- FR/EN and handoff: `messages/en.json`, `messages/fr.json`, this document.
- Test integration: `lib/files/company-logo.test.ts`, `components/layout/navbar.test.tsx`, `features/admin/admin-companies.test.tsx`, `features/admin/admin-company-verification.test.tsx`, `features/companies/public-company-profile.test.tsx`, `features/marketplace/company-identity-ui.test.tsx`, `tests/e2e/admin-companies.spec.ts`, `tests/e2e/support/component-harness.ts`, `playwright.company-logo.config.ts`.

Previously untracked backend/owner work remains untracked and preserved:

- `convex/companyLogos.test.ts`
- `convex/companyLogos/constants.ts`
- `convex/companyLogos/http.ts`
- `convex/companyLogos/index.ts`
- `convex/companyLogos/model.ts`
- `convex/storage/imageValidation.ts`
- `docs/company-logo-moderation-v1.md`
- `features/companies/company-owner-logo-manager.test.tsx`
- `features/companies/components/company-owner-logo-manager.tsx`
- `lib/company-logo-delivery.test.ts`
- `lib/files/company-logo.test.ts`
- `lib/files/company-logo.ts`
- `playwright.company-logo.config.ts`
- `tests/e2e/company-owner-logo.spec.ts`
