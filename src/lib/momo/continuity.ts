import type {
  ClarificationTarget,
  ContinuityGoal,
  ContinuityPreference,
  ConversationContinuityState,
  InterventionApproach,
  InterventionOutcome,
  MomoDecision,
  NormalizedConversationInput,
  ResponseShape,
  SupportMode,
  UserCorrection,
} from "./schemas.ts";
import { conversationContinuityStateSchema } from "./schemas.ts";

const MAX_INTERVENTIONS = 8;
const MAX_CORRECTIONS = 6;
const MAX_SHAPES = 8;
const MAX_QUESTION_TARGETS = 4;

const APPROACH_PATTERNS: Record<InterventionApproach, RegExp[]> = {
  BREATHING: [/\bbreath(?:e|ing)?\b/i, /\bdeep breaths?\b/i],
  GROUNDING: [/\bground(?:ing|ed)?\b/i, /\b5[- ]?4[- ]?3[- ]?2[- ]?1\b/i, /\bfive things (?:you )?can see\b/i],
  PMR: [/\bpmr\b/i, /\bprogressive muscle relaxation\b/i, /\b(?:tense|relax|release) (?:your )?(?:muscles|shoulders|jaw|hands)\b/i],
  GUIDED_IMAGERY: [/\bguided imagery\b/i, /\bvisuali[sz](?:e|ation|ing)\b/i, /\bcalm(?:ing)? (?:place|scene)\b/i],
  MINDFUL_PAUSE: [/\bmindful(?:ness)?\b/i, /\bpresent[- ]moment\b/i, /\bnotice (?:the|your) (?:moment|thoughts?|feelings?)\b/i],
  CBT_RESTRUCTURING: [/\bcbt\b/i, /\bthought record\b/i, /\b(?:challenge|examine|reframe) (?:this|that|the|your|my) thought\b/i],
  PROBLEM_SOLVING: [/\bproblem[- ]solving\b/i, /\bnext practical step\b/i, /\baction plan\b/i],
  TASK_LISTING: [/\bbrain dump\b/i, /\btask list\b/i, /\blist(?:ing)? (?:all|everything|every task)\b/i, /\brank (?:all|the|your) tasks?\b/i],
  OTHER_REGULATION: [],
};

const QUESTION_FATIGUE = [
  /\bstop asking (?:me )?questions?\b/i,
  /\b(?:no|not) more questions?\b/i,
  /\bi (?:do not|don['’]t) want (?:any )?questions?\b/i,
  /\bi (?:do not|don['’]t) want to answer\b/i,
  /\bi['’]?m tired of (?:answering )?questions?\b/i,
];
const QUESTION_INVITATION = [
  /\byou can ask (?:me )?(?:a |some )?questions?\b/i,
  /\bask me (?:a |some )?questions?\b/i,
  /\bi['’]?m (?:okay|ready|fine) (?:with|to answer) questions?\b/i,
];
const OPTION_OVERLOAD = [
  /\btoo many (?:options|choices|things)\b/i,
  /\boverwhelm(?:ed|ing) (?:by|with) (?:the )?(?:options|choices)\b/i,
  /\bi (?:do not|don['’]t) (?:understand|know which)\b/i,
  /\bi (?:do not|don['’]t) know what (?:helps|would help|to choose|to try)\b/i,
  /\bi['’]?ve never (?:done|tried) (?:therapy|an exercise|this)\b/i,
  /\bi (?:do not|don['’]t) want to continue\b/i,
  /\b(?:fewer|less) options\b/i,
  /\bjust (?:pick|choose|give me) one\b/i,
];
const OPTION_READINESS = [
  /\b(?:show|give) me (?:the |some |more )?(?:options|choices)\b/i,
  /\bwhat are (?:the|my) options\b/i,
  /\bi['’]?m ready (?:for|to consider) (?:more )?(?:options|choices)\b/i,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function appendBounded<T>(items: T[], item: T, limit: number): T[] {
  return [...items, item].slice(-limit);
}

function addPreference(
  preferences: ContinuityPreference[],
  preference: ContinuityPreference
): ContinuityPreference[] {
  return unique([...preferences, preference]).slice(-8);
}

function removePreference(
  preferences: ContinuityPreference[],
  preference: ContinuityPreference
): ContinuityPreference[] {
  return preferences.filter((item) => item !== preference);
}

export function emptyConversationContinuityState(): ConversationContinuityState {
  return {
    version: 1,
    currentGoal: "UNKNOWN",
    explicitPreferences: [],
    rejectedApproaches: [],
    recentInterventions: [],
    userCorrections: [],
    optionOverload: false,
    questionFatigue: false,
    needsReassessment: false,
    recentResponseShapes: [],
    recentQuestionTargets: [],
  };
}

export function parseConversationContinuityState(raw: unknown): ConversationContinuityState {
  const parsed = conversationContinuityStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyConversationContinuityState();
}

export function detectInterventionApproaches(text: string): InterventionApproach[] {
  return (Object.entries(APPROACH_PATTERNS) as [InterventionApproach, RegExp[]][])
    .filter(([, patterns]) => patterns.length > 0 && matchesAny(text, patterns))
    .map(([approach]) => approach);
}

function detectOutcome(text: string): InterventionOutcome | null {
  if (/\b(?:made|makes|making) (?:me (?:feel )?|it |things )?(?:worse|dizzy|more anxious|uncomfortable|panicky)\b|\bfeel(?:s|ing)? (?:worse|bad)\b|\bmore uncomfortable\b/i.test(text)) {
    return "WORSE";
  }
  if (/\b(?:nothing|not much) changed\b|\b(?:did not|didn['’]t|does not|doesn['’]t|is not|isn['’]t) help(?:ing|ed)?\b|\b(?:feel|felt) (?:exactly )?the same\b/i.test(text)) {
    return "NO_CHANGE";
  }
  if (/\b(?:stop|stopped|quit|done with) (?:it|this|the exercise)\b|\bi (?:had to|want to) stop\b/i.test(text)) {
    return "STOPPED";
  }
  if (/\b(?:do not|don['’]t) want to (?:do|try|use|continue)\b|\bi hate (?:it|this|that)\b|\b(?:it|this|that) (?:is|was) stupid\b/i.test(text)) {
    return "REJECTED";
  }
  if (/\b(?:that|it|this) help(?:ed|s)?\b|\b(?:feel|felt|feeling) (?:a little |much )?(?:better|calmer|less tense|more settled)\b|\b(?:worked|useful)\b/i.test(text)) {
    return "HELPED";
  }
  return null;
}

function detectGoal(text: string): ContinuityGoal | null {
  if (/\b(?:stop|quit|do not|don['’]t) (?:the |this |that )?(?:exercise|technique|breathing|grounding)\b/i.test(text)) return "STOP_INTERVENTION";
  if (/\b(?:just )?(?:need|want) to (?:vent|rant)\b|\blet me (?:vent|rant)\b/i.test(text)) return "VENT";
  if (/\b(?:just )?(?:listen|be heard|talk without advice)\b|\bno advice\b/i.test(text)) return "BE_HEARD";
  if (/\b(?:calm|settle|ground|regulate) (?:me|down|myself)\b|\bhelp me (?:calm|settle|ground)\b/i.test(text)) return "REGULATE";
  if (/\b(?:understand|make sense of|figure out why|work through)\b/i.test(text)) return "UNDERSTAND";
  if (/\b(?:make|build) (?:a |the )?plan\b|\bplan (?:this|it|my)\b/i.test(text)) return "MAKE_PLAN";
  if (/\bwhat should i do\b|\b(?:give|tell) me (?:a |one |the )?(?:next step|answer|advice)\b|\bpractical help\b/i.test(text)) return "PRACTICAL_HELP";
  return null;
}

function detectCorrection(text: string, now: string): UserCorrection | null {
  const patterns = [
    /\bi['’]?m not\s+([^,.!?—-]{1,80})\s*[,—-]+\s*i['’]?m\s+([^,.!?]{1,80})/i,
    /\bnot\s+([^,.!?—-]{1,80})\s*[,—-]+\s*(?:more like\s+)?([^,.!?]{1,80})/i,
    /\bi mean\s+([^,.!?]{1,80})\s*,?\s+not\s+([^,.!?]{1,80})/i,
  ];
  for (const [index, pattern] of patterns.entries()) {
    const match = text.match(pattern);
    if (!match) continue;
    const rejectedTerm = (index === 2 ? match[2] : match[1]).trim();
    const preferredTerm = (index === 2 ? match[1] : match[2]).trim();
    if (!safeCorrectionTerm(rejectedTerm) || !safeCorrectionTerm(preferredTerm)) return null;
    return { rejectedTerm, preferredTerm, recordedAt: now };
  }
  return null;
}

function safeCorrectionTerm(term: string): boolean {
  if (!term || term.split(/\s+/).length > 4 || /\d|@|https?:|\b(?:address|phone|email)\b/i.test(term)) return false;
  return !/\b(?:adhd|autis(?:m|tic)|bipolar|depress(?:ion|ive)|disorder|ocd|ptsd|schizophren(?:ia|ic)|diagnos(?:is|ed))\b/i.test(term);
}

export function isContextDependentShortReply(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length > 7 || text.length > 64) return false;
  return /^(?:i\s+)?(?:don['’]t know|do not know|idk|no|nope|same|maybe|not really|nothing changed|still the same|go on|continue|i hate (?:it|this)|it['’]?s not helping)[.!?]*$/i.test(text.trim());
}

function latestApproach(state: ConversationContinuityState): InterventionApproach | undefined {
  return state.recentInterventions.at(-1)?.approach;
}

export function prepareContinuityState(
  input: Pick<NormalizedConversationInput, "messageText">,
  previous: ConversationContinuityState | undefined,
  now = new Date()
): ConversationContinuityState {
  const state = structuredClone(previous ?? emptyConversationContinuityState());
  const text = input.messageText.normalize("NFKC").trim();
  const recordedAt = now.toISOString();

  const goal = detectGoal(text);
  if (goal) state.currentGoal = goal;

  if (/\bno advice\b|\b(?:do not|don['’]t) (?:want advice|(?:give|offer) me advice)\b/i.test(text)) {
    state.explicitPreferences = addPreference(state.explicitPreferences, "NO_ADVICE");
  }
  if (/\b(?:give|offer) me (?:some |your )?advice\b|\bi (?:want|am ready for) advice\b|\bwhat should i do\b/i.test(text)) {
    state.explicitPreferences = removePreference(state.explicitPreferences, "NO_ADVICE");
    state.explicitPreferences = removePreference(state.explicitPreferences, "RANT_FIRST");
  }
  if (/\b(?:rant|vent) first\b/i.test(text)) {
    state.explicitPreferences = addPreference(state.explicitPreferences, "RANT_FIRST");
  }
  if (/\b(?:one|single|small) (?:step|thing)\b|\bone at a time\b/i.test(text)) {
    state.explicitPreferences = addPreference(state.explicitPreferences, "ONE_STEP_AT_A_TIME");
  }
  if (/\bpractical (?:help|advice|step)\b|\bwhat should i do\b/i.test(text)) {
    state.explicitPreferences = addPreference(state.explicitPreferences, "PRACTICAL_HELP");
  }

  if (matchesAny(text, QUESTION_FATIGUE)) {
    state.questionFatigue = true;
    state.explicitPreferences = addPreference(state.explicitPreferences, "NO_QUESTIONS");
  } else if (matchesAny(text, QUESTION_INVITATION)) {
    state.questionFatigue = false;
    state.explicitPreferences = removePreference(state.explicitPreferences, "NO_QUESTIONS");
  }

  if (matchesAny(text, OPTION_OVERLOAD)) {
    state.optionOverload = true;
    state.explicitPreferences = addPreference(state.explicitPreferences, "MINIMAL_OPTIONS");
    state.explicitPreferences = addPreference(state.explicitPreferences, "ONE_STEP_AT_A_TIME");
  } else if (matchesAny(text, OPTION_READINESS)) {
    state.optionOverload = false;
    state.explicitPreferences = removePreference(state.explicitPreferences, "MINIMAL_OPTIONS");
  }

  const correction = detectCorrection(text, recordedAt);
  if (correction) {
    state.userCorrections = appendBounded(state.userCorrections, correction, MAX_CORRECTIONS);
  }

  const outcome = detectOutcome(text);
  const mentionedApproaches = detectInterventionApproaches(text);
  const approach = mentionedApproaches.at(-1) ?? latestApproach(state);
  if (outcome && approach) {
    state.recentInterventions = appendBounded(state.recentInterventions, {
      approach,
      outcome,
      goal: state.currentGoal,
      recordedAt,
    }, MAX_INTERVENTIONS);
    if (["NO_CHANGE", "WORSE", "STOPPED", "REJECTED"].includes(outcome)) {
      state.rejectedApproaches = unique([...state.rejectedApproaches, approach]);
      state.needsReassessment = true;
    } else if (outcome === "HELPED") {
      state.needsReassessment = false;
    }
  }

  return conversationContinuityStateSchema.parse(state);
}

function goalForDecision(decision: MomoDecision): ContinuityGoal {
  if (decision.supportMode === "LISTEN") return decision.primaryNeed === "VENT" ? "VENT" : "BE_HEARD";
  if (decision.supportMode === "REGULATE") return "REGULATE";
  if (decision.supportMode === "DIRECT_HELP") return decision.primaryNeed === "PRACTICAL_HELP" ? "PRACTICAL_HELP" : "MAKE_PLAN";
  if (decision.supportMode === "WORK_THROUGH") return "UNDERSTAND";
  return "UNKNOWN";
}

export function classifyResponseShapes(text: string, decision?: MomoDecision): ResponseShape[] {
  const shapes: ResponseShape[] = [];
  if (/\?/.test(text)) shapes.push("QUESTION");
  if (detectInterventionApproaches(text).length > 0 || /\b(?:try|start by|notice|focus on)\b/i.test(text)) shapes.push("EXERCISE");
  if (decision?.supportMode === "DIRECT_HELP" || /(?:^|\n)\s*(?:[-*]|\d+[.)])\s+/.test(text) || /\byou (?:can|could|might)\b/i.test(text)) shapes.push("ADVICE");
  if (/\b(?:it sounds like|it seems like|you['’]re saying|you said|that left you)\b/i.test(text)) shapes.push("REFLECTION");
  if (/\b(?:that makes sense|understandable|fair enough|of course)\b/i.test(text)) shapes.push("VALIDATION");
  if (decision?.supportMode === "DIRECT_HELP") shapes.push("DIRECT_ANSWER");
  if (shapes.length === 0) shapes.push("ACKNOWLEDGEMENT");
  return unique(shapes);
}

function inferQuestionTarget(text: string): ClarificationTarget {
  if (/\bwhat (?:do you|would you) (?:want|need|prefer)\b|\bhelpful (?:right now|next)\b/i.test(text)) return "SUPPORT_PREFERENCE";
  if (/\bwhat happened\b|\bwhich situation\b/i.test(text)) return "SITUATION";
  if (/\bhow (?:do|does|did) (?:you|that) feel\b|\bwhat emotion\b/i.test(text)) return "EMOTION";
  if (/\bwhat (?:thought|went through your mind|makes you think)\b/i.test(text)) return "THOUGHT";
  if (/\bwhat (?:is|would be) (?:the|your) goal\b|\bwhat are you trying to\b/i.test(text)) return "GOAL";
  return "OTHER";
}

export interface ContinuityTurnMetadata {
  responseShapes: ResponseShape[];
  interventionApproaches: InterventionApproach[];
  questionTarget?: ClarificationTarget;
}

export function finalizeContinuityState(
  state: ConversationContinuityState,
  decision: MomoDecision,
  responseText: string,
  now = new Date()
): { state: ConversationContinuityState; metadata: ContinuityTurnMetadata } {
  const next = structuredClone(state);
  if (decision.supportMode !== "UNCLEAR") next.currentSupportMode = decision.supportMode;
  if (next.currentGoal === "UNKNOWN" || decision.userPreferenceOverride) {
    next.currentGoal = goalForDecision(decision);
  }

  const responseShapes = classifyResponseShapes(responseText, decision);
  next.recentResponseShapes = [...next.recentResponseShapes, ...responseShapes].slice(-MAX_SHAPES);
  const questionTarget = responseShapes.includes("QUESTION")
    ? decision.clarificationTarget ?? inferQuestionTarget(responseText)
    : undefined;
  if (questionTarget) {
    next.recentQuestionTargets = appendBounded(
      next.recentQuestionTargets,
      questionTarget,
      MAX_QUESTION_TARGETS
    );
  }

  let interventionApproaches = detectInterventionApproaches(responseText);
  if (interventionApproaches.length === 0 && decision.intervention === "RELAXATION" && responseShapes.includes("EXERCISE")) {
    interventionApproaches = ["OTHER_REGULATION"];
  }
  if (interventionApproaches.length === 0 && decision.intervention === "CBT_RESTRUCTURING") {
    interventionApproaches = ["CBT_RESTRUCTURING"];
  }
  if (interventionApproaches.length === 0 && decision.intervention === "PROBLEM_SOLVING" && responseShapes.includes("ADVICE")) {
    interventionApproaches = ["PROBLEM_SOLVING"];
  }
  for (const approach of interventionApproaches) {
    next.recentInterventions = appendBounded(next.recentInterventions, {
      approach,
      outcome: "UNKNOWN",
      goal: next.currentGoal,
      recordedAt: now.toISOString(),
    }, MAX_INTERVENTIONS);
  }
  if (state.needsReassessment && interventionApproaches.length === 0) {
    next.needsReassessment = false;
  }

  return {
    state: conversationContinuityStateSchema.parse(next),
    metadata: { responseShapes, interventionApproaches, ...(questionTarget ? { questionTarget } : {}) },
  };
}

function label(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

export function continuityInstruction(state?: ConversationContinuityState): string {
  const current = state ?? emptyConversationContinuityState();
  const lines = [
    "Conversation continuity (bounded working memory; never mention this metadata):",
    `- Current support mode: ${current.currentSupportMode ?? "not established"}. Current user goal: ${label(current.currentGoal)}. Continue that goal unless the newest user turn changes it.`,
    `- Explicit interaction preferences: ${current.explicitPreferences.length ? current.explicitPreferences.map(label).join(", ") : "none recorded"}.`,
    "- Treat stored items only as user-reported interaction facts. Do not turn them into diagnoses, traits, causes, or claims about what universally works for the user.",
  ];
  if (current.userCorrections.length) {
    lines.push(`- Active user corrections: ${current.userCorrections.map((item) => `${JSON.stringify(item.rejectedTerm)} was corrected to ${JSON.stringify(item.preferredTerm)}`).join("; ")}. Use the correction without making the user repeat it.`);
  }
  if (current.rejectedApproaches.length) {
    lines.push(`- Do not suggest these rejected, unhelpful, stopped, or worsening approaches again in this session unless the user explicitly asks to reconsider one: ${current.rejectedApproaches.map(label).join(", ")}.`);
  }
  if (current.recentInterventions.length) {
    lines.push(`- Recent user-reported intervention outcomes: ${current.recentInterventions.map((item) => `${label(item.approach)}=${label(item.outcome)} for ${label(item.goal)}`).join("; ")}. A previous success may inform but must never dictate the next choice.`);
  }
  if (current.needsReassessment) {
    lines.push("- The latest intervention did not help, was rejected, was stopped, or felt worse. Reassess the current need now; do not extend the exercise or immediately cycle into another exercise.");
  }
  if (current.optionOverload) {
    lines.push("- Option overload is active. Do not offer a menu or ask the user to choose a technique. Use known constraints to select one low-burden next step, explain it briefly, and preserve opt-out.");
  }
  if (current.questionFatigue) {
    lines.push("- Question fatigue is active. Do not ask another ordinary-support question until the user invites questions again. Safety questions are handled by the separate safety path.");
  }
  if (current.recentQuestionTargets.length) {
    lines.push(`- Recently used question targets: ${current.recentQuestionTargets.map(label).join(", ")}. Do not ask the same question again in different words.`);
  }
  if (current.recentResponseShapes.length) {
    lines.push(`- Recent response functions: ${current.recentResponseShapes.map(label).join(", ")}. Avoid repeating the same response shape mechanically; vary only when context supports it.`);
  }
  lines.push("- Use the relevant recent turns plus this compact state. Do not restart, re-greet, re-explain rejected options, or ask again for a preference already recorded.");
  return lines.join("\n");
}

function contentTokens(text: string): string[] {
  const stop = new Set(["a", "an", "and", "are", "do", "for", "how", "i", "in", "is", "it", "me", "of", "or", "that", "the", "this", "to", "we", "what", "would", "you", "your"]);
  return unique((text.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((token) => token.length > 2 && !stop.has(token)));
}

function similarity(left: string, right: string): number {
  const a = new Set(contentTokens(left));
  const b = new Set(contentTokens(right));
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

function questionsAreSimilar(left: string, right: string): boolean {
  const a = new Set(contentTokens(left));
  const b = new Set(contentTokens(right));
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection >= 3 && similarity(left, right) >= 0.4;
}

function questions(text: string): string[] {
  return text.split(/(?<=[?.!])\s+|\n+/).filter((part) => part.includes("?"));
}

function explicitlyRequestsApproach(message: string, approach: InterventionApproach): boolean {
  const patterns = APPROACH_PATTERNS[approach];
  if (!patterns.length || !matchesAny(message, patterns)) return false;
  return /\b(?:want|willing|ready|please|could we|can we|let['’]s|try|use|do|again)\b/i.test(message);
}

export type ContinuityViolation =
  | "REJECTED_APPROACH"
  | "REASSESSMENT_REQUIRED"
  | "OPTION_OVERLOAD"
  | "QUESTION_FATIGUE"
  | "REPEATED_QUESTION"
  | "REPEATED_OPENING"
  | "RECYCLED_RESPONSE"
  | "REPEATED_SHAPE";

export function continuityResponseViolations(
  candidate: string,
  input: NormalizedConversationInput,
  state = input.continuityState ?? emptyConversationContinuityState()
): ContinuityViolation[] {
  const violations: ContinuityViolation[] = [];
  const approaches = detectInterventionApproaches(candidate);
  if (approaches.some((approach) => state.rejectedApproaches.includes(approach) && !explicitlyRequestsApproach(input.messageText, approach))) {
    violations.push("REJECTED_APPROACH");
  }
  if (state.needsReassessment && (approaches.length > 0 || /\b(?:try|start|continue) (?:this|another|the) exercise\b/i.test(candidate))) {
    violations.push("REASSESSMENT_REQUIRED");
  }
  const menuItems = candidate.match(/(?:^|\n)\s*(?:[-*]|\d+[.)])\s+/g)?.length ?? 0;
  if (state.optionOverload && (menuItems > 1 || approaches.length > 1 || /\b(?:choose|pick) (?:one|between|from)\b/i.test(candidate))) {
    violations.push("OPTION_OVERLOAD");
  }
  if (state.questionFatigue && candidate.includes("?")) violations.push("QUESTION_FATIGUE");

  const recentMomo = input.history.filter((turn) => turn.role === "MOMO").slice(-4).map((turn) => turn.text);
  const candidateQuestions = questions(candidate);
  const priorQuestions = recentMomo.flatMap(questions);
  if (candidateQuestions.some((question) => priorQuestions.some((prior) => questionsAreSimilar(question, prior)))) {
    violations.push("REPEATED_QUESTION");
  }
  const candidateOpening = contentTokens(candidate).slice(0, 4).join(" ");
  if (candidateOpening.split(" ").length >= 3 && recentMomo.some((reply) => contentTokens(reply).slice(0, 4).join(" ") === candidateOpening)) {
    violations.push("REPEATED_OPENING");
  }
  if (recentMomo.some((reply) => similarity(candidate, reply) >= 0.78)) violations.push("RECYCLED_RESPONSE");
  const candidateShape = classifyResponseShapes(candidate)[0];
  const recentShapes = state.recentResponseShapes.slice(-3);
  if (recentShapes.length === 3 && recentShapes.every((shape) => shape === candidateShape)) {
    violations.push("REPEATED_SHAPE");
  }
  return unique(violations);
}

export function supportModeFromContinuity(state?: ConversationContinuityState): Exclude<SupportMode, "UNCLEAR"> | null {
  const mode = state?.currentSupportMode;
  return mode && mode !== "UNCLEAR" ? mode : null;
}
