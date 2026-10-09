# Momo audit: architecture before changes

Baseline commit: `8d2bb5f8a338076cdbe62b60a0ec10e97e096d41`. Working tree was clean. This map was recorded before production edits.

Research reference: https://docs.google.com/document/d/1CtIUHQZAdV3QSA6-PucRK_l20CeO2GhPejsVxjrBQOQ/edit (read through connected Drive, modified 2026-09-24). The relevant research sections describe PCT communication, collaborative CBT, adaptive question burden, user choice, individualized regulation and outcome feedback. These are design hypotheses and research notes, not clinical validation. The explicit task's journal boundary takes precedence over older research suggestions involving journal themes. No new therapeutic catalog or clinical policy is authorized.

| Concern | Actual implementation |
|---|---|
| Entry and state | `app/api/momo/chat/route.ts`: authenticated owned session, quota, idempotency, session lease; loads last 12 messages and stored continuity. |
| Orchestrator | `src/lib/momo/orchestrator.ts`: safety first; dedicated safety bypasses ordinary planner/responder. |
| Planner | `src/lib/momo/planner.ts`: explicit pattern routing before model inference; continuity and no-advice constraints. `src/server/momo/planner.ts`: schema-constrained inference, 6-second timeout and deterministic fallback. |
| Responder | `src/server/momo/responder.ts`: actual Gemini generation, backend-action truthfulness filter, continuity/style validation and one retry; errors after two rejected outputs. |
| PCT / naturalness | `src/lib/momo/prompts/{core,pct,naturalConversation,boundaries}.ts`, composed by `src/lib/momo/responder.ts` and server persona. PCT governs communication in every ordinary mode. |
| Modes / length | LISTEN, WORK_THROUGH, DIRECT_HELP, REGULATE, UNCLEAR in schemas, planner and mode-specific prompt directions. Length is prompted, not universally measured. |
| CBT | Optional CBT_RESTRUCTURING routing with guided exploration instructions; no separately persisted CBT stage machine or full protocol catalog. WORK_THROUGH can use PCT_EXPLORATION. |
| Regulation | RELAXATION plus bounded detected approach/outcome memory; approach and outcome detection largely English lexical patterns. No separate protocol runner. |
| Continuity | `src/lib/momo/continuity.ts`: goal, mode, explicit preferences, corrections (6), outcomes (8), rejected approaches, question fatigue, option overload, recent response functions/questions. Bounded categories rather than a semantic factual summary. |
| Personalization | Session-local only. No cross-session personalization retrieval, expert-guidance retrieval or global learning from users. |
| Corrections / rejection | Detected in prepareContinuityState; included in responder prompt and validators. Explicit safe current requests should override prior preferences. Coverage must be evaluated, not inferred from prompt text. |
| Greetings / identity | `identity.ts`, naturalConversation prompt; sanitized first name only for greeting-only turns. No identity stored in continuity. |
| Safety | `src/lib/safety/{detector,stateMachine,policy,schemas,responses}.ts`; contextual deterministic transitions, optional structured classifier second opinion; state, target and review status distinct. Research-draft fixed EN/NE responses. |
| Safety persistence | Detector reconstructs state from USER turns in the supplied recent history. Text route does not supply a separately persisted safety evaluation. Safety messages are recorded in an asynchronous after callback. This is an audit risk to test, not a verified fix yet. |
| Backend truth | `actionTruthfulness.ts`, server safety events/cases/notifications: requested/attempted/succeeded must stay distinct. Harness never sends alerts, creates cases or contacts anyone. |
| Multilingual | Explicit EN/NE/romanized routing patterns; fixed EN/NE safety copy; ordinary generation relies on model conversational context. No dedicated romanized safety copy family. |
| Model registry | `src/lib/ai/models.ts`: planner/response/classifier gemini-3.8-flash. Environment overrides exist, none active in preflight. Planner applies low thinking; response and classifier omit their registry thinking settings. No model migration planned. |
| Privacy | Normalized input accepts message/history/continuity/participant only. Journal encryption and metrics-only reporting tested separately. No journal access in this harness. |
| Validation | `tests/*.test.mjs`: Day 2, PCT, naturalness, continuity, behavioral intelligence, safety/targeting/dashboard, engineering, journal, therapy. Firestore emulator suite separately. Manual acceptance docs in `docs/MOMO_*` and `docs/SAFETY_*`. |
| Voice | Disabled by default; transcript safety only after completed speech. This audit exercises text runtime; it cannot establish real-time voice safety. |

## Baseline method

Call the actual production server planner, responder and safety assessor through an alias-only Node loader. Emulate the route's 12-message window and ordinary continuity preparation/finalization without any production database writes. Save every turn, failures, state and source hashes. Fixed synthetic user scripts are replayed unchanged before/after; seeded earlier assistant mistakes are explicitly labeled fixtures for recovery tests. A separate evaluator sees only corpus constraints and transcripts, never fixer reasoning or production prompts. Model grading is fallible; report deterministic invariants and model quality separately. HTTP/auth/database transaction integration remains covered by existing checks and code review, not by this harness.
