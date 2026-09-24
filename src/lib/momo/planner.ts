import { getSafetyPolicy } from "../safety/policy.ts";
import type { SafetyState } from "../safety/schemas.ts";
import {
  momoDecisionSchema,
  type MomoDecision,
  type NormalizedConversationInput,
  type SupportMode,
} from "./schemas.ts";

function explicitSupportMode(message: string): SupportMode {
  if (/\b(?:calm down|ground me|breathe|breathing|panic|regulate)\b/i.test(message)) return "REGULATE";
  if (/\b(?:just listen|need to vent|let me vent|no advice)\b/i.test(message)) return "LISTEN";
  if (/\b(?:what should i do|give me advice|help me decide|next steps?)\b/i.test(message)) return "DIRECT_HELP";
  if (/\b(?:work through|understand this|think through|make sense of)\b/i.test(message)) return "WORK_THROUGH";
  return "UNCLEAR";
}

export function planMomoResponse(
  input: NormalizedConversationInput,
  safetyState: SafetyState
): MomoDecision {
  const policy = getSafetyPolicy(safetyState);
  const supportMode = explicitSupportMode(input.messageText);
  const intervention = !policy.normalSupportAllowed
    ? "PROFESSIONAL_SUPPORT"
    : !policy.structuredInterventionsAllowed
      ? "PCT_LISTENING"
      : supportMode === "REGULATE"
        ? "RELAXATION"
        : supportMode === "DIRECT_HELP"
          ? "PROBLEM_SOLVING"
          : "PCT_LISTENING";

  return momoDecisionSchema.parse({
    supportMode,
    intervention,
    emotionalContext: [],
    shouldClarify: policy.clarificationRequired,
    needsProfessionalSupport: policy.humanReviewRequired,
    safetyState,
  });
}
