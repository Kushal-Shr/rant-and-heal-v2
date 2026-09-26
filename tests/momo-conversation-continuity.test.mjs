import assert from "node:assert/strict";
import test from "node:test";
import {
  continuityInstruction,
  continuityResponseViolations,
  emptyConversationContinuityState,
  finalizeContinuityState,
  parseConversationContinuityState,
  prepareContinuityState,
} from "../src/lib/momo/continuity.ts";
import { planMomoResponse } from "../src/lib/momo/planner.ts";
import { orchestrateMomoTurn } from "../src/lib/momo/orchestrator.ts";
import { MOMO_PCT_PROMPT } from "../src/lib/momo/prompts/pct.ts";
import { composeMomoSystemInstruction } from "../src/lib/momo/responder.ts";
import { evaluateDeterministicSafety } from "../src/lib/safety/detector.ts";

const NOW = new Date("2026-09-26T12:00:00.000Z");
const input = (messageText, history = [], continuityState) => ({
  messageText,
  history,
  ...(continuityState ? { continuityState } : {}),
});
const inference = (overrides = {}) => ({
  supportMode: "WORK_THROUGH",
  primaryNeed: "UNDERSTAND",
  intervention: "PCT_EXPLORATION",
  confidence: "HIGH",
  shouldClarify: false,
  clarificationTarget: null,
  ...overrides,
});
const decision = (overrides = {}) => ({
  supportMode: "REGULATE",
  primaryNeed: "EMOTIONAL_REGULATION",
  intervention: "RELAXATION",
  confidence: "HIGH",
  shouldClarify: false,
  userPreferenceOverride: true,
  safetyState: "NORMAL",
  ...overrides,
});

function afterMomo(state, reply, route = decision()) {
  return finalizeContinuityState(state, route, reply, NOW).state;
}

test("rejected and worsening breathing is remembered and cannot silently resurface", () => {
  let state = afterMomo(emptyConversationContinuityState(), "Let's try a short breathing exercise.");
  state = prepareContinuityState(input("Breathing makes me dizzy."), state, NOW);

  assert.equal(state.recentInterventions.at(-1).approach, "BREATHING");
  assert.equal(state.recentInterventions.at(-1).outcome, "WORSE");
  assert.ok(state.rejectedApproaches.includes("BREATHING"));
  assert.equal(state.needsReassessment, true);
  assert.ok(continuityResponseViolations(
    "Let's return to breathing for another round.",
    input("same", [], state),
    state
  ).includes("REJECTED_APPROACH"));

  const explicitRetry = continuityResponseViolations(
    "We can try breathing again, gently.",
    input("Can we try breathing again?", [], state),
    state
  );
  assert.equal(explicitRetry.includes("REJECTED_APPROACH"), false);
});

test("grounding rejection, stopped exercises, worse outcomes, and no change are bounded outcomes", () => {
  const cases = [
    ["Let's use grounding.", "Grounding didn't help.", "GROUNDING", "NO_CHANGE"],
    ["Let's try progressive muscle relaxation.", "I want to stop the exercise.", "PMR", "STOPPED"],
    ["Let's use guided imagery.", "This made it worse.", "GUIDED_IMAGERY", "WORSE"],
    ["Let's try a mindful pause.", "Nothing changed.", "MINDFUL_PAUSE", "NO_CHANGE"],
  ];

  for (const [reply, report, approach, outcome] of cases) {
    const offered = afterMomo(emptyConversationContinuityState(), reply);
    const state = prepareContinuityState(input(report), offered, NOW);
    assert.equal(state.recentInterventions.at(-1).approach, approach, report);
    assert.equal(state.recentInterventions.at(-1).outcome, outcome, report);
    assert.ok(state.rejectedApproaches.includes(approach), report);
    assert.equal(state.needsReassessment, true, report);
  }
});

test("no improvement suppresses automatic intervention repetition and requests reassessment", () => {
  let state = afterMomo(emptyConversationContinuityState(), "Let's try grounding for a moment.");
  state = prepareContinuityState(input("Nothing changed."), state, NOW);
  const planned = planMomoResponse(
    input("Nothing changed.", [], state),
    "NORMAL",
    inference({
      supportMode: "REGULATE",
      primaryNeed: "EMOTIONAL_REGULATION",
      intervention: "RELAXATION",
    })
  );

  assert.equal(planned.supportMode, "REGULATE");
  assert.equal(planned.intervention, "NONE");
  assert.match(continuityInstruction(state), /Reassess the current need now/i);
  assert.ok(continuityResponseViolations(
    "Let's immediately try a breathing exercise instead.",
    input("Nothing changed.", [], state),
    state
  ).includes("REASSESSMENT_REQUIRED"));
});

test("a helpful intervention is remembered as influence rather than a permanent selection", () => {
  let state = afterMomo(emptyConversationContinuityState(), "Let's use grounding.");
  state = prepareContinuityState(input("That helped. I feel calmer."), state, NOW);
  const prompt = continuityInstruction(state);

  assert.equal(state.recentInterventions.at(-1).outcome, "HELPED");
  assert.equal(state.recentInterventions.at(-1).approach, "GROUNDING");
  assert.equal(state.needsReassessment, false);
  assert.match(prompt, /previous success may inform but must never dictate/i);
  assert.doesNotMatch(prompt, /must use grounding/i);
});

test("option overload persists, rejects menus, and allows one low-burden step", () => {
  const state = prepareContinuityState(
    input("There are too many options. Just pick one."),
    emptyConversationContinuityState(),
    NOW
  );
  assert.equal(state.optionOverload, true);
  assert.ok(state.explicitPreferences.includes("MINIMAL_OPTIONS"));
  assert.match(continuityInstruction(state), /Do not offer a menu/i);

  const menu = continuityResponseViolations(
    "1. Try breathing\n2. Try grounding\n3. Try guided imagery",
    input("What should I do?", [], state),
    state
  );
  assert.ok(menu.includes("OPTION_OVERLOAD"));
  assert.equal(continuityResponseViolations(
    "Put the deadline at the top of the page and work only on that for ten minutes.",
    input("What should I do?", [], state),
    state
  ).includes("OPTION_OVERLOAD"), false);

  const cleared = prepareContinuityState(input("I'm ready to consider more options."), state, NOW);
  assert.equal(cleared.optionOverload, false);
});

test("technique uncertainty uses the active regulation goal instead of returning a menu", () => {
  const prior = {
    ...emptyConversationContinuityState(),
    currentSupportMode: "REGULATE",
    currentGoal: "REGULATE",
  };
  const state = prepareContinuityState(input("I don't know what helps."), prior, NOW);
  const route = planMomoResponse(
    input("I don't know what helps.", [], state),
    "NORMAL",
    inference({
      supportMode: "UNCLEAR",
      primaryNeed: "UNKNOWN",
      intervention: "NONE",
      shouldClarify: true,
      clarificationTarget: "SUPPORT_PREFERENCE",
    })
  );
  assert.equal(state.optionOverload, true);
  assert.equal(route.supportMode, "REGULATE");
  assert.equal(route.intervention, "RELAXATION");
  assert.equal(route.shouldClarify, false);
  assert.match(continuityInstruction(state), /select one low-burden next step/i);
});

test("current support goal follows explicit LISTEN to DIRECT_HELP to REGULATE changes", () => {
  let state = prepareContinuityState(input("I just need to rant."), emptyConversationContinuityState(), NOW);
  let route = planMomoResponse(input("I just need to rant.", [], state), "NORMAL");
  state = afterMomo(state, "Go on.", route);
  assert.equal(route.supportMode, "LISTEN");
  assert.equal(state.currentGoal, "VENT");

  state = prepareContinuityState(input("Actually, what should I do?"), state, NOW);
  route = planMomoResponse(input("Actually, what should I do?", [], state), "NORMAL");
  state = afterMomo(state, "Start with the deadline due today.", route);
  assert.equal(route.supportMode, "DIRECT_HELP");
  assert.equal(state.currentGoal, "PRACTICAL_HELP");

  state = prepareContinuityState(input("Help me calm down first."), state, NOW);
  route = planMomoResponse(input("Help me calm down first.", [], state), "NORMAL");
  state = afterMomo(state, "Notice where your feet meet the floor.", route);
  assert.equal(route.supportMode, "REGULATE");
  assert.equal(state.currentGoal, "REGULATE");
});

test("short contextual replies retain the active mode instead of restarting", () => {
  const state = {
    ...emptyConversationContinuityState(),
    currentSupportMode: "WORK_THROUGH",
    currentGoal: "UNDERSTAND",
  };
  for (const message of ["idk", "no", "same", "go on", "I hate this"]) {
    const result = planMomoResponse(
      input(message, [{ role: "MOMO", text: "Let's keep looking at what happened." }], state),
      "NORMAL",
      inference({
        supportMode: "UNCLEAR",
        primaryNeed: "UNKNOWN",
        intervention: "NONE",
        shouldClarify: true,
        clarificationTarget: "SUPPORT_PREFERENCE",
      })
    );
    assert.equal(result.supportMode, "WORK_THROUGH", message);
    assert.equal(result.shouldClarify, false, message);
  }
  const attemptedFlip = planMomoResponse(
    input("same", [{ role: "MOMO", text: "Let's keep looking at what happened." }], state),
    "NORMAL",
    inference({
      supportMode: "DIRECT_HELP",
      primaryNeed: "PRACTICAL_HELP",
      intervention: "PROBLEM_SOLVING",
    })
  );
  assert.equal(attemptedFlip.supportMode, "WORK_THROUGH");
  assert.equal(attemptedFlip.intervention, "PCT_EXPLORATION");
});

test("user corrections persist across later turns without speculative labels", () => {
  let state = prepareContinuityState(
    input("I'm not frustrated—I'm confused."),
    emptyConversationContinuityState(),
    NOW
  );
  state = afterMomo(state, "Okay—confused about which deadline applies.", decision({
    supportMode: "LISTEN",
    primaryNeed: "VENT",
    intervention: "PCT_LISTENING",
  }));
  state = prepareContinuityState(input("same"), state, NOW);
  state = afterMomo(state, "The deadline is still unclear.", decision({
    supportMode: "LISTEN",
    primaryNeed: "VENT",
    intervention: "PCT_LISTENING",
  }));

  assert.equal(state.userCorrections.length, 1);
  assert.equal(state.userCorrections[0].rejectedTerm, "frustrated");
  assert.equal(state.userCorrections[0].preferredTerm, "confused");
  assert.match(continuityInstruction(state), /was corrected to.*confused/i);
});

test("question fatigue persists until the user explicitly invites questions", () => {
  let state = prepareContinuityState(
    input("I'm tired of questions. Stop asking me."),
    emptyConversationContinuityState(),
    NOW
  );
  assert.equal(state.questionFatigue, true);
  assert.ok(continuityResponseViolations(
    "What feels most important right now?",
    input("same", [], state),
    state
  ).includes("QUESTION_FATIGUE"));

  state = prepareContinuityState(input("You can ask me a question now."), state, NOW);
  assert.equal(state.questionFatigue, false);
  assert.equal(state.explicitPreferences.includes("NO_QUESTIONS"), false);
});

test("no-advice preference persists until the user explicitly changes it", () => {
  let state = prepareContinuityState(
    input("I don't want advice. Just listen."),
    emptyConversationContinuityState(),
    NOW
  );
  const conflictingInference = inference({
    supportMode: "DIRECT_HELP",
    primaryNeed: "PRACTICAL_HELP",
    intervention: "PROBLEM_SOLVING",
  });
  const preserved = planMomoResponse(
    input("They changed it again today.", [], state),
    "NORMAL",
    conflictingInference
  );
  assert.equal(preserved.supportMode, "LISTEN");
  assert.equal(preserved.intervention, "PCT_LISTENING");

  state = prepareContinuityState(input("Okay, give me advice now."), state, NOW);
  const changed = planMomoResponse(input("Okay, give me advice now.", [], state), "NORMAL");
  assert.equal(state.explicitPreferences.includes("NO_ADVICE"), false);
  assert.equal(changed.supportMode, "DIRECT_HELP");
});

test("semantic repetition catches reworded questions and recycled replies", () => {
  const state = {
    ...emptyConversationContinuityState(),
    recentResponseShapes: ["QUESTION", "QUESTION", "QUESTION"],
  };
  const history = [
    { role: "MOMO", text: "Which part of this deadline feels most important to handle first?" },
    { role: "USER", text: "The report." },
    { role: "MOMO", text: "Start with the report section due today, then leave the rest alone." },
  ];
  const repeatedQuestion = continuityResponseViolations(
    "What feels most important about this deadline?",
    input("same", history, state),
    state
  );
  assert.ok(repeatedQuestion.includes("REPEATED_QUESTION"));
  assert.ok(repeatedQuestion.includes("REPEATED_SHAPE"));

  const recycled = continuityResponseViolations(
    "Start with the report section due today, then leave the rest alone.",
    input("okay", history, state),
    state
  );
  assert.ok(recycled.includes("RECYCLED_RESPONSE"));
});

test("a rejected task-list recommendation remains excluded", () => {
  let state = afterMomo(
    emptyConversationContinuityState(),
    "Make a task list and rank all the tasks.",
    decision({ supportMode: "DIRECT_HELP", primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING" })
  );
  state = prepareContinuityState(input("Listing everything makes me feel worse."), state, NOW);
  assert.ok(state.rejectedApproaches.includes("TASK_LISTING"));
  assert.ok(continuityResponseViolations(
    "Start with a task list of everything you need to do.",
    input("What should I do now?", [], state),
    state
  ).includes("REJECTED_APPROACH"));
});

test("composed responder policy uses continuity without regressing PCT or greeting rules", () => {
  const state = {
    ...emptyConversationContinuityState(),
    currentSupportMode: "LISTEN",
    currentGoal: "BE_HEARD",
    explicitPreferences: ["NO_ADVICE"],
  };
  const route = decision({
    supportMode: "LISTEN",
    primaryNeed: "VENT",
    intervention: "PCT_LISTENING",
  });
  const prompt = composeMomoSystemInstruction(MOMO_PCT_PROMPT, route, { continuityState: state });
  assert.match(prompt, /Continue that goal unless the newest user turn changes it/i);
  assert.match(prompt, /Do not restart, re-greet/i);
  assert.match(prompt, /USER-STATED facts, emotions, concerns, and preferences/i);
  assert.match(prompt, /If conversation history exists, continue it.*Do not greet the user again/is);
});

test("safety bypass remains authoritative over every continuity preference", async () => {
  const state = {
    ...emptyConversationContinuityState(),
    currentSupportMode: "LISTEN",
    currentGoal: "BE_HEARD",
    explicitPreferences: ["NO_ADVICE", "NO_QUESTIONS"],
    optionOverload: true,
    questionFatigue: true,
  };
  let planned = false;
  let responded = false;
  const result = await orchestrateMomoTurn(
    input("I'm going to kill myself tonight.", [], state),
    {
      evaluateSafety: evaluateDeterministicSafety,
      plan: () => { planned = true; return decision(); },
      respond: async () => { responded = true; return "ordinary response"; },
      safetyResponse: () => "safety response",
    }
  );
  assert.equal(result.kind, "SAFETY_RESPONSE");
  assert.equal(result.safety.state, "IMMINENT");
  assert.equal(planned, false);
  assert.equal(responded, false);
});

test("continuity storage is bounded and excludes transcripts, journals, diagnoses, and rationale", () => {
  let state = emptyConversationContinuityState();
  for (let index = 0; index < 15; index += 1) {
    state = afterMomo(state, `Let's try breathing. ${index}`);
    state = prepareContinuityState(input("It didn't help."), state, new Date(NOW.getTime() + index * 1000));
  }
  const parsed = parseConversationContinuityState(state);
  const diagnosticCorrection = prepareContinuityState(
    input("I'm not tired—I'm diagnosed with depression."),
    parsed,
    NOW
  );
  assert.equal(diagnosticCorrection.userCorrections.length, parsed.userCorrections.length);
  assert.ok(parsed.recentInterventions.length <= 8);
  assert.ok(parsed.recentResponseShapes.length <= 8);
  assert.deepEqual(Object.keys(parsed).sort(), [
    "currentGoal",
    "currentSupportMode",
    "explicitPreferences",
    "needsReassessment",
    "optionOverload",
    "questionFatigue",
    "recentInterventions",
    "recentQuestionTargets",
    "recentResponseShapes",
    "rejectedApproaches",
    "userCorrections",
    "version",
  ].sort());
  const serialized = JSON.stringify(parsed).toLowerCase();
  for (const forbidden of ["journal", "full transcript", "diagnosis", "rationale", "chain-of-thought", "hidden reasoning"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
