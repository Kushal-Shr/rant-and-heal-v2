# Codebase Architecture - Rant and Heal V2

This document describes the structural organization, architectural decisions, and key component relations of the **Rant and Heal V2** project.

---

## 1. Directory Structure

The project follows a hybrid directory layout:
- **Next.js App Router Pages & Layouts** reside in the root `/app` directory.
- **Source Modules** (Components, services, config, and state providers) reside in the `/src` directory.

```
├── app/                              # Next.js App Router Pages and Layouts
│   ├── page.tsx                      # Landing Page (public facing)
│   ├── layout.tsx                    # Root Layout
│   ├── (patient)/                    # Patient-specific routes (authenticated)
│   │   ├── layout.tsx                # Patient spacing and role guard
│   │   ├── dashboard/
│   │   ├── momo/                     # AI Guide ("Momo") text and video calls
│   │   ├── therapy/                  # Therapist chat and sessions
│   │   └── vault/                    # Patient secure journal/data vault
│   ├── (therapist)/                  # Therapist-specific routes (authenticated)
│   │   ├── layout.tsx                # Therapist spacing and role guard
│   │   ├── portal/                   # Therapist portal dashboard
│   │   ├── patients/                 # Patient list and patient detail pages
│   │   ├── messages/                 # Therapist-patient messaging
│   │   └── session/                  # Secure therapy sessions
│   ├── auth/                         # Authentication pages
│   │   ├── login/
│   │   ├── signup/
│   │   ├── onboarding-patient/       # Patient-specific onboarding steps
│   │   └── onboarding-therapist/     # Therapist credentials/onboarding steps
│   ├── crisis/                       # Instant crisis resources page
│   ├── globals.css                   # Global styles
│   └── layout.tsx                    # Root HTML layout
│
├── src/                              # Core Source Directory
│   ├── components/                   # Shared UI Components
│   │   ├── forms/                    # Form inputs, labels, and error states
│   │   ├── layout/                   # Sidebars, navbar, footer
│   │   ├── shared/                   # Domain-specific components (ChatBubble, ProfileCard)
│   │   └── ui/                       # Fundamental UI atoms (Button, Card, Badge, Modal, Spinner)
│   │
│   ├── config/                       # Application configuration
│   │   ├── env.ts                    # Zod env schema validation
│   │   └── firebase.ts               # Firebase App, Auth, and Firestore initialization
│   │
│   ├── context/                      # React Context Providers
│   │   └── AuthContext.tsx           # Firebase Auth Session State Provider
│   │
│   ├── services/                     # Business logic & API wrappers
│   │   ├── authService.ts            # Auth-to-Database Bridge (signup/signin)
│   │   └── connectionService.ts      # Client WebRTC/Session connectivity services
│   │
│   └── types/                        # Core TypeScript declarations
```

---

## 2. Key Architectural Design Patterns

### Service-Oriented Architecture (SOA)
- Client-side Firebase helpers live in `src/services/` for user, therapist, and connection flows.
- Privileged server integrations live in `src/server/`, including Firebase Admin initialization, Firebase ID-token verification, Gemini configuration, and shared Momo persona instructions.
- UI components should not perform privileged writes directly. Sensitive mutations, such as Momo message creation, should go through authenticated Route Handlers.

### Auth-to-Database Bridge (Atomic Registration)
- User sign-ups require atomic syncing between Firebase Auth and Firestore.
- In `signUpWithEmail`, if an account is successfully registered in Firebase Auth but the corresponding identity record (`/users/{uid}`) fails to write in Firestore, a **ghost rollback** executes automatically, deleting the Auth user representation to maintain state consistency.

### Component Design (Soft Clay Realism)
- UI primitives are organized into an atomic structure:
  - **Atoms (`ui/`)**: Basic interactive elements (e.g. `Button`, `Badge`, `Avatar`) that enforce visual tokens.
  - **Forms (`forms/`)**: Accessible fields with consistent focus outlines, error wrappers, and labels.
  - **Shared Blocks (`shared/`)**: Assembled compound blocks like `ChatBubble` and `TherapistProfileCard`.
  - **Layout (`layout/`)**: The root `GlobalSidebar` supplies persistent navigation, with a mobile disclosure menu. The root layout owns the cream/sage/peach canvas; route groups own spacing and role guards.

---

## 3. Routing & Security

### Route Groups
- **`app/page.tsx`**: Public landing page.
- **`app/(patient)`**: Layout implements route guarding restricting to the `USER` role.
- **`app/(therapist)`**: Layout wraps clinical tools and implements route guarding restricting to the `THERAPIST` role.

- `useCurrentProfile` associates each profile result with its UID and lookup attempt. Navigation and role guards do not reuse another account’s role; failed lookups offer a retry. This UI guard does not replace Firestore or API authorization.
- `MoodTrend` renders the latest seven dated mood entries with a 1–10 axis, equal check-in spacing, and a values table. It uses the existing owner-only `users/{uid}/health_metrics` query. No backend migration is needed.

### Firestore Rules matching
- The document ID inside the `users` collection matches the authenticated user UID exactly. This allows secure, owner-only read/write operations via:
  ```javascript
  match /users/{userId} {
    allow read, write: if isOwner(userId);
  }
  ```

### Momo Data Boundary
- Patient clients may listen to their own Momo sessions and messages.
- Message writes are server-owned. `/api/momo/chat` verifies the Firebase ID token, prevents cross-user spoofing, calls Gemini, and writes both USER and MOMO messages through the Admin SDK.
- Firestore rules intentionally deny direct client writes to `users/{uid}/sessions/{sessionId}/messages`.
- The Momo safety interceptor runs in the authenticated chat and transcript handlers before normal persistence/generation. Direct, high-confidence self-harm or harm-to-others signals bypass Gemini, save a fixed support reply, and write a minimal server-only audit event at `users/{uid}/safety_events/{eventId}`. Browser clients cannot read or write safety events.
- Text is intercepted before it reaches Gemini. Momo Live voice is screened after its completed user transcript is received; since its audio reaches Gemini Live directly, the voice path must not be represented as real-time crisis moderation.
- When enabled by server configuration, a minimal email notification is sent to the designated Rant & Heal support address only when deterministic rules and the structured Gemini classifier agree on imminent risk. No automatic calling, emergency-contact storage, delayed dispatch, IP-location, or police workflow exists. The email contains event metadata only, and it must not be represented as a monitored or emergency-response service.

### Therapy Connection MVP
- Therapist directory profiles live at `therapists/{therapistUid}`. Public applicants may create and edit a `PENDING` profile, but cannot change `isVerified`, `verificationStatus`, or their account role. The patient directory only reads profiles where `isVerified == true`.
- A Firebase Auth user with the `admin: true` custom claim approves or rejects applications through `POST /api/admin/therapists/[therapistId]/verification`. Approval uses the Admin SDK to atomically set `therapists/{therapistUid}.isVerified`, `verificationStatus`, and `users/{therapistUid}.role = THERAPIST`.
- `connections/{patientUid}` is a server-owned pointer enforcing one current active or pending therapist relationship. Each request creates an immutable `therapy_relationships/{relationshipId}` record.
- Connection status values are `PENDING`, `ACTIVE`, `REJECTED`, and `REVOKED`.
- Therapy messages live at `therapy_relationships/{relationshipId}/messages/{messageId}`; private identities remain in owner-only `users`, while therapists receive the explicit subset in `patient_profiles`.
- Therapy call sessions live at `therapy_relationships/{relationshipId}/call_sessions/{sessionId}` with signaling documents under `signals/{signalId}`. Each session records participants, relationship ID, expiry, and explicit answer/decline/end fields.
- Call creation and status transitions are authenticated Route Handlers. A server-owned per-relationship `call_state/current` lease is updated atomically with the session. Revocation ends any open call.
- Consent acceptance is versioned and written as an immutable relationship event by the server. Browser clients cannot mutate relationship state.
- The call room obtains STUN/TURN configuration through `/api/therapy/ice-servers`, which verifies the active session before returning optional server-only TURN credentials.
- Shared UI components currently power both sides:
  - `TherapyChatRoom` is used by patient and therapist message routes.
  - `TherapyCallRoom` is used by patient and therapist session routes.

Implemented routes:
- `/therapy`: patient therapist directory, connection request status, and active connection entry to chat.
- `/portal`: therapist request dashboard with accept/reject actions.
- `/patients`: therapist active patient roster.
- `/messages`: therapist conversation list.
- `/therapy/chat/[therapistId]` and `/messages/[patientId]`: shared real-time therapy chat.
- `/therapy/session/[sessionId]` and `/session/[sessionId]`: shared WebRTC call room.

Known call work remaining:
- Set `TURN_URLS`, `TURN_USERNAME`, and `TURN_CREDENTIAL` before launch. Prefer short-lived credentials from the TURN provider; without this configuration, the call room falls back to Google STUN only.
- End-to-end testing still needs two separate authenticated browser sessions for both caller directions, decline, hangup, and a subsequent call.
