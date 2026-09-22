# Therapy communication and reports

## Storage and access

- `connections/{patientUid}` remains the current relationship pointer. `therapy_relationships/{relationshipId}` remains the versioned historical record. The backend requires both records to be `ACTIVE` and to name the same relationship before reading or writing therapy data.
- `therapy_keys/{relationshipId}` contains a random 32-byte relationship DEK wrapped by Google Cloud KMS. The key is created when the therapist accepts a request, in the same Firestore transaction that activates the relationship. Requesting a connection does not require KMS; accepting one does. Browser clients cannot read this collection. The unwrapped DEK exists only in server memory during a request and is zeroed after use.
- `therapy_relationships/{relationshipId}/messages/{messageId}` stores `relationshipId`, `senderUid`, `recipientUid`, `senderRole`, `type: TEXT`, `ciphertext`, `iv`, `cryptoVersion: 1`, and `createdAt`. The AES-256-GCM ciphertext includes its authentication tag. The authenticated context is `relationshipId:message:messageId`.
- `.../session_notes/{noteId}` stores source, period, status, and encrypted `aiDraft` or `reviewed` content. Drafts are returned to the therapist only. Reviewed notes are returned to both active participants. Call note IDs equal call session IDs so one note is created per call.
- `.../weekly_therapy_summaries/{YYYY-MM-DD}` and `.../weekly_reflections/{YYYY-MM-DD}` contain encrypted structured reports. Therapy summaries are available to both active participants; reflections are patient only. Each report uses the relationship DEK with a report-specific authenticated context.
- `.../call_sessions/{callId}/transcripts/{transcriptId}` is reserved and denied to clients. There is no call recording or transcription in this implementation. A future transcript must record separate patient and therapist consent and store only encrypted text.

All therapy communication, notes and reports are served by Firebase authenticated API routes, with `Cache-Control: no-store`. The browser never receives a DEK. The journal Vault remains browser-only and is unrelated to this scheme.
Chat polling sends the last message version to the API. When nothing changed, the API returns 304 after authorization without unwrapping the DEK or rereading and decrypting the message list.

## AI and consent

The current patient disclosure explicitly covers AI session drafts and weekly reflections. Existing relationships must accept the new disclosure in the session notes panel before AI generation. The backend checks this consent before any Gemini call. A separate call-transcription disclosure is defined for future use but no transcription consent or recording flow exists yet.

Text note generation reads at most 100 messages in a therapist-selected seven-day-or-shorter window (the UI offers the last one, six, or 24 hours). It decrypts only those messages, labels the speaker, and sends them to Gemini 3.8 Flash with medium thinking and a strict structured response. Zod validates the response. Therapist review edits and approves the shared note. Manual call summaries can be saved directly as reviewed after therapist entry; optional AI organization creates a draft that requires review.
If a selected window contains more than 100 messages, note generation stops instead of silently omitting messages. The therapist can choose a shorter one-hour or six-hour window in the UI. Call summaries require a nonempty focus before saving.

Weekly reports read only reviewed notes, mood scores, available stored Momo session summaries, Momo session counts, and aggregate journal behavior metrics. They do not query raw therapy messages or journal text. Gemini 3.8 Flash uses high thinking and structured output. No previous relationship's raw conversation or key is shared with a new therapist.

## Deployment and migration

1. Enable Cloud KMS API, create a symmetric encryption key, and grant the application's Firebase Admin service account `cloudkms.cryptoKeyEncrypterDecrypter` on that key. Set `THERAPY_KMS_KEY_NAME` to the full `projects/.../locations/.../keyRings/.../cryptoKeys/...` name. Keep this key and its versions available for the lifetime of stored therapy data. The existing Firebase Admin credentials must be configured on the server.

   For the current `rant-and-heal` project, Firestore is in `us-central1`. The local `gcloud` default project is different, so specify `--project=rant-and-heal` on every command. One concrete setup is:

   ```sh
   gcloud services enable cloudkms.googleapis.com --project=rant-and-heal
   gcloud kms keyrings create rant-heal-therapy --location=us-central1 --project=rant-and-heal
   gcloud kms keys create relationship-dek --keyring=rant-heal-therapy --location=us-central1 --purpose=encryption --protection-level=software --project=rant-and-heal
   gcloud kms keys add-iam-policy-binding relationship-dek --keyring=rant-heal-therapy --location=us-central1 --member='serviceAccount:firebase-adminsdk-fbsvc@rant-and-heal.iam.gserviceaccount.com' --role=roles/cloudkms.cryptoKeyEncrypterDecrypter --project=rant-and-heal
   ```

   The service account above matches this project's current `FIREBASE_ADMIN_CLIENT_EMAIL`. Set the following in `.env.local` and restart the Next.js server:

   ```text
   THERAPY_KMS_KEY_NAME=projects/rant-and-heal/locations/us-central1/keyRings/rant-heal-therapy/cryptoKeys/relationship-dek
   ```

   Run `npm run check:therapy-kms` locally to test a random encrypt/decrypt round trip with the same Firebase Admin credentials the app uses. The check prints no key material.

   Cloud KMS keys cannot be moved to another location after creation. Retain the key and its versions while wrapped relationship keys exist.
2. Deploy the new Firestore rules and backend together. Until legacy messages are migrated, their browser reads are denied and the chat API returns a migration-required error. Do not remove those legacy messages.
3. Back up Firestore and review whether production users exist. The message migration is **not run automatically**. Its dry-run form is `npm run migrate:therapy-messages`. After reviewing backup, KMS permissions, and affected message IDs, run `npm run migrate:therapy-messages -- --execute --ack-production-user-data`. It writes encrypted fields, verifies a fresh read and decrypt, then removes `text` and `senderId`. It can be restarted and reports failed IDs without message content. A partially migrated message retains plaintext until verification succeeds.
4. The migration creates a wrapped key for each existing relationship that lacks one, including empty active chats. Do not rotate or delete a KMS key version without rewrapping every relationship DEK.
   The automatic legacy connection route initializes a key only when the old and new message collections are empty. If legacy messages exist, it returns a migration-required error so the offline relationship and message migration can be reviewed and run first.
5. Run `npm run test:rules` with a Java runtime installed, then inspect representative Firestore documents to confirm no `text` field remains on therapy messages and no plaintext note/report fields are present.

Current access policy denies both therapist and patient raw history after a relationship is revoked. The patient can later reconnect through a new relationship; historical summary sharing is not implemented. This should be revisited only after an explicit product policy decision.
Legacy `weekly_reports` documents are therapist-readable only when their `relationshipId` matches the current active connection. Reports without a relationship ID remain patient-readable but are not shared with a therapist until a reviewed backfill or explicit sharing flow is implemented.
