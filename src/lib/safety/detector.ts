import { getSafetyPolicy } from "./policy.ts";
import {
  modelRiskAssessmentSchema,
  type ModelRiskAssessment,
  type RuleRiskAssessment,
  type SafetyEvaluation,
} from "./schemas.ts";
import { resolveSafetyState } from "./stateMachine.ts";

export type MomoSafetyCategory = "SELF_HARM" | "HARM_TO_OTHERS";
export type MomoSafetyLanguage = "EN" | "NE";
export type MomoSafetyAssessment = RuleRiskAssessment;

interface SafetyPattern {
  id: string;
  category: MomoSafetyCategory;
  language: MomoSafetyLanguage;
  expression: RegExp;
}

const URGENT_PATTERNS: SafetyPattern[] = [
  { id: "self-harm-direct", category: "SELF_HARM", language: "EN", expression: /\b(?:kill|hurt|harm|cut)\s+myself\b/i },
  { id: "self-harm-intent", category: "SELF_HARM", language: "EN", expression: /\b(?:want|plan|going|about)\s+to\s+(?:die|end\s+my\s+life)\b/i },
  { id: "suicide-intent", category: "SELF_HARM", language: "EN", expression: /\b(?:suicidal\s+(?:thoughts?|ideas?|intent|plan)|(?:commit|attempt)\s+suicide)\b/i },
  { id: "harm-others-direct", category: "HARM_TO_OTHERS", language: "EN", expression: /\b(?:kill|hurt|harm|attack|shoot)\s+(?:him|her|them|someone|people|my\s+(?:partner|family|friend|boss))\b/i },
  { id: "harm-others-intent", category: "HARM_TO_OTHERS", language: "EN", expression: /\b(?:going|plan(?:ning)?|want)\s+to\s+(?:kill|hurt|harm|attack|shoot)\b/i },
  { id: "self-harm-nepali", category: "SELF_HARM", language: "NE", expression: /(?:आत्महत्या|आफैलाई\s*मार|आफ्नो\s*ज्यान|मर्न\s*मन|बाँच्न\s*मन\s*छैन)/i },
  { id: "harm-others-nepali", category: "HARM_TO_OTHERS", language: "NE", expression: /(?:उसलाई\s*मार|मान्छे\s*मार|कसैलाई\s*मार|हान्न\s*जान्छु)/i },
  { id: "self-harm-romanized-nepali", category: "SELF_HARM", language: "NE", expression: /\b(?:aatmahatya|afulai\s*mar|aafailai\s*mar|aafno\s*jyan|marna\s*man|bachna\s*man\s*chaina)\b/i },
  { id: "harm-others-romanized-nepali", category: "HARM_TO_OTHERS", language: "NE", expression: /\b(?:uslai\s*mar|manche\s*mar|kasailai\s*mar|hanne\s*janxu)\b/i },
];

export function assessMomoSafety(text: string): MomoSafetyAssessment {
  const normalizedText = text.normalize("NFKC").trim();
  const matchedPatterns = URGENT_PATTERNS.filter((pattern) => {
    const match = pattern.expression.exec(normalizedText);
    if (!match) return false;
    if (pattern.language !== "EN") return true;
    const prefix = normalizedText.slice(Math.max(0, match.index - 48), match.index);
    return !/(?:\bdo\s+not\b|\bdon['’]t\b|\bnot\b|\bnever\b|\bno\s+longer\b)(?:[\s,]+\w+){0,4}[\s,]*$/i.test(prefix);
  });
  if (matchedPatterns.length === 0) return { level: "SAFE", matchedSignals: [] };
  return {
    level: "IMMINENT",
    category: matchedPatterns[0].category,
    language: matchedPatterns[0].language,
    matchedSignals: matchedPatterns.map((pattern) => pattern.id),
  };
}

export function combineSafetyAssessments(
  deterministic: RuleRiskAssessment,
  model: ModelRiskAssessment | null = null
): SafetyEvaluation {
  const validatedModel = model ? modelRiskAssessmentSchema.parse(model) : null;
  const state = resolveSafetyState({ deterministic, model: validatedModel });
  return {
    state,
    deterministic,
    model: validatedModel,
    escalationStatus: getSafetyPolicy(state).escalationStatus,
  };
}

export function evaluateDeterministicSafety(text: string): SafetyEvaluation {
  return combineSafetyAssessments(assessMomoSafety(text));
}
