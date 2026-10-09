# Conversation policy verification

- `npm run check`: ESLint, TypeScript, and all **192 tests** passed (180 baseline tests plus 12 new policy tests).
- `git diff --check`: passed.
- `smoke-before-verbosity-refinement.json`: 12 synthetic cases completed through the real production planner/responder. No database, notifications, or handoffs were invoked. The work-credit reply stayed factual; no sampled reply assigned the prohibited emotions or intentional wrongdoing.
- Reviewing that sample identified an overlong drafting answer. The final instruction asks for one short draft, and a scope-sensitive verbosity signal now requests one rewrite for unnecessarily long short-request answers. As with repetition signals, verbosity alone does not withhold help after the retry.
- `draft-followup.json`: the affected case was rerun after that refinement and produced a single 62-word response. Unrelated cases were not rerun for that drafting-only change.

These are small synthetic smoke checks, not a statistically representative quality evaluation or clinical validation. Output varies between model calls. Existing safety/privacy tests passed, but Firestore emulator/deployment checks were not rerun because this change did not modify those layers. Nepali examples and generated mixed-language responses still require native-speaker review.

The reusable opt-in runner is `scripts/check-momo-conversation-policy.mjs`; its optional third argument selects one fixture by id. The fixtures contain no real user data. Each result records the configured models, policy-file hash, and timestamp.
