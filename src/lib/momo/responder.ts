import type { MomoDecision } from "./schemas.ts";
import type { ConversationContinuityState, ConversationParticipant } from "./schemas.ts";
import { continuityInstruction } from "./continuity.ts";
import { MOMO_CONVERSATION_CONTRACT } from "./prompts/conversationContract.ts";
import { MOMO_GROUNDING_CONTRACT } from "./prompts/groundingContract.ts";
import { selectedExamplePrinciples, exampleSelectionFor } from "./examples/selector.ts";
import {
  naturalConversationStyle,
  type ConversationModality,
} from "./prompts/naturalConversation.ts";
import { languageStyleInstruction, userFacingSystemLanguageInstruction } from "./responseStyle.ts";

export function momoDecisionInstruction(decision: MomoDecision): string {
  const modeDirections: Record<MomoDecision["supportMode"], string> = {
    LISTEN: "Use one to three short sentences, and allow a single brief acknowledgement when that is enough. Listening must not sound like an intake form. Use only the situation, emotions, and meanings the user explicitly stated. When a turn only reports a fact and gives no explicit emotion or request, do not summarize or evaluate it; prefer a neutral invitation to continue or one question about an actually missing fact. Do not merely paraphrase or synonym-swap the message; when there is nothing grounded to add, leave room for the user to continue. Do not give advice, challenge thoughts, or introduce an exercise. Do not force a question, summary, or validation. A question is optional; ask at most one only when it fills a useful gap. Conversational space is acceptable.",
    WORK_THROUGH: "Use two to four short sentences and keep them conversational. Take one collaborative step at a time. Begin only from the user's explicitly stated facts and meanings, then explore collaboratively without supplying missing psychological meaning. Use at most one useful question or one useful perspective at a time. Avoid clinical-interview tone, therapy jargon, and formal analysis language. Do not rush into automatic-thought identification, belief analysis, or cognitive challenge unless the selected intervention and user's request call for it; do not label a distortion, assert an unstated emotion, or turn the response into a questionnaire.",
    DIRECT_HELP: "Give practical, organized help before asking anything else. Answer the request first in direct everyday language with one to three useful points or one small practical next step and no unnecessary empathy preamble or generic overview. PCT appears here through respect, specificity, and agency—not through an added emotional interpretation. Do not respond with another unnecessary question. Avoid immediate interrogation or an advice avalanche. Offer options or a small next step without taking over a major life decision; the final decision remains the user's.",
    REGULATE: "Reduce cognitive load and pause analysis or cognitive challenging. Avoid psychological interpretation, filler, and elaborate empathy. Give one manageable instruction or anchor at a time in very short language. Use short sentences and minimal explanation; do not improvise a full multi-step relaxation protocol in this sprint. Do not default to breathing or offer a menu of techniques; use the current context and remembered outcomes to select one low-burden step.",
    UNCLEAR: "Use at most one brief neutral acknowledgement of what is known. When clarification is requested, ask exactly one natural question to clarify the specified missing information, and keep it concise. Otherwise preserve uncertainty without a question. Leave unknown meaning open; do not add multiple questions, a questionnaire, formal explanation, advice, an exercise, or several guesses about the user's emotions.",
  };
  const interventionDirections: Record<MomoDecision["intervention"], string> = {
    NONE: "Do not start an intervention yet.",
    PCT_LISTENING: "Stay with person-centered listening without merely repeating the user's words; a brief acknowledgement or conversational space is valid. Do not manufacture emotional intensity or begin analysis.",
    PCT_EXPLORATION: "Explore only the person's explicitly stated experience. Leave hidden causes and unnamed emotions open; ask one neutral question only when the missing answer is needed.",
    CBT_RESTRUCTURING: "Use collaborative, natural cognitive exploration only after understanding the user's stated experience. Do not label a distortion or assume the thought is false. Acknowledge an emotion only when the user stated it and doing so helps this turn; no emotional preamble is required.",
    PROBLEM_SOLVING: "Start with one practical action and preserve the user's choice. Use conversational prose by default; add a list only when the user requests one or several genuinely independent items clearly need structure.",
    RELAXATION: "Treat regulation as the immediate direction, not as a cure or a way to suppress an emotion the user wants to discuss.",
    PROFESSIONAL_SUPPORT: "Keep appropriate human or professional support prominent and do not lead with CBT.",
  };
  const directions = [modeDirections[decision.supportMode], interventionDirections[decision.intervention]];
  if (decision.supportMode === "DIRECT_HELP") {
    directions.push("For a brief request, default to one immediately useful next step in a few short sentences of conversational prose. Do not use a numbered list unless the user asks for a list or several genuinely independent items clearly require structure. Add more only when requested or necessary. Refine the existing answer when new facts arrive rather than restarting a full advice list.");
    directions.push("When the user asks what to say or write, give ONE short usable draft immediately (normally two to four sentences), with placeholders for unknown details. Do not give separate email and spoken alternatives, a preparatory lecture, or extra communication tips unless requested.");
  }
  if (decision.safetyState === "NORMAL") {
    directions.push("The authoritative safety result for this turn is normal. Do not initiate a suicide, self-harm, or immediate-danger assessment in the ordinary response. Safety questions belong to the separate safety path.");
  }
  if (decision.shouldClarify) {
    directions.push(`Ask exactly one natural question. The one clarification must target: ${decision.clarificationTarget}.`);
  }
  if (!decision.shouldClarify) directions.push("No clarification is required. Do not force a question.");
  return `Application routing guidance (do not mention this routing metadata):\n${directions.join("\n")}`;
}

export function composeMomoSystemInstruction(
  baseInstruction: string,
  decision: MomoDecision,
  options: {
    conversationModality?: ConversationModality;
    continuityState?: ConversationContinuityState;
    participant?: ConversationParticipant;
    userMessageText?: string;
  } = {}
): string {
  const style = naturalConversationStyle({
    modality: options.conversationModality ?? "TEXT",
    safetyState: decision.safetyState,
    participant: options.participant,
  });
  const principles = selectedExamplePrinciples(exampleSelectionFor({
    messageText: options.userMessageText ?? "", history: [], continuityState: options.continuityState,
  }, decision));
  return `${MOMO_GROUNDING_CONTRACT}\n\n${MOMO_CONVERSATION_CONTRACT}\n\n${baseInstruction}\n\n${style}\n\n${continuityInstruction(options.continuityState)}\n\n${languageStyleInstruction(options.userMessageText ?? "")}\n\n${userFacingSystemLanguageInstruction(options.userMessageText)}\n\n${momoDecisionInstruction(decision)}\n\n${principles}`;
}
