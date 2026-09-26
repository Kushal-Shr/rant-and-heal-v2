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
}).strict().superRefine((inference, context) => {
  if (inference.shouldClarify && !inference.clarificationTarget) {
    context.addIssue({
      code: "custom",
      path: ["clarificationTarget"],
      message: "A clarification target is required when shouldClarify is true.",
    });
  }
  if (!inference.shouldClarify && inference.clarificationTarget) {
    context.addIssue({
      code: "custom",
      path: ["clarificationTarget"],
      message: "A clarification target must be null when shouldClarify is false.",
    });
  }
  if (inference.supportMode === "UNCLEAR" && !inference.shouldClarify) {
    context.addIssue({
      code: "custom",
      path: ["shouldClarify"],
      message: "UNCLEAR routing must request a targeted clarification.",
    });
  }
});
export type MomoPlannerInference = z.infer<typeof momoPlannerInferenceSchema>;

export const conversationTurnSchema = z.object({
  role: z.enum(["USER", "MOMO"]),
  text: z.string().trim().min(1).max(8000),
}).strict();
export type ConversationTurn = z.infer<typeof conversationTurnSchema>;

export const conversationParticipantSchema = z.object({
  isAnonymous: z.boolean(),
  preferredName: z.string().trim().min(1).max(40).optional(),
}).strict();
export type ConversationParticipant = z.infer<typeof conversationParticipantSchema>;

export const CONTINUITY_GOALS = [
  "VENT",
  "BE_HEARD",
  "UNDERSTAND",
  "PRACTICAL_HELP",
  "MAKE_PLAN",
  "REGULATE",
  "STOP_INTERVENTION",
  "UNKNOWN",
] as const;
export const continuityGoalSchema = z.enum(CONTINUITY_GOALS);
export type ContinuityGoal = z.infer<typeof continuityGoalSchema>;

export const CONTINUITY_PREFERENCES = [
  "NO_ADVICE",
  "NO_QUESTIONS",
  "RANT_FIRST",
  "PRACTICAL_HELP",
  "ONE_STEP_AT_A_TIME",
  "MINIMAL_OPTIONS",
] as const;
export const continuityPreferenceSchema = z.enum(CONTINUITY_PREFERENCES);
export type ContinuityPreference = z.infer<typeof continuityPreferenceSchema>;

export const INTERVENTION_APPROACHES = [
  "BREATHING",
  "GROUNDING",
  "PMR",
  "GUIDED_IMAGERY",
  "MINDFUL_PAUSE",
  "CBT_RESTRUCTURING",
  "PROBLEM_SOLVING",
  "TASK_LISTING",
  "OTHER_REGULATION",
] as const;
export const interventionApproachSchema = z.enum(INTERVENTION_APPROACHES);
export type InterventionApproach = z.infer<typeof interventionApproachSchema>;

export const INTERVENTION_OUTCOMES = [
  "HELPED",
  "NO_CHANGE",
  "WORSE",
  "STOPPED",
  "REJECTED",
  "UNKNOWN",
] as const;
export const interventionOutcomeSchema = z.enum(INTERVENTION_OUTCOMES);
export type InterventionOutcome = z.infer<typeof interventionOutcomeSchema>;

export const RESPONSE_SHAPES = [
  "ACKNOWLEDGEMENT",
  "REFLECTION",
  "QUESTION",
  "DIRECT_ANSWER",
  "ADVICE",
  "EXERCISE",
  "VALIDATION",
] as const;
export const responseShapeSchema = z.enum(RESPONSE_SHAPES);
export type ResponseShape = z.infer<typeof responseShapeSchema>;

export const interventionOutcomeRecordSchema = z.object({
  approach: interventionApproachSchema,
  outcome: interventionOutcomeSchema,
  goal: continuityGoalSchema,
  recordedAt: z.string().datetime({ offset: true }),
}).strict();
export type InterventionOutcomeRecord = z.infer<typeof interventionOutcomeRecordSchema>;

export const userCorrectionSchema = z.object({
  rejectedTerm: z.string().trim().min(1).max(80),
  preferredTerm: z.string().trim().min(1).max(80),
  recordedAt: z.string().datetime({ offset: true }),
}).strict();
export type UserCorrection = z.infer<typeof userCorrectionSchema>;

export const conversationContinuityStateSchema = z.object({
  version: z.literal(1),
  currentSupportMode: supportModeSchema.optional(),
  currentGoal: continuityGoalSchema,
  explicitPreferences: z.array(continuityPreferenceSchema).max(8),
  rejectedApproaches: z.array(interventionApproachSchema).max(9),
  recentInterventions: z.array(interventionOutcomeRecordSchema).max(8),
  userCorrections: z.array(userCorrectionSchema).max(6),
  optionOverload: z.boolean(),
  questionFatigue: z.boolean(),
  needsReassessment: z.boolean(),
  recentResponseShapes: z.array(responseShapeSchema).max(8),
  recentQuestionTargets: z.array(clarificationTargetSchema).max(4),
}).strict();
export type ConversationContinuityState = z.infer<typeof conversationContinuityStateSchema>;

export const normalizedConversationInputSchema = z.object({
  messageText: z.string().trim().min(1).max(4000),
  history: z.array(conversationTurnSchema).max(50),
  continuityState: conversationContinuityStateSchema.optional(),
  participant: conversationParticipantSchema.optional(),
}).strict();
export type NormalizedConversationInput = z.infer<typeof normalizedConversationInputSchema>;

export const normalizedMomoOutputSchema = z.object({
  message: z.string().trim().min(1),
  kind: z.enum(["MOMO_RESPONSE", "SAFETY_RESPONSE"]),
  decision: momoDecisionSchema.nullable(),
  safety: safetyEvaluationSchema,
}).strict();
export type NormalizedMomoOutput = z.infer<typeof normalizedMomoOutputSchema>;
