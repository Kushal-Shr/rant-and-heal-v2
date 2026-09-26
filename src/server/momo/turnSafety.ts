import { evaluateConversationSafetyWithClassifier } from "@/src/lib/safety/detector";
import type { NormalizedConversationInput } from "@/src/lib/momo/schemas";
import type { SafetyEvaluation } from "@/src/lib/safety/schemas";
import { classifySafetyRisk } from "@/src/server/safety/classifier";

/** Deterministic/contextual safety runs first; the model is a fallible second opinion. */
export async function assessMomoTurnSafety(
  input: NormalizedConversationInput
): Promise<SafetyEvaluation> {
  return evaluateConversationSafetyWithClassifier(input, classifySafetyRisk);
}
