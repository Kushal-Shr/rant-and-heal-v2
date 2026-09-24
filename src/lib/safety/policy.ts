import type { EscalationStatus, SafetyState } from "./schemas.ts";

export interface SafetyPolicy {
  normalSupportAllowed: boolean;
  clarificationRequired: boolean;
  structuredInterventionsAllowed: boolean;
  humanReviewRequired: boolean;
  immediateProtocolRequired: boolean;
  escalationStatus: EscalationStatus;
}

const POLICIES: Record<SafetyState, SafetyPolicy> = {
  NORMAL: {
    normalSupportAllowed: true,
    clarificationRequired: false,
    structuredInterventionsAllowed: true,
    humanReviewRequired: false,
    immediateProtocolRequired: false,
    escalationStatus: "NONE",
  },
  CLARIFY: {
    normalSupportAllowed: true,
    clarificationRequired: true,
    structuredInterventionsAllowed: false,
    humanReviewRequired: false,
    immediateProtocolRequired: false,
    escalationStatus: "CLARIFICATION_REQUIRED",
  },
  SELF_HARM: {
    normalSupportAllowed: true,
    clarificationRequired: true,
    structuredInterventionsAllowed: false,
    humanReviewRequired: true,
    immediateProtocolRequired: false,
    escalationStatus: "HUMAN_REVIEW_REQUIRED",
  },
  SUICIDAL: {
    normalSupportAllowed: true,
    clarificationRequired: true,
    structuredInterventionsAllowed: false,
    humanReviewRequired: true,
    immediateProtocolRequired: false,
    escalationStatus: "HUMAN_REVIEW_REQUIRED",
  },
  IMMINENT: {
    normalSupportAllowed: false,
    clarificationRequired: false,
    structuredInterventionsAllowed: false,
    humanReviewRequired: true,
    immediateProtocolRequired: true,
    escalationStatus: "IMMEDIATE_PROTOCOL",
  },
  MEDICAL_EMERGENCY: {
    normalSupportAllowed: false,
    clarificationRequired: false,
    structuredInterventionsAllowed: false,
    humanReviewRequired: true,
    immediateProtocolRequired: true,
    escalationStatus: "IMMEDIATE_PROTOCOL",
  },
};

export function getSafetyPolicy(state: SafetyState): SafetyPolicy {
  return POLICIES[state];
}
