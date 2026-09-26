import { getSafetyPolicy } from "../safety/policy.ts";
import type { SafetyState } from "../safety/schemas.ts";
import {
  isContextDependentShortReply,
  supportModeFromContinuity,
} from "./continuity.ts";
import {
  momoDecisionSchema,
  momoPlannerInferenceSchema,
  type Intervention,
  type MomoDecision,
  type NormalizedConversationInput,
  type PrimaryNeed,
  type SupportMode,
} from "./schemas.ts";

interface ExplicitPreference {
  supportMode: Exclude<SupportMode, "UNCLEAR">;
  primaryNeed: PrimaryNeed;
  intervention: Intervention;
}

const LISTEN_PATTERNS = [
  /\b(?:i\s+)?just\s+(?:need|want)\s+to\s+(?:vent|rant|talk|be\s+heard)\b/i,
  /\b(?:please\s+)?let\s+me\s+(?:vent|rant)\b/i,
  /\b(?:please\s+)?(?:just\s+)?listen(?:\s+to\s+me)?\b/i,
  /\bno\s+advice(?:\s+please)?\b/i,
  /\b(?:do\s+not|don['’]t|no)\s+(?:give|offer)\s+me\s+(?:any\s+)?advice\b/i,
  /\b(?:do\s+not|don['’]t|stop)\s+(?:trying\s+to\s+)?fix(?:ing)?\s+(?:me|everything|this)\b/i,
  /\b(?:i\s+)?(?:do\s+not|don['’]t)\s+want\s+to\s+do\s+(?:a\s+)?(?:thought|cbt)\s+exercise\b/i,
  /(?:मलाई\s*)?(?:सल्लाह\s*नदिनु|बस\s*सुन(?:िदिनु)?|केवल\s*सुन(?:िदिनु)?|कुरा\s*पोख्न\s*(?:दिनु|छ))/i,
  /\b(?:malai\s+)?(?:sallah\s+nadinu|bas\s+sun(?:a|i)?dinu|kura\s+matra\s+suna|vent\s+garna\s+(?:cha|man\s+cha))\b/i,
];

const DIRECT_HELP_PATTERNS = [
  /\b(?:stop|quit)\s+asking\s+(?:me\s+)?questions?\b/i,
  /\b(?:no|not)\s+more\s+questions?\b/i,
  /\bjust\s+(?:give|tell)\s+me\s+(?:an?\s+)?(?:answer|what\s+to\s+do)\b/i,
  /\bwhat\s+do\s+you\s+think\s+i\s+should\s+(?:actually\s+)?do\b/i,
  /\bwhat\s+should\s+i\s+(?:actually\s+)?do(?:\s+(?:now|today|tomorrow|next))?\b/i,
  /\b(?:give|offer)\s+me\s+(?:some\s+)?(?:ideas|options|advice|next\s+steps?)\b/i,
  /\b(?:help\s+me\s+decide|tell\s+me\s+what\s+i\s+can\s+(?:actually\s+)?do)\b/i,
  /(?:प्रश्न\s*नसोध|सिधै\s*भन|के\s*गर्ने\s*भन|केही\s*उपाय\s*देऊ)/i,
  /\b(?:prasna\s+nasodha|sidhai\s+bhana|ke\s+garne\s+bhana|kehi\s+upaya\s+deu)\b/i,
];

const REGULATE_PATTERNS = [
  /\b(?:i\s+)?(?:need|want)\s+to\s+(?:calm|settle)\s+down(?:\s+first)?\b/i,
  /\bhelp\s+me\s+(?:calm|settle|ground|regulate)(?:\s+down)?\b/i,
  /\b(?:can|could)\s+we\s+(?:pause|ground|breathe)\b/i,
  /(?:शान्त\s*हुन\s*(?:मद्दत|मन)|मन\s*शान्त\s*पार्न|सास\s*फेर्न\s*मद्दत)/i,
  /\b(?:shanta\s+huna|man\s+shanta|saas\s+ferna)\s+(?:madat|help)\b/i,
];

const WORK_THROUGH_PATTERNS = [
  /\b(?:can|could|will|would)\s+(?:you|we)\s+(?:actually\s+)?(?:help\s+me\s+)?(?:work|talk|think)\s+through\b/i,
  /\bhelp\s+me\s+(?:understand|make\s+sense\s+of|challenge|examine)\b/i,
  /\bwhy\s+does\s+this\s+keep\s+happening\b/i,
  /\b(?:can|could)\s+we\s+(?:figure|find)\s+out\s+why\b/i,
  /\blet['’]s\s+(?:do\s+cbt|work\s+through|look\s+at\s+this\s+thought)\b/i,
  /(?:बुझ्न\s*मद्दत|सँगै\s*बुझौँ|यो\s*विचार\s*हेरौँ)/i,
  /\b(?:bujhna\s+madat|sangai\s+bujhau|yo\s+bichar\s+herau)\b/i,
];

const CBT_REQUEST_PATTERN = /\b(?:cbt|challenge\s+(?:this|that|my)\s+thought|examine\s+(?:this|that|my)\s+(?:thought|belief))\b/i;

function matchesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message));
}

export function detectExplicitSupportPreference(message: string): ExplicitPreference | null {
  const normalized = message.normalize("NFKC").trim();

  // Refusing advice or an exercise is more specific than incidental words such
  // as "panic" or "help" elsewhere in the same message.
  if (matchesAny(normalized, LISTEN_PATTERNS)) {
    return { supportMode: "LISTEN", primaryNeed: "VENT", intervention: "PCT_LISTENING" };
  }
  if (matchesAny(normalized, DIRECT_HELP_PATTERNS)) {
    return { supportMode: "DIRECT_HELP", primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING" };
  }
  if (matchesAny(normalized, REGULATE_PATTERNS)) {
    return { supportMode: "REGULATE", primaryNeed: "EMOTIONAL_REGULATION", intervention: "RELAXATION" };
  }
  if (matchesAny(normalized, WORK_THROUGH_PATTERNS)) {
    const cbtRequested = CBT_REQUEST_PATTERN.test(normalized);
    return {
      supportMode: "WORK_THROUGH",
      primaryNeed: cbtRequested ? "COGNITIVE_SUPPORT" : "UNDERSTAND",
      intervention: cbtRequested ? "CBT_RESTRUCTURING" : "PCT_EXPLORATION",
    };
  }
  return null;
}

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
    shouldClarify: true,
    clarificationTarget: "SUPPORT_PREFERENCE",
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
  const preferenceConstrainedRouting = noAdvice && routing.supportMode === "DIRECT_HELP"
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
