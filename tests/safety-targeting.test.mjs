import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateConversationSafety,
  evaluateConversationSafetyWithClassifier,
} from "../src/lib/safety/detector.ts";
import {
  safetyResponseFamilyFor,
  safetyResponseFor,
} from "../src/lib/safety/responses.ts";
import { modelRiskAssessmentSchema } from "../src/lib/safety/schemas.ts";

const input = (messageText, history = []) => ({ messageText, history });
const questionCount = (text) => (text.match(/\?/g) ?? []).length;

function resultFor(messageText, history = []) {
  const evaluation = evaluateConversationSafety(input(messageText, history));
  return {
    evaluation,
    family: safetyResponseFamilyFor(evaluation),
    response: safetyResponseFor(evaluation, { messageText }),
  };
}

const freshCases = [
  {
    name: "self-directed near-term threat",
    message: "I am going to kill myself tonight.",
    state: "IMMINENT",
    target: "SELF",
    step: "CREATE_DISTANCE",
    review: true,
    urgency: "IMMEDIATE",
    family: "IMMINENT_SELF",
  },
  {
    name: "other-directed near-term threat",
    message: "I am going to kill my boss tonight.",
    state: "IMMINENT",
    target: "OTHER",
    step: "CREATE_DISTANCE",
    review: true,
    urgency: "IMMEDIATE",
    family: "IMMINENT_OTHER",
  },
  {
    name: "about-to language establishes near-term other-directed intent",
    message: "I am about to attack my coworker.",
    state: "IMMINENT",
    target: "OTHER",
    step: "CREATE_DISTANCE",
    review: true,
    urgency: "IMMEDIATE",
    family: "IMMINENT_OTHER",
  },
  {
    name: "bounded near-term timeframe establishes other-directed imminence",
    message: "I intend to hurt my roommate tomorrow.",
    state: "IMMINENT",
    target: "OTHER",
    step: "CREATE_DISTANCE",
    review: true,
    urgency: "IMMEDIATE",
    family: "IMMINENT_OTHER",
  },
  {
    name: "credible other-directed intent without timeframe asks immediacy",
    message: "I want to hurt my boss.",
    state: "CLARIFY",
    target: "OTHER",
    step: "CHECK_CURRENT_IMMEDIACY",
    review: true,
    urgency: "ROUTINE",
    family: "VIOLENCE_CLARIFICATION",
  },
  {
    name: "ambiguous angry language asks what the user means",
    message: "I was so mad I could hurt him.",
    state: "CLARIFY",
    target: "OTHER",
    step: "CLARIFY_MEANING",
    review: false,
    urgency: "NONE",
    family: "VIOLENCE_CLARIFICATION",
  },
  {
    name: "figurative violence stays in ordinary support",
    message: "That exam murdered me.",
    state: "NORMAL",
    target: "NONE",
    step: "NONE",
    review: false,
    urgency: "NONE",
    family: "NORMAL",
  },
  {
    name: "plan and access with no named target remains target-unclear",
    message: "I have a plan, I have access to it, and I intend to do it now.",
    state: "IMMINENT",
    target: "UNCLEAR",
    step: "CLARIFY_TARGET",
    review: true,
    urgency: "IMMEDIATE",
    family: "IMMINENT_UNCLEAR",
  },
  {
    name: "independently present self and other risk selects both",
    message: "I am going to kill myself and my boss tonight.",
    state: "IMMINENT",
    target: "BOTH",
    step: "CREATE_DISTANCE",
    review: true,
    urgency: "IMMEDIATE",
    family: "IMMINENT_BOTH",
  },
  {
    name: "both-risk target order does not change classification",
    message: "I am going to kill my boss and myself tonight.",
    state: "IMMINENT",
    target: "BOTH",
    step: "CREATE_DISTANCE",
    review: true,
    urgency: "IMMEDIATE",
    family: "IMMINENT_BOTH",
  },
  {
    name: "resolved historical violence reference is not current danger",
    message: "Years ago I wanted to hurt someone, but I am safe now.",
    state: "NORMAL",
    target: "NONE",
    step: "NONE",
    review: false,
    urgency: "NONE",
    family: "NORMAL",
  },
  {
    name: "quoted violence statement is not attributed to the user",
    message: "My coworker said, 'I am going to kill my boss tonight.'",
    state: "NORMAL",
    target: "NONE",
    step: "NONE",
    review: false,
    urgency: "NONE",
    family: "NORMAL",
  },
  {
    name: "fictional violence discussion is not current danger",
    message: "In my screenplay, the villain says he will kill someone tonight.",
    state: "NORMAL",
    target: "NONE",
    step: "NONE",
    review: false,
    urgency: "NONE",
    family: "NORMAL",
  },
  {
    name: "educational violence discussion is not current danger",
    message: "For an assignment, what are signs of violence risk?",
    state: "NORMAL",
    target: "NONE",
    step: "NONE",
    review: false,
    urgency: "NONE",
    family: "NORMAL",
  },
];

test("target-aware safety matrix separates severity, target, progression, and response family", () => {
  for (const scenario of freshCases) {
    const { evaluation, family, response } = resultFor(scenario.message);
    assert.equal(evaluation.state, scenario.state, `${scenario.name}: state`);
    assert.equal(evaluation.safetyTarget, scenario.target, `${scenario.name}: target`);
    assert.equal(evaluation.assessmentStep, scenario.step, `${scenario.name}: step`);
    assert.equal(evaluation.requiresHumanReview, scenario.review, `${scenario.name}: review`);
    assert.equal(evaluation.reviewUrgency, scenario.urgency, `${scenario.name}: urgency`);
    assert.equal(family, scenario.family, `${scenario.name}: response family`);
    assert.ok(questionCount(response) <= 1, `${scenario.name}: ${response}`);
  }
});

test("OTHER responses never use self-directed instructions without independent self risk", () => {
  const otherDirectedMessages = [
    "I am going to kill my boss tonight.",
    "I am about to attack my coworker.",
    "I want to hurt my boss.",
    "I was so mad I could hurt him.",
  ];

  for (const message of otherDirectedMessages) {
    const { evaluation, response } = resultFor(message);
    assert.equal(evaluation.safetyTarget, "OTHER", message);
    assert.doesNotMatch(
      response,
      /(?:hurt|harm|kill) yourself|ending your life|end your life/i,
      `${message}: ${response}`
    );
  }
});

test("SELF responses do not introduce another-person protection language", () => {
  const { evaluation, response } = resultFor("I am going to kill myself tonight.");
  assert.equal(evaluation.safetyTarget, "SELF");
  assert.doesNotMatch(
    response,
    /person (?:at risk|you might harm)|other people|someone else|anyone else/i
  );
});

const progressionCases = [
  {
    name: "other-directed retraction is verified",
    current: "Relax, I was joking.",
    history: [{ role: "USER", text: "I am going to kill my boss tonight." }],
    state: "IMMINENT",
    target: "OTHER",
    step: "VERIFY_RETRACTED_CLAIM",
    resolution: "UNRESOLVED",
    urgency: "IMMEDIATE",
    family: "IMMINENT_OTHER",
  },
  {
    name: "subject change cannot clear other-directed imminent risk",
    current: "What movies are playing?",
    history: [{ role: "USER", text: "I am going to kill my boss tonight." }],
    state: "IMMINENT",
    target: "OTHER",
    step: "VERIFY_RETRACTED_CLAIM",
    resolution: "UNRESOLVED",
    urgency: "IMMEDIATE",
    family: "IMMINENT_OTHER",
  },
  {
    name: "uncertain answer carries active other-directed risk forward",
    current: "I do not know.",
    history: [{ role: "USER", text: "I am going to kill my boss tonight." }],
    state: "IMMINENT",
    target: "OTHER",
    step: "VERIFY_RETRACTED_CLAIM",
    resolution: "UNRESOLVED",
    urgency: "IMMEDIATE",
    family: "IMMINENT_OTHER",
  },
  {
    name: "affirmed immediacy escalates credible other-directed concern",
    current: "Yes.",
    history: [{ role: "USER", text: "I want to hurt my boss." }],
    state: "IMMINENT",
    target: "OTHER",
    step: "CREATE_DISTANCE",
    resolution: "ASSESSING",
    urgency: "IMMEDIATE",
    family: "IMMINENT_OTHER",
  },
];

test("other-directed multi-turn progression preserves target and human-review intent", () => {
  for (const scenario of progressionCases) {
    const { evaluation, family, response } = resultFor(scenario.current, scenario.history);
    assert.equal(evaluation.state, scenario.state, `${scenario.name}: state`);
    assert.equal(evaluation.safetyTarget, scenario.target, `${scenario.name}: target`);
    assert.equal(evaluation.assessmentStep, scenario.step, `${scenario.name}: step`);
    assert.equal(evaluation.resolution, scenario.resolution, `${scenario.name}: resolution`);
    assert.equal(evaluation.requiresHumanReview, true, `${scenario.name}: review`);
    assert.equal(evaluation.reviewUrgency, scenario.urgency, `${scenario.name}: urgency`);
    assert.equal(family, scenario.family, `${scenario.name}: response family`);
    assert.doesNotMatch(response, /(?:hurt|harm|kill) yourself|ending your life/i);
    assert.ok(questionCount(response) <= 1, `${scenario.name}: ${response}`);
  }
});

test("a clear figurative explanation resolves ambiguous anger but not a credible threat", () => {
  const ambiguous = evaluateConversationSafety(input(
    "I was just angry; I will not hurt anyone.",
    [{ role: "USER", text: "I was so mad I could hurt him." }]
  ));
  assert.equal(ambiguous.state, "NORMAL");
  assert.equal(ambiguous.safetyTarget, "NONE");

  const credible = evaluateConversationSafety(input(
    "No, I will not hurt him.",
    [{ role: "USER", text: "I want to hurt my boss." }]
  ));
  assert.equal(credible.state, "CLARIFY");
  assert.equal(credible.safetyTarget, "OTHER");
  assert.equal(credible.assessmentStep, "AWAIT_HUMAN_REVIEW");
  assert.equal(credible.requiresHumanReview, true);
});

test("bounded classifier evidence validates target and rejects mismatches or rationale", async () => {
  const modelOnlyOther = await evaluateConversationSafetyWithClassifier(
    input("Tonight, harming someone is what I intend to do."),
    async () => ({
      level: "IMMINENT",
      target: "OTHER",
      category: "HARM_TO_OTHERS",
      evidence: ["HARM_TO_OTHERS", "INTENT", "IMMEDIACY"],
    })
  );
  assert.equal(modelOnlyOther.state, "IMMINENT");
  assert.equal(modelOnlyOther.safetyTarget, "OTHER");
  assert.equal(modelOnlyOther.requiresHumanReview, true);

  const mismatchedTarget = await evaluateConversationSafetyWithClassifier(
    input("I want to stop existing."),
    async () => ({
      level: "CONCERNING",
      target: "OTHER",
      category: "HARM_TO_OTHERS",
      evidence: ["DEATH_OR_NONEXISTENCE"],
    })
  );
  assert.equal(mismatchedTarget.state, "NORMAL");
  assert.equal(mismatchedTarget.safetyTarget, "NONE");

  assert.equal(modelRiskAssessmentSchema.safeParse({
    level: "CONCERNING",
    target: "OTHER",
    category: "HARM_TO_OTHERS",
    evidence: ["HARM_TO_OTHERS"],
    rationale: "free-form reasoning is forbidden",
  }).success, false);

  assert.equal(modelRiskAssessmentSchema.safeParse({
    level: "CONCERNING",
    target: "SELF",
    category: "HARM_TO_OTHERS",
    evidence: ["SELF_DIRECTED_HARM"],
  }).success, false);
});

test("BOTH responses mention both risk domains while preserving one immediate action", () => {
  const { evaluation, family, response } = resultFor(
    "I am going to kill myself and my boss tonight."
  );
  assert.equal(evaluation.safetyTarget, "BOTH");
  assert.equal(family, "IMMINENT_BOTH");
  assert.match(response, /yourself/i);
  assert.match(response, /someone else/i);
  assert.equal(questionCount(response), 0);
});
