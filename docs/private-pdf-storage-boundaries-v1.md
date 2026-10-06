# Private PDF storage boundaries V1

Project attachment downloads return a configured Convex HTTP endpoint containing
the attachment record ID. Every request checks the current stored Client role,
completed onboarding, attachment ownership and Project ownership before reading
the file. Admin, Company, SEO and anonymous access remains denied. Both errors
and PDF responses are private/no-store. No native storage URL, storage ID or
redirect is returned. Browser callers use `fetchProjectAttachment` with their
Convex JWT; opening the endpoint without authentication does not grant access.

Message PDF upload intents now record the Company context and, after an
authenticated direct HTTP upload, the exact newly created storage ID. Uploads
validate the actual bounded PDF bytes before storing, and binding reauthorizes
the current user, conversation, Company, expiry and unused intent. The browser
receives only an upload acknowledgement and sends/discards using the intent
token. Tokens are headers, not URL parameters. Existing unbound native upload
grants cannot be attached or used to delete files through the new flow; users
must select/upload their PDF again.

Discard and commit recheck the same intent in their transactions. Discard may
delete only its bound, unclaimed file after indexed checks for Project
attachments, message attachments, Final Quote PDFs, verification documents and
verification upload intents, and moderated logo/cover/portfolio files. A
discarded tombstone makes repeated discard safe and fences late upload binding
or message commit. Committing first consumes the intent and blocks discard;
discarding first blocks commit. Failed HTTP upload cleanup can delete only a
fresh unbound copy, and keeps files already bound or persistently referenced.

Expired active grants fail closed; this change does not implement an orphan
sweeper or delete legacy files. An interrupted upload can leave a private orphan
before binding, as in the existing moderated-upload pattern.

Previously issued native Project PDF URLs may still work. Replacing the current
query does not revoke those URLs, delete their objects, purge caches or remove
downloaded copies. Inventory and any copy/revocation/deletion require a separate
explicitly authorized rollout. This change performs no production migration,
deployment, legacy-file deletion or URL revocation.

Offline regressions use registered Convex handlers and HTTP routes with
`convex-test` authentication, in-memory database and storage. Browser transport
tests mock fetch. Live development checks remain required for JWT forwarding,
deployment schema/index rollout, CORS, streaming and browser upload/download.

## Changed files

- `convex/projects/index.ts`: authenticated endpoint URL instead of native URL.
- `convex/projects/download.ts` (new): owner authorization and private PDF delivery.
- `convex/messages/attachments.ts`: server binding, guarded commit/discard and cleanup.
- `convex/messages/upload.ts` (new): authenticated bounded direct PDF upload.
- `convex/storage/privateFileReferences.ts` (new): indexed persistent-reference guard.
- `convex/schema.ts`: optional Company/file/discard state and storage-reference index.
- `convex/http.ts`: Project download and message upload routes/preflights.
- `convex/_generated/api.d.ts`: local API declarations for new modules.
- `features/messages/components/messages-inbox.tsx`: authenticated token-only upload/send/discard.
- `lib/files/private-pdf.ts` (new): trusted-origin browser upload/download helpers.
- `convex/privatePdfStorage.test.ts` (new): authorization, deletion, replay, race and reference regressions.
- `lib/files/private-pdf.test.ts` (new): browser credentials/URL/transport regressions.
- `convex/messages.test.ts`: exercise server-bound upload and byte validation.
- `convex/companyNamePrivacy.test.ts`: exercise bound attachment upload before identity checks.
- `features/messages/messages-inbox.test.tsx`: mocked session for the existing component checks.
- `features/marketplace/company-identity-ui.test.tsx`: mocked session for existing identity checks.
- `docs/private-pdf-storage-boundaries-v1.md` (new): architecture and legacy/live-check boundaries.

The four new runtime modules above must be included with their imports when this
change is committed. No files are staged or committed automatically.
