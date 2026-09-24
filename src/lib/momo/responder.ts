import type { MomoDecision } from "./schemas.ts";

export function momoDecisionInstruction(decision: MomoDecision): string {
  const modeDirections: Record<MomoDecision["supportMode"], string> = {
    LISTEN: "Reflect the specific situation and its emotional meaning. Do not give advice, challenge thoughts, or introduce an exercise. A question is optional and only useful if it helps the user feel heard rather than moving them into problem-solving.",
    WORK_THROUGH: "Acknowledge the user's experience before exploring it collaboratively. Use one useful question or one useful perspective at a time; do not turn the response into a questionnaire.",
    DIRECT_HELP: "Give practical, organized help before asking anything else. Do not respond with another unnecessary question. Offer options or a small next step without taking over a major life decision.",
    REGULATE: "Reduce cognitive load and pause analysis or cognitive challenging. Keep the response short and steady. Recognize that settling comes first, but do not improvise a full multi-step relaxation protocol in this sprint.",
    UNCLEAR: "Ask exactly one natural question aimed at the specified missing information. Do not add advice, an exercise, or several follow-up questions.",
  };
  const interventionDirections: Record<MomoDecision["intervention"], string> = {
    NONE: "Do not start an intervention yet.",
    PCT_LISTENING: "Stay with person-centered listening and specific reflection.",
    PCT_EXPLORATION: "Explore the person's experience and meaning without assuming hidden causes.",
    CBT_RESTRUCTURING: "Use collaborative, natural cognitive exploration. Do not label a distortion, assume the thought is false, or skip emotional acknowledgment.",
    PROBLEM_SOLVING: "Offer a manageable set of practical options and preserve the user's choice.",
    RELAXATION: "Treat regulation as the immediate direction, not as a cure or a way to suppress an emotion the user wants to discuss.",
    PROFESSIONAL_SUPPORT: "Keep appropriate human or professional support prominent and do not lead with CBT.",
  };
  const directions = [modeDirections[decision.supportMode], interventionDirections[decision.intervention]];
  if (decision.shouldClarify) {
    directions.push(`The one clarification must target: ${decision.clarificationTarget}.`);
  }
  return `Application routing guidance (do not mention this routing metadata):\n${directions.join("\n")}`;
}

export function composeMomoSystemInstruction(
  baseInstruction: string,
  decision: MomoDecision
): string {
  return `${baseInstruction}\n\n${momoDecisionInstruction(decision)}`;
}
