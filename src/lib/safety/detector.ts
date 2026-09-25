import { getSafetyPolicy } from "./policy.ts";
import {
  modelRiskAssessmentSchema,
  safetyEvaluationSchema,
  type ModelRiskAssessment,
  type ModelSafetyEvidence,
  type RuleRiskAssessment,
  type SafetyAssessmentStep,
  type SafetyEvaluation,
  type SafetyResolution,
  type SafetyState,
  type SafetyTriggerType,
} from "./schemas.ts";
import { resolveSafetyState } from "./stateMachine.ts";

export type MomoSafetyCategory = "SELF_HARM" | "HARM_TO_OTHERS";
export type MomoSafetyLanguage = "EN" | "NE";
export type MomoSafetyAssessment = RuleRiskAssessment;

export interface SafetyConversationInput {
  messageText: string;
  history: Array<{ role: "USER" | "MOMO"; text: string }>;
}

interface DetectedSignal {
  id: string;
  state: SafetyState;
  category?: MomoSafetyCategory;
  language?: MomoSafetyLanguage;
  assessmentStep?: SafetyAssessmentStep;
}

const MEDICAL_PATTERNS: Array<[string, RegExp]> = [
  ["overdose", /\b(?:overdos(?:e|ed)|took|swallowed)\b.{0,36}\b(?:too many|pills?|tablets?|medication|medicine)\b/i],
  ["serious-bleeding", /\b(?:bleeding (?:badly|heavily|a lot)|(?:bleeding|blood) (?:will not|won['’]t|isn['’]t) stop|uncontrolled bleeding)\b/i],
  ["breathing-difficulty", /\b(?:cannot|can['’]t|struggling to|difficulty|trouble)\s+(?:breathe|breathing)\b/i],
  ["unconsciousness", /\b(?:unconscious|not breathing|passed out and (?:will not|won['’]t) wake)\b/i],
  ["serious-injury", /\b(?:serious(?:ly)? injured|life[- ]threatening injury|attempt (?:is )?(?:already )?underway)\b/i],
];

const IMMINENT_PATTERNS: Array<[string, RegExp]> = [
  ["immediate-suicide-intent", /\b(?:i(?:\s+am|['’]m)?\s+)?(?:am\s+)?(?:going to|planning to|intend to|will|about to)\s+(?:kill myself|end my life|die)(?:\s+(?:now|tonight|today|soon))?\b/i],
  ["timebound-suicide-intent", /\b(?:i\s+)?want to (?:die|kill myself|end my life)\s+(?:now|tonight|today|very soon)\b/i],
  ["immediate-self-harm-intent", /\b(?:i(?:\s+am|['’]m)?\s+)?(?:am\s+)?going to\s+(?:hurt|harm|cut|injure)\s+myself\b/i],
  ["dangerous-location-intent", /\b(?:roof|rooftop|balcony|bridge|highway|traffic|train tracks?)\b.{0,80}\b(?:jump(?:ing)?|die|kill myself|end my life|walk into)\b|\b(?:jump(?:ing)?|die|kill myself|end my life|walk into)\b.{0,80}\b(?:roof|rooftop|balcony|bridge|highway|traffic|train tracks?)\b/i],
  ["plan-access-intent", /\bplan\b.{0,100}\b(?:access|with me|have it|ready)\b.{0,100}\b(?:intend|going|tonight|now|today|do it)\b|\b(?:intend|going|tonight|now|today|do it)\b.{0,100}\bplan\b.{0,100}\b(?:access|with me|have it|ready)\b/i],
  ["cannot-stay-safe", /\b(?:cannot|can['’]t|don['’]t think i can)\s+(?:keep myself|stay)\s+safe\b/i],
  ["harm-others-immediate", /\b(?:going|planning|intend|want)\s+to\s+(?:kill|shoot|attack)\s+(?:him|her|them|someone|people|my\s+(?:partner|family|friend|boss))\b/i],
];

const SUICIDAL_PATTERNS: Array<[string, RegExp, MomoSafetyLanguage?]> = [
  ["suicidal-thoughts", /\b(?:suicidal\s+(?:thoughts?|ideas?|intent)|thinking about (?:suicide|killing myself)|thinking about (?:ending|taking) my life)\b/i],
  ["wish-to-die", /\b(?:wish i (?:could|would|were) (?:die|dead)|want (?:to die|my life to end)|would rather be dead|don['’]t want to (?:be alive|live)|do not want to (?:be alive|live)|no longer want to live)\b/i],
  ["life-not-worth-living", /\b(?:my\s+)?life (?:isn['’]t|is not|doesn['’]t feel) worth living\b/i],
  ["not-wake-up", /\b(?:wish|hope) i (?:could )?(?:go to sleep and )?not wake up\b/i],
  ["not-here-tomorrow", /\b(?:don['’]t think i(?:['’]ll| will) be here tomorrow|won['’]t be here tomorrow)\b/i],
  ["suicidal-nepali", /(?:आत्महत्या|आफ्नो\s*ज्यान|मर्न\s*मन|बाँच्न\s*मन\s*छैन)/i, "NE"],
  ["suicidal-romanized-nepali", /\b(?:aatmahatya|aafno\s*jyan|marna\s*man|bachna\s*man\s*chaina)\b/i, "NE"],
];

const SELF_HARM_PATTERNS: Array<[string, RegExp, MomoSafetyLanguage?]> = [
  ["self-harm-direct", /\b(?:want|thinking|thoughts?|feel like|urge|might|may|going)\s+(?:to\s+|of\s+|about\s+)?(?:hurt(?:ing)?|harm(?:ing)?|cut(?:ting)?|injur(?:e|ing)|burn(?:ing)?|hit(?:ting)?)\s+myself\b/i],
  ["self-harm-pain", /\b(?:cause|inflict)\s+(?:myself\s+pain|pain\s+(?:on|to)\s+myself)\b/i],
  ["self-harm-noun", /\b(?:thoughts?|urges?)\s+(?:of|to)\s+self[- ]?harm(?:ing)?\b|\b(?:want|might|may)\s+to\s+self[- ]?harm\b/i],
  ["self-harm-already", /\b(?:already|just)\s+(?:hurt|harmed|cut|injured|burned|hit)\s+myself\b/i],
  ["self-harm-nepali", /(?:आफैलाई\s*(?:हान|चोट|मार)|आफूलाई\s*चोट)/i, "NE"],
  ["self-harm-romanized-nepali", /\b(?:afulai|aafailai)\s+(?:han|chot|hurt)\b/i, "NE"],
];

const AMBIGUOUS_PATTERNS: Array<[string, RegExp]> = [
  ["cannot-do-this", /\b(?:i\s+)?can['’]t do this anymore\b/i],
  ["done-with-everything", /\b(?:i(?:\s+am|['’]m)?\s+)?done with (?:everything|all of this|this)\b/i],
  ["want-everything-to-stop", /\b(?:i\s+)?want (?:everything|all of this) to (?:stop|end|be over)\b/i],
  ["want-this-to-end", /\b(?:i\s+)?(?:just\s+)?want this to (?:stop|end|be over)\b/i],
  ["want-out", /\b(?:i\s+)?(?:just\s+)?want out(?:\s+of\s+(?:this|all of this|everything))?\b/i],
  ["cannot-keep-going", /\b(?:i\s+)?(?:don['’]t know how much longer i can|can['’]t|cannot) (?:keep going|go on)(?:\s+like this)?\b/i],
  ["want-to-disappear", /\b(?:i\s+)?(?:just\s+)?want to disappear\b/i],
  ["better-without-me", /\beveryone (?:would|will) be better (?:off )?without me\b/i],
  ["hopeless-nepali", /(?:अब\s*सक्दिन|यो\s*गर्न\s*सक्दिन)/i],
  ["hopeless-romanized-nepali", /\b(?:aba\s+sakdina|yo\s+garna\s+sakdina)\b/i],
];

const PERSONAL_RISK_EXCLUSION = /\b(?:for (?:an? )?(?:essay|assignment|research|article|story)|in (?:a|the) (?:novel|book|movie|show|article)|the (?:character|client|patient) (?:said|says)|(?:my|a) (?:friend|partner|sibling|coworker) (?:said|says|told me)|what (?:is|does|are) (?:self[- ]?harm|suicidal ideation|suicidal thoughts?)|signs of (?:suicide|self[- ]?harm)|suicide prevention education|quoted? (?:text|statement))\b/i;
const HISTORICAL_RESOLVED = /\b(?:yesterday|last (?:week|month|year)|years? ago|when i was younger|i used to)\b.{0,120}\b(?:but|and)\b.{0,60}\b(?:not now|no longer|recovered|safe now|am safe now)\b/i;
const EXPLICIT_DENIAL = /\b(?:do not|don['’]t|never|no longer|am not|i['’]m not)\b.{0,24}\b(?:hurt|harm|cut|kill)\s+myself\b/i;
const NON_SUICIDAL_DISTINCTION = /\b(?:do not|don['’]t|am not|i['’]m not)\s+(?:want(?:ing)?\s+to\s+)?(?:die|kill myself|end my life)|\bwithout (?:wanting to )?dying\b/i;
const UNRESOLVED_ANSWER = /^(?:i\s+)?(?:don['’]t know|do not know|am not sure|i['’]m not sure|unsure|maybe|can['’]t say|cannot say|don['’]t want to answer|do not want to answer|won['’]t answer|stop asking)(?:\b|[.!?])/i;
const JOKING_RETRACTION = /\b(?:i was|i['’]m|just) joking\b|\b(?:relax|forget it),?\s*(?:i was joking|it was a joke)?/i;
const CLEAR_NON_SAFETY_MEANING = /\b(?:(?:i\s+)?mean|i meant|what i mean|what i meant|i was talking about)\b.{0,160}\b(?:college|school|course|job|work|relationship|argument|conversation|situation|project|exams?|deadlines?|studying|leave|quit|stop|exhausted|tired|burned out|overwhelmed)\b/i;
const CLEAR_CONTEXTUAL_EXPLANATION = /\b(?:exhausted|tired|burned out|overwhelmed)\b.{0,100}\b(?:from|because of|with)\b.{0,80}\b(?:exams?|school|college|course|studying|work|job|project|deadlines?)\b/i;
const AFFIRMATIVE_ANSWER = /^(?:yes|yeah|yep|i am|i do|i did|right now|today|tonight)\b/i;
const NEGATIVE_ANSWER = /^(?:no|nope|not right now|not today|i am not|i['’]m not|i do not|i don['’]t|i did not|i didn['’]t)\b/i;

function normalized(text: string): string {
  return text.normalize("NFKC").trim();
}

function isClearNonSafetyExplanation(text: string): boolean {
  return CLEAR_NON_SAFETY_MEANING.test(text) || CLEAR_CONTEXTUAL_EXPLANATION.test(text);
}

const MODEL_EVIDENCE_PATTERNS: Record<ModelSafetyEvidence, RegExp> = {
  SELF_DIRECTED_HARM: /\b(?:self[- ]?harm|(?:hurt|harm|cut|burn|injure|cause pain to)\s+myself)\b/i,
  DEATH_OR_NONEXISTENCE: /\b(?:i\s+(?:want|wish|hope|would rather)\s+(?:to\s+)?(?:die|be dead|not exist|stop existing)|i\s+don['’]t want to (?:live|be alive)|my life\s+(?:to\s+end|isn['’]t worth living))\b/i,
  SUICIDAL_IDEATION: /\b(?:suicid(?:e|al)|ending my life|taking my life|kill myself)\b/i,
  PLAN_OR_ACCESS: /\b(?:plan|method|means|access|have (?:it|them) (?:with me|ready))\b/i,
  IMMEDIACY: /\b(?:right now|now|tonight|today|very soon|about to)\b/i,
  INABILITY_TO_STAY_SAFE: /\b(?:can['’]t|cannot|don['’]t think i can|unable to)\s+(?:keep myself|stay)\s+safe\b/i,
  ATTEMPT_OR_INJURY: /\b(?:attempt (?:is|already) underway|overdos(?:e|ed)|took|swallowed|bleeding|not breathing|unconscious|serious(?:ly)? injured)\b/i,
  HARM_TO_OTHERS: /\b(?:kill|shoot|attack|hurt|harm)\s+(?:him|her|them|someone|people|my\s+(?:partner|family|friend|boss))\b/i,
};

function supportedModelAssessment(
  text: string,
  model: ModelRiskAssessment | null
): ModelRiskAssessment | null {
  if (!model) return null;
  const parsed = modelRiskAssessmentSchema.safeParse(model);
  if (!parsed.success) return null;
  if (parsed.data.level === "SAFE") return parsed.data;

  const value = normalized(text);
  if (PERSONAL_RISK_EXCLUSION.test(value) || HISTORICAL_RESOLVED.test(value)) return null;
  const evidence = parsed.data.evidence.filter((item) => MODEL_EVIDENCE_PATTERNS[item].test(value));
  const substantive = evidence.filter((item) => item !== "IMMEDIACY" && item !== "PLAN_OR_ACCESS");
  if (substantive.length === 0) return null;
  if (parsed.data.category === "HARM_TO_OTHERS" && !evidence.includes("HARM_TO_OTHERS")) return null;
  if (parsed.data.category === "SELF_HARM" && evidence.includes("HARM_TO_OTHERS") && substantive.length === 1) return null;

  const imminentSupport = evidence.some((item) =>
    item === "INABILITY_TO_STAY_SAFE" || item === "ATTEMPT_OR_INJURY"
  ) || (evidence.includes("IMMEDIACY") && substantive.length > 0) ||
    (evidence.includes("PLAN_OR_ACCESS") && substantive.length > 0);

  return {
    level: parsed.data.level === "IMMINENT" && !imminentSupport ? "CONCERNING" : parsed.data.level,
    category: parsed.data.category,
    evidence,
  };
}

function signalFor(text: string): DetectedSignal | null {
  const value = normalized(text);
  if (!value || PERSONAL_RISK_EXCLUSION.test(value) || HISTORICAL_RESOLVED.test(value)) return null;
  if (EXPLICIT_DENIAL.test(value) && !/\bbut\b/i.test(value)) return null;

  for (const [id, expression] of MEDICAL_PATTERNS) {
    if (expression.test(value)) {
      return { id, state: "MEDICAL_EMERGENCY", category: "SELF_HARM", assessmentStep: "MEDICAL_TRIAGE" };
    }
  }
  for (const [id, expression] of IMMINENT_PATTERNS) {
    if (expression.test(value)) {
      return { id, state: "IMMINENT", category: id === "harm-others-immediate" ? "HARM_TO_OTHERS" : "SELF_HARM", assessmentStep: "CHECK_ALONE" };
    }
  }
  for (const [id, expression, language] of SUICIDAL_PATTERNS) {
    if (expression.test(value) && !NON_SUICIDAL_DISTINCTION.test(value)) {
      const noCurrentPlan = /\b(?:not planning|no plan|don['’]t plan|do not plan)\b.{0,32}\b(?:today|tonight|now|anything)\b/i.test(value);
      return {
        id,
        state: "SUICIDAL",
        category: "SELF_HARM",
        language,
        assessmentStep: noCurrentPlan ? "CHECK_SAFE_PERSON" : "CHECK_CURRENT_IMMEDIACY",
      };
    }
  }
  for (const [id, expression, language] of SELF_HARM_PATTERNS) {
    if (expression.test(value)) {
      const alreadyActed = id === "self-harm-already";
      return {
        id,
        state: "SELF_HARM",
        category: "SELF_HARM",
        language,
        assessmentStep: alreadyActed
          ? "MEDICAL_TRIAGE"
          : NON_SUICIDAL_DISTINCTION.test(value)
            ? "CHECK_ALREADY_ACTED"
            : "CHECK_SUICIDAL_INTENT",
      };
    }
  }
  for (const [id, expression] of AMBIGUOUS_PATTERNS) {
    if (expression.test(value)) {
      return { id, state: "CLARIFY", assessmentStep: "CLARIFY_MEANING" };
    }
  }
  return null;
}

function triggerTypeFor(state: SafetyState): SafetyTriggerType {
  switch (state) {
    case "CLARIFY": return "AMBIGUOUS_LANGUAGE";
    case "SELF_HARM": return "SELF_HARM_DISCLOSURE";
    case "SUICIDAL": return "SUICIDAL_IDEATION";
    case "IMMINENT": return "IMMINENT_DANGER";
    case "MEDICAL_EMERGENCY": return "MEDICAL_EMERGENCY";
    default: return "NONE";
  }
}

function ruleAssessmentFor(text: string): RuleRiskAssessment {
  const signal = signalFor(text);
  if (!signal) return { level: "SAFE", suggestedState: "NORMAL", matchedSignals: [] };
  const language = signal.language ?? (/\p{Script=Devanagari}/u.test(text) ? "NE" : "EN");
  return {
    level: signal.state === "IMMINENT" || signal.state === "MEDICAL_EMERGENCY" ? "IMMINENT" : "CONCERNING",
    ...(signal.category ? { category: signal.category } : {}),
    language,
    suggestedState: signal.state,
    assessmentStep: signal.assessmentStep,
    matchedSignals: [signal.id],
  };
}

function evaluationFrom(
  deterministic: RuleRiskAssessment,
  model: ModelRiskAssessment | null,
  resolution?: SafetyResolution,
  assessmentStep?: SafetyAssessmentStep,
  triggerType?: SafetyTriggerType
): SafetyEvaluation {
  const state = resolveSafetyState({ deterministic, model });
  const policy = getSafetyPolicy(state);
  const isUnresolvedConcern = resolution === "UNRESOLVED" && state !== "NORMAL" && state !== "CLARIFY";
  const requiresHumanReview = policy.humanReviewRequired || isUnresolvedConcern;
  const reviewUrgency = policy.reviewUrgency === "NONE" && isUnresolvedConcern ? "ROUTINE" : policy.reviewUrgency;
  const escalationStatus = requiresHumanReview && policy.escalationStatus === "CLARIFICATION_REQUIRED"
    ? "HUMAN_REVIEW_REQUIRED"
    : policy.escalationStatus;

  return safetyEvaluationSchema.parse({
    state,
    resolution: resolution ?? (state === "NORMAL" ? "RESOLVED_NORMAL" : "ASSESSING"),
    assessmentStep: assessmentStep ?? deterministic.assessmentStep ?? getSafetyPolicy(state).defaultAssessmentStep,
    requiresHumanReview,
    reviewUrgency,
    triggerType: triggerType ?? (deterministic.level === "SAFE" && model?.level !== "SAFE" ? "MODEL_CONCERN" : triggerTypeFor(state)),
    policyApprovalStatus: policy.approvalStatus,
    deterministic,
    model,
    escalationStatus,
  });
}

export function assessMomoSafety(text: string): MomoSafetyAssessment {
  return ruleAssessmentFor(text);
}

export function combineSafetyAssessments(
  deterministic: RuleRiskAssessment,
  model: ModelRiskAssessment | null = null
): SafetyEvaluation {
  const validatedModel = model ? modelRiskAssessmentSchema.parse(model) : null;
  return evaluationFrom(deterministic, validatedModel);
}

export function evaluateDeterministicSafety(text: string): SafetyEvaluation {
  return combineSafetyAssessments(assessMomoSafety(text));
}

function carryForward(
  previous: SafetyEvaluation,
  resolution: SafetyResolution = "UNRESOLVED",
  assessmentStep: SafetyAssessmentStep = previous.assessmentStep
): SafetyEvaluation {
  const deterministic: RuleRiskAssessment = {
    ...previous.deterministic,
    level: previous.state === "IMMINENT" || previous.state === "MEDICAL_EMERGENCY" ? "IMMINENT" : "CONCERNING",
    suggestedState: previous.state,
    assessmentStep,
    matchedSignals: [...new Set([...previous.deterministic.matchedSignals, "unresolved-follow-up"])].slice(0, 20),
  };
  return evaluationFrom(deterministic, previous.model, resolution, assessmentStep, "UNRESOLVED_FOLLOW_UP");
}

function needsSeriousClaimVerification(previous: SafetyEvaluation): boolean {
  return previous.state === "IMMINENT" || previous.state === "MEDICAL_EMERGENCY";
}

function verifySeriousClaim(previous: SafetyEvaluation): SafetyEvaluation {
  return carryForward(previous, "UNRESOLVED", "VERIFY_RETRACTED_CLAIM");
}

const SAFETY_STATE_RANK: Record<SafetyState, number> = {
  NORMAL: 0,
  CLARIFY: 1,
  SELF_HARM: 2,
  SUICIDAL: 3,
  IMMINENT: 4,
  MEDICAL_EMERGENCY: 5,
};

function transitionFrom(previous: SafetyEvaluation, text: string, current: SafetyEvaluation): SafetyEvaluation {
  if (current.state !== "NORMAL") {
    if (previous.state !== "NORMAL" && SAFETY_STATE_RANK[current.state] < SAFETY_STATE_RANK[previous.state]) {
      return carryForward(previous);
    }
    return current;
  }
  if (previous.state === "NORMAL") return current;

  const value = normalized(text);
  if (previous.state === "CLARIFY" && (isClearNonSafetyExplanation(value) || EXPLICIT_DENIAL.test(value))) {
    return current;
  }
  if (JOKING_RETRACTION.test(value) || UNRESOLVED_ANSWER.test(value)) {
    return needsSeriousClaimVerification(previous) ? verifySeriousClaim(previous) : carryForward(previous);
  }

  if (previous.state === "SELF_HARM" && NON_SUICIDAL_DISTINCTION.test(value)) {
    return evaluationFrom(
      { ...previous.deterministic, suggestedState: "SELF_HARM" }, previous.model,
      "ASSESSING", "CHECK_ALREADY_ACTED", "UNRESOLVED_FOLLOW_UP"
    );
  }

  if (AFFIRMATIVE_ANSWER.test(value)) {
    if (previous.assessmentStep === "CHECK_SUICIDAL_INTENT") {
      return evaluationFrom(
        { ...previous.deterministic, level: "CONCERNING", suggestedState: "SUICIDAL" }, previous.model,
        "ASSESSING", "CHECK_CURRENT_IMMEDIACY", "SUICIDAL_IDEATION"
      );
    }
    if (previous.assessmentStep === "CHECK_ALREADY_ACTED") {
      return evaluationFrom(
        { ...previous.deterministic, suggestedState: "SELF_HARM" }, previous.model,
        "ASSESSING", "MEDICAL_TRIAGE", "SELF_HARM_DISCLOSURE"
      );
    }
    if (previous.state === "SUICIDAL" && previous.assessmentStep === "CHECK_CURRENT_IMMEDIACY") {
      return evaluationFrom(
        { ...previous.deterministic, level: "IMMINENT", suggestedState: "IMMINENT" }, previous.model,
        "ASSESSING", "CHECK_ALONE", "IMMINENT_DANGER"
      );
    }
  }

  if (NEGATIVE_ANSWER.test(value)) {
    if (needsSeriousClaimVerification(previous) && previous.assessmentStep === "VERIFY_RETRACTED_CLAIM") {
      return carryForward(previous, "ASSESSING", "AWAIT_HUMAN_REVIEW");
    }
    if (previous.assessmentStep === "CHECK_SUICIDAL_INTENT") {
      return evaluationFrom(
        { ...previous.deterministic, suggestedState: "SELF_HARM" }, previous.model,
        "ASSESSING", "CHECK_ALREADY_ACTED", "SELF_HARM_DISCLOSURE"
      );
    }
    if (previous.assessmentStep === "CHECK_ALREADY_ACTED") {
      return evaluationFrom(
        { ...previous.deterministic, suggestedState: "SELF_HARM" }, previous.model,
        "ASSESSING", "CHECK_CURRENT_IMMEDIACY", "SELF_HARM_DISCLOSURE"
      );
    }
    if (previous.state === "SUICIDAL" && previous.assessmentStep === "CHECK_CURRENT_IMMEDIACY") {
      return evaluationFrom(
        { ...previous.deterministic, level: "CONCERNING", suggestedState: "SUICIDAL" }, previous.model,
        "ASSESSING", "CHECK_SAFE_PERSON", "SUICIDAL_IDEATION"
      );
    }
  }

  // Subject changes cannot clear a live assessment. Significant claims move
  // into explicit verification instead of replaying their initial response.
  return needsSeriousClaimVerification(previous) ? verifySeriousClaim(previous) : carryForward(previous);
}

export function evaluateConversationSafety(
  input: SafetyConversationInput,
  model: ModelRiskAssessment | null = null
): SafetyEvaluation {
  let evaluation = evaluationFrom(
    { level: "SAFE", suggestedState: "NORMAL", matchedSignals: [] }, null
  );

  for (const turn of input.history) {
    if (turn.role !== "USER") continue;
    const current = evaluateDeterministicSafety(turn.text);
    evaluation = transitionFrom(evaluation, turn.text, current);
  }

  const deterministic = assessMomoSafety(input.messageText);
  const validatedModel = supportedModelAssessment(input.messageText, model);
  const current = evaluationFrom(deterministic, validatedModel);
  return transitionFrom(evaluation, input.messageText, current);
}

export async function evaluateConversationSafetyWithClassifier(
  input: SafetyConversationInput,
  classify: (text: string) => Promise<ModelRiskAssessment | null>
): Promise<SafetyEvaluation> {
  const deterministic = evaluateConversationSafety(input);
  if (deterministic.state !== "NORMAL") return deterministic;
  try {
    const model = supportedModelAssessment(input.messageText, await classify(input.messageText));
    return model ? evaluateConversationSafety(input, model) : deterministic;
  } catch {
    return deterministic;
  }
}
