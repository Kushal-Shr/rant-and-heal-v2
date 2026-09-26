import type { MomoDecision } from "./schemas.ts";

export function momoDecisionInstruction(decision: MomoDecision): string {
  const modeDirections: Record<MomoDecision["supportMode"], string> = {
    LISTEN: "Use one to three short sentences. Reflect the specific situation and only emotions or meanings the user actually stated. Do not merely paraphrase or synonym-swap the message: briefly connect confirmed details to their grounded significance when the user supplied that connection; otherwise a simple acknowledgement or space to continue is enough. Do not give advice, challenge thoughts, or introduce an exercise. Do not force a question. A question is optional; ask at most one only when it fills a useful gap. Silence or conversational space is acceptable.",
    WORK_THROUGH: "Use two to four short sentences. Understand the user's stated experience and grounded significance before exploring it collaboratively. Use at most one useful question or one useful perspective at a time. Do not rush into automatic-thought identification, belief analysis, or cognitive challenge unless the selected intervention and user's request call for it; do not label a distortion, assert an unstated emotion, or turn the response into a questionnaire.",
    DIRECT_HELP: "Give practical, organized help before asking anything else. Answer first with one to three useful points and no unnecessary empathy preamble. PCT appears here through respect, specificity, and agency—not through an added emotional interpretation. Do not respond with another unnecessary question. Avoid immediate interrogation or an advice avalanche. Offer options or a small next step without taking over a major life decision; the final decision remains the user's.",
    REGULATE: "Reduce cognitive load and pause analysis or cognitive challenging. Avoid psychological interpretation. Give one manageable instruction or anchor at a time in very short language; do not improvise a full multi-step relaxation protocol in this sprint.",
    UNCLEAR: "Use a brief neutral acknowledgement of what is known. Ask exactly one natural question to clarify the specified missing information. Leave unknown meaning open; do not add advice, an exercise, multiple questions, or several guesses about the user's emotions.",
  };
  const interventionDirections: Record<MomoDecision["intervention"], string> = {
    NONE: "Do not start an intervention yet.",
    PCT_LISTENING: "Stay with person-centered listening and reflection that adds grounded conversational value without merely repeating the user's words; do not manufacture emotional intensity or begin analysis.",
    PCT_EXPLORATION: "Explore the person's stated experience and grounded significance without assuming hidden causes or assigning an emotion they did not name. Clarify before interpreting when an important meaning is open.",
    CBT_RESTRUCTURING: "Use collaborative, natural cognitive exploration only after understanding the user's stated experience. Do not label a distortion, assume the thought is false, or skip emotional acknowledgment.",
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
