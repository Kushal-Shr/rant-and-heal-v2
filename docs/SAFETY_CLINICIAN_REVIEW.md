# Safety Behavior — Clinician and Legal Review

Status: `RESEARCH_DRAFT`  
Policy version: `2026-09-25-target-aware-research-draft`

This document separates behavior implemented from the supplied Rant & Heal research from decisions that still require qualified clinical, legal, privacy, and operational approval. Nothing here is represented as clinically validated, legally approved, or a production-approved crisis protocol.

## Implemented research-supported behavior

- The existing taxonomy remains authoritative: `NORMAL`, `CLARIFY`, `SELF_HARM`, `SUICIDAL`, `IMMINENT`, and `MEDICAL_EMERGENCY`.
- Safety assessment runs before the ordinary Momo planner. Every non-`NORMAL` state bypasses normal Day 2 interventions for that turn.
- `CLARIFY` asks one direct question using the user's wording where practical and does not assume suicide.
- `SELF_HARM` distinguishes non-suicidal self-harm from suicidal intent, checks whether harm occurred, checks immediacy, and does not minimize a denial of suicidal intent.
- `SUICIDAL` pauses ordinary CBT, requires human-review intent, and asks one important question at a time.
- `IMMINENT` uses short, low-cognitive-load safety directions and produces immediate human-review intent. It does not trigger police, ambulance, contact calling, SMS, or location capture.
- `MEDICAL_EMERGENCY` prioritizes urgent medical guidance and does not prolong psychological assessment.
- `UNRESOLVED` is retained for uncertainty, refusal, joking retractions, and subject changes. These inputs do not become a denial or `NORMAL`.
- Ordinary distress such as sadness, situational hopelessness, failure, exhaustion, fear, or uncertainty remains `NORMAL` unless the current message contains supported self-harm, suicide/death, harm-to-others, attempt/injury, plan/access, inability-to-stay-safe, or imminence evidence. These signals may still guide ordinary PCT/CBT routing.
- The model classifier may supplement deterministic rules only through schema-validated evidence categories that application code can anchor to the current message. Emotional intensity alone is not model evidence for a safety state.
- Historical, quoted, and educational references are not automatically treated as current imminent danger without personal-risk context.
- Generated success/progress claims about external action are removed unless matching backend state is supplied. The current chat responder has no confirmed external actions.
- Safety events contain structured state, target, resolution, assessment step, review intent/urgency, trigger type, source, session ID, policy version, and timestamps. The event does not duplicate the user's message or store model rationale.
- The existing opt-in Resend transport remains separate from classification. It is eligible only for policy states with `IMMEDIATE` review urgency and stores `REQUESTED`, `STARTED`, then `CONFIRMED` or `FAILED`; it is not an emergency-service dispatch.

## Current operational policy

| State | Ordinary intervention | Default next need | Human-review intent | Response constraint |
|---|---|---|---|---|
| `NORMAL` | Allowed | None | None | Ordinary Day 2 PCT/intervention flow |
| `CLARIFY` | Paused | Clarify meaning | None by default | Short, warm, one question |
| `SELF_HARM` | Paused/secondary | Distinguish suicidal intent; check injury and immediacy | Not mandatory by default; unresolved concern becomes routine review intent | Short, non-minimizing, one question |
| `SUICIDAL` | Paused | Check current immediacy or safe human connection | Urgent | Short, warm, direct, one question |
| `IMMINENT` | Blocked | One immediate safety action | Immediate | Very short, low cognitive load |
| `MEDICAL_EMERGENCY` | Blocked | Urgent medical action | Immediate | Very short; medical priority |

The policy values above are software defaults derived from the research brief, not clinical approval.

## Harm-to-others / violence-risk policy gap

Status: `RESEARCH_DRAFT / CLINICIAN_REVIEW_REQUIRED`

The software now represents danger severity separately from the possible target: `NONE`, `SELF`, `OTHER`, `BOTH`, or `UNCLEAR`. Explicit near-term other-directed threats pause ordinary support, use target-appropriate distance language rather than suicide copy, and create immediate human-review intent. Credible other-directed concern without established imminence asks one direct immediacy question and creates routine review intent as a temporary research-draft default. Figurative or ambiguous violent language asks one clarification and does not become imminent solely because violent words appear.

This is not a complete violence-risk protocol. Clinical and legal owners must define and approve:

- threat-credibility criteria, including context, specificity, capability, access, protective factors, and how model evidence may be used;
- imminent-risk criteria for other-directed and mixed self/other threats;
- required reviewer urgency and response-time expectations for credible but non-imminent threats;
- target-protection policy, including what guidance may be shown to the user and what qualified reviewers may do;
- whether, when, and under whose authority emergency services or law enforcement may be involved;
- minimum-necessary disclosure, consent and notice requirements, jurisdictional duties, retention, and audit access;
- safe de-escalation, retraction reassessment, denial verification, and clearance criteria before returning to ordinary support.

The current implementation does not claim that police, emergency services, a clinician, or the possible target were contacted. It does not independently authorize those actions.

## Review decisions still required

| Review area | Implemented draft position | Approval still required |
|---|---|---|
| State taxonomy | Existing six states preserved | Confirm clinical fitness, overlap, and terminology |
| State thresholds | Conservative deterministic examples plus structured classifier second opinion | Validate thresholds, false-positive/false-negative tolerance, and special populations |
| Exact user-facing copy | Centralized research-draft copy with PCT-informed constraints | Approve/localize every production phrase, including English, Nepali, and romanized-Nepali behavior |
| Mandatory-review states | `SUICIDAL` urgent; `IMMINENT` and `MEDICAL_EMERGENCY` immediate; unresolved non-normal concern at least routine | Decide whether every `SELF_HARM` event requires review and under what urgency |
| `UNRESOLVED` definition | Uncertainty, refusal, joking retraction, or unrelated subject change during an active assessment | Confirm duration, retry limits, nonresponse behavior, and escalation thresholds |
| Return to `NORMAL` | A clear non-safety explanation can resolve `CLARIFY`; significant states are not cleared by subject change or a joking retraction | Approve full reassessment criteria and who may close a significant safety case |
| Case resolution | No Day 4 case-closing workflow is implemented | Define closure evidence, reviewer authority, documentation, and follow-up |
| Reviewer response time | No SLA is claimed | Define urgency-specific response expectations, operating hours, and service guarantees |
| Backup reviewer escalation | Not implemented | Define ownership, coverage, paging ladder, failure modes, and audit requirements |
| Reviewer context | Structured safety metadata and session reference; no duplicated event plaintext | Define minimum/maximum conversation context, consent, role access, and redaction |
| Emergency-contact policy | No automatic contact | Define consent, unsafe/abusive-contact handling, minors, capacity, and exceptions |
| Location policy | No device location, IP geolocation, or automatic address lookup | Decide whether any location collection is lawful, necessary, consented, secure, and operationally useful |
| Emergency-service policy | No automatic police or ambulance dispatch | Define jurisdiction-specific authority, human approval, confirmation, and user transparency |
| Retention/disclosure | Existing 30-day TTL target retained for minimal events; session retention unchanged | Approve retention periods, legal holds, disclosures, audit access, deletion, and incident reporting |
| Crisis resources | Generic local emergency/ED guidance only unless configured elsewhere | Verify region-specific resources, availability, ownership, and update cadence |
| Minors | No child-specific pathway added | Establish age-appropriate language, guardian involvement, confidentiality limits, and reporting duties |

## Privacy and data boundary

Day 3 does not give safety processing access to journal plaintext, journal semantic analysis, unrelated therapy plaintext, or unrelated user data. The chat route already stored the user's Momo message in the session; Day 3 does not duplicate that plaintext into `safety_events`. Events reference the session and store operational metadata only. No hidden reasoning or free-form classifier rationale is persisted.

## External action boundary

No automatic emergency-contact call, SMS, police request, ambulance request, device-location capture, IP geolocation, hotline connection, clinician live takeover, or paging system was added. An optional pre-existing support email can be attempted only when enabled and configured for an immediate-review state. Email delivery confirmation is operational metadata; it must never be described to the user as emergency response or as proof that a clinician is joining.

## Required approval evidence before production claims

Production approval should require traceable sign-off from named clinical, legal/privacy, and operational owners; a versioned evaluation corpus; localized copy review; a verified resource directory; documented on-call ownership; failure-mode tests; and an approved incident/retention process. Until those artifacts exist, the code and copy remain `RESEARCH_DRAFT`.
