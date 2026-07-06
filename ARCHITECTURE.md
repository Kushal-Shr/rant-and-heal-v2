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
│   │   ├── layout.tsx                # Patient shell with sidebar
│   │   ├── dashboard/
│   │   ├── momo/                     # AI Guide ("Momo") text and video calls
│   │   ├── therapy/                  # Therapist chat and sessions
│   │   └── vault/                    # Patient secure journal/data vault
│   ├── (therapist)/                  # Therapist-specific routes (authenticated)
│   │   ├── layout.tsx                # Therapist shell with sidebar
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

### Component Design (Radiant Brutalism)
- UI primitives are organized into an atomic structure:
  - **Atoms (`ui/`)**: Basic interactive elements (e.g. `Button`, `Badge`, `Avatar`) that enforce visual tokens.
  - **Forms (`forms/`)**: Accessible fields with consistent focus outlines, error wrappers, and labels.
  - **Shared Blocks (`shared/`)**: Assembled compound blocks like `ChatBubble` and `TherapistProfileCard`.
  - **Layout (`layout/`)**: Structural components like `PatientSidebar` and `TherapistSidebar`.

---

## 3. Routing & Security

### Route Groups
- **`app/page.tsx`**: Public landing page.
- **`app/(patient)`**: Layout wraps patient navigation and implements route guarding restricting to the `PATIENT` role.
- **`app/(therapist)`**: Layout wraps clinical tools and implements route guarding restricting to the `THERAPIST` role.

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
