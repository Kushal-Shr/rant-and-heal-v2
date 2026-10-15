# Momo conversation privacy v2

Momo uses application-level encrypted conversation storage and TLS in transit. It is not end-to-end encrypted: the Rant & Heal application server and the configured AI provider receive the bounded plaintext needed to process a turn.

## Encryption and keys

- Each user conversation has a random 256-bit data-encryption key (DEK).
- Message content and sensitive continuity state use AES-256-GCM with a fresh 96-bit nonce. Authenticated additional data binds ciphertext to the user, conversation, message ID, role, modality, and crypto version.
- The DEK is wrapped with the Google Cloud KMS key named by `MOMO_CONVERSATION_KMS_KEY_NAME`. Wrapped DEKs are stored in `momo_conversation_keys`; Firestore clients cannot read that collection.
- An authenticated owner-only, rate-limited API unwraps the DEK and returns it over TLS for import as a non-extractable browser `CryptoKey`. The server also unwraps it for finalized GPT-Live turns, migration, and recovery. Operators with both production application authority and KMS decrypt authority can therefore decrypt conversations.
- Safety excerpts use independently generated DEKs wrapped by the distinct `MOMO_SAFETY_KMS_KEY_NAME`. Only the safety-review API decrypts them after verifying either the `safetyReviewer` or `admin` custom claim.
- Journal encryption and keys are unchanged and share no key material with Momo.

`cryptoVersion: 1` is stored with every encrypted payload. KMS key rotation can rewrap DEKs without re-encrypting message content; an algorithm or AAD migration must increment the crypto version.

## Plaintext lifecycle

For text, the browser sends the current message, at most 12 decrypted recent turns, and the decrypted bounded continuity state to the authenticated Momo API over TLS. The server performs mandatory safety assessment and AI generation transiently, returns the response and updated continuity, and stores no plaintext request, reply, transcript, title, or continuity. The browser encrypts both turns and continuity before Firestore persistence.

For voice, microphone audio is carried by WebRTC and is not written to application storage. Partial input/output transcripts live only in bounded process/browser memory. The trusted sideband encrypts each finalized user/assistant turn before Firestore persistence. GPT-Live is configured with `store: false`.

Production logs may contain IDs, status, model, safety-state transitions, error codes, latency, and usage. They must not contain message text, model replies, transcripts, decrypted history, safety excerpts, request bodies, or ciphertext.

## Persisted-field classification

Every Momo field belongs to one category:

1. `ENCRYPTED_CONVERSATION_CONTENT`: message ciphertext/IV/version/algorithm and encrypted bounded continuity (including corrections, current-session intervention outcomes, and other free-text-derived continuity).
2. `REQUIRED_SAFETY_DATA`: structured state, target, trigger type/category, resolution, assessment step, review urgency/status, case/action state, policy/classifier source, timestamps, and a separately encrypted minimum triggering excerpt when human review is required.
3. `OPTIONAL_MOOD_DATA`: when opted in, only 1–10 mood, stress, energy, and sleep-quality scores plus source, conversation ID, timestamp, and schema version. Manual mood check-ins remain governed separately.
4. `OPTIONAL_SUCCESS_DATA`: when opted in, only allow-listed approach, outcome, goal, source, conversation ID, timestamp, and schema version.
5. `NON_SENSITIVE_OPERATIONAL_METADATA`: user/conversation/message/request IDs, role, modality, sequence, timestamps, crypto version, request/live status, bounded quota state, model, and operational error codes.

No embeddings, semantic indexes, plaintext search indexes, hidden narrative summaries, or full-history analytics are created.

## Consent and reporting

`moodTrendAnalyticsEnabled` and `outcomeAnalyticsEnabled` default to `false`, because the previous product had no explicit consent for inferred conversation analytics. Safety has no switch and is always active while Momo is used.

Weekly reflection uses manual check-ins, opted-in structured Momo mood/outcome records, allowed activity counts, journal metrics that exclude journal text, and reviewed therapy data. It never decrypts Momo history or reads session narrative summaries.

## Recovery and loss

- A different device or cleared browser storage can recover conversation access after Firebase authentication because the server unwraps the per-conversation DEK through KMS.
- Changing an authentication password does not re-encrypt history.
- Deleting the Firebase account recursively deletes conversations; the associated wrapped key records must be included in operational erasure procedures.
- Loss or disablement of the KMS key makes the corresponding content unrecoverable. There is no plaintext fallback.
- Compromise of the application runtime together with KMS decrypt authority can expose plaintext. This is why the system must not be marketed as zero-knowledge or end-to-end encrypted.

## Existing-data migration

Run `npm run migrate:momo-conversations` first in dry-run mode. After reviewed backups, KMS configuration, and change approval, execute with `-- --execute --ack-production-user-data`. The migration is idempotent and resumable. It writes ciphertext, verifies a decrypt round trip, removes plaintext only after verification, scrubs narrative titles/summaries and request caches, encrypts legacy safety excerpts under the safety key domain, and records a session migration version. It never creates a plaintext backup.

Production rollout requires two distinct Google Cloud KMS keys, Cloud KMS API access, and `cloudkms.cryptoKeyEncrypterDecrypter` (or a narrower equivalent) for the Firebase Admin runtime identity. Set both non-public KMS resource-name environment variables, deploy the Firestore rules and application together, and confirm a new text and voice turn before migrating legacy data. Any pre-migration backup must use the existing provider-managed encrypted backup mechanism with restricted IAM and retention—not a plaintext application export. Run the dry-run inventory, review its candidate/failure counts, execute in a controlled window, then rerun it until the candidate count is zero.
