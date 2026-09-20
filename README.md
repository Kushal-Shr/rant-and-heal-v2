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
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview

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

## Firebase Rules

Firestore rules live in `firestore.rules` and are wired through `firebase.json`.

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

## Momo Architecture

Momo text chat is server-owned: the client calls `/api/momo/chat`, the route verifies the Firebase ID token, fetches session history, calls Gemini, then writes both USER and MOMO messages with the Admin SDK.

Momo voice uses `/api/momo/live-token` to mint a short-lived Gemini Live token. Browser code captures microphone PCM audio and streams it directly to Gemini Live with the ephemeral token.

### Momo safety interceptor v0.1

Before a text message reaches Gemini, `/api/momo/chat` applies a conservative server-side phrase screen for direct self-harm or harm-to-others language in English, Nepali, and romanized Nepali. A matching message bypasses Gemini, receives fixed crisis wording, records a minimal server-only `users/{uid}/safety_events/{eventId}` audit event, and takes the user to `/crisis`.

Voice transcription is screened when a completed user transcript is saved. On a match, the browser ends the Momo Live session and opens `/crisis`. Because Gemini Live receives audio directly, this post-transcription safeguard is not a replacement for real-time voice moderation.

This is not a clinical risk assessment or an emergency-response service. It needs clinician-approved rules, localized resources, escalation ownership, and a reviewed evaluation corpus before release. See [docs/SAFETY_INTERCEPTOR_V0.md](./docs/SAFETY_INTERCEPTOR_V0.md).

### Optional safety-support notification

When the deterministic phrase screen and the schema-validated Gemini classifier both identify imminent self-harm or harm-to-others risk, Momo records its fixed crisis response and can send a minimal email alert to the configured support address. The setting is disabled by default. The alert has only an event ID, risk category, source, state, and timestamp—never a message, name, phone number, or user ID.

There are no emergency-contact calls, text-message fallbacks, delayed dispatches, IP-location workflows, or police integrations. The feature is not live monitoring or an emergency-response service. Voice alerts, if enabled, occur only after a completed transcript has reached the server and are not real-time moderation.

Configure Firestore TTL for `safety_events.expireAt` before relying on the 30-day retention target. TTL deletion is asynchronous. Do not enable email alerts without a named operating owner, clinician/legal review, a verified Resend sender, and a tested response protocol.

## Therapy Connection MVP Status

Completed so far:
- Patients can browse verified therapist profiles from `therapists/{therapistUid}` on `/therapy`.
- Therapist onboarding at `/auth/onboarding-therapist` creates a pending practitioner application. Staff approval is required before it appears in the verified directory.
- Patients can request one therapist connection at a time through `connections/{patientUid}`.
- Therapists can review pending requests on `/portal` and accept or reject them.
- Accepted patients appear in the therapist roster on `/patients`.
- Patient and therapist chat routes share the same real-time chat component:
  - Patient: `/therapy/chat/[therapistId]`
  - Therapist: `/messages/[patientId]`
- Therapist `/messages` now shows active patient conversation threads.
- Therapy messages are stored separately from Momo messages under `connections/{patientUid}/messages`.
- Therapy calls use explicit `callerId` and `recipientId` fields. Authenticated server routes create, answer, decline, and end calls, with a transaction-backed per-connection call lock.
- Firestore rules restrict call-session creation and state transitions to server routes; client-side Firestore is used only for participant-scoped signaling.

Known follow-up:
- Calls currently use a public STUN server only. Configure authenticated TURN credentials before relying on calls across restrictive or mobile networks.
- TURN settings are returned only by the authenticated `/api/therapy/ice-servers` route to active call participants. Use short-lived credentials from your TURN provider in production.
- Manually test patient-initiated and therapist-initiated calls in two authenticated browser sessions, including answer, decline, hangup, and a second call after termination.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [docs/SYSTEM_MAP.md](./docs/SYSTEM_MAP.md) for the broader product architecture.

## Interface and chart data

All pages share the Soft Clay Realism canvas and responsive navigation from the root layout. The design reference is `stitch_rant_and_heal_ui/soft_clay_realism/DESIGN.md`. Signed-out navigation exposes Home and Crisis Support, plus sign-in/account creation. Patient and practitioner links appear only after the current account’s role resolves.

The patient mood chart uses the existing latest seven `health_metrics` entries, including real dates and a values table; it does not represent seven calendar days. This redesign requires no database, API, or Firestore-rule changes. Sleep tracking would need its own data fields and validation. Therapist access to mood or journal data would require a separately designed consent and authorization flow; those records remain private.

See `docs/soft-clay-ui.md` for implementation, graphics provenance, and validation notes.
