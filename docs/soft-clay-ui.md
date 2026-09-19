# Soft Clay Realism interface

The root layout now supplies one fixed Daybreak canvas across landing, authentication/onboarding, crisis, patient, and practitioner pages. `GlobalSidebar` shares its navigation model between the desktop sidebar and keyboard-accessible mobile menu. The palette, rounded geometry, Jakarta typography, inset inputs, and layered shadows follow `stitch_rant_and_heal_ui/soft_clay_realism/DESIGN.md`. Motion respects reduced-motion preferences.

Guests can navigate Home and Crisis Support, sign in, create an account, or open practitioner sign-in. Patient routes remain protected. Patient links are Dashboard, Talk to Momo, Journal, Find a therapist, and Crisis Support. Practitioner links are Overview, My patients, Messages, and Crisis Support. No unsupported community, settings, or sleep pages are advertised. Role lookups are tied to the current UID and have loading/failure handling; API and Firestore enforcement remain unchanged.

Practitioner pages share clay headers, searchable patient/conversation lists, clear empty/error states, and profile links. Patient profiles verify an active connection before displaying relationship details. Momo and therapy chat scroll their message panes without moving the entire page.

## Backend impact

- **No backend changes required** for this UI or the mood graph. `listMoodEntries` already returns the latest seven records from `users/{uid}/health_metrics`, ordered by `createdAt`.
- The chart represents **recent check-ins**, not calendar days: points have equal spacing, scores use a labeled 1–10 axis, and an expandable table supplies exact timestamps and values. Zero entries show an empty state; one valid entry shows a single point. No synthetic data is displayed by the app.
- Sleep tracking would need a schema, validation, persistence, and UI. It is not added here.
- Practitioner mood/journal charts would need explicit sharing consent and authorization changes. Existing owner-only Firestore rules remain intact.
- Existing TURN configuration and real-network two-browser call validation are separate launch work, unchanged by this redesign.

## Generated asset

- File: `public/images/momo-clay.png`.
- Created with the built-in imagegen tool, used by `MomoPortrait` for the brand, landing hero, dashboard, signup, and Momo voice screen. The original output was copied into this repository and is served through `next/image`.
- Prompt: “Use case: stylized-concept. Asset type: reusable website mascot illustration for Rant & Heal, a gentle emotional wellbeing app. Create a single charming 3D marshmallow cloud called Momo, floating just above a sage green surface in a softly lit miniature studio. Momo is a creamy warm ivory puffy cloud with five organic lobes, two tiny dark moss round eyes, a subtle friendly curved smile, soft muted peach cheeks. Soft Clay Realism: tactile matte sculpted clay, soft subsurface scattering, delicate contact shadows and diffused warm daylight from upper left, sophisticated polished 3D render. Front view, centered full character, generous negative space around it, square composition, background seamless pale sage #d9e7d8 with warm cream #fff8f5 glow. Palette ivory, muted sage, blush peach only. No lettering, no text, no logo, no watermark, no other objects, no border. Quiet comforting expression, avoid plastic shine, avoid emoji style.”

## Verification

- TypeScript, ESLint, and Next.js production build.
- Headless Chrome: public pages at 1440, 768, and 390 pixels; consistent public navigation, mobile menu closing, no horizontal document overflow, and signed-out redirects for 13 private route variants.
- Isolated rendering of actual patient and practitioner page components with synthetic service data: 13 screen variants at 1440, 1024, 768, and 390 pixels. Checks include role-specific navigation, mood save selection, chart values, patient search, and empty chart. Fixtures live outside the app and do not bypass production authentication.
- No live authenticated backend writes, real patient data, or audio/video sessions were used for visual verification. Live authentication, Firestore operations, and two-party calls still require an authenticated end-to-end pass.
