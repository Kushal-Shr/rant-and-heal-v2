# Momo conversation audit

Start with [the completion report](REPORT.md), [architecture before editing](ARCHITECTURE-BASELINE.md), [baseline findings](BASELINE-FINDINGS.md), and [20-conversation human review pack](HUMAN-REVIEW.md).

## Contents

- `scenarios.json`: 120 saved synthetic scenarios, 8 user turns each (960 user/response opportunities). Category minimums and five language styles are checked by `tests/momo-audit-corpus.test.mjs`.
- `rubric.json`: independent evaluator instructions and 13 separately graded dimensions, frozen before baseline.
- `runs/baseline/`: original runtime responses, state, model judgments and source hashes.
- `runs/post-fix-complete/`: final-version replay attempt; currently blocked by provider daily quota (54 failed responses, 128 ungraded turns).
- `runs/post-fix/` and `runs/post-fix-verified/`: explicitly aborted intermediate trials, excluded from comparison.
- `runs/post-fix-final/`: complete intermediate replay that exposed the fictional-quotation defect; superseded by the final replay. All intermediate evidence is retained.
- `validation.json`: commands/results and final source verification.

## Run

Requires Node 22.15+ (synchronous import hooks), installed project dependencies, and a valid `GEMINI_API_KEY`. The runner loads `.env.local` only through Node's env-file support. It never prints the key. Live generation and independent evaluation incur API usage; normal `npm test` stays offline.

```sh
node --no-warnings --experimental-strip-types --env-file=.env.local scripts/run-momo-audit.mjs --run my-new-run --concurrency 8
node scripts/analyze-momo-audit.mjs my-new-run
```

The saved final attempt requires quota recovery before it can be completed:

```sh
node --no-warnings --experimental-strip-types --env-file=.env.local scripts/run-momo-audit.mjs --run post-fix-complete --concurrency 4 --retry-provider-errors --retry-evaluator
```

Provider-failed conversations are archived under `attempts/` and replayed in full to restore their context. Bad quality scores alone never trigger regeneration.

Use a fresh run name after production changes. Existing manifests reject changed production sources, corpus or rubric to prevent mixing versions. Completed scenario files are reused on resumption. For a failed evaluator request, use `--evaluate-only --retry-evaluator`; this never regenerates conversation output. `--only <scenario-id>` or `--category <comma-separated-categories>` can scope diagnostic runs. Prefer one process per run to avoid duplicate scheduling.

The runner imports production orchestrator, planner, safety assessor and responder via an alias-only loader. It emulates the route's history limit, committed state and failure cleanup without authenticating real users, reading journals, writing Firestore, creating reviewer cases, sending notifications or making handoffs. It does **not** claim HTTP/database transaction integration coverage. Existing emulator and unit suites test those boundaries where available.

The current runner persists the safety checkpoint exactly as the fixed text route does. To reproduce the original baseline, use the baseline commit’s production modules with this harness and `--legacy-route-state` (no checkpoint and no failure-state persistence); the frozen baseline manifest identifies production sources. The baseline intentionally had no persisted safety checkpoint. Its JSON outputs are immutable evidence, not a benchmark target to match word for word.

`build-momo-corpus.mjs` reconstructs the saved fixture deterministically. Do not rebuild or change scenarios between baseline and regression. No expected exact response text is supplied to generation.

## Interpretation

`PASS`, `MINOR`, `FAIL`, `CRITICAL_FAIL` are model judgments, not clinician verdicts. Non-applicable dimensions are identified per turn. Raw grades remain unchanged even where the evaluator inconsistently scores missing replies as grounding/brevity failures. Summaries additionally provide delivered-output-only counts and separate availability failures. Heuristic word-length and structural repetition screens are explicitly labeled; they are not clinical limits or semantic judgments.

The corpus is scripted and synthetic. Shared continuations, paired situations and seeded earlier assistant mistakes help compare behaviors, but are not independent samples of natural patient conversation. The user scripts do not adapt to generated responses. One retained generation per scenario per comparison does not establish statistical reliability. Native Nepali and romanized Nepali reviewers, intended users, and qualified clinicians must review remaining weaknesses before any launch claim. Voice is outside this audit.
