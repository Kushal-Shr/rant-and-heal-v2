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

export const INTERVENTIONS = [
  "NONE",
  "PCT_LISTENING",
  "CBT_GUIDED_DISCOVERY",
  "CBT_RESTRUCTURING",
  "PROBLEM_SOLVING",
  "RELAXATION",
  "PROFESSIONAL_SUPPORT",
] as const;
export const interventionSchema = z.enum(INTERVENTIONS);
export type Intervention = z.infer<typeof interventionSchema>;

export const momoDecisionSchema = z.object({
  supportMode: supportModeSchema,
  intervention: interventionSchema,
  emotionalContext: z.array(z.string().trim().min(1).max(80)).max(12),
  primaryIssue: z.string().trim().min(1).max(240).optional(),
  shouldClarify: z.boolean(),
  needsProfessionalSupport: z.boolean(),
  safetyState: safetyStateSchema,
}).strict();
export type MomoDecision = z.infer<typeof momoDecisionSchema>;

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
