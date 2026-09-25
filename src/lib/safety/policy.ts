import type {
  EscalationStatus,
  PolicyApprovalStatus,
  ReviewUrgency,
  SafetyAssessmentStep,
  SafetyEvaluation,
  SafetyState,
} from "./schemas.ts";

export type SafetyResponseLength = "STANDARD" | "SHORT" | "VERY_SHORT";
export type SafetyResponseStyle = "ORDINARY_PCT" | "WARM_DIRECT" | "URGENT_DIRECT" | "MEDICAL_DIRECT";

export interface SafetyPolicy {
  ordinaryInterventionAllowed: boolean;
  normalSupportAllowed: boolean;
  clarificationRequired: boolean;
  structuredInterventionsAllowed: boolean;
  humanReviewRequired: boolean;
  reviewUrgency: ReviewUrgency;
  immediateProtocolRequired: boolean;
  medicalPriority: boolean;
  defaultAssessmentStep: SafetyAssessmentStep;
  responseLength: SafetyResponseLength;
  responseStyle: SafetyResponseStyle;
  approvalStatus: PolicyApprovalStatus;
  escalationStatus: EscalationStatus;
}

const POLICIES: Record<SafetyState, SafetyPolicy> = {
  NORMAL: {
    ordinaryInterventionAllowed: true,
    normalSupportAllowed: true,
    clarificationRequired: false,
    structuredInterventionsAllowed: true,
    humanReviewRequired: false,
    reviewUrgency: "NONE",
    immediateProtocolRequired: false,
    medicalPriority: false,
    defaultAssessmentStep: "NONE",
    responseLength: "STANDARD",
    responseStyle: "ORDINARY_PCT",
    approvalStatus: "RESEARCH_DRAFT",
    escalationStatus: "NONE",
  },
  CLARIFY: {
    ordinaryInterventionAllowed: false,
    normalSupportAllowed: false,
    clarificationRequired: true,
    structuredInterventionsAllowed: false,
    humanReviewRequired: false,
    reviewUrgency: "NONE",
    immediateProtocolRequired: false,
    medicalPriority: false,
    defaultAssessmentStep: "CLARIFY_MEANING",
    responseLength: "SHORT",
    responseStyle: "WARM_DIRECT",
    approvalStatus: "RESEARCH_DRAFT",
    escalationStatus: "CLARIFICATION_REQUIRED",
  },
  SELF_HARM: {
    ordinaryInterventionAllowed: false,
    normalSupportAllowed: false,
    clarificationRequired: true,
    structuredInterventionsAllowed: false,
    // Mandatory review for confirmed non-suicidal self-harm remains a
    // clinician-policy decision. Unresolved answers can elevate this at runtime.
    humanReviewRequired: false,
    reviewUrgency: "NONE",
    immediateProtocolRequired: false,
    medicalPriority: false,
    defaultAssessmentStep: "CHECK_SUICIDAL_INTENT",
    responseLength: "SHORT",
    responseStyle: "WARM_DIRECT",
    approvalStatus: "RESEARCH_DRAFT",
    escalationStatus: "CLARIFICATION_REQUIRED",
  },
  SUICIDAL: {
    ordinaryInterventionAllowed: false,
    normalSupportAllowed: false,
    clarificationRequired: true,
    structuredInterventionsAllowed: false,
    humanReviewRequired: true,
    reviewUrgency: "URGENT",
    immediateProtocolRequired: false,
    medicalPriority: false,
    defaultAssessmentStep: "CHECK_CURRENT_IMMEDIACY",
    responseLength: "SHORT",
    responseStyle: "WARM_DIRECT",
    approvalStatus: "RESEARCH_DRAFT",
    escalationStatus: "HUMAN_REVIEW_REQUIRED",
  },
  IMMINENT: {
    ordinaryInterventionAllowed: false,
    normalSupportAllowed: false,
    clarificationRequired: false,
    structuredInterventionsAllowed: false,
    humanReviewRequired: true,
    reviewUrgency: "IMMEDIATE",
    immediateProtocolRequired: true,
    medicalPriority: false,
    defaultAssessmentStep: "CHECK_ALONE",
    responseLength: "VERY_SHORT",
    responseStyle: "URGENT_DIRECT",
    approvalStatus: "RESEARCH_DRAFT",
    escalationStatus: "IMMEDIATE_PROTOCOL",
  },
  MEDICAL_EMERGENCY: {
    ordinaryInterventionAllowed: false,
    normalSupportAllowed: false,
    clarificationRequired: false,
    structuredInterventionsAllowed: false,
    humanReviewRequired: true,
    reviewUrgency: "IMMEDIATE",
    immediateProtocolRequired: true,
    medicalPriority: true,
    defaultAssessmentStep: "MEDICAL_TRIAGE",
    responseLength: "VERY_SHORT",
    responseStyle: "MEDICAL_DIRECT",
    approvalStatus: "RESEARCH_DRAFT",
    escalationStatus: "IMMEDIATE_PROTOCOL",
  },
};

export function getSafetyPolicy(state: SafetyState): SafetyPolicy {
  return POLICIES[state];
}

export function shouldAttemptSafetySupportNotification(
  evaluation: SafetyEvaluation
): evaluation is SafetyEvaluation & {
  state: "IMMINENT" | "MEDICAL_EMERGENCY";
  reviewUrgency: "IMMEDIATE";
} {
  return evaluation.reviewUrgency === "IMMEDIATE" &&
    (evaluation.state === "IMMINENT" || evaluation.state === "MEDICAL_EMERGENCY");
}
