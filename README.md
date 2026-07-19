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

## Momo Architecture

Momo text chat is server-owned: the client calls `/api/momo/chat`, the route verifies the Firebase ID token, fetches session history, calls Gemini, then writes both USER and MOMO messages with the Admin SDK.

Momo voice uses `/api/momo/live-token` to mint a short-lived Gemini Live token. Browser code captures microphone PCM audio and streams it directly to Gemini Live with the ephemeral token.

## Therapy Connection MVP Status

Completed so far:
- Patients can browse verified therapist profiles from `therapists/{therapistUid}` on `/therapy`.
- Therapist onboarding at `/auth/onboarding-therapist` creates an MVP-verified therapist profile.
- Patients can request one therapist connection at a time through `connections/{patientUid}`.
- Therapists can review pending requests on `/portal` and accept or reject them.
- Accepted patients appear in the therapist roster on `/patients`.
- Patient and therapist chat routes share the same real-time chat component:
  - Patient: `/therapy/chat/[therapistId]`
  - Therapist: `/messages/[patientId]`
- Therapist `/messages` now shows active patient conversation threads.
- Therapy messages are stored separately from Momo messages under `connections/{patientUid}/messages`.
- Firestore rules were expanded for connection state, therapy messages, therapist profile reads, call sessions, and signaling.

Known follow-up:
- The therapy call feature still needs work. The current MVP call UI is embedded into the chat flow with Start/Join/Return actions, but the call state can be incorrect: it may show "You started a call" for the wrong participant, and the incoming call can appear on the patient side when it should be scoped to the other participant. This needs a dedicated fix to track caller/recipient state more explicitly and validate the signaling flow end to end.

## Verification

```bash
npx tsc --noEmit
npm run lint
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [docs/SYSTEM_MAP.md](./docs/SYSTEM_MAP.md) for the broader product architecture.
