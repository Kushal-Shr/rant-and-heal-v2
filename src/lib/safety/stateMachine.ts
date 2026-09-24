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
  if (evidence.deterministic.level === "IMMINENT" || evidence.model?.level === "IMMINENT") {
    return "IMMINENT";
  }
  if (evidence.model?.level === "CONCERNING") {
    return evidence.model.category === "SELF_HARM" ? "SELF_HARM" : "CLARIFY";
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
