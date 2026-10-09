import { composeMomoSystemInstruction } from "@/src/lib/momo/responder";
import { continuityResponseViolations } from "@/src/lib/momo/continuity";
import { responseStyleViolations } from "@/src/lib/momo/responseStyle";
import { groundingViolationDetails } from "@/src/lib/momo/grounding";
import type { MomoDecision, NormalizedConversationInput } from "@/src/lib/momo/schemas";
import { enforceBackendActionTruthfulness } from "@/src/lib/safety/actionTruthfulness";
import { MOMO_SYSTEM_INSTRUCTION } from "./persona";
import { generateMomoText, type MomoTextRequest } from "./textProvider";

// These are coarse style signals, not evidence that a reply is unsafe. Retry
// them once, but do not turn a stylistic disagreement into a missing reply.
const STYLE_ONLY_VIOLATIONS = new Set([
  "REPEATED_SHAPE", "REPEATED_OPENING", "RECYCLED_RESPONSE", "REPEATED_QUESTION",
  "EXCESSIVE_DIRECT_HELP", "CANNED_GREETING", "REPEATED_GREETING",
  "UNNECESSARY_LIST_STRUCTURE", "REPEATED_FACT_MIRRORING", "SCRIPT_STYLE_MISMATCH",
  "UNNECESSARY_FACT_MIRRORING", "UNSUPPORTED_EMOTION_INFERENCE",
  "UNSUPPORTED_PSYCHOLOGICAL_IMPLICATION", "LISTEN_ADVICE",
]);

export function partitionResponseViolations(violations: readonly string[]): {
  hard: string[];
  style: string[];
} {
  return {
    hard: violations.filter((violation) => !STYLE_ONLY_VIOLATIONS.has(violation)),
    style: violations.filter((violation) => STYLE_ONLY_VIOLATIONS.has(violation)),
  };
}

export function hasBlockingResponseViolation(violations: string[]): boolean {
  return partitionResponseViolations(violations).hard.length > 0;
}

type MomoResponseGenerator = (request: MomoTextRequest) => Promise<string>;

function responseViolations(
  reply: string,
  input: NormalizedConversationInput,
  decision: MomoDecision
): string[] {
  return [
    ...continuityResponseViolations(reply, input, input.continuityState),
    ...responseStyleViolations(reply, input, decision),
  ];
}

function excerpt(text: string, max = 180): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return JSON.stringify(compact.length > max ? `${compact.slice(0, max - 1)}…` : compact);
}

function repairInstruction(
  reply: string,
  violations: readonly string[],
  input: NormalizedConversationInput
): string {
  const guidance: string[] = [];
  const factMirroring = violations.includes("UNNECESSARY_FACT_MIRRORING") || violations.includes("REPEATED_FACT_MIRRORING");
  const listenAdvice = violations.includes("LISTEN_ADVICE") || violations.includes("EXPLICIT_NO_ADVICE");
  const grounding = groundingViolationDetails(reply, input);
  for (const detail of grounding.slice(0, 2)) {
    if (detail.code === "UNSUPPORTED_DIAGNOSIS") {
      guidance.push(`Remove the unsupported diagnostic claim ${excerpt(detail.claim)}; the user did not establish that diagnosis.`);
    } else if (detail.code === "UNSUPPORTED_EVENT_INFERENCE") {
      guidance.push(`Remove or neutralize the unsupported event or intent claim ${excerpt(detail.claim)}; state only the reported event.`);
    } else {
      guidance.push(`Remove the unsupported psychological claim ${excerpt(detail.claim)}; the user did not state that feeling or meaning.`);
    }
  }
  if (factMirroring) {
    const opening = reply.split(/(?<=[.!?।])\s+|\n+/, 1)[0] ?? reply;
    guidance.push(`Do not repeat or paraphrase any fact, feeling, or wording from the user's latest message as ${excerpt(opening)} does. Rewrite without describing their situation or state: use only a brief acknowledgement, conversational space, or one neutral useful question.`);
  }
  if (violations.includes("TOO_MANY_QUESTIONS") || violations.includes("UNCLEAR_QUESTION_COUNT") || violations.includes("DIRECT_HELP_INTERROGATION") || violations.includes("QUESTION_FATIGUE") || violations.includes("REPEATED_QUESTION")) {
    const questions = reply.split(/(?<=\?)\s+|\n+/).filter((part) => part.includes("?")).join(" ");
    guidance.push(`Fix the questioning in ${excerpt(questions || reply)}: keep at most the one permitted useful question, or none when questions were declined.`);
  }
  if (violations.includes("LISTEN_ADVICE") || violations.includes("EXPLICIT_NO_ADVICE") || violations.includes("REJECTED_APPROACH") || violations.includes("REASSESSMENT_REQUIRED") || violations.includes("REGULATE_DEFAULT_BREATHING") || violations.includes("REGULATE_TECHNIQUE_MENU")) {
    guidance.push(`Remove the unsolicited, rejected, or repeated technique from ${excerpt(reply)} and stay with the user's current request.`);
  }
  if (violations.includes("UNNECESSARY_LIST_STRUCTURE") || violations.includes("OPTION_OVERLOAD") || violations.includes("EXCESSIVE_DIRECT_HELP")) {
    guidance.push(`Condense the over-structured or overloaded passage ${excerpt(reply)} to one immediately useful point in conversational prose.`);
  }
  if (violations.includes("SCRIPT_STYLE_MISMATCH")) {
    guidance.push(`Rewrite ${excerpt(reply)} without introducing Devanagari; preserve the user's Latin-script choice.`);
  }
  if (violations.includes("INTERNAL_SYSTEM_TERMINOLOGY") || violations.includes("UNAUTHORIZED_SAFETY_ASSESSMENT")) {
    guidance.push(`Remove the internal-routing or unauthorized safety language from ${excerpt(reply)} and answer at the user-facing level.`);
  }
  if (guidance.length === 0) {
    guidance.push(`Rewrite the problematic wording in ${excerpt(reply)} while preserving only grounded, current-conversation content.`);
  }
  const finalConstraint = factMirroring || grounding.length > 0
    ? " For this rewrite, use one sentence that does not begin with ‘that,’ ‘this,’ ‘it,’ ‘you,’ or ‘your’; do not describe or evaluate the reported event. A neutral acknowledgement, invitation to continue, or necessary fact question is enough."
    : "";
  const adviceConstraint = listenAdvice
    ? " For this LISTEN rewrite, do not mention correcting, addressing, documenting, planning, responding, options, or what to do next. Use only a neutral acknowledgement, an invitation to keep talking, or one missing-fact question."
    : "";
  return `Rewrite once, concisely. ${guidance.slice(0, 4).join(" ")} Keep the same helpful intent, but do not add a new evaluation (such as unfair, difficult, rough, serious, significant, or worth addressing), advice, action, emotion, or meaning that the user did not state.${finalConstraint}${adviceConstraint} Do not explain the rewrite or mention internal policy.`;
}

function asksAboutExternalAction(input: NormalizedConversationInput): boolean {
  const recentContext = [...input.history.slice(-4).map((turn) => turn.text), input.messageText].join(" ");
  return /\b(?:contact|notifi|reach|request|review|confirm|status)\w*\b/i.test(input.messageText)
    && /\b(?:emergency\s+contact|therapist|review|reviewer|person|service|someone)\b/i.test(recentContext);
}

function explicitCorrectionFallback(messageText: string): string | null {
  const correction = messageText.match(/\bi(?:['’]m| am)\s+not\s+([^,.!?]{1,40})[,.!—-]+\s*i(?:['’]m| am)\s+(?:mostly\s+)?([^,.!?]{1,40})/i);
  if (!correction) return null;
  return `Got it—${correction[2].trim()}, not ${correction[1].trim()}.`;
}

export function safeMomoFallback(
  input: NormalizedConversationInput,
  decision: MomoDecision
): Promise<string> {
  const state = input.continuityState;
  if (asksAboutExternalAction(input)) {
    const statement = "I can’t confirm that anyone was contacted. A request is not the same as a confirmed contact.";
    return Promise.resolve(decision.supportMode === "UNCLEAR" && decision.shouldClarify
      ? `${statement} What would you like to know about the request?`
      : statement);
  }
  const correction = explicitCorrectionFallback(input.messageText);
  if (correction) return Promise.resolve(correction);
  if (/\b(?:exact wording|write it for me|draft (?:it|that|a message))\b/i.test(input.messageText)) {
    return Promise.resolve("You could say: “I’d like to discuss this directly and agree on one clear next step. When would be a good time to talk?”");
  }
  if (/\b(?:just give me an answer|stop asking(?: me)? questions?)\b/i.test(input.messageText)) {
    return Promise.resolve("State the specific problem, say what needs to change, and make one clear request.");
  }
  if (/\b(?:leave|skip|stop|no)\b.{0,24}\bbreath(?:ing)?\b|\bnot\s+do\b.{0,20}\bbreath(?:ing)?\b/i.test(input.messageText)) {
    return Promise.resolve("Okay—we’ll leave breathing exercises out.");
  }
  if (/\bevidence\s+against\b/i.test(input.messageText)) {
    const statement = "That is relevant counterevidence. It doesn’t erase the concern, but it means the absolute conclusion needs softening.";
    return Promise.resolve(decision.supportMode === "UNCLEAR" && decision.shouldClarify
      ? `${statement} What does that fact suggest to you?`
      : statement);
  }
  if (/\b(?:make|give)\s+it\s+(?:concrete|specific)\b|\bmake\s+this\s+concrete\b/i.test(input.messageText)) {
    return Promise.resolve("Name the specific issue, say what needs to change, and make one clear request.");
  }
  if (/\bshould\s+i\s+(?:quit|drop\s+out|leave|end\s+it)\b/i.test(input.messageText)) {
    return Promise.resolve("Don’t make the final decision in this moment. First verify the most reversible alternative and its consequences; the choice remains yours.");
  }
  if (state?.needsReassessment || state?.rejectedApproaches.length) {
    return Promise.resolve("Okay—we’ll stop that and leave the exercise aside. You can keep talking without doing another technique.");
  }
  if (state?.optionOverload) {
    if (decision.supportMode === "LISTEN") {
      return Promise.resolve("You don’t have to sort all of it at once. Go ahead—I’ll listen without turning it into a plan.");
    }
    if (/\b(?:help\s+me\s+start|where\s+do\s+i\s+start)\b/i.test(input.messageText)) {
      return Promise.resolve("Open the item with the nearest deadline. Do nothing else yet.");
    }
    if (/\b(?:can(?:not|'t)|unable\s+to)\s+prioriti[sz]e\b/i.test(input.messageText)) {
      return Promise.resolve("Open only the task with the nearest deadline.");
    }
    return Promise.resolve("Work for ten minutes on the task with the nearest real deadline.");
  }
  if (decision.supportMode === "LISTEN") {
    return Promise.resolve("Go ahead—I’ll listen without turning this into advice.");
  }
  if (decision.supportMode === "REGULATE") {
    return Promise.resolve("Pause the exercise and stay where you feel physically steady. Don’t force another technique right now.");
  }
  if (decision.supportMode === "WORK_THROUGH") {
    if (state?.questionFatigue) {
      return Promise.resolve("Keep the facts separate from the interpretation for now; you don’t have to force a conclusion.");
    }
    if (decision.intervention === "CBT_RESTRUCTURING") {
      if (/\bcounterexample\b/i.test(input.messageText)) {
        return Promise.resolve("That is a concrete exception to the absolute thought. It shows the thought is broader than the facts support.");
      }
      if (/\bevidence\s+for\b/i.test(input.messageText)) {
        return Promise.resolve("Treat that as one piece of evidence, then separate what happened from what it proves.");
      }
      return Promise.resolve("Start with one concrete exception to the thought. What recent fact does not fit the absolute conclusion?");
    }
    return Promise.resolve("Name the clearest fact and keep it separate from the conclusion you’re drawing. What part do you know for certain?");
  }
  if (decision.supportMode === "UNCLEAR") {
    return Promise.resolve("I’m not sure what you mean yet. What part would you like help with?");
  }
  if (/\bwhat\s+should\s+i\s+(?:say|write|text)\b/i.test(input.messageText)) {
    return Promise.resolve("Keep it factual: state what happened, say what you need, and make one specific request.");
  }
  return Promise.resolve("Take the smallest useful action you can do now, then reassess before adding another step.");
}

export async function generateMomoResponseWithGenerator(
  input: NormalizedConversationInput,
  decision: MomoDecision,
  generator: MomoResponseGenerator
): Promise<string> {
  const baseSystemInstruction = composeMomoSystemInstruction(MOMO_SYSTEM_INSTRUCTION, decision, {
    conversationModality: "TEXT",
    continuityState: input.continuityState,
    participant: input.participant,
    userMessageText: input.messageText,
  });
  let retryInstruction = "";
  let lastViolations: string[] = [];
  let lastReply = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reply = await generator({
      instructions: retryInstruction
        ? `${baseSystemInstruction}\n\n${retryInstruction}`
        : baseSystemInstruction,
      history: input.history,
      messageText: input.messageText,
    });
    const truthfulReply = enforceBackendActionTruthfulness(reply);
    lastReply = truthfulReply;
    const violations = responseViolations(truthfulReply, input, decision);
    if (violations.length === 0) return truthfulReply;
    lastViolations = violations;
    const partition = partitionResponseViolations(violations);
    if (attempt === 1 && partition.hard.length === 0) return truthfulReply;
    retryInstruction = repairInstruction(truthfulReply, violations, input);
  }
  if (partitionResponseViolations(lastViolations).hard.length === 0) return lastReply;
  const fallback = enforceBackendActionTruthfulness(await safeMomoFallback(input, decision));
  const fallbackViolations = responseViolations(fallback, input, decision);
  const hardFallbackViolations = partitionResponseViolations(fallbackViolations).hard;
  if (hardFallbackViolations.length > 0) {
    throw new Error(`Policy-safe Momo fallback violated: ${hardFallbackViolations.join(", ")}. Original violations: ${lastViolations.join(", ")}.`);
  }
  return fallback;
}

export async function generateMomoResponse(
  input: NormalizedConversationInput,
  decision: MomoDecision
): Promise<string> {
  return generateMomoResponseWithGenerator(input, decision, generateMomoText);
}
