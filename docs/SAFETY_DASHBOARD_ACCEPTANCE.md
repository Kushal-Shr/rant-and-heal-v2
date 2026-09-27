# Day 4 Human Safety Dashboard — Manual Acceptance

Status: `RESEARCH_DRAFT / OPERATIONS_REVIEW_REQUIRED`

This workflow records verified human reviewer actions. It does not dispatch police, an ambulance, SMS, a trusted contact, or a clinician. Do not represent it as live monitoring or emergency response.

## Setup

1. Grant a test reviewer the Firebase Auth custom claim with `npm run set-safety-reviewer -- <uid>`.
2. Sign out and back in so the ID token refreshes.
3. Keep separate browser profiles available for a patient, an ordinary therapist, reviewer A, and reviewer B.
4. Ensure `ENABLE_SAFETY_DASHBOARD=true` and deploy the current Firestore rules.

## Happy path

1. Submit a Momo message whose Day 3 evaluation has `requiresHumanReview=true`.
2. As reviewer A, open `/safety` and confirm the OPEN case appears under **Needs acknowledgement** with urgency, clinical safety state, waiting time, assignment, and a short trigger excerpt.
3. Open `/safety/{caseId}`. Confirm only the triggering text and structured assessment are shown—no full transcript, journal, therapy history, or model rationale.
4. Select **Acknowledge**. Wait for the backend response and confirm the status becomes ACKNOWLEDGED and the timeline adds the action.
5. Select **Assign to me**. Confirm reviewer A owns the case and an ASSIGNED entry appears.
6. Record a contact attempt. Confirm status does not become HUMAN_CONNECTED or EXTERNAL_HANDOFF.
7. Record `NO_ANSWER`, `UNREACHABLE`, or `FAILED`. Confirm it remains in the timeline and no success UI appears.
8. Record a later `SUCCEEDED` outcome only after a real person is reached. Confirm the backend changes status to HUMAN_CONNECTED and adds both the success and connection audit entries.
9. If a real handoff occurs, record its party type, channel, and minimal note. Confirm status becomes EXTERNAL_HANDOFF only after the backend response.
10. Add a required concise resolution note and resolve. Confirm `resolvedAt`, `resolvedByUid`, note, and RESOLVED audit entry are present.

## Failure and concurrency checks

- Stale page: leave reviewer A's detail page open, mutate the case as reviewer B, then try an invalid stale action. Expect an explicit conflict/transition error and no optimistic success.
- Assignment race: have reviewers A and B select **Assign to me** together. Exactly one UID must own the case; the other receives a conflict. No ownership overwrite is allowed.
- Duplicate click/retry: double-click or retry a request after interrupting the response. The same idempotency key must not create duplicate audit entries.
- Contact failure: record a failed call and confirm the case is not connected or handed off.
- Network failure: take the browser offline before submitting. Pending state must end in an error; the UI must not display success.
- Backend error: force a 500/transaction failure. The existing confirmed state must remain visible.
- Invalid case ID: `/safety/not-a-real-case` must return a safe not-found error.
- Unauthorized account: USER and THERAPIST-only accounts must be denied by the API and Firestore rules.
- Resolved case: every later mutation must be rejected.

## Truthfulness and privacy checks

- `REQUESTED`, `STARTED`, an opened case, or a failed attempt must never render as contacted, connected, handed off, or resolved.
- A successful connection or handoff must originate from an explicit reviewer mutation and confirmed backend state.
- The queue must not display large raw conversation content.
- Case payloads must contain no journal plaintext/ciphertext derivatives, journal embeddings, unrelated therapist chat, full Momo transcript, hidden model reasoning, or free-form model rationale.

## Policy review markers

- `CLINICIAN_REVIEW_REQUIRED`: exact cross-session episode/reopening criteria and clinical closure evidence.
- `OPERATIONS_REVIEW_REQUIRED`: response SLAs, staffing/coverage, escalation ladders, and note-quality review.
- `LEGAL_REVIEW_REQUIRED`: retention, disclosure, consent exceptions, minors, and authority for external service involvement.
