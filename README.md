# Rant and Heal V2

Privacy-first mental health support platform built with Next.js, Firebase, Firestore, and Gemini.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Create `.env.local` with:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_SAFETY_MODEL=gemini-2.5-flash
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview

# Trial feature flags. Voice stays off until live audio can be interrupted by
# the safety layer before a model response is delivered.
ENABLE_WEEKLY_REPORTS=true
ENABLE_AI_THERAPY_NOTES=true
ENABLE_SAFETY_DASHBOARD=true
ENABLE_MOMO_VOICE=false

# Server-only application-managed therapy encryption.
THERAPY_KMS_KEY_NAME=

# Optional TURN relay for therapist video calls. Keep these server-only.
TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349
TURN_USERNAME=
TURN_CREDENTIAL=

# Public number shown as the temporary crisis-support contact. This is
# intentionally optional, but should be set before presenting the feature.
NEXT_PUBLIC_CRISIS_CONTACT_NAME=Rant and Heal Support
NEXT_PUBLIC_CRISIS_CONTACT_PHONE=+15551234567

# Optional safety-support notification. Disabled by default. Resend must use
# a verified sender domain. Alerts contain metadata only, never chat content
# or a user's identity.
SAFETY_SUPPORT_NOTIFICATIONS_ENABLED=false
RESEND_API_KEY=
SAFETY_ALERT_FROM_EMAIL=
SAFETY_SUPPORT_ALERT_EMAIL=
```

Never commit `.env.local` or Firebase service-account JSON files.

## Encrypted journal Vault

Journal titles, bodies, and migrated free-text tags are encrypted in the browser with AES-256-GCM before Firestore receives them. The encryption key is derived with PBKDF2-SHA-256 (600,000 iterations) from a Vault passphrase and a random 256-bit salt. AES-GCM uses a fresh 96-bit IV for every encryption. The passphrase is never persisted. After a successful unlock, the browser may structured-clone the non-extractable `CryptoKey` into IndexedDB for up to 14 days. Explicit locking, logout, expiry, or clearing site data removes access and requires the passphrase again. The pilot has no passphrase recovery.

Firestore data is separated as follows:

- `users/{uid}/vault/config`: KDF salt/settings and encrypted verification sentinel; never the passphrase or key.
- `users/{uid}/journals/{entryId}`: `userId`, `ciphertext`, `iv`, `cryptoVersion`, and timestamps only.
- `users/{uid}/journal_metrics/{entryId}`: coarse length/time/local-day/edit behavior and optional user-selected emotion/context/intent values.
- `weekly_reports/{reportId}`: server-owned aggregate output that is readable by the patient and, only when explicitly shared, their current active therapist.

Length buckets are `SHORT` (up to 100 words), `MEDIUM` (101–400), and `LONG` (over 400). Time buckets use the browser's local time: `MORNING` (05:00–11:59), `AFTERNOON` (12:00–16:59), `EVENING` (17:00–21:59), and `LATE_NIGHT` (22:00–04:59). These are behavioral observations, not clinical inferences.

Legacy plaintext entries migrate only after the user creates or unlocks the Vault. Each entry is replaced atomically with ciphertext while its safe metric is created. Failed IDs are reported in the UI and remain recoverable for retry. No Gemini call or semantic analysis occurs during migration.

Weekly journal aggregation queries only `journal_metrics`. Gemini receives counts/distributions and explicit user selections, never journal documents, ciphertext, decrypted text, excerpts, titles, embeddings, or semantic derivatives. The repository provides the aggregation/request contract; a scheduled weekly-report job did not previously exist and is not introduced implicitly here.

## Firebase Rules

Firestore rules and indexes live in `firestore.rules` and `firestore.indexes.json`, wired through `firebase.json`.

```bash
firebase deploy --only firestore:rules
```

## Therapist verification

Public practitioner registration creates a pending application. It does not create a verified therapist or grant access to practitioner tools. A staff member with the Firebase Auth custom claim `admin: true` must review the application and call:

```http
POST /api/admin/therapists/{therapistUid}/verification
Authorization: Bearer {admin Firebase ID token}
Content-Type: application/json

{ "action": "VERIFY" }
```

Verification atomically marks the directory profile as verified and changes the user role to `THERAPIST`. Send `{ "action": "REJECT" }` to reject a pending application. Assigning the `admin` custom claim must be done through a trusted Firebase Admin SDK environment; never from the browser.

## V4 engineering layer

Shared domain contracts live under `src/lib` and provider integrations remain under `src/server`:

- `src/lib/momo`: normalized input/output, structured routing decisions, orchestration, and core/PCT/boundary prompts.
- `src/lib/safety`: deterministic detection, normalized safety state, event schemas, and response policy. The Gemini classifier remains server-only.
- `src/lib/reports`: weekly report schemas, privacy-safe source contracts, and request builders. Actual Gemini generation is isolated in `src/server/reports`.
- `src/lib/crypto`: client-only journal Vault primitives. These never import Firebase Admin, Gemini, KMS, or therapy encryption.
- `src/lib/therapy`: relationship transitions, access policy, note schemas, consent, and the server-only-compatible therapy envelope primitive.
- `src/lib/ai/models.ts`: one model-role and thinking-level registry. Server environment overrides are resolved by the provider adapter.
- `src/config/features.ts`: server-owned feature flags. The non-sensitive voice availability value is projected into the client build so disabled trial UI is not offered.

The two encryption models are deliberately separate: journals are encrypted and decrypted only in the browser with the user's Vault key; therapy communication uses per-relationship envelope encryption whose DEK is wrapped by Cloud KMS and may be temporarily decrypted by authorized server workflows.

## Momo Architecture

Momo text chat is server-owned: the client calls `/api/momo/chat`, the route verifies the Firebase ID token and session, enforces bounded quotas, and preserves idempotent persistence. The domain orchestrator then evaluates safety, creates a structured `MomoDecision`, and invokes the server-only responder. Each session stores a bounded `continuityState` for the active support goal/mode, explicit interaction preferences, brief user corrections, option/question fatigue, recent response functions, and user-reported intervention outcomes. It does not copy the transcript or use journal or therapist-chat content, and it does not store diagnosis or model reasoning. Current-session continuity informs planning and a deterministic response check; safety still bypasses ordinary generation. Cross-session personalization is deferred.

For greeting-only turns, the route may provide the responder with a sanitized first name from the authenticated user profile. Incognito accounts and placeholder names are treated as anonymous. The hint is optional, is not stored in continuity state, and must not produce repeated name use or a fixed greeting template.

The underlying Momo voice implementation uses `/api/momo/live-token` to mint a short-lived Gemini Live token. Browser code captures microphone PCM audio and streams it directly to Gemini Live with the ephemeral token. It is disabled for the trial by `ENABLE_MOMO_VOICE=false` and hidden from trial actions because completed-transcript screening is not real-time interruption.

Authenticated patient and anonymous Firebase sessions use the same application quotas: 20 text turns per minute, 5 live-token grants per 10 minutes, and 60 transcript writes per minute. Infrastructure-level budgets and alerts should still be configured in Google Cloud.

### Momo Day 3 safety behavior

Before ordinary planning, `/api/momo/chat` applies contextual deterministic safety assessment and a schema-validated Gemini second opinion when the deterministic path is normal. The existing six-state taxonomy drives centralized behavior. Every non-`NORMAL` state bypasses the ordinary Day 2 responder; assessment is sequential, unresolved answers remain unresolved, and medical emergencies take priority. Immediate states still take the user to `/crisis`.

Voice transcription is screened when a completed user transcript is saved. On a match, the browser ends the Momo Live session and opens `/crisis`. Because Gemini Live receives audio directly, this post-transcription safeguard is not a replacement for real-time voice moderation.

This is not a clinically validated risk assessment or an emergency-response service. The implemented policy and exact copy are marked `RESEARCH_DRAFT`; clinician/legal approval gaps are tracked in [docs/SAFETY_CLINICIAN_REVIEW.md](./docs/SAFETY_CLINICIAN_REVIEW.md). The earlier interceptor boundary is documented in [docs/SAFETY_INTERCEPTOR_V0.md](./docs/SAFETY_INTERCEPTOR_V0.md).

### Optional safety-support notification

For a policy state with `IMMEDIATE` review urgency, Momo records a structured safety event and can send a minimal email alert to the configured support address. The setting is disabled by default. Transport status is recorded separately from classification and user-facing copy. The alert has only an event ID, risk category, source, state, and timestamp—never a message, name, phone number, or user ID.

There are no emergency-contact calls, text-message fallbacks, delayed dispatches, IP-location workflows, or police integrations. The feature is not live monitoring or an emergency-response service. Voice alerts, if enabled, occur only after a completed transcript has reached the server and are not real-time moderation.

Configure Firestore TTL for `safety_events.expireAt` before relying on the 30-day retention target. TTL deletion is asynchronous. Do not enable email alerts without a named operating owner, clinician/legal review, a verified Resend sender, and a tested response protocol.

## Therapy Connection MVP Status

Completed so far:
- Patients can browse verified therapist profiles from `therapists/{therapistUid}` on `/therapy`.
- Therapist onboarding at `/auth/onboarding-therapist` creates a pending practitioner application. Staff approval is required before it appears in the verified directory.
- Patients can request one therapist connection at a time. `connections/{patientUid}` is a current pointer; each request creates a new immutable `therapy_relationships/{relationshipId}` record.
- Therapists can review pending requests on `/portal` and accept or reject them.
- Accepted patients appear in the therapist roster on `/patients`.
- Patient and therapist chat routes share the same real-time chat component:
  - Patient: `/therapy/chat/[therapistId]`
  - Therapist: `/messages/[patientId]`
- Therapist `/messages` now shows active patient conversation threads.
- Therapy messages, calls, signals, consent events, and call locks are scoped under `therapy_relationships/{relationshipId}`, so a future therapist cannot read a previous relationship.
- Therapy calls use explicit `callerId` and `recipientId` fields. Authenticated server routes create, answer, decline, and end calls, with a transaction-backed per-connection call lock.
- Firestore rules restrict relationship/call state transitions to server routes; client-side Firestore is used only for active relationship messages and participant-scoped signaling.

Before deploying these schema changes, run `npm run migrate:therapy` to preview legacy records, then `npm run migrate:therapy -- --apply` after reviewing the output. The migration copies legacy chat/call history into a stable relationship without deleting the old records, repairs an orphaned relationship pointer when one exists, and marks legacy `isVerified` therapist profiles as `VERIFIED`. The scripts load Firebase Admin credentials from `.env.local`, the same way the local Next.js app does. Deploy Firestore rules and indexes only after the migration succeeds.

Known follow-up:
- Calls currently use a public STUN server only. Configure authenticated TURN credentials before relying on calls across restrictive or mobile networks.
- TURN settings are returned only by the authenticated `/api/therapy/ice-servers` route to active call participants. Use short-lived credentials from your TURN provider in production.
- Manually test patient-initiated and therapist-initiated calls in two authenticated browser sessions, including answer, decline, hangup, and a second call after termination.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
npm test
npm run test:rules
```

`npm run test:rules` requires a Java runtime for the Firebase Firestore emulator.

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [docs/SYSTEM_MAP.md](./docs/SYSTEM_MAP.md) for the broader product architecture.

## Interface and chart data

All pages share the Soft Clay Realism canvas and responsive navigation from the root layout. The design reference is `stitch_rant_and_heal_ui/soft_clay_realism/DESIGN.md`. Signed-out navigation exposes Home and Crisis Support, plus sign-in/account creation. Patient and practitioner links appear only after the current account’s role resolves.

The patient mood chart uses the existing latest seven `health_metrics` entries, including real dates and a values table; it does not represent seven calendar days. Journal text remains private to the patient; raw per-entry journal metrics are also patient-only. A therapist can read only a user-shared weekly report while the current relationship remains active.

See `docs/soft-clay-ui.md` for implementation, graphics provenance, and validation notes.
