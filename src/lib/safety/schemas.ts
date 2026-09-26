import { z } from "zod";

export const SAFETY_STATES = [
  "NORMAL",
  "CLARIFY",
  "SELF_HARM",
  "SUICIDAL",
  "IMMINENT",
  "MEDICAL_EMERGENCY",
] as const;

export const safetyStateSchema = z.enum(SAFETY_STATES);
export type SafetyState = z.infer<typeof safetyStateSchema>;

export const safetyResolutionSchema = z.enum([
  "RESOLVED_NORMAL",
  "ASSESSING",
  "UNRESOLVED",
]);
export type SafetyResolution = z.infer<typeof safetyResolutionSchema>;

export const safetyAssessmentStepSchema = z.enum([
  "CLARIFY_MEANING",
  "CHECK_SUICIDAL_INTENT",
  "CHECK_ALREADY_ACTED",
  "CHECK_CURRENT_IMMEDIACY",
  "CHECK_ACCESS",
  "CHECK_ALONE",
  "CHECK_SAFE_PERSON",
  "CREATE_DISTANCE",
  "CLARIFY_TARGET",
  "MEDICAL_TRIAGE",
  "VERIFY_RETRACTED_CLAIM",
  "AWAIT_HUMAN_REVIEW",
  "NONE",
]);
export type SafetyAssessmentStep = z.infer<typeof safetyAssessmentStepSchema>;

export const reviewUrgencySchema = z.enum(["NONE", "ROUTINE", "URGENT", "IMMEDIATE"]);
export type ReviewUrgency = z.infer<typeof reviewUrgencySchema>;

export const policyApprovalStatusSchema = z.enum(["RESEARCH_DRAFT", "CLINICIAN_APPROVED"]);
export type PolicyApprovalStatus = z.infer<typeof policyApprovalStatusSchema>;

export const externalActionStatusSchema = z.enum(["REQUESTED", "STARTED", "CONFIRMED", "FAILED"]);
export type ExternalActionStatus = z.infer<typeof externalActionStatusSchema>;

export const safetyTriggerTypeSchema = z.enum([
  "NONE",
  "AMBIGUOUS_LANGUAGE",
  "SELF_HARM_DISCLOSURE",
  "SUICIDAL_IDEATION",
  "IMMINENT_DANGER",
  "OTHER_DIRECTED_THREAT",
  "MEDICAL_EMERGENCY",
  "MODEL_CONCERN",
  "UNRESOLVED_FOLLOW_UP",
]);
export type SafetyTriggerType = z.infer<typeof safetyTriggerTypeSchema>;

export const riskLevelSchema = z.enum(["SAFE", "CONCERNING", "IMMINENT"]);
export const safetyCategorySchema = z.enum(["SELF_HARM", "HARM_TO_OTHERS"]);
export const safetyLanguageSchema = z.enum(["EN", "NE"]);
export const safetyTargetSchema = z.enum(["NONE", "SELF", "OTHER", "BOTH", "UNCLEAR"]);
export type SafetyTarget = z.infer<typeof safetyTargetSchema>;

export const modelSafetyEvidenceSchema = z.enum([
  "SELF_DIRECTED_HARM",
  "DEATH_OR_NONEXISTENCE",
  "SUICIDAL_IDEATION",
  "PLAN_OR_ACCESS",
  "IMMEDIACY",
  "INABILITY_TO_STAY_SAFE",
  "ATTEMPT_OR_INJURY",
  "HARM_TO_OTHERS",
  "INTENT",
]);
export type ModelSafetyEvidence = z.infer<typeof modelSafetyEvidenceSchema>;

export const ruleRiskAssessmentSchema = z.object({
  level: riskLevelSchema,
  target: safetyTargetSchema,
  category: safetyCategorySchema.optional(),
  language: safetyLanguageSchema.optional(),
  suggestedState: safetyStateSchema.optional(),
  assessmentStep: safetyAssessmentStepSchema.optional(),
  matchedSignals: z.array(z.string().min(1).max(80)).max(20),
}).strict();
export type RuleRiskAssessment = z.infer<typeof ruleRiskAssessmentSchema>;

export const modelRiskAssessmentSchema = z.object({
  level: riskLevelSchema,
  target: safetyTargetSchema,
  category: safetyCategorySchema.nullable(),
  evidence: z.array(modelSafetyEvidenceSchema).max(8),
}).strict().superRefine((value, context) => {
  if (value.level === "SAFE") {
    if (value.target !== "NONE" || value.category !== null || value.evidence.length !== 0) {
      context.addIssue({
        code: "custom",
        message: "SAFE assessments must use target NONE without a risk category or safety evidence",
      });
    }
    return;
  }
  if (value.target === "NONE" || value.evidence.length === 0) {
    context.addIssue({
      code: "custom",
      message: "Non-safe assessments require a safety target and explicit safety evidence",
    });
  }
  if (value.target === "SELF" && value.category !== "SELF_HARM") {
    context.addIssue({ code: "custom", message: "SELF target requires SELF_HARM category" });
  }
  if (value.target === "OTHER" && value.category !== "HARM_TO_OTHERS") {
    context.addIssue({ code: "custom", message: "OTHER target requires HARM_TO_OTHERS category" });
  }
  if ((value.target === "BOTH" || value.target === "UNCLEAR") && value.category !== null) {
    context.addIssue({ code: "custom", message: "BOTH and UNCLEAR targets use a null legacy category" });
  }
});
export type ModelRiskAssessment = z.infer<typeof modelRiskAssessmentSchema>;

export const escalationStatusSchema = z.enum([
  "NONE",
  "CLARIFICATION_REQUIRED",
  "HUMAN_REVIEW_REQUIRED",
  "IMMEDIATE_PROTOCOL",
]);
export type EscalationStatus = z.infer<typeof escalationStatusSchema>;

export const safetyEvaluationSchema = z.object({
  state: safetyStateSchema,
  safetyTarget: safetyTargetSchema,
  resolution: safetyResolutionSchema,
  assessmentStep: safetyAssessmentStepSchema,
  requiresHumanReview: z.boolean(),
  reviewUrgency: reviewUrgencySchema,
  triggerType: safetyTriggerTypeSchema,
  policyApprovalStatus: policyApprovalStatusSchema,
  deterministic: ruleRiskAssessmentSchema,
  model: modelRiskAssessmentSchema.nullable(),
  escalationStatus: escalationStatusSchema,
}).strict();
export type SafetyEvaluation = z.infer<typeof safetyEvaluationSchema>;

export const safetyEventSchema = z.object({
  userId: z.string().min(1).max(128),
  sessionId: z.string().min(1).max(128),
  state: safetyStateSchema,
  safetyResolution: safetyResolutionSchema,
  assessmentStep: safetyAssessmentStepSchema,
  requiresHumanReview: z.boolean(),
  reviewUrgency: reviewUrgencySchema,
  triggerType: safetyTriggerTypeSchema,
  safetyTarget: safetyTargetSchema,
  category: safetyCategorySchema.optional(),
  source: z.enum(["TEXT", "VOICE"]),
  status: escalationStatusSchema,
  policyVersion: z.string().min(1).max(80),
  matchedSignals: z.array(z.string().min(1).max(80)).max(20),
}).strict();
export type SafetyEvent = z.infer<typeof safetyEventSchema>;
