# V1 company verification

Verification is separate from onboarding: company account → normal onboarding → dashboard → verification → upload documents → submit → admin review → approve or reject.

## State machine

Only `draft`, `pending`, `verified`, and `rejected` are database statuses. `resubmit` is an action handled by `submitVerification` when the current status is rejected.

| Current status | Action | Actor | Result |
| --- | --- | --- | --- |
| draft | submit | Active company owner after onboarding | pending |
| pending | approve | Admin | verified |
| pending | reject, with a reason | Admin | rejected |
| rejected | resubmit | Active company owner | pending |

Every other transition is rejected by Convex. No public function accepts a caller-supplied verification status. A required certificate must exist before submission or approval. Pending and verified companies cannot upload, replace documents, or change the submission, including with upload tokens issued earlier. Verified document renewal is deferred beyond V1. The public badge remains exactly `verificationStatus === "verified"`.

## Authorization matrix

| Caller | Status | Submission and document metadata | File contents | Submit / replace | Approve / reject |
| --- | --- | --- | --- | --- | --- |
| Anonymous / visitor | Public badge | No | No | No | No |
| Client | Public badge | No | No | No | No |
| SEO user | Public badge | No | No | No | No |
| Other company | Public badge | No | No | No | No |
| Active company staff | Own status only | No | No | No | No |
| Active company owner | Own status and rejection reason | Own company only | Own company only | Own company, draft/rejected | No |
| Admin | All statuses | Review access | Review access | No | Pending only |

Backend checks derive the authenticated user through Convex Auth and verify the stored account type and active owner membership. Owners cannot supply another company ID to the submission API. Download authorization checks the document's company and its verification record relationship. Inactive membership loses file access immediately.

## Documents and private storage

Required: **Attestation de régularité fiscale / Tax Compliance Certificate** (`tax_compliance`). Optional: RC / Trade Register (`rc`), ICE (`ice`), Insurance (`insurance`), Other (`other`). At most one document per type, five types total. Existing ICE/RC text fields remain unchanged; optionality applies to their files.

Only PDF, JPG/JPEG, and PNG are accepted, with a maximum of 10 MiB (10 × 1024 × 1024 bytes) per file. Backend HTTP upload checks the MIME type, file signature, nonempty content, and size while reading a bounded stream. Backend mutations recheck authoritative storage size and type.

1. An authenticated owner receives a random, short-lived upload token tied to the company, user, and document type.
2. The browser posts bytes directly to `https://<deployment>.convex.site/company-verification/upload`, sending the Convex session JWT in `Authorization: Bearer ...` and the upload token in `X-Upload-Token`. The handler stores the bytes it receives and an internal mutation binds that exact storage ID to the upload intent. Callers cannot bind arbitrary IDs. Concurrent uploads, stale states, expired tokens, and token reuse are rejected; a failed bind removes the new file.
3. Submission rechecks ownership, status, token expiry, file metadata, exact storage binding, unique document types, and the required certificate in one transaction. Rejected companies may retain the certificate or replace it. Replacements remove the previous storage object and document record.
4. Tables store private `_storage` references and metadata, never file URLs. Owner/admin DTOs expose authenticated Convex HTTP download endpoints, never raw Convex storage URLs. Owner form metadata includes document IDs for authorized retrieval.
5. The browser fetches `https://<deployment>.convex.site/company-verification/documents/<documentId>` directly with the current session JWT in the Authorization header. Both admin document views use authenticated fetch and save an in-memory Blob rather than navigating an unauthenticated link. Each request reauthorizes before reading the blob. Knowing a document ID or HTTP endpoint URL conveys no access. Downloads use `private, no-store`, attachment disposition, and `nosniff` headers. Denied/missing documents return the same 404 response.
6. A shared privacy guard prevents verification storage IDs (including staged uploads) being exposed as logos, portfolio media, project files, quote PDFs, or message attachments. The message upload-discard API also refuses to delete private verification files.

Public DTOs, notifications, and application logs contain no verification file URLs or document content. The status-only staff query does not return document names, types, IDs, or legal submission fields. Documents stay private after approval.

## Direct file transport and CORS

Previously, uploads and downloads passed through the Next.js `/api/company-verification/*` file proxies on Vercel. Uploads exceeding Vercel's 4.5 MB request payload limit could fail before Convex validation. The proxies have been removed. File bytes now travel browser ↔ authenticated Convex HTTP action ↔ private Convex storage; Next.js serves the UI and no verification file bytes.

`useAuthToken` retrieves the existing Convex Auth session JWT. The browser sends it only in the Authorization header, never URLs, upload tokens, or logs. The client refuses proxy URLs, unrelated origins, credentials in URLs, query parameters, fragments, and redirects before transmitting a session token. Fetch uses `credentials: omit` and `cache: no-store`. Downloads use a temporary browser Blob URL that is revoked after saving; no permanent storage URL is exposed.

Convex OPTIONS handlers allow only exact origins `https://batiplusmaroc.com` and `https://www.batiplusmaroc.com` by default. `VERIFICATION_WEB_ORIGINS` is an optional Convex deployment variable for explicitly configured development/preview origins. The development deployment is configured with `http://localhost:3000,http://127.0.0.1:3000`. Wildcards, opaque `null` origins, lookalike domains, and unconfigured previews are denied. Production was not configured or changed.

Upload preflight permits POST and only Authorization, Content-Type, and X-Upload-Token. Download preflight permits GET and only Authorization. Responses include the exact matching Access-Control-Allow-Origin and Vary: Origin; downloads expose only Content-Disposition for file handling. Cross-origin cookies and Access-Control-Allow-Credentials are unnecessary. Requests from disallowed origins are rejected before file processing. Non-browser requests without Origin still require backend JWT authorization.

Expired tokens are checked before the upload stream is read and again during binding and submission. Pending/verified state and current owner membership are rechecked in the binding transaction. A change between initial authorization and binding therefore fails and removes the uploaded storage object.

## Audit history

Append-only `companyVerificationHistory` records `document_uploaded`, `document_replaced`, `verification_submitted`, `verification_resubmitted`, `verification_rejected`, and `verification_approved`. Each row includes the actor (`changedBy`), server timestamp (`changedAt`), and `oldStatus`/`newStatus` (from/to status); rejection rows include the required reason. Document actions retain the current status on both sides. No filenames, storage IDs, file URLs, or file content are stored in history.

A staged upload records `document_uploaded` when its storage reference is bound. Replacement and submission/resubmission records commit with the actual document replacement and status transition. Notification failures roll back moderation and its history. Document audit events are excluded from the existing status-transition activity timeline so they do not masquerade as repeated submissions or decisions. An indexed rejection-action lookup keeps the reason available even after many staged uploads.

## Existing records and rollout

New schema fields are optional for existing rows; existing statuses and histories are preserved. Legacy history rows without an action retain their existing transition meaning. A legacy pending company without the tax certificate must be rejected and resubmit with the required file before approval. Existing verified companies are not automatically downgraded. No migration or production change was performed as part of this work.

## Verification

Tests in `convex/companyVerification.test.ts` and `convex/admin.verification.test.ts` cover the role matrix, own/other company isolation, revoked membership, anonymous and guessed-ID denial, frozen states, owner self-approval denial, invalid transitions, required certificate, upload binding and token abuse, MIME/signature/empty/size validation, replacement/resubmission, rejection reason visibility, audit privacy, notifications, public DTOs, private-ID reuse, and verified badge behavior.

## Company verification screen

The existing routes remain `/en/company/verification` and `/fr/espace-entreprise/verification`. Verification has its own centered screen and header, separate from onboarding.

- Draft: legal details, one required Tax Compliance Certificate and four optional document cards. File selection uploads directly to authenticated Convex. Cards show uploading, uploaded, error and empty states; submission stays disabled until the required certificate is uploaded or already exists, and all new uploads have completed successfully.
- Rejected: private Admin reason, current documents, replacement controls and a resubmit action. Existing documents can be retained. The editor resets on backend submission/state changes so claimed upload tokens cannot be reused after a later rejection.
- Pending: a locked clock/status screen with no file controls and a workspace link.
- Verified: a blue success icon, the shared `VerifiedBadge`, and a workspace link. The badge itself renders only for `verificationStatus === "verified"` and is available for reuse in Company profiles and cards.
- Staff: the status query returns only status and the owner permission flag. Staff never subscribe to the owner-only form or download query, and see no files or rejection reason.

Existing documents download through authenticated Convex. A just-uploaded file may be saved from the owner's local File object before submission assigns a document ID; that temporary Blob URL is revoked after saving. File bytes and session tokens never pass through a Vercel file proxy. Loading and route error states have translated copy; errors do not log document information.

All visible screen text uses next-intl. `features/companies/company-verification-screen.test.tsx` adds 14 rendering tests. `tests/e2e/company-verification.spec.ts` adds 18 browser component tests covering upload/download, disabled/enabled submission, resubmission, all four states, staff privacy, failed uploads, live Admin rejection, FR/EN and 320 px layouts without horizontal overflow. Browser component tests use mocked backend responses; backend authorization remains covered by Convex security tests.

Validation results:

- Focused verification/security plus browser transport: 37 passing tests across `convex/companyVerification.test.ts`, `convex/admin.verification.test.ts`, and `lib/files/company-verification.test.ts`.
- `npm test`: 91 files, 952 tests passed.
- Verification UI browser component tests: 18 passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed, zero errors and 10 existing warnings (generated ESLint directives and SEO `<img>` usage).
- `npm run build`: passed; managed-page metadata fetches logged fallback warnings in the restricted build environment.
- `git diff --check`: passed.
- Development Convex compile-and-push: passed.
- Live development HTTP checks: allowed-origin preflight returned 204 with exact CORS headers; an untrusted origin returned 403 without an allow-origin header; anonymous guessed-document download returned safe 404 with private/no-store and nosniff headers.

The download architecture follows [Convex's private-file guidance](https://docs.convex.dev/file-storage/serve-files): authorize each request in an HTTP action and do not expose direct file URLs.

 Development compile-and-push target: `dev:hip-gnat-222`. Production is excluded; neither `convex deploy` nor `--prod` is used.

## Files changed for direct file transport

- `convex/companyVerification/index.ts`: direct HTTP URLs, CORS on file responses, early token expiry, OPTIONS actions.
- `convex/companyVerification/httpAccess.ts`: exact origin allowlist, endpoint URLs, restricted preflight handling.
- `convex/admin/verification.ts`: direct authorized HTTP document paths.
- `convex/http.ts`: upload/download OPTIONS routes.
- `convex/convex.config.ts`: optional typed CORS origin configuration.
- `convex/_generated/api.d.ts`, `convex/_generated/server.d.ts`: generated API/environment declarations.
- `features/companies/components/company-verification-form.tsx`: direct authenticated upload.
- `features/companies/components/verification-document-download.tsx`: authenticated private file download button.
- `features/admin/components/admin-verification-panel.tsx`, `features/admin/components/admin-company-detail-panel.tsx`: both admin document views use the shared download button.
- `lib/files/company-verification.ts`: direct browser upload/download, safe token destination checks, temporary Blob download cleanup.
- `convex/companyVerification.test.ts`, `lib/files/company-verification.test.ts`: transport, CORS, size-boundary, authorization, binding cleanup and token tests.
- `.env.example`: explicit Convex origin configuration instructions.
- `docs/company-verification-v1.md`: workflow, security model and validation report.
- Removed `app/api/company-verification/upload/route.ts` and `app/api/company-verification/documents/[documentId]/route.ts`; no replacement Vercel file proxy.

## Admin Company verification tab

Verification stays inside Admin → Companies → Company detail → Verification. The existing Company header supplies the safe summary, city, onboarding and verification statuses. `AdminCompanyVerification` handles the four states without adding a separate review system:

- Draft has no decision controls and explains that the Company has not submitted yet.
- Pending permits confirmed approval or rejection. The required certificate has its own card; approval is disabled when it is missing. Rejection requires a private reason of 3–500 characters.
- Verified shows the shared blue badge and approval history, with no decision controls.
- Rejected shows the private rejection reason and waits for Company resubmission. Admin cannot set it back to pending.

Required and optional document cards show translated types, filenames, upload dates and authenticated document review. `uploadedAt` is taken from the current document's backend `updatedAt`; the Admin DTO contains no storage ID or permanent storage URL. The shared download action sends the session token only in the Authorization header directly to Convex.

The audit list renders all six safe actions, actor, timestamp, from/to statuses and allowed rejection reasons. Legacy rows without an action display a status change. React escapes actor names and rejection text. Confirmation dialogs trap keyboard focus, restore it after cancellation, and close when the reactive verification status changes. Loading, missing-record, mutation-error and existing Companies route-error states remain translated.

Added coverage: 16 FR/EN rendering tests, 9 browser component tests and 6 backend regression tests; the existing 5 consolidated Admin Companies and 18 Company verification browser tests were also revalidated. Browser tests mock Convex responses while exercising real components, compiled application CSS and authenticated browser transport. Backend tests use Convex's test runtime to verify authorization, state transitions, storage access and safe HTTP responses. Mobile/tablet checks include widths from 320 to 1440 px with no horizontal overflow.

Latest Admin validation: 1,002 tests across 93 test files; 32 browser checks passed. Typecheck, lint (zero errors, 10 existing warnings), build and whitespace checks passed. The Admin DTO update was compiled and pushed only to development `hip-gnat-222`. Production was not accessed or changed; neither `convex deploy` nor `--prod` was used.
