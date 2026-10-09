import type { SafetyState } from "../../safety/schemas.ts";
import type { MomoDecision, NormalizedConversationInput, PrimaryNeed, SupportMode } from "../schemas.ts";
import { MOMO_EXAMPLES, type MomoExample } from "./index.ts";

export interface ExampleSelection {
  mode: SupportMode;
  primaryNeed: PrimaryNeed;
  safetyState: SafetyState;
  domain?: string;
  tags?: string[];
  optionOverload?: boolean;
  questionFatigue?: boolean;
  correctionPresent?: boolean;
  rejectedIntervention?: boolean;
  limit?: number;
}

/** Stable, local selection. No retrieval service, user profiling, or persistence. */
export function selectExamples(selection: ExampleSelection): MomoExample[] {
  // Safety case illustrations are review material, never ordinary prompt data.
  if (selection.safetyState !== "NORMAL") return [];
  const limit = Number.isFinite(selection.limit)
    ? Math.max(0, Math.min(1, Math.floor(selection.limit!)))
    : 0;
  if (limit === 0) return [];
  const tags = new Set(selection.tags ?? []);
  if (selection.domain) tags.add(selection.domain);
  if (selection.optionOverload) tags.add("option-overload");
  if (selection.questionFatigue) tags.add("question-fatigue");
  if (selection.correctionPresent) tags.add("correction");
  if (selection.rejectedIntervention) tags.add("rejection");
  const priorityTags = new Set([
    "correction", "rejection", "question-fatigue", "option-overload",
    "breathing-rejection", "grounding-rejection", "cbt-rejected",
    "intervention-failure", "intervention-success", "no-advice",
  ]);
  const sensitiveTags = ["explicit-emotion", "guilt", "jealousy", "no-advice"];
  return MOMO_EXAMPLES
    .filter((example) => {
      if (example.tags.includes("safety") || example.mode !== selection.mode) return false;
      if (sensitiveTags.some((tag) => example.tags.includes(tag) && !tags.has(tag))) return false;
      const priorityMatch = example.tags.some((tag) => priorityTags.has(tag) && tags.has(tag));
      const needMatch = example.tags.includes(selection.primaryNeed);
      const contextMatch = example.tags.some((tag) => tags.has(tag));
      const domainMatch = !selection.domain || example.tags.includes(selection.domain);
      return priorityMatch || (needMatch && contextMatch && domainMatch);
    })
    .map((example, order) => ({
      example,
      order,
      score: (example.tags.includes(selection.primaryNeed) ? 2 : 0)
        + example.tags.reduce((score, tag) => score + (tags.has(tag) ? priorityTags.has(tag) ? 12 : 4 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ example }) => example);
}

const TOPIC_TAGS: Array<[string, RegExp]> = [
  ["work", /\b(?:coworker|supervisor|manager|project|meeting|workplace|boss)\b/i],
  ["academics", /\b(?:exam|stud(?:y|ied|ying)|university|degree|course|grade|passed|college)\b/i],
  ["relationships", /\b(?:friend|partner|girlfriend|boyfriend|engaged|text|replied)\b/i],
  ["family", /\b(?:parents?|mother|father|mom|dad|cousin|sister|brother)\b/i],
  ["low-mood", /\b(?:sad|low|bed|exhausting)\b/i],
  ["guilt", /\bguilt(?:y)?\b/i],
  ["jealousy", /\b(?:jealous|engaged)\b/i],
  ["explicit-emotion", /\bi(?:['’]m| am| feel| felt| was)\s+(?:really\s+|very\s+|so\s+)?(?:angry|pissed|furious|frustrated|betrayed|anxious|afraid|ashamed|embarrassed|lonely|sad|devastated|overwhelmed|confused|irritated|jealous|guilty|disappointed|hurt)\b/i],
  ["ambiguous-emotion", /\b(?:weird|strange|confused|off)\b/i],
  ["self-esteem", /\b(?:stupid|failure|worthless)\b/i],
  ["overwhelm", /\b(?:overwhelm|too much|can't think|cannot think)\b/i],
  ["multilingual", /[\u0900-\u097f]|\b(?:malai|haina|bhana|nadeu|bholi|cha|huncha|prasna|sidhai)\b/i],
];

export function exampleSelectionFor(input: NormalizedConversationInput, decision: MomoDecision): ExampleSelection {
  const state = input.continuityState;
  const tags = TOPIC_TAGS.filter(([, pattern]) => pattern.test(input.messageText)).map(([tag]) => tag);
  if (decision.intervention === "CBT_RESTRUCTURING") tags.push("cbt-requested");
  if (/\b(?:no advice|just listen|let me (?:rant|vent)|want to (?:rant|vent)|advice nadeu|suna)\b/i.test(input.messageText)) tags.push("no-advice");
  if (state?.rejectedApproaches.includes("BREATHING")) tags.push("breathing-rejection");
  if (state?.rejectedApproaches.includes("GROUNDING")) tags.push("grounding-rejection");
  if (state?.rejectedApproaches.includes("CBT_RESTRUCTURING")) tags.push("cbt-rejected");
  if (state?.needsReassessment) tags.push("intervention-failure");
  if (state?.recentInterventions.at(-1)?.outcome === "HELPED") tags.push("intervention-success");
  const domain = tags.find((tag) => ["work", "academics", "relationships", "family", "low-mood", "self-esteem", "overwhelm", "multilingual"].includes(tag));
  return {
    mode: decision.supportMode, primaryNeed: decision.primaryNeed, safetyState: decision.safetyState,
    domain, tags, optionOverload: state?.optionOverload, questionFatigue: state?.questionFatigue,
    correctionPresent: Boolean(state?.userCorrections.length),
    rejectedIntervention: Boolean(state?.rejectedApproaches.length),
    limit: tags.length || state?.optionOverload || state?.questionFatigue || state?.userCorrections.length || state?.rejectedApproaches.length ? 1 : 0,
  };
}

export function selectedExamplePrinciples(selection: ExampleSelection): string {
  const examples = selectExamples(selection);
  if (!examples.length) return "";
  // Deliberate projection: no context, knownFacts, unknownFacts, sample turns,
  // or backend statuses can leak into the live responder from the library.
  return [
    "Selected case principle (illustration only, never a response template or fact about this user):",
    "Apply only when consistent with the current request. Never copy example wording or infer a matching story. Current facts and preferences outrank these principles.",
    ...examples.map((example) => `- ${example.principles.join(" ")}`),
  ].join("\n");
}
