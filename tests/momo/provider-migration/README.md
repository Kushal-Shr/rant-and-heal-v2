# Momo text-provider migration verification

This directory records the verification boundary for moving only `MOMO_RESPONSE` from Gemini to OpenAI `gpt-5.6-luna`.

## Before-change baseline

The live Gemini baseline was saved before the provider edit in [`../conversation-policy/smoke-before-verbosity-refinement.json`](../conversation-policy/smoke-before-verbosity-refinement.json). It contains 12 synthetic, non-user scenarios covering ordinary listening, work/relationships/academics/family/low mood, ambiguous emotion, guilt, a user correction, direct help, mixed English/Nepali, requested CBT, and breathing rejection. [`../conversation-policy/draft-followup.json`](../conversation-policy/draft-followup.json) records the follow-up direct-help sample.

The larger pre-migration Gemini baseline remains under [`../conversation-corpus/runs/baseline`](../conversation-corpus/runs/baseline), with 120 conversations and 960 turns spanning all support modes, continuity, correction/rejection, question pressure, option overload, multilingual conversations, and safety transitions. These historical files were not rewritten for the migration.

Backend truthfulness and the distinction between requested/started/confirmed actions are deterministic post-generation behavior covered by `tests/safety-dashboard.test.mjs` and `tests/safety.test.mjs`. Active safety states bypass the responder entirely and are covered by the existing safety, Day 2, Day 3, Day 4, audit-regression, and conversation-policy tests.

## OpenAI comparison status

A live GPT-5.6 Luna run requires `OPENAI_API_KEY`. No OpenAI key was available in the implementation environment, so no GPT output or latency result is claimed here. The migration runner records responder provider/model and per-scenario wall-clock duration. Once the key is configured, run:

```sh
MOMO_TEXT_PROVIDER=openai node --env-file=.env.local --experimental-strip-types --no-warnings scripts/check-momo-conversation-policy.mjs /tmp/momo-openai-smoke.json
```

For rollback comparison:

```sh
MOMO_TEXT_PROVIDER=gemini node --env-file=.env.local --experimental-strip-types --no-warnings scripts/check-momo-conversation-policy.mjs /tmp/momo-gemini-smoke.json
```

Compare mode decisions and final text for grounding, directness, question pressure, intervention reuse, continuity, and mixed-language behavior. Safety routing and backend truthfulness should be checked from deterministic tests because the ordinary LLM responder cannot authorize those actions.

The post-migration rollback smoke artifact [`gemini-rollback-work.json`](gemini-rollback-work.json) confirms the Gemini route on one synthetic work scenario. It retained the baseline `LISTEN` / `VENT` / `PCT_LISTENING` decision, returned a closely equivalent grounded response, and recorded 6,068 ms wall-clock latency for planner plus responder. This validates rollback wiring; it is not an OpenAI latency comparison.

## Compatibility assertions

`tests/momo-provider-migration.test.mjs` verifies:

- only `MOMO_RESPONSE` changes provider/model;
- medium reasoning and stateless Responses API usage;
- exact instruction and bounded-history mapping;
- the previous Gemini request shape remains available;
- invalid providers fail closed;
- an OpenAI failure never invokes Gemini;
- both providers normalize to the existing response-text contract.
