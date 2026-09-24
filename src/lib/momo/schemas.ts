import { z } from "zod";
import { safetyEvaluationSchema, safetyStateSchema } from "../safety/schemas.ts";

export const SUPPORT_MODES = [
  "LISTEN",
  "WORK_THROUGH",
  "DIRECT_HELP",
  "REGULATE",
  "UNCLEAR",
] as const;
export const supportModeSchema = z.enum(SUPPORT_MODES);
export type SupportMode = z.infer<typeof supportModeSchema>;

export const PRIMARY_NEEDS = [
  "VENT",
  "UNDERSTAND",
  "PRACTICAL_HELP",
  "COGNITIVE_SUPPORT",
  "EMOTIONAL_REGULATION",
  "PROFESSIONAL_SUPPORT",
  "UNKNOWN",
] as const;
export const primaryNeedSchema = z.enum(PRIMARY_NEEDS);
export type PrimaryNeed = z.infer<typeof primaryNeedSchema>;

export const INTERVENTIONS = [
  "NONE",
  "PCT_LISTENING",
  "PCT_EXPLORATION",
  "CBT_RESTRUCTURING",
  "PROBLEM_SOLVING",
  "RELAXATION",
  "PROFESSIONAL_SUPPORT",
] as const;
export const interventionSchema = z.enum(INTERVENTIONS);
export type Intervention = z.infer<typeof interventionSchema>;

export const PLANNER_CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export const plannerConfidenceSchema = z.enum(PLANNER_CONFIDENCE_LEVELS);
export type PlannerConfidence = z.infer<typeof plannerConfidenceSchema>;

export const CLARIFICATION_TARGETS = [
  "SUPPORT_PREFERENCE",
  "SITUATION",
  "EMOTION",
  "THOUGHT",
  "GOAL",
  "OTHER",
] as const;
export const clarificationTargetSchema = z.enum(CLARIFICATION_TARGETS);
export type ClarificationTarget = z.infer<typeof clarificationTargetSchema>;

export const momoDecisionSchema = z.object({
  supportMode: supportModeSchema,
  primaryNeed: primaryNeedSchema,
  intervention: interventionSchema,
  confidence: plannerConfidenceSchema,
  shouldClarify: z.boolean(),
  clarificationTarget: clarificationTargetSchema.optional(),
  userPreferenceOverride: z.boolean(),
  safetyState: safetyStateSchema,
}).strict().superRefine((decision, context) => {
  if (decision.shouldClarify && !decision.clarificationTarget) {
    context.addIssue({
      code: "custom",
      path: ["clarificationTarget"],
      message: "A clarification target is required when shouldClarify is true.",
    });
  }
  if (!decision.shouldClarify && decision.clarificationTarget) {
    context.addIssue({
      code: "custom",
      path: ["clarificationTarget"],
      message: "A clarification target is only allowed when shouldClarify is true.",
    });
  }
});
export type MomoDecision = z.infer<typeof momoDecisionSchema>;

// The inference model returns routing metadata only. Safety state and explicit
// preference precedence are owned by application code, not the model.
export const momoPlannerInferenceSchema = z.object({
  supportMode: supportModeSchema,
  primaryNeed: primaryNeedSchema,
  intervention: interventionSchema,
  confidence: plannerConfidenceSchema,
  shouldClarify: z.boolean(),
  clarificationTarget: clarificationTargetSchema.nullable(),
}).strict();
export type MomoPlannerInference = z.infer<typeof momoPlannerInferenceSchema>;

export const conversationTurnSchema = z.object({
  role: z.enum(["USER", "MOMO"]),
  text: z.string().trim().min(1).max(8000),
}).strict();
export type ConversationTurn = z.infer<typeof conversationTurnSchema>;

export const normalizedConversationInputSchema = z.object({
  messageText: z.string().trim().min(1).max(4000),
  history: z.array(conversationTurnSchema).max(50),
}).strict();
export type NormalizedConversationInput = z.infer<typeof normalizedConversationInputSchema>;

export const normalizedMomoOutputSchema = z.object({
  message: z.string().trim().min(1),
  kind: z.enum(["MOMO_RESPONSE", "SAFETY_RESPONSE"]),
  decision: momoDecisionSchema.nullable(),
  safety: safetyEvaluationSchema,
}).strict();
export type NormalizedMomoOutput = z.infer<typeof normalizedMomoOutputSchema>;
