import { getSafetyPolicy } from "../safety/policy.ts";
import type { SafetyEvaluation } from "../safety/schemas.ts";
import {
  normalizedConversationInputSchema,
  normalizedMomoOutputSchema,
  type MomoDecision,
  type NormalizedConversationInput,
  type NormalizedMomoOutput,
} from "./schemas.ts";

export interface MomoOrchestratorDependencies {
  evaluateSafety(messageText: string): SafetyEvaluation | Promise<SafetyEvaluation>;
  plan(input: NormalizedConversationInput, safetyState: SafetyEvaluation["state"]): MomoDecision | Promise<MomoDecision>;
  respond(input: NormalizedConversationInput, decision: MomoDecision): Promise<string>;
  safetyResponse(evaluation: SafetyEvaluation): string | Promise<string>;
}

export async function orchestrateMomoTurn(
  rawInput: NormalizedConversationInput,
  dependencies: MomoOrchestratorDependencies
): Promise<NormalizedMomoOutput> {
  const input = normalizedConversationInputSchema.parse(rawInput);
  const safety = await dependencies.evaluateSafety(input.messageText);
  const policy = getSafetyPolicy(safety.state);

  if (policy.immediateProtocolRequired) {
    return normalizedMomoOutputSchema.parse({
      message: await dependencies.safetyResponse(safety),
      kind: "SAFETY_RESPONSE",
      decision: null,
      safety,
    });
  }

  const decision = await dependencies.plan(input, safety.state);
  return normalizedMomoOutputSchema.parse({
    message: await dependencies.respond(input, decision),
    kind: "MOMO_RESPONSE",
    decision,
    safety,
  });
}
