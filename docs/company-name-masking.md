# Company name masking V1 — Steps 1 and 2

## Final release findings: public copy and separator-only aliases

Before: directory/profile descriptions and public portfolio/review text used
name-only matching. A reference such as `S2MBOU SARL2026.pdf` could therefore
retain the full identity. An extensionless filename such as `---` also produced
a separator-equivalent matcher that consumed ordinary spaces before name
masking, corrupting commercial text and leaving identity words unmasked.

After:

- `maskPublicCompanyText` reuses the shared filename engine. Explicitly
  authorized references are generated before name masking. Public discovery has
  no authorized private-file relationship, so it does **not** query conversation
  attachments, revisions or upload aliases. If filename-style Company identity
  remains unresolved, only that text field is withheld as an empty string. Safe
  copy, masked display names, URLs, pagination and the rest of the DTO remain
  available; one unsafe description does not break the directory.
- The public boundary covers Company descriptions, directory portfolio titles,
  public portfolio titles/descriptions/captions, review comments and reviewed
  project titles. Privileged portfolio/profile reads retain originals.
- Whitespace-only filename aliases are not compiled. Separator-only stems use
  literal matching, including legacy sanitizer aliases, and cannot acquire an
  optional extension that turns them into arbitrary whitespace. Meaningful
  extensionless names such as `devis-final` still recognize separator variants.
  Actual-span overlap selection, bounded lookup and private fail-closed errors
  are unchanged.
- Stored legal names, source text/filenames, financial snapshots and audit/history
  records are not rewritten. No schema, index, dependency or authorization change
  is required for this follow-up.

Files changed for the privacy fix: `convex/lib/companyName.ts`,
`convex/companies/directory.ts`, `convex/portfolio/index.ts`, both Company-name
privacy test modules, and this report. Added 22 regressions covering public
copy/alias isolation, literal separator aliases, ordinary spaces, extensionless
uploads, inbox/push previews, privileged originals and source immutability.

The Company-settings extraction is unrelated: its two consumers and
`features/companies/lib/settings-sections.ts` were already staged/tracked when
this follow-up began. They are preserved unchanged and must be committed as a
separate three-file settings change, not combined with the masking change. No
commit or stash is created automatically, and existing staging is preserved.

Validation:

- Focused affected-module suite: 9 files, 286 tests passed.
- `npm test`: 95 files, 1,166 tests passed.
- `npm run typecheck`: passed standalone before and after the successful build.
- `npm run lint`: passed, 0 errors and the same 10 existing warnings.
- `npm run build`: passed with process-local localhost Convex URL overrides;
  expected managed-metadata fallback warnings were logged. No environment file
  was changed, and no production backend was queried.
- `git diff --check` and the staged diff check: passed.
- `git status --short`: no untracked files; all required modules are tracked.
  The latest privacy edits remain unstaged over the previously staged change;
  stage these separately and do not blanket-commit the mixed existing index.

No deployment command, live Convex operation, migration, production access or
environment-setting change was performed for this follow-up.

## Rule and trust boundary

`convex/lib/companyName.ts` owns the masking rule. Each whitespace-separated word
keeps its first two Unicode code points (after NFC normalization); all remaining
characters become `*`. Whitespace is trimmed and collapsed. Non-string input
returns an empty string. Punctuation and numbers count as characters.

Examples: `S2MBOU SARL` → `S2**** SA**`; `Atlas Construction Maroc` →
`At*** Co********** Ma***`; `A AB CD` → `A AB CD`.

The Convex DTO boundary applies masking, not React. Existing display fields
(`name`, `companyName`, `otherPartyName`, Company notification sender aliases)
carry the safe value; they do not include a second real-name field. Stored
Company names, source text, financial snapshots, and notification history are
unchanged. The filename-alias follow-up adds optional private metadata for new
uploads; existing rows remain valid and no backfill is needed.

Public discovery/profile endpoints always return masked names, regardless of
the caller's role. Existing authenticated Admin endpoints and own-Company
owner/staff endpoints retain full names under their existing authorization.
Notification visibility additionally checks active membership of the Company
associated with the notification entity; a Company account type alone does not
permit a full name.

## Protected DTOs

| Backend entry point | Protection |
| --- | --- |
| `companies/directory.listPublicCompanies` | Company name, descriptions and portfolio preview titles; search results use the same DTO. |
| `portfolio/index.getPublicCompanyProfile` | Company name and exact name aliases in profile, portfolio captions/text and public reviews; existing SEO reads consume this DTO. |
| `quotes/index.listReceivedInitialQuotes`, `getReceivedInitialQuote` | Company summary, proposal message/scope and status-history reasons, including shortlisted proposals. |
| `invitations/index.listProjectInvitations` | Company name and exact aliases in invitation message and project context. |
| `messages/index.listMyThreads`, `getConversation`, `listMessages` | Company counterpart name, context/preview/body and attachment display filename. |
| `siteVisits/index.getForProject`, `getForConversation` | Company name, assessment notes, visit address/note/cancellation reason and proposal history. |
| `finalQuotes/index.getForConversation` | Company name, revision scope/terms/notes/PDF display filename and changes-request reason. |
| `messages/download.authorizeAttachmentDownload`, `finalQuotes/download.authorizePdfDownload` | Display/download filenames (including HTTP download headers); existing download authorization is unchanged. |
| `notifications/index.listMyNotifications` | Legacy and new payload Company names, Company sender aliases and repeated names in title/preview, resolved at read time. |
| `notifications/pushDeliveryModel.claimMarketplacePush`, `pushPresentation` | Safe payload before the delivery action plus masking when rendering FR/EN push copy; locale, destination, lease/retry and dedupe behavior unchanged. |

Marketplace activity DTOs are currently Admin-only. Company/Client Deal DTOs
contain identifiers and commercial data rather than a Company name; their
notifications go through the protected boundary above. No new access is granted
to activity, quote, invitation, conversation, assessment, Final Quote or Deal
records.

### Filename privacy

`companyPdfFileNameForAudience` generates `attachment.pdf`, `final-quote.pdf`, or
`company-document.pdf` for Client/public PDF reads, preserving the PDF extension
including its case. It never copies the original basename or an unknown extension.
Company owner/staff and Admin keep original filenames only where existing
authorization already permits access. Verification documents remain private;
this change does not expose a new Company-document endpoint.

The same rule protects attachment/revision DTOs and authorized HTTP download
headers. Text outputs replace literal references to known stored filenames before
Company-name masking. Conversation and notification/push previews resolve their
full source message before shortening it, including non-empty messages and
historical truncated previews. Stored filenames, message text, notification
history, and financial/audit records are not rewritten. Deal-based reveal remains
deferred.

## Deliberately deferred

- Step 4: reveal only after validating the **requesting Client's own Deal** with
  this Company. Until then, Client/public DTOs remain masked even after a Deal;
  another Client must never inherit a global reveal flag. The explicit audience
  helper is ready for a server-validated relationship policy, not a caller role
  or browser-provided reveal boolean.
- No UI redesign or rollout of new display fields. Existing consumers render
  the safe values supplied by Convex.
- This is name-field privacy, not complete Company anonymity: existing slugs,
  public URLs/websites, branding/images and uploaded document contents are not
  rewritten or removed. Existing SEO URLs remain intact.
- Text redaction matches known current display/legal-name aliases (and stored
  notification aliases). It cannot infer arbitrary signatures, former names,
  obfuscated identity, phone numbers, or names embedded in uploaded binaries.
  These require a separate content/contact/media policy.

Tests cover Unicode/invalid input, public/search/profile payloads, Client
commercial and messaging reads, legacy notifications/push claims, privileged
reads, revoked membership and cross-Client isolation. No production operation
is part of this change.

## Verification

- Added `convex/lib/companyName.test.ts` (20 unit tests) and
  `convex/companyNamePrivacy.test.ts` (13 integration tests).
- Updated existing profile-management, portfolio, message, notification,
  site-visit, Final Quote and push tests to expect masked Client/public names;
  privileged expectations remain full-name checks.
- Focused affected-module suite: 262 tests passed; the additional
  profile-management/helper/privacy run passed all 43 tests.
- `npm test`: 95 test files, 1,071 tests passed.
- `npm run typecheck`: passed (standalone; rerun after build output regeneration).
- `npm run lint`: passed with 10 existing generated-file/SEO image warnings.
- `npm run build`: passed; managed-page metadata fallback warnings were logged.
- `git diff --check`: passed.
- Convex functions validated and pushed with `npx convex dev --once` to
  **development `hip-gnat-222` only**. The CLI reported that its AI guidance files
  have an available update; they were not changed as part of this task.
- No production deployment, production data write, migration, schema change,
  environment change, `convex deploy`, or production flag was used.

## Filename privacy follow-up

Before: exact-alias text redaction could leave Company identity in filenames such
as `S2MBOU SARL2026.pdf`, hyphen/underscore variants, and longer names. PDF-only
messages also copied those filenames into conversation and notification previews.

After: Client attachment/revision DTOs and download descriptors use generated
filenames. HTTP download headers use the same safe descriptors. Legacy PDF-only
previews resolve the original attachment and apply the same rule at read time,
without rewriting source records. Company owner/staff keep their own originals;
Admin keeps existing Final Quote access. Admin chat access is not expanded.

Files updated for this fix:

- Shared helper: `convex/lib/companyName.ts`.
- DTOs/downloads: `convex/messages/index.ts`, `convex/messages/download.ts`,
  `convex/finalQuotes/index.ts`, `convex/finalQuotes/download.ts`.
- Derived notification/push previews: `convex/notifications/companyIdentity.ts`.
- Tests: `convex/lib/companyName.test.ts`, `convex/companyNamePrivacy.test.ts`,
  `convex/messages.test.ts`, `convex/finalQuotes.test.ts`.
- This report: `docs/company-name-masking.md`.

Regression coverage includes numeric suffixes, hyphens, underscores, embedded
names, legal names, accents/punctuation, uppercase and mixed-case PDF extensions,
unknown/missing extensions, filenames longer than the preview cap, and ordinary
filenames. Tests assert safe Client DTOs and HTTP headers, safe inbox/push
previews, unchanged privileged originals and stored names, and denied access for
other Clients/Companies and anonymous visitors.

Verification for this follow-up:

- Eight filename regression cases failed before the fix and passed afterward.
- Focused suite: 6 test files, 164 tests passed.
- `npm test`: 95 test files, 1,090 tests passed.
- `npm run typecheck`: passed, including a post-build rerun.
- `npm run lint`: passed, with the same 10 existing warnings.
- `npm run build`: passed using temporary process-local localhost Convex URLs;
  expected managed-metadata fallback warnings were logged. No environment file
  was changed and no production backend was contacted by the build.
- `git diff --check`: passed.
- Tests used only in-memory Convex. No deployment, production access, migration,
  schema/index change, or financial/audit record rewrite was performed.

## Filename references inside text

Before: generated attachment filenames were safe, but non-empty bodies such as
`Please see S2MBOU SARL2026.pdf.` still leaked the stored original through the
message, conversation preview, and notification/push delivery payload. Exact
Company-name matching did not recognize numeric suffixes or separator variants.

After: `maskCompanyNamesInText` accepts stored filename references and replaces
them with the same generated attachment/Final Quote names used by their DTOs.
Matching is literal (regex punctuation escaped), Unicode-normalized,
case-insensitive, and longest-first in one replacement pass. Ordinary text is
preserved. Preview formatting is shared and runs after source-text sanitization,
so a 120-character historical preview cannot bypass the replacement.

Source-message attachments and returned Final Quote revisions are resolved first.
Follow-up references to older files use existing indexes scoped to the authorized
conversation, never another Client's conversation or Company-wide file history.
These additional lookups are bounded at 1,000 attachments and the existing 100
Final Quote revisions. If an unresolved reference requires a larger/inconsistent
context, the read fails closed (`COMPANY_FILE_PRIVACY_LIMIT`) rather than silently
returning text from an incomplete alias set. Privileged reads do not take this
lookup path and retain originals.

Protected output fields include message bodies; thread preview/project title;
notification preview/title and production push interpolation data; Final Quote
scope, inclusions, exclusions, terms, note and change-request reason; and known
filename references in related proposal, invitation and site-visit context.
Public reads never borrow a private file relationship. The final-release public
fallback withholds fields with unresolved filename-style Company identity; no
private-file lookup or new access is introduced for public visitors.

Files changed in this follow-up:

- `convex/lib/companyName.ts` and its unit tests.
- `convex/messages/index.ts`, `convex/messages/attachmentRules.ts`.
- `convex/notifications/companyIdentity.ts` (shared inbox/push boundary).
- `convex/finalQuotes/index.ts`, `convex/quotes/index.ts`,
  `convex/invitations/index.ts`, `convex/siteVisits/index.ts`.
- `convex/companyNamePrivacy.test.ts` and this report.

Regression tests cover non-empty/PDF-only bodies, numeric suffixes,
hyphens/underscores, embedded names, accents/punctuation, mixed-case extensions,
long filenames truncated in historical previews, references outside the current
message page, Final Quote references, FR/EN push rendering, related context,
unchanged ordinary text, the real attachment send flow, privileged originals,
unchanged source records, existing authorization and fail-closed bounded lookup.

Verification for this follow-up:

- The initial focused regression run reproduced 15 failures before the fix.
- Focused affected-module suite: 9 test files, 257 tests passed.
- Added 6 helper regressions and 14 integration regressions (20 additional tests).
- `npm test`: 95 test files, 1,110 tests passed.
- `npm run typecheck`: passed, including a post-build rerun.
- `npm run lint`: passed with the same 10 existing warnings (no errors).
- `npm run build`: passed with temporary process-local localhost Convex URLs;
  expected managed-metadata fallback warnings were logged. No environment file
  was changed and no production backend was contacted by the build.
- `git diff --check`: passed, including the previously staged diff.
- All source/test modules used by this fix already exist in Git. Existing staged
  changes were preserved; the new edits remain unstaged for the author to review.
- Tests used in-memory Convex only. No live deployment (development or
  production), production data access/write, schema/index change, migration,
  environment setting change, or financial/audit/history rewrite was performed.

## Complete filename lookup and upload aliases

Root causes: checking for remaining `.pdf` text could mistake a known suffix
(`2026.pdf`) for a complete reference to an older `S2MBOU SARL2026.pdf`, or miss
an extensionless Final Quote entirely. Upload sanitization also discarded the
browser spelling, leaving references containing `?` or different whitespace
unrecognized.

For non-empty Client-facing text, the shared helper now resolves the complete
authorized conversation file set, using the existing indexes. Relationship
lookups still check the exact project/Company/Client pairing. Reads remain capped
at 1,000 attachments, one Final Quote parent and 100 revisions, and fail closed
if those limits or integrity checks fail. A page-local filename only determines
the preferred generated label; it cannot suppress the complete lookup. Empty
text does not require a lookup. No `.pdf`-presence heuristic remains.

New message upload intents/attachments retain an optional private
`uploadFileName`; new Final Quote revisions retain optional `pdfUploadFileName`.
Existing stored display filenames keep their prior sanitization. Alias matching
recognizes browser and stored spellings, NFC/NFD Unicode, case, whitespace and
hyphen/underscore equivalents. Legacy message filenames also recognize the
sanitizer's punctuation replacements and possible appended PDF extension.
Matching is longest-first in one pass. If a legacy filename reached the sanitizer
truncation boundary without a retained browser alias, Client reads fail closed
because the discarded suffix cannot be reconstructed safely. Privileged reads
do not take that redaction path.

The new fields are optional and internal, so old records need no migration and
no Client/public DTO includes upload aliases. Existing authorization, Admin/own-
Company filenames, source messages, legal names, audit/history and financial
records are unchanged. New metadata is written only when a new upload is committed.

Files changed in this follow-up:

- `convex/lib/companyName.ts`: complete lookup, alias redaction and limits.
- `convex/messages/attachmentRules.ts`: shared sanitizer-equivalent patterns and
  bounded original upload names (1,024 characters).
- `convex/messages/attachments.ts`, `convex/messages/index.ts`: retain browser
  aliases in upload intents and committed attachments.
- `convex/finalQuotes/index.ts`: retain original browser names on new PDF revisions.
- `convex/schema.ts`: three backward-compatible optional private metadata fields;
  no index change or migration.
- `convex/lib/companyName.test.ts`, `convex/companyNamePrivacy.test.ts`: regressions.
- `docs/company-name-masking.md`: this report.

Added 18 tests: eight helper regressions and ten integration regressions. They
cover older full filenames versus newer suffixes, extensionless Final Quotes,
real sanitized uploads, hyphens/underscores, Unicode/case/whitespace, all message
and conversation/inbox/FR/EN push previews, Final Quote and proposal/invitation/
site-visit context, privileged originals, cross-Client/conversation isolation,
unchanged source/history snapshots, private metadata absent from DTOs and
fail-closed legacy truncation. Scheduled external delivery is disabled in the
new integration group; push claims/rendering are driven explicitly in memory.

Verification for this follow-up:

- Initial regression run: 14 reproduced failures before implementation.
- Focused affected-module suite: 9 files, 275 tests passed.
- `npm test`: 95 files, 1,128 tests passed.
- `npm run typecheck`: passed standalone after build. A concurrent run raced
  Next.js regenerating `.next/types`; the post-build run passed.
- `npm run lint`: passed with the same 10 existing warnings and no errors.
- `npm run build`: passed with temporary process-local localhost Convex URLs;
  managed-metadata fallback warnings were expected. No environment file changed.
- `git diff --check` and the staged diff check passed. No untracked files or new
  required modules; the follow-up edits remain unstaged, preserving existing
  staged work.
- Tests and schema validation used in-memory Convex only. No development or
  production deployment, live data access/write, migration, production flag,
  environment setting change or index operation was performed.

## Complete backend filename-privacy boundary

The filename redactor is now a private alias-and-span model built by
`createCompanyFilePrivacyBoundary` in `convex/lib/companyName.ts`. The existing
authorized DTO entry points all use this model through `maskCompanyNamesInText`.
Generated descriptor/download names still use `companyPdfFileNameForAudience`;
no original name or alias list is added to a Client/public response.

The model builds the complete internal alias set from retained browser spelling,
stored spelling, NFC normalization, safely derived basenames, equivalent path
separators, and the shared upload sanitizer's punctuation/separator equivalents.
Extensionless Final Quotes remain valid aliases. New upload metadata is reused;
this replacement needs no new schema fields, indexes, migration or backfill.

Each alias is matched independently against the original normalized text,
including overlapping occurrences. Actual match intervals—not alias spelling
length or regular-expression alternative order—determine coverage. Within each
overlapping group, the longest actual span chooses the generated label. Crossing
overlaps are covered by their union so that discarding a shorter match cannot
leave an original suffix. Replacements happen once, before Company-name masking
and before preview truncation; generated names are not processed as new input.

Legacy path stripping cannot recover an arbitrary discarded prefix from
`plans.pdf`. If text references `S2MBOU SARL2026\\plans.pdf` and no retained full
path alias covers it, the read throws `COMPANY_FILE_PRIVACY_LIMIT`. A retained
full path supports safe replacement (including slash/backslash variants).
Legacy truncation without the browser alias, and PDF records missing both
filename sources, also fail closed. Empty message
bodies contain no reference and can retain their generated safe attachment
descriptor without an unnecessary alias reconstruction.

Existing conversation/relationship lookups remain scoped to the authorized
project, Company and Client, capped at 1,000 attachments, one Final Quote parent,
and 100 revisions. The matching model also caps file references, filename length,
text length and actual match count; exhausting a bound never returns partial
redaction. Source messages, legal names, original stored filenames, notifications,
financial snapshots and audit/history are unchanged. Privileged reads do not
enter this model and retain their authorized originals.

Files changed for this replacement:

- `convex/lib/companyName.ts`: complete alias model and actual-span resolution.
- `convex/messages/attachmentRules.ts`: sanitizer-equivalent character classes.
- `convex/lib/companyName.test.ts`: model, overlap, path and bounded-work tests.
- `convex/companyNamePrivacy.test.ts`: Client/privileged end-to-end regressions.
- `docs/company-name-masking.md`: architecture and verification report.

Added 16 regression tests, retaining the existing numeric-suffix, sanitized/raw
filename, extensionless Final Quote, Unicode, older-file lookup, download-header,
preview and cross-Client tests. Seven newly added regressions reproduced the old
engine's failures before replacement. New coverage includes long separator
aliases independent of input ordering, same-alias/crossing overlaps, retained
and unknowable paths, limits, all related DTOs, FR/EN push rendering, failed push
claims without committed state, privileged originals, PDF-only long uploads,
and missing legacy PDF filename metadata.

Verification for this replacement:

- Focused affected-module suite: 9 files, 264 tests passed.
- `npm test`: 95 files, 1,144 tests passed.
- `npm run typecheck`: passed, including the post-build check.
- `npm run lint`: passed with 10 existing warnings and no errors.
- `npm run build`: passed with process-local localhost Convex URLs. Managed-page
  metadata fallback warnings were expected; no environment file was changed.
- `git diff --check` and the staged diff check passed.
- All five changed privacy/report files are already tracked. Existing staged
  work and unrelated Company-settings edits were preserved.
- Validation was local/in-memory only. No production access, live Convex push,
  deployment, migration, environment setting change, schema/index operation, or
  stored financial/audit/history rewrite was performed.
