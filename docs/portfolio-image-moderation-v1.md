# Portfolio Image Moderation V1 — backend, owner and Admin UI

This step adds per-file moderation for portfolio covers and gallery images. Company logos, verification, Company cover uploads, Company-name masking and Deal rules retain their existing behavior. Human review only: no AI, OCR or contact-text detection. No deployment, production access, migration, legacy-file deletion, staging or commit is part of this work.

## Records and replacement

- `portfolioImages`: one immutable private Convex file per successful upload, with Company/project, purpose (`cover` or `gallery`), optional gallery slot ID, MIME, size, storage-derived SHA-256, uploader/time and `pending`/`approved`/`rejected` moderation status. Only status/moderator/time/reason are patched by moderation commands; file metadata and bytes are never replaced.
- `portfolioProjects.submittedImageId` and `approvedImageId`: independent cover submission and public references. Both are optional for legacy projects.
- `portfolioMedia`: existing gallery rows become stable slots. Optional `submittedImageId`/`approvedImageId` references are independent of `sortOrder` and caption. Legacy storage/R2 fields are retained without being used as a fallback. The existing eight-gallery-image limit counts slots, including retained legacy rows.
- `portfolioImageUploadIntents`: ten-minute, random, owner/Company/project/purpose/slot-bound intents with expected MIME and exact size. One successful use binds the exact received file.
- `portfolioImageModerationHistory`: append-only upload/approve/reject/hide events, including actor, server time, old/new status and required decision reason where applicable. The event commits in the same transaction as the decision and slot reference.

For either a cover or gallery slot: uploading B updates only its submitted reference and creates a pending record. Approved A stays public while B waits or is rejected. Approving B atomically switches only that slot's approved reference; A's endpoint then denies public delivery. Hiding the current approved image clears the approved reference, marks it rejected and records the reason. It never restores an older file, and it leaves any newer pending submission intact. A new slot without an approved image is omitted from public gallery DTOs.

Admin `approve`, `reject` and `hide` require the exact `imageId` and `expectedSha256` from the reviewed DTO. Approve/reject require the current pending submission; hide requires the current approved image. Wrong hashes, superseded images, repeated decisions and concurrent stale decisions are rejected. Reject/hide normalize whitespace and require 3–500 characters. Publication never changes image status. Approved images in draft/hidden projects stay private.

## Owner and Admin integration contract

1. Create portfolio metadata with `portfolio.index.createPortfolioProject`. Images are optional at this stage so upload intents can bind to an existing project. Existing metadata editing, publish/archive and URLs remain in place.
2. For a new gallery image, call `portfolioImages.index.createGallerySlot({portfolioProjectId, caption?})`. Retain this slot ID for retries and replacements. `reorderGallery` accepts every slot ID once and updates ordering without changing approval. Cover uploads use the project itself as the slot.
3. Call `portfolioImages.index.generateUploadIntent({portfolioProjectId, purpose, gallerySlotId?, contentType, size})`. Gallery requires a slot belonging to that project; cover forbids a gallery slot.
4. Send file bytes directly to `POST <CONVEX_SITE_URL>/portfolio-images/upload`, with the Convex JWT in `Authorization: Bearer …`, intent in `X-Upload-Token`, and exact MIME in `Content-Type`. JPEG, PNG and WebP remain allowed, maximum **10 MiB**. The bounded stream validates actual size and signature; binding rechecks current active owner, Company/project/slot, expiry/use and storage metadata/hash. The response contains only `{imageId}`. Failed binds delete only an unreferenced newly stored file; uncertain success cannot delete a committed image, and failed cleanup schedules a safe retry.
5. `getMyImages({portfolioProjectId})` returns cover and ordered gallery submitted/approved pairs. `listMyImages` includes older/hidden records with native pagination. Owner queries require the current active owner of that exact Company; Staff, Clients (including Deal Clients), SEO, visitors and other Companies are denied. Onboarding must be completed for new portfolio uploads, as before; verification is irrelevant.
6. Admin uses metadata-only `listAdminImages({status, companyId?, paginationOpts})`, `getAdminReview({imageId})` and `getHistory({imageId, paginationOpts})`. Review DTOs include Company/project identity, current same-slot approved/submitted pairs, gallery sort order, exact hash and authenticated preview URL. Queue/history/owner history use indexes and native pagination with 1–100 requested entries. Listing never downloads bytes.

Human reviewers must reject real Company names, Company logos/identifying branding, phone/email, websites/social handles, QR codes and identifying watermarks. The Admin UI presents this checklist, loads and decodes the exact preview before confirmed approval, sends its captured ID/hash, and requires a fresh review after any stale response.

## Private and public delivery

`GET /portfolio-images/private/<imageId>` reauthorizes active own owner or Admin on every request, checks project/slot relationship and immutable storage metadata, then streams bytes. No raw storage reference, URL or redirect is returned. Knowing the image ID or copying its endpoint URL grants no private access. Inactive/revoked owners lose access immediately; a Deal never grants private-file access.

`GET /portfolio-images/public/<imageId>` checks exact approved status, current approved slot reference, Company/project/slot relationship, published portfolio and the existing completed public Company-profile conditions on every request. Historical suspension visibility follows the existing public-profile rule; suspended Companies remain excluded from directory results. No verification badge or Deal is required for an approved image. Superseded, hidden, pending and rejected files return safe 404s. Hiding blocks subsequent public requests; already delivered/in-flight bytes or downloaded copies cannot be recalled.

Uploads, previews, public delivery, errors and OPTIONS responses use `no-store` and narrow CORS from the verification flow. JWTs/tokens stay in headers. `lib/files/portfolio-image.ts` constructs every destination from `NEXT_PUBLIC_CONVEX_SITE_URL`, refusing untrusted origins, credentials, query strings, fragments and redirects, and accepts an AbortSignal. It returns preview Blobs. Owner and Admin controls implement account-scoped state, cancellation and Blob URL cleanup described below.

The shared private-storage guard now denies these files through raw URL helpers, project attachments, message attachment send/discard/download and final-quote PDF submit/download. No derivatives or thumbnails are created. The Next optimizer's existing restricted `.convex.site` paths and disabled redirects exclude both portfolio endpoints. Do not add a cached proxy or optimizer route for these images.

## Approved-only read integration and remaining UI

Public profile, directory previews and Admin Company summary now resolve approved portfolio references without a legacy fallback. Missing cover approval returns `null` while published project metadata remains visible; unapproved gallery slots are omitted. The owner metadata manager also avoids legacy raw URLs; `getMyImages` supplies its private image state. Existing portfolio renderers use the small `ApprovedPortfolioImage` component for direct unoptimized delivery and generic fallback. Homepage/hiring cards bypass optimization only when their Company-cover fallback is a moderated portfolio endpoint; unrelated Company covers retain their existing optimization.

The owner manager now uses the secure draft-first upload workflow below. Admin portfolio review is integrated into Admin → Companies as described below. All legacy R2 portfolio request/verify/claim paths remain closed, including already-created intent claims. Company cover uploads and Company logo moderation remain available.

## Company-owner UI completed

- `PortfolioManager` retains the existing project form/cards/navigation and gates owner metadata queries with the existing active-membership capability. Staff do not subscribe to private portfolio state. Verification status is not a prerequisite. Sign-out/account/session changes destroy the editor and selected files.
- Save a new project's text as a draft first; images are optional. The editor remains open and uses the returned project ID for uploads. Existing-project text saves also stay independent of image requests, failures and review. No image fields or legacy R2 tokens are sent in text saves. Publishing changes project status only, explicitly explains that it does not approve images, and can proceed with pending/rejected images.
- `CompanyOwnerPortfolioImages` renders the current approved cover separately from its latest pending/rejected submission. Ordered, stable gallery slots each render their own approved/submitted pair and rejection reason. An explicit Add gallery slot action allocates one slot, focuses its chooser and retains that ID for retries/replacements; the existing eight-slot limit includes legacy slots. It does not move approvals between slots or change gallery ordering.
- New uploads use `generateUploadIntent` and `uploadPortfolioImage`, with the exact File body sent directly to configured Convex HTTP. The returned intent URL is ignored. JWT/upload tokens remain in headers. Frontend MIME/size checks improve feedback; backend bytes/signature checks remain authoritative. Duplicate requests are blocked synchronously. Recoverable failures keep the File and slot, and retry requests a new intent.
- `PrivatePortfolioImagePreview` renders authenticated Blobs without a storage URL. Its tagged image/token/attempt state hides stale results immediately; disposal suppresses late responses, cancellation stops active downloads, and cleanup revokes temporary URLs. Completed bodies are not aborted, following the existing Chrome logo-preview fix. Image/slot/project replacement, editor close, sign-out, account/session changes and retry dispose old previews. Staff never request them or render reasons.
- Eligible approved images use backend-returned public URLs through `ApprovedPortfolioImage`, unoptimized with generic failure fallback. An approved image in a draft/hidden portfolio (or otherwise not publicly eligible) uses an authenticated owner preview; public delivery still denies it. Missing approved cover stays generic, and a gallery slot with no approval is explicitly absent publicly. No legacy R2/native URL fallback or cached thumbnail/proxy is added.
- FR/EN guidance, review/publication/replacement explanations, loading/upload/error/success/retry states and rejection reasons use next-intl. Native labelled file inputs, visible keyboard focus, 44px buttons and stacked narrow layouts retain the Batiplus design. Logo moderation, Company verification, name masking, Deals and backend moderation remain unchanged.

## Legacy rollout blocker — separate authorization required

Legacy cover/gallery rows without exact-file moderation records are unreviewed. This code stops returning their URLs in application portfolio DTOs, keeps project URLs/SEO metadata and files/references intact, and does not automatically approve them. Replacements/hiding never delete a legacy object or native reference.

Previously issued public R2/native Convex URLs and optimizer/CDN variants can remain accessible outside these DTOs. Database status and folder names are not storage ACLs. This implementation does **not** make old links private. Inventory legacy origins, variants, caches and outstanding presigned PUT grants separately; grant expiry and storage-origin/cache controls require an authorized rollout plan that accounts for still-public Company covers/other media. Review newly ingested private copies or owner re-uploads individually before exposing them. Do not automatically approve all images in a published project. Previously downloaded copies cannot be removed.

## Validation boundaries

Backend tests execute real queries/mutations/HTTP handlers in `convex-test`, with in-memory auth/storage and deterministic clocks. Cleanup retry coverage injects a transient failure. DTO-only discovery/name tests seed approved fixtures; they do not exercise live moderation. Browser transport tests mock `fetch`; renderer tests mock Next Image. Optimizer tests use Next's actual remote URL matcher. No live Convex JWT/CORS, deployment schema push, storage provider or production behavior is claimed.

Release checks still require an explicitly authorized development deployment: schema/API validation, real session JWT upload at the 10 MiB boundary, origin allowlist/configuration alignment, denied-role previews, public replacement/hide delivery and legacy inventory. The user's no-deploy instruction takes precedence over the Convex skill's usual compile-and-push step; local tests/typecheck/build are used here.

## Local validation results

- Focused portfolio/logo/security/transport/delivery regressions: **232/232**, eight files. Portfolio backend security suite: **26/26**; existing logo suite: **25/25** unchanged.
- Full `npm test`: **1,433/1,433**, 106 files.
- `npm run typecheck -- --incremental false`: passed without loosening compiler settings.
- `npm run lint`: passed, zero errors and the same ten existing generated/SEO warnings.
- `npm run build`: passed in an isolated source copy containing no environment files, with every Convex origin overridden to localhost. The first sandbox attempt failed to resolve Google Fonts; the network-enabled retry fetched the existing Outfit font. Managed metadata used its existing fallback. No deployment or live backend access occurred.
- `git diff --check` and `git diff --cached --check`: passed. Branch remains `feature/company-media-moderation-v1`; no staging or commit.

## Files changed

- `components/home/category-marketplace.tsx`
- `components/home/marketplace-feed.tsx`
- `components/how-it-works/hiring-company-previews.tsx`
- `convex/_generated/api.d.ts`
- `convex/admin/companies.ts`
- `convex/companies/directory.ts`
- `convex/companyDiscovery.test.ts`
- `convex/companyNamePrivacy.test.ts`
- `convex/http.ts`
- `convex/portfolio.test.ts`
- `convex/portfolio/index.ts`
- `convex/portfolioImages.test.ts`
- `convex/portfolioImages/constants.ts`
- `convex/portfolioImages/http.ts`
- `convex/portfolioImages/index.ts`
- `convex/portfolioImages/model.ts`
- `convex/schema.ts`
- `convex/storage/publicMedia.ts`
- `convex/storage/publicMediaModel.ts`
- `convex/storage/r2.ts`
- `convex/storage/verificationPrivacy.ts`
- `docs/portfolio-image-moderation-v1.md`
- `docs/r2-public-media.md`
- `features/companies/components/company-directory.tsx`
- `features/companies/components/company-profile-editor.tsx`
- `features/companies/components/public-company-profile.tsx`
- `features/portfolio/approved-portfolio-image.test.tsx`
- `features/portfolio/components/approved-portfolio-image.tsx`
- `features/portfolio/components/portfolio-manager.tsx`
- `lib/errors/codes.ts`
- `lib/files/portfolio-image.test.ts`
- `lib/files/portfolio-image.ts`
- `lib/portfolio-image-delivery.test.ts`
- `messages/en.json`
- `messages/fr.json`
- `next.config.ts`

## Owner-step validation and files

- Focused owner/portfolio/logo/security/name/privacy/delivery checks: **244/244**, nine files. Full `npm test`: **1,445/1,445**, 107 files.
- Chrome component browser suite: **26/26**, including FR/EN, keyboard file selection/upload, 320/375px gallery and full-editor layouts, cover and per-slot replacement, retained File/fresh-intent retry, duplicate clicks, staff denial, private-preview retry, close/sign-out/account cleanup, late bodies, draft-approved private delivery and independent metadata saves/publication. Six asynchronous privacy/retry scenarios repeated five times: **30/30**. Mobile screenshots were inspected; fixed generic placeholders are checked at 80px to prevent overlap with status/upload controls.
- `npm run typecheck -- --incremental false`, `npm run lint`, `npm run build`, `git diff --check` and `git diff --cached --check`: passed. Lint retains ten existing generated/SEO warnings. Build/browser checks used isolated copies without environment files, with application Convex environment variables set to loopback; the browser harness intercepts its configured fake Convex origin. The build fetched the existing Google font and used the existing managed-metadata fallback. Repository Next-generated instructions and TypeScript files were unchanged.
- Mock boundaries: UI unit tests mock Convex/authentication and Next Image. Browser checks mount real owner components with app CSS and native Chrome File/Blob/image behavior; Convex subscriptions/mutations, sessions, HTTP uploads and previews are mocked/intercepted. They do not exercise live Convex JWT/CORS/storage. Backend regression tests execute real handlers in `convex-test` with in-memory auth/storage. Optimizer restrictions are checked with Next's real URL matcher. No live backend behavior is claimed.
- Remaining authorized-development checks: actual configured-origin/JWT/CORS uploads and denied-role previews, membership revocation, publication/visibility gating, real reactive owner updates after exact-file Admin approval/rejection/hiding, cover/gallery replacement and public revocation. Admin portfolio review was completed in the following step using those same APIs. Legacy origins/caches still need the separate rollout described above.
- Branch stays `feature/company-media-moderation-v1`. Both Site Visit stash identities were checked unchanged. No production access, deployment, staging, commit, legacy migration, deletion or automatic approval occurred. Logo moderation and its Chrome abort fix were preserved.

Owner-step source/handoff changes:

- `features/portfolio/components/portfolio-manager.tsx`
- `features/portfolio/components/company-owner-portfolio-images.tsx` (new)
- `features/portfolio/components/private-portfolio-image-preview.tsx` (new)
- `lib/files/portfolio-image.ts` (frontend validation export only; existing transport reused)
- `messages/en.json`, `messages/fr.json`
- `docs/portfolio-image-moderation-v1.md`

Owner-step test files:

- `features/portfolio/company-owner-portfolio-images.test.tsx` (new)
- `tests/e2e/company-owner-portfolio-images.spec.ts` (new)
- `playwright.portfolio-images.config.ts` (new)

The pre-existing untracked backend/delivery files listed above remain required and preserved. Nothing was staged automatically.

## Admin review UI completed

- Admin → Companies includes a metadata-only Portfolio Image review queue with pending/approved/rejected filters, 20 entries per request and explicit Load more. Company detail adds a locale-routed Portfolio Images tab using the same queue scoped by Company. Rows show Company/project, cover or gallery order, upload time/status and superseded context. No previews or history subscribe/download until a review opens.
- Review opens in the existing Radix modal style. It shows the selected immutable file, Company/project identity and publication status, current approved image for that same slot, latest pending/rejected replacement, reason and indexed history (10 per request). Comparison images load privately only within the open review. Switching from an approved image to its replacement is an explicit selection.
- Approval is disabled until the exact selected image decodes, then requires confirmation. Every decision captures the reviewed image ID/hash; reject/hide require normalized 3–500 character reasons and hide requires confirmation. Duplicate submissions are blocked synchronously. A cover decision does not affect gallery slots, and a gallery decision does not affect its neighbours or any cover/project. Upload and moderation command implementations were reused unchanged.
- Any change to the selected DTO, status, slot references, gallery order, Company/project context or publication cancels confirmation, releases previews and latches stale state. Returning to an earlier DTO cannot reopen a cancelled confirmation. Backend stale responses require explicit reload and inspection too. Reload queries the same selected ID, with approval disabled until its new preview decodes; a newer replacement is never substituted into a decision.
- Admin access requires an authenticated Admin session before private subscriptions mount. Session/account changes remount the queue and destroy selected review/confirmation state. The existing PrivatePortfolioImagePreview/transport handles authenticated fetch, local Blob URLs, cancellation, late-response suppression and revocation on selection, stale review, modal close, sign-out or account change. JWTs remain in headers and destinations use only the configured Convex origin. No raw storage URLs, new proxy, derivative, AI or OCR is added.
- FR/EN through next-intl covers loading/empty/error/retry/success/stale/confirmation and the manual checklist. Radix focus trapping/restoration, existing Company tab keyboard navigation, labelled status/reason controls and stacked 320/375px layouts preserve the Admin design.
- The only backend additions for this screen are Admin read metadata (same-slot submission/order/current-approved flags), optional Company-scoped native pagination, and its Company/status/time index. Public delivery, uploads, moderation commands, verification, masking, Deals, owner UI and logo moderation behavior remain unchanged.

## Admin-step public audit

Public Company profiles/directory/previews, homepage and hiring-guide cards, owner portfolio cards and Admin Company summaries were checked. Their backend portfolio URLs resolve exact current approved references in published portfolios and preserve existing Company visibility. Pending/rejected gallery slots are omitted, missing cover approval is null/generic, and legacy file fields are not used as portfolio fallbacks. The existing ApprovedPortfolioImage renderer accepts only configured public endpoints, renders unoptimized and falls back generically on failure. Homepage/hiring Company-cover fallbacks use unoptimized only for approved portfolio endpoints; unrelated Company covers/static content retain optimization. No public renderer changes were necessary in this step.

Replacement/hide/publication/slot independence and public DTO behavior are exercised through real handlers in convex-test. Next's actual URL matcher and localhost Next optimizer HTTP requests reject both moderated portfolio paths. Browser image rendering uses a native-image mock for Next Image, so those component checks prove the unoptimized prop/URL and fallback, not a live Convex delivery. Legacy-link blockers above remain separate; hiding blocks subsequent endpoint requests but cannot remove downloaded copies.

Admin-step files changed:

- `app/[locale]/(admin)/admin/companies/[companyId]/page.tsx`
- `features/admin/components/admin-companies-panel.tsx`
- `features/admin/components/admin-company-detail-panel.tsx`
- `features/admin/components/admin-portfolio-image-review.tsx` (new)
- `convex/portfolioImages/index.ts` and `convex/schema.ts` (Admin read metadata/index only)
- `convex/portfolioImages.test.ts` (three additional read-contract/security cases)
- `features/admin/admin-portfolio-image-review.test.tsx` (new)
- `tests/e2e/admin-portfolio-images.spec.ts` (new)
- `tests/e2e/admin-companies.spec.ts`
- `tests/e2e/support/component-harness.ts` (records pagination args/options)
- `playwright.portfolio-images.config.ts` (includes Admin/Companies/logo regressions)
- `messages/en.json`, `messages/fr.json`
- `docs/portfolio-image-moderation-v1.md`

The three new Admin files must be included along with the previously untracked backend/owner/transport/test files listed above. No files are staged automatically.

## Admin-step validation and remaining live checks

- Focused portfolio/logo/Admin/owner/name/privacy/transport/delivery suite: **269/269**, 11 files. Portfolio backend suite: **29/29**, including three additional Company-scoped pagination/same-slot review DTO cases. New Admin UI unit suite: **12/12**.
- Full `npm test`: **1,460/1,460**, 108 files.
- Chrome component suite: **92/92** — 37 Admin portfolio cases, 26 existing owner portfolio cases, 24 existing Admin logo cases and five consolidated Companies/navigation regressions. Twelve critical approval/decoding/stale/late-body/selection/mobile scenarios repeated five times: **60/60**. This includes comparison-image readiness isolation, close/sign-out/Admin account switches, explicit same-ID reload, reasons, duplicate prevention, FR/EN, keyboard focus, 320/375px layouts and generic fallback. Mobile screenshots were inspected. The initial query-error retry fixture registered its mocked response after the fetch; fixing that setup resolved the initial failure.
- `npm run typecheck -- --incremental false`, `npm run lint`, `npm run build`, `git diff --check` and `git diff --cached --check`: passed. Lint retains the same ten generated/SEO warnings and zero errors. TypeScript/security configuration was not weakened. Next-generated repository instruction/TypeScript files are unchanged.
- Build and browser checks ran in separate isolated source copies excluding all environment files, with application Convex origins set to localhost. Chrome blocks outside network requests except intercepted fixture responses at its configured fake Convex origin. The build fetched the existing Google font and used the existing managed-metadata fallback; no backend deployment or production access occurred.
- Mock boundaries: UI unit tests mock Convex/auth and Next Image; transport tests mock fetch. Chrome mounts real components/app CSS with native Blob/decode/focus behavior, while Convex sessions/subscriptions/mutations and preview HTTP responses are mocked. Next Image is mapped to a native image in that harness; actual localhost Next optimizer HTTP denial and Next's real remote-pattern matcher are checked separately. Backend security tests execute actual queries/mutations/HTTP handlers with convex-test's in-memory auth/storage, not live JWT/storage/CORS. No live Convex behavior is claimed.
- Remaining checks require an authorized development deployment: validate the schema/API/index, real Admin/owner JWT and strict origin/CORS settings, denied/revoked roles, reactive concurrent Admin/owner replacement, per-slot approval/history, public replacement/hide/visibility and stale review using real sessions. Legacy origin URLs, caches and old upload grants still require the separately authorized rollout above; existing files were not ingested, deleted, migrated or automatically approved.
- Production was untouched. No deployment, staging or commit. Branch stays `feature/company-media-moderation-v1`; both Site Visit stashes retain their original identities. Existing logo moderation (including its Chrome abort fix), owner portfolio work, verification, Company-name masking and Deal behavior are preserved.
