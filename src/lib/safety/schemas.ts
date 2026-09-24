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

export const riskLevelSchema = z.enum(["SAFE", "CONCERNING", "IMMINENT"]);
export const safetyCategorySchema = z.enum(["SELF_HARM", "HARM_TO_OTHERS"]);
export const safetyLanguageSchema = z.enum(["EN", "NE"]);

export const ruleRiskAssessmentSchema = z.object({
  level: riskLevelSchema,
  category: safetyCategorySchema.optional(),
  language: safetyLanguageSchema.optional(),
  matchedSignals: z.array(z.string().min(1).max(80)).max(20),
}).strict();
export type RuleRiskAssessment = z.infer<typeof ruleRiskAssessmentSchema>;

export const modelRiskAssessmentSchema = z.object({
  level: riskLevelSchema,
  category: safetyCategorySchema.nullable(),
  rationale: z.string().min(1).max(240),
}).strict();
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
  deterministic: ruleRiskAssessmentSchema,
  model: modelRiskAssessmentSchema.nullable(),
  escalationStatus: escalationStatusSchema,
}).strict();
export type SafetyEvaluation = z.infer<typeof safetyEvaluationSchema>;

export const safetyEventSchema = z.object({
  state: safetyStateSchema,
  category: safetyCategorySchema.optional(),
  source: z.enum(["TEXT", "VOICE"]),
  status: escalationStatusSchema,
  policyVersion: z.string().min(1).max(80),
  matchedSignals: z.array(z.string().min(1).max(80)).max(20),
}).strict();
export type SafetyEvent = z.infer<typeof safetyEventSchema>;
