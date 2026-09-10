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
- Manually test patient-initiated and therapist-initiated calls in two authenticated browser sessions, including answer, decline, hangup, and a second call after termination.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [docs/SYSTEM_MAP.md](./docs/SYSTEM_MAP.md) for the broader product architecture.
