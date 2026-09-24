import type { MomoDecision } from "./schemas.ts";

export function momoDecisionInstruction(decision: MomoDecision): string {
  const directions = [
    `Support mode: ${decision.supportMode}.`,
    `Permitted response approach: ${decision.intervention}.`,
  ];
  if (decision.shouldClarify) directions.push("Ask one clear safety-relevant clarification before offering a structured intervention.");
  if (decision.needsProfessionalSupport) directions.push("Keep professional or immediate human support prominent and do not lead with CBT.");
  return `Application routing guidance (do not mention this routing metadata):\n${directions.join("\n")}`;
}
