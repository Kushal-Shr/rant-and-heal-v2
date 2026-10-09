import type { NormalizedConversationInput } from "./schemas.ts";

// Bounded assertion checks, not a semantic verifier or a style phrase blacklist.
// The shared policy handles meanings outside these deliberately narrow signals.
const EMOTIONS = {
  angry: ["angry", "anger", "pissed", "furious"],
  frustrated: ["frustrated", "frustrating", "frustration"],
  betrayed: ["betrayed", "betrayal"],
  anxious: ["anxious", "anxiety"],
  afraid: ["afraid", "scared", "fearful"],
  ashamed: ["ashamed", "shame"],
  embarrassed: ["embarrassed", "embarrassing", "embarrassment"],
  lonely: ["lonely", "loneliness"],
  sad: ["sad", "sadness"],
  devastated: ["devastated", "devastating"],
  overwhelmed: ["overwhelmed", "overwhelming"],
  confused: ["confused", "confusing", "confusion"],
  irritated: ["irritated", "irritating", "irritation"],
  jealous: ["jealous", "jealousy"],
  guilty: ["guilty", "guilt"],
  disappointed: ["disappointed", "disappointing", "disappointment"],
  hurt: ["hurt"],
} as const;

const words = Object.values(EMOTIONS).flat().join("|");
const modifiers = "(?:(?:really|very|mostly|so|a little|quite|clearly|probably|just|deeply)\\s+)*";
const emotionList = `${modifiers}(?:${words})(?:(?:,?\\s+and\\s+|,\\s*)${modifiers}(?:${words}))*`;
const assignment = new RegExp(`\\byou(?:['’]re|\\s+(?:are|feel|sound|seem|must be|must feel))\\s+(${emotionList})\\b|\\b(?:that|this|it)\\s+(?:sounds?|must (?:be|feel))\\s+(${emotionList})\\b`, "gi");

function unquoted(text: string): string {
  return text.replace(/"[^"\n]*"|“[^”\n]*”/g, "");
}

function emotionEvidence(text: string, variants: readonly string[]): boolean | undefined {
  const value = variants.join("|");
  const self = `\\bi(?:['’]m| am| was| feel| felt| get)\\s+(?:feeling\\s+)?`;
  const precedingEmotions = `(?:${modifiers}(?:${words})(?:,?\\s+and\\s+|,\\s*))*`;
  const positive = new RegExp(`${self}${precedingEmotions}${modifiers}(?:${value})\\b|\\bi\\s+have\\s+(?:this\\s+)?(?:${value})\\b|\\b(?:makes?|made|leaves?|left)\\s+me\\s+(?:feel\\s+)?${modifiers}(?:${value})\\b`, "i");
  const negative = new RegExp(`${self}${precedingEmotions}(?:not|never)\\s+${modifiers}(?:${value})\\b|\\bi\\s+(?:don't|don’t|do not)\\s+feel\\s+${modifiers}(?:${value})\\b`, "i");
  let evidence: boolean | undefined;
  for (const clause of unquoted(text).split(/[.!?;।\n]+|\bbut\b/i)) {
    if (negative.test(clause)) evidence = false;
    else if (positive.test(clause) && !/\b(?:if|whether|maybe|wonder)\b/i.test(clause)) evidence = true;
  }
  return evidence;
}

function inputEstablishesEmotion(
  input: NormalizedConversationInput,
  variants: readonly string[]
): boolean {
  let established = false;
  for (const text of input.history.filter((turn) => turn.role === "USER").map((turn) => turn.text)) {
    established = emotionEvidence(text, variants) ?? established;
  }
  for (const correction of input.continuityState?.userCorrections ?? []) {
    if (variants.some((word) => correction.rejectedTerm.toLowerCase() === word)) established = false;
    if (variants.some((word) => correction.preferredTerm.toLowerCase() === word)) established = true;
  }
  return emotionEvidence(input.messageText, variants) ?? established;
}

export type GroundingViolation =
  | "UNSUPPORTED_EMOTION_INFERENCE"
  | "UNSUPPORTED_EVENT_INFERENCE"
  | "UNSUPPORTED_PSYCHOLOGICAL_IMPLICATION"
  | "UNSUPPORTED_DIAGNOSIS";

export interface GroundingViolationDetail {
  code: GroundingViolation;
  claim: string;
}

function boundedGroundingViolations(candidate: string, input: NormalizedConversationInput): GroundingViolation[] {
  const violations = new Set<GroundingViolation>();
  const userTurns = input.history.filter((turn) => turn.role === "USER").map((turn) => turn.text);
  for (const match of candidate.matchAll(assignment)) {
    const assigned = match[1] ?? match[2];
    for (const variants of Object.values(EMOTIONS)) {
      if (!new RegExp(`\\b(?:${variants.join("|")})\\b`, "i").test(assigned)) continue;
      const established = inputEstablishesEmotion(input, variants);
      if (!established) violations.add("UNSUPPORTED_EMOTION_INFERENCE");
    }
  }

  // High-confidence work-credit overclaims. These guard the stated regression
  // without treating every use of "intentional" or "stole" as forbidden.
  const overclaims = [
    { assertion: /\b(?:your coworker|they|he|she)\s+(?:stole|has stolen)\s+(?:your work|the credit)\b/i,
      evidence: /\b(?:my coworker|they|he|she)\s+(?:stole|has stolen)\s+(?:my work|the credit)\b/i },
    { assertion: /\b(?:your coworker|they|he|she)\s+(?:deliberately|intentionally|knowingly)\s+(?:took|claimed|got)\s+(?:the |your )?credit\b/i,
      evidence: /\b(?:my coworker|they|he|she)\s+(?:deliberately|intentionally|knowingly)\s+(?:took|claimed|got)\s+(?:the |my )?credit\b/i },
  ];
  for (const claim of overclaims) {
    const assertions = candidate.split(/[.!?;।\n]+/).filter((clause) =>
      !/\b(?:if|whether|might|may|not|don't|don’t|can't|cannot|unsure|unclear|know)\b/i.test(clause));
    if (!assertions.some((clause) => claim.assertion.test(clause))) continue;
    let established = false;
    for (const text of [...userTurns, input.messageText]) {
      for (const clause of unquoted(text).split(/[.!?;।\n]+/)) {
        if (claim.evidence.test(clause)) {
          established = !/\b(?:not|never|if|whether|wonder|maybe|unsure|don't|don’t|didn't|didn’t)\b/i.test(clause);
        }
      }
    }
    if (!established) violations.add("UNSUPPORTED_EVENT_INFERENCE");
  }
  return [...violations];
}

const PSYCHOLOGICAL_CONCEPTS: Record<string, readonly string[]> = {
  invisible: ["invisible", "unseen", "overlooked"],
  invalidated: ["invalidated", "dismissed"],
  disrespected: ["disrespected", "not respected"],
  unvalued: ["unvalued", "undervalued", "not valued", "unappreciated", "not appreciated"],
  erased: ["erased", "written off"],
  unfair: ["unfair", "unjust"],
  unsafe: ["unsafe", "threatened"],
  powerless: ["powerless", "helpless"],
  internalConflict: ["your body is reacting", "your mind is", "your nervous system", "part of you"],
  significance: ["significant", "serious", "important", "meaningful", "worth addressing", "worth dealing with"],
  difficulty: ["difficult", "rough", "hard to deal with", "hard to handle", "tough to deal with"],
  recognition: ["recognition", "unrecognized", "not recognized", "lack of recognition", "wasn't recognized", "wasn’t recognized", "was not recognized"],
};

const DIAGNOSIS = /\b(?:depression|depressive disorder|anxiety disorder|ptsd|post-traumatic stress|ocd|bipolar|adhd|autis(?:m|tic)|personality disorder|trauma response|panic disorder)\b/i;
const DIAGNOSIS_ASSERTION = /\b(?:you (?:have|are|seem|sound)|you['’]re (?:experiencing|showing|suffering)|this is|that is|it is)\b/i;
const PSYCHOLOGICAL_ATTRIBUTION = /\b(?:you|your|this|that|it|the situation|the experience)\b/i;
const IMPLIED_EMOTION_ATTRIBUTION = /\b(?:(?:can|could|may|might|must)\s+(?:make|leave)\s+you(?:\s+feeling|\s+feel)?|you\s+(?:may|might|must|could)\s+(?:feel|be feeling)|(?:it|that|this)(?:['’]s|\s+is)\s+(?:understandable|natural|reasonable)\s+(?:if|to)\s+(?:you\s+)?feel)\b/i;

function clauses(text: string): string[] {
  return text.split(/(?<=[.!?।])\s+|[;\n]+/).map((clause) => clause.trim()).filter(Boolean);
}

function containsVariant(text: string, variant: string): boolean {
  const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, "i").test(text);
}

function userEstablishedConcept(input: NormalizedConversationInput, variants: readonly string[]): boolean {
  const value = variants.map((variant) => variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const explicit = new RegExp(
    `\\b(?:i(?:['’]m| am| was| feel| felt| get)|makes? me(?: feel)?|made me(?: feel)?|i feel like)\\s+(?:really\\s+|very\\s+|so\\s+)?(?:${value})\\b|\\b(?:it|that|this)\\s+(?:is|was|feels|felt)\\s+(?:${value})\\b`,
    "i"
  );
  return [...input.history.filter((turn) => turn.role === "USER").map((turn) => turn.text), input.messageText]
    .some((text) => clauses(unquoted(text)).some((clause) => explicit.test(clause)));
}

function userEstablishedDiagnosis(input: NormalizedConversationInput): boolean {
  const explicit = /\bi\s+(?:have|was diagnosed with|am diagnosed with)\s+(?:depression|depressive disorder|anxiety disorder|ptsd|post-traumatic stress|ocd|bipolar|adhd|autism|panic disorder)\b/i;
  return [...input.history.filter((turn) => turn.role === "USER").map((turn) => turn.text), input.messageText]
    .some((text) => explicit.test(unquoted(text)));
}

export function groundingViolationDetails(
  candidate: string,
  input: NormalizedConversationInput
): GroundingViolationDetail[] {
  const details: GroundingViolationDetail[] = [];
  const candidateClauses = clauses(unquoted(candidate));
  for (const code of boundedGroundingViolations(candidate, input)) {
    const claim = candidateClauses.find((clause) =>
      code === "UNSUPPORTED_EMOTION_INFERENCE"
        ? new RegExp(`\\b(?:${words})\\b`, "i").test(clause)
        : /\b(?:stole|deliberately|intentionally|knowingly)\b/i.test(clause)
    ) ?? candidate.trim();
    details.push({ code, claim });
  }

  for (const clause of candidateClauses) {
    if (DIAGNOSIS.test(clause) && DIAGNOSIS_ASSERTION.test(clause) && !userEstablishedDiagnosis(input)) {
      details.push({ code: "UNSUPPORTED_DIAGNOSIS", claim: clause });
    }
    if (!PSYCHOLOGICAL_ATTRIBUTION.test(clause)) continue;
    if (IMPLIED_EMOTION_ATTRIBUTION.test(clause)) {
      for (const variants of Object.values(EMOTIONS)) {
        if (variants.some((variant) => new RegExp(`\\b${variant}\\b`, "i").test(clause))
            && !inputEstablishesEmotion(input, variants)) {
          details.push({ code: "UNSUPPORTED_PSYCHOLOGICAL_IMPLICATION", claim: clause });
          break;
        }
      }
    }
    for (const variants of Object.values(EMOTIONS)) {
      if (variants.some((variant) => new RegExp(`\\b${variant}\\b`, "i").test(clause))
          && !inputEstablishesEmotion(input, variants)) {
        details.push({ code: "UNSUPPORTED_PSYCHOLOGICAL_IMPLICATION", claim: clause });
        break;
      }
    }
    for (const variants of Object.values(PSYCHOLOGICAL_CONCEPTS)) {
      const mentionsConcept = variants.some((variant) => containsVariant(clause, variant));
      if (mentionsConcept && !userEstablishedConcept(input, variants)) {
        details.push({ code: "UNSUPPORTED_PSYCHOLOGICAL_IMPLICATION", claim: clause });
        break;
      }
    }
  }
  return details.filter((detail, index, all) =>
    all.findIndex((item) => item.code === detail.code && item.claim === detail.claim) === index
  );
}

export function groundingViolations(candidate: string, input: NormalizedConversationInput): GroundingViolation[] {
  return [...new Set(groundingViolationDetails(candidate, input).map((detail) => detail.code))];
}
