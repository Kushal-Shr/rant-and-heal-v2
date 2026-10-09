# Momo conversation examples

52 hand-authored synthetic cases covering all five support modes. Every case records known and unknown facts, the conversational context, transferable principles, mistakes to avoid, and illustrative turns. These are neither response templates nor clinical protocols.

`selector.ts` ranks by mode, primary need, topic, and bounded continuity signals. Corrections, rejection, question fatigue, and option overload receive priority. Selection is stable and clamped to 2–4 cases (default 3). Only the selected **principles** enter the system instruction. Dialogue, case context, facts, and fictional backend status never enter a live prompt. Non-normal safety states select nothing; the existing safety responder remains authoritative.

The original request and [research reference](https://docs.google.com/document/d/1CtIUHQZAdV3QSA6-PucRK_l20CeO2GhPejsVxjrBQOQ/edit) inform the conversation policy. The source includes proposals for future services; this implementation does not add them or imply they exist.

## Audit and integration

| Area | Existing behavior | Change |
| --- | --- | --- |
| Planner | Five modes, structured model inference, deterministic preferences, safety precedence | Shared explicit preference detector; additional direct/mixed-language requests; listening and rejected CBT constraints; question-fatigue-safe fallback |
| Responder and PCT | Grounding/style prompts plus one constrained retry | Highest-level conversation contract; selected case principles; conditional clarification and emotion acknowledgement |
| Grounding | A mentioned emotion could license an assertion even when it belonged to another person | Bounded user self-report checks, negation/correction precedence, multiple emotion checks, work-credit wrongdoing checks |
| Continuity | Bounded session goal/mode, preferences, corrections, outcomes, fatigue | Persist current explicit intent, mixed-language corrections, thought-exercise rejection, list-related discomfort, approach-specific reopening |
| Safety | Independent deterministic/structured assessment and fixed response path | Preserved; safety cases are review fixtures excluded from generation |
| Backend claims/privacy | Existing truthfulness guard and server-owned state | Preserved; no new schema, data source, profile, or external action |
| Multilingual | Existing script/romanized preference patterns and model language handling | Additional mixed-language listening/correction examples and checks |

## Verification and limits

`tests/momo-conversation-policy.test.mjs` covers grounding across work, relationships, academics, family, low mood, jealousy, guilt, ambiguous emotion, and corrections; selection bounds and data projection; current intent; rejection; and safety bypass. Existing Day 2/3/4 and privacy tests remain part of `npm test`.

The optional live smoke check uses 12 fictional messages through the production planner/responder, without Firestore writes, notifications, or handoffs:

```sh
node --env-file=.env.local --experimental-strip-types --no-warnings scripts/check-momo-conversation-policy.mjs /tmp/momo-policy-smoke.json
```

The deterministic checks are narrow regression defenses, not comprehensive semantic verification. They cannot prove arbitrary model output is grounded, catch every paraphrase, or fully parse multilingual intent. Evaluate varied multi-turn conversations before release. The Nepali and romanized dialogue requires native-speaker review; synthetic safety examples and model checks are not clinical validation. This work does not establish new clinical policy or enable voice.
