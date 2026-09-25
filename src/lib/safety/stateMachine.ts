import type {
  ModelRiskAssessment,
  RuleRiskAssessment,
  SafetyState,
} from "./schemas.ts";

export interface SafetyEvidence {
  deterministic: RuleRiskAssessment;
  model?: ModelRiskAssessment | null;
  medicalEmergency?: boolean;
}

export function resolveSafetyState(evidence: SafetyEvidence): SafetyState {
  if (evidence.medicalEmergency) return "MEDICAL_EMERGENCY";
  if (evidence.deterministic.suggestedState && evidence.deterministic.suggestedState !== "NORMAL") {
    return evidence.deterministic.suggestedState;
  }
  if (evidence.deterministic.level === "IMMINENT" || evidence.model?.level === "IMMINENT") {
    return "IMMINENT";
  }
  if (evidence.model?.level === "CONCERNING") {
    if (evidence.model.category !== "SELF_HARM") return "CLARIFY";
    return evidence.model.evidence.some((item) =>
      item === "DEATH_OR_NONEXISTENCE" || item === "SUICIDAL_IDEATION"
    ) ? "SUICIDAL" : "SELF_HARM";
  }
  if (evidence.deterministic.level === "CONCERNING") {
    return evidence.deterministic.category === "SELF_HARM" ? "SELF_HARM" : "CLARIFY";
  }
  return "NORMAL";
}

export function isSafetyState(value: unknown): value is SafetyState {
  return typeof value === "string" && [
    "NORMAL", "CLARIFY", "SELF_HARM", "SUICIDAL", "IMMINENT", "MEDICAL_EMERGENCY",
  ].includes(value);
}
