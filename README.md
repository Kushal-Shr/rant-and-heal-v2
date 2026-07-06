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

## Verification

```bash
npx tsc --noEmit
npm run lint
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [docs/SYSTEM_MAP.md](./docs/SYSTEM_MAP.md) for the broader product architecture.
