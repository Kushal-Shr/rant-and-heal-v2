import type { MomoDecision } from "./schemas.ts";

export function momoDecisionInstruction(decision: MomoDecision): string {
  const modeDirections: Record<MomoDecision["supportMode"], string> = {
    LISTEN: "Use one to three short sentences. Reflect the specific situation and only emotions or meanings the user actually stated. Do not give advice, challenge thoughts, or introduce an exercise. Do not force a question. A question is optional; ask at most one only when it fills a useful gap. Leave space for the user to continue.",
    WORK_THROUGH: "Use two to four short sentences. Understand the user's stated experience before exploring it collaboratively. Use at most one useful question or one useful perspective at a time; do not label a distortion, assert an unstated emotion, or turn the response into a questionnaire.",
    DIRECT_HELP: "Give practical, organized help before asking anything else. Answer first with one to three useful points and no unnecessary empathy preamble. Do not respond with another unnecessary question. Avoid immediate interrogation or an advice avalanche. Offer options or a small next step without taking over a major life decision; the final decision remains the user's.",
    REGULATE: "Reduce cognitive load and pause analysis or cognitive challenging. Avoid interpretation. Give one manageable instruction or anchor at a time in very short language; do not improvise a full multi-step relaxation protocol in this sprint.",
    UNCLEAR: "Use a brief neutral acknowledgement. Ask exactly one natural question to clarify the specified missing information. Do not add advice, an exercise, multiple questions, or several guesses about the user's emotions.",
  };
  const interventionDirections: Record<MomoDecision["intervention"], string> = {
    NONE: "Do not start an intervention yet.",
    PCT_LISTENING: "Stay with person-centered listening and content-grounded reflection; do not manufacture emotional intensity.",
    PCT_EXPLORATION: "Explore the person's stated experience and meaning without assuming hidden causes or assigning an emotion they did not name.",
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
