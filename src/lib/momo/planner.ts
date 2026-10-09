import { detectExplicitSupportPreference, type ExplicitPreference } from "./supportPreferences.ts";
export { detectExplicitSupportPreference } from "./supportPreferences.ts";
import { getSafetyPolicy } from "../safety/policy.ts";
import type { SafetyState } from "../safety/schemas.ts";
import {
  isContextDependentShortReply,
  supportModeFromContinuity,
} from "./continuity.ts";
import {
  momoDecisionSchema,
  momoPlannerInferenceSchema,
  type MomoDecision,
  type NormalizedConversationInput,
  type SupportMode,
} from "./schemas.ts";

function safetyConstrainedDecision(safetyState: SafetyState): MomoDecision | null {
  const policy = getSafetyPolicy(safetyState);
  if (policy.ordinaryInterventionAllowed) return null;

  return momoDecisionSchema.parse({
    supportMode: "UNCLEAR",
    primaryNeed: safetyState === "CLARIFY" ? "UNKNOWN" : "PROFESSIONAL_SUPPORT",
    intervention: safetyState === "CLARIFY" ? "PCT_LISTENING" : "PROFESSIONAL_SUPPORT",
    confidence: "HIGH",
    shouldClarify: policy.clarificationRequired,
    ...(policy.clarificationRequired ? { clarificationTarget: "OTHER" } : {}),
    userPreferenceOverride: false,
    safetyState,
  });
}

function modeDefaults(supportMode: Exclude<SupportMode, "UNCLEAR">): Pick<ExplicitPreference, "primaryNeed" | "intervention"> {
  if (supportMode === "LISTEN") return { primaryNeed: "VENT", intervention: "PCT_LISTENING" };
  if (supportMode === "WORK_THROUGH") return { primaryNeed: "UNDERSTAND", intervention: "PCT_EXPLORATION" };
  if (supportMode === "DIRECT_HELP") return { primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING" };
  return { primaryNeed: "EMOTIONAL_REGULATION", intervention: "RELAXATION" };
}

function fallbackDecision(
  safetyState: SafetyState,
  input?: NormalizedConversationInput
): MomoDecision {
  const continuityMode = supportModeFromContinuity(input?.continuityState);
  const preserveContinuity = continuityMode && (
    input?.continuityState?.explicitPreferences.includes("NO_ADVICE") ||
    input?.continuityState?.questionFatigue ||
    input?.continuityState?.needsReassessment ||
    input?.continuityState?.optionOverload ||
    (input ? isContextDependentShortReply(input.messageText) : false)
  );
  if (preserveContinuity && continuityMode) {
    const defaults = modeDefaults(continuityMode);
    return momoDecisionSchema.parse({
      supportMode: continuityMode,
      primaryNeed: defaults.primaryNeed,
      intervention: input?.continuityState?.needsReassessment ? "NONE" : defaults.intervention,
      confidence: "MEDIUM",
      shouldClarify: false,
      userPreferenceOverride: false,
      safetyState,
    });
  }
  return momoDecisionSchema.parse({
    supportMode: "UNCLEAR",
    primaryNeed: "UNKNOWN",
    intervention: "NONE",
    confidence: "LOW",
    shouldClarify: !input?.continuityState?.questionFatigue,
    ...(!input?.continuityState?.questionFatigue ? { clarificationTarget: "SUPPORT_PREFERENCE" } : {}),
    userPreferenceOverride: false,
    safetyState,
  });
}

export function planMomoResponse(
  input: NormalizedConversationInput,
  safetyState: SafetyState,
  inferredRouting?: unknown
): MomoDecision {
  const constrained = safetyConstrainedDecision(safetyState);
  if (constrained) return constrained;

  const explicit = detectExplicitSupportPreference(input.messageText);
  if (explicit) {
    return momoDecisionSchema.parse({
      ...explicit,
      confidence: "HIGH",
      shouldClarify: false,
      userPreferenceOverride: true,
      safetyState,
    });
  }

  const inferred = momoPlannerInferenceSchema.safeParse(inferredRouting);
  if (!inferred.success) return fallbackDecision(safetyState, input);

  const continuityMode = supportModeFromContinuity(input.continuityState);
  const shortContextualReply = isContextDependentShortReply(input.messageText);
  const preserveContinuity = continuityMode && (
    shortContextualReply ||
    ((input.continuityState?.questionFatigue || input.continuityState?.needsReassessment || input.continuityState?.optionOverload) &&
      inferred.data.supportMode === "UNCLEAR")
  );
  const routing = preserveContinuity
    ? {
        ...inferred.data,
        supportMode: continuityMode,
        ...modeDefaults(continuityMode),
        shouldClarify: false,
        clarificationTarget: null,
      }
    : inferred.data;
  const noAdvice = input.continuityState?.explicitPreferences.some((preference) =>
    preference === "NO_ADVICE" || preference === "RANT_FIRST"
  );
  const preferenceConstrainedRouting = noAdvice
    ? {
        ...routing,
        supportMode: "LISTEN" as const,
        primaryNeed: "VENT" as const,
        intervention: "PCT_LISTENING" as const,
        shouldClarify: false,
        clarificationTarget: null,
      }
    : routing;
  const shouldClarify = input.continuityState?.questionFatigue
    ? false
    : preferenceConstrainedRouting.supportMode === "UNCLEAR" || preferenceConstrainedRouting.shouldClarify;
  const clarificationTarget = shouldClarify
    ? preferenceConstrainedRouting.clarificationTarget ?? "SUPPORT_PREFERENCE"
    : undefined;

  let intervention = preferenceConstrainedRouting.intervention;
  if (preferenceConstrainedRouting.supportMode === "LISTEN") intervention = "PCT_LISTENING";
  if (preferenceConstrainedRouting.supportMode === "REGULATE" && !input.continuityState?.needsReassessment) intervention = "RELAXATION";
  if (preferenceConstrainedRouting.supportMode === "UNCLEAR") intervention = "NONE";
  if (preferenceConstrainedRouting.supportMode === "WORK_THROUGH" && intervention === "PCT_LISTENING") {
    intervention = "PCT_EXPLORATION";
  }
  if (input.continuityState?.needsReassessment && !explicit) intervention = "NONE";
  if (intervention === "CBT_RESTRUCTURING" && input.continuityState?.rejectedApproaches.includes("CBT_RESTRUCTURING")) {
    intervention = "PCT_EXPLORATION";
  }

  return momoDecisionSchema.parse({
    supportMode: preferenceConstrainedRouting.supportMode,
    primaryNeed: preferenceConstrainedRouting.supportMode === "UNCLEAR" ? "UNKNOWN" : preferenceConstrainedRouting.primaryNeed,
    intervention,
    confidence: routing.confidence,
    shouldClarify,
    ...(clarificationTarget ? { clarificationTarget } : {}),
    userPreferenceOverride: false,
    safetyState,
  });
}

export type MomoRoutingInference = (
  input: NormalizedConversationInput
) => unknown | Promise<unknown>;

export async function planMomoResponseWithModel(
  input: NormalizedConversationInput,
  safetyState: SafetyState,
  infer: MomoRoutingInference,
  onInferenceError?: (error: unknown) => void
): Promise<MomoDecision> {
  const constrained = safetyConstrainedDecision(safetyState);
  if (constrained || detectExplicitSupportPreference(input.messageText)) {
    return constrained ?? planMomoResponse(input, safetyState);
  }

  try {
    return planMomoResponse(input, safetyState, await infer(input));
  } catch (error) {
    onInferenceError?.(error);
    return planMomoResponse(input, safetyState);
  }
}
