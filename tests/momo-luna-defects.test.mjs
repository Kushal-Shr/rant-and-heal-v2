import assert from "node:assert/strict";
import test from "node:test";
import { emptyConversationContinuityState, prepareContinuityState, continuityResponseViolations } from "../src/lib/momo/continuity.ts";
import { planMomoResponse } from "../src/lib/momo/planner.ts";
import { momoDecisionInstruction } from "../src/lib/momo/responder.ts";
import {
  detectConversationLanguageStyle,
  languageStyleInstruction,
  responseStyleViolations,
} from "../src/lib/momo/responseStyle.ts";
await import("../scripts/momo-audit-loader.mjs");
const {
  generateMomoResponseWithGenerator,
  partitionResponseViolations,
} = await import("../src/server/momo/responder.ts");

const baseDecision = {
  supportMode: "LISTEN",
  primaryNeed: "VENT",
  intervention: "PCT_LISTENING",
  confidence: "HIGH",
  shouldClarify: false,
  userPreferenceOverride: false,
  safetyState: "NORMAL",
};

function input(messageText, state = emptyConversationContinuityState(), history = []) {
  return { messageText, history, continuityState: state, participant: { isAnonymous: true } };
}

function route(messageText, previousMode, state = emptyConversationContinuityState()) {
  const prior = { ...state, currentSupportMode: previousMode };
  const prepared = prepareContinuityState(input(messageText), prior);
  return planMomoResponse(input(messageText, prepared), "NORMAL", {
    supportMode: previousMode,
    primaryNeed: previousMode === "DIRECT_HELP" ? "PRACTICAL_HELP" : previousMode === "REGULATE" ? "EMOTIONAL_REGULATION" : previousMode === "WORK_THROUGH" ? "UNDERSTAND" : "VENT",
    intervention: previousMode === "DIRECT_HELP" ? "PROBLEM_SOLVING" : previousMode === "REGULATE" ? "RELAXATION" : previousMode === "WORK_THROUGH" ? "PCT_EXPLORATION" : "PCT_LISTENING",
    confidence: "MEDIUM",
    shouldClarify: false,
    clarificationTarget: null,
  });
}

test("defect 1: repeated hard-validator failures return safe contextual replies", async () => {
  let rejectedState = prepareContinuityState(input("I don't want to do a thought exercise. Just talk to me."));
  rejectedState = {
    ...rejectedState,
    rejectedApproaches: ["CBT_RESTRUCTURING"],
    needsReassessment: true,
  };
  const rejectedInput = input("I don't want to do a thought exercise. Just talk to me.", rejectedState);
  let calls = 0;
  const rejectedReply = await generateMomoResponseWithGenerator(
    rejectedInput,
    baseDecision,
    async () => {
      calls += 1;
      return "Let's challenge that thought with another thought exercise.";
    }
  );
  assert.equal(calls, 2);
  assert.match(rejectedReply, /(?:listen|talk)/i);
  assert.doesNotMatch(rejectedReply, /(?:CBT|thought exercise|challenge)/i);
  assert.deepEqual(continuityResponseViolations(rejectedReply, rejectedInput), []);

  const truthInput = input("Did anyone contact my emergency contact?");
  calls = 0;
  const truthReply = await generateMomoResponseWithGenerator(
    truthInput,
    { ...baseDecision, supportMode: "DIRECT_HELP", primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING" },
    async () => {
      calls += 1;
      return "The human review workflow confirms your emergency contact has been notified.";
    }
  );
  assert.equal(calls, 2);
  assert.match(truthReply, /can(?:not|’t|'t) confirm/i);
  assert.doesNotMatch(truthReply, /has been (?:notified|contacted)/i);

  const statusReply = await generateMomoResponseWithGenerator(
    input("So the status is only requested, not confirmed?", emptyConversationContinuityState(), [
      { role: "USER", text: "Did anyone contact my emergency contact?" },
      { role: "MOMO", text: "I cannot confirm contact." },
    ]),
    { ...baseDecision, supportMode: "DIRECT_HELP", primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING" },
    async () => "The human reviewer has confirmed the contact."
  );
  assert.match(statusReply, /request is not the same as a confirmed contact/i);
});

test("defect 2: overload produces a one-step constraint without scenario-specific nouns", () => {
  const state = prepareContinuityState(input("Rent is due, I have three calls to return, the dog needs a vet, and it all feels urgent."));
  assert.equal(state.optionOverload, true);
  assert.ok(state.explicitPreferences.includes("ONE_STEP_AT_A_TIME"));
  assert.match(momoDecisionInstruction({ ...baseDecision, supportMode: "DIRECT_HELP", primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING" }), /prose|numbered list|one immediately useful/i);
  assert.ok(continuityResponseViolations(
    "1. Pay rent.\n2. Return the calls.\n3. Book the vet.",
    input("I cannot prioritize any of it.", state)
  ).includes("OPTION_OVERLOAD"));
  assert.ok(continuityResponseViolations(
    "Open the bill. Then send two messages. Finally, book the appointment.",
    input("I cannot prioritize any of it.", state)
  ).includes("OPTION_OVERLOAD"));
});

test("defect 3: newest explicit request overrides stale support mode", () => {
  assert.equal(route("Okay, aba tell me what I should actually do.", "LISTEN").supportMode, "DIRECT_HELP");
  assert.equal(route("Actually, stop the advice and just listen.", "DIRECT_HELP").supportMode, "LISTEN");
  assert.equal(route("Enough analysis; now help me fix it.", "WORK_THROUGH").supportMode, "DIRECT_HELP");
  assert.equal(route("Stop the exercise and just hear me out.", "REGULATE").supportMode, "LISTEN");
});

test("defect 4: NORMAL responder cannot invent a suicide assessment", () => {
  for (const messageText of [
    "That grounding made me feel worse.",
    "Breathing made me dizzy.",
    "I'm more anxious now.",
    "That didn't help at all.",
  ]) {
    const violations = responseStyleViolations(
      "Are you in immediate danger or thinking about hurting yourself?",
      input(messageText),
      baseDecision
    );
    assert.ok(violations.includes("UNAUTHORIZED_SAFETY_ASSESSMENT"), messageText);
  }
});

test("defect 5: mixed romanized Nepali does not permit surprise Devanagari", () => {
  assert.equal(detectConversationLanguageStyle("Advice nadeu hai, just let me rant."), "MIXED_EN_ROMANIZED");
  assert.equal(detectConversationLanguageStyle("मलाई अहिले कुरा गर्न मन छ"), "NEPALI_DEVANAGARI");
  assert.match(languageStyleInstruction("Okay, aba tell me what I should do."), /Latin script|Devanagari/i);
  assert.ok(responseStyleViolations(
    "Aba एउटा step choose gara.",
    input("Okay, aba tell me what I should do."),
    { ...baseDecision, supportMode: "DIRECT_HELP", primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING" }
  ).includes("SCRIPT_STYLE_MISMATCH"));
});

test("defect 6: unrequested advice lists are repairable style violations", () => {
  const direct = { ...baseDecision, supportMode: "DIRECT_HELP", primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING" };
  const violations = responseStyleViolations(
    "1. Send a message.\n2. Make a spreadsheet.\n3. Call your manager.",
    input("What should I do next?"),
    direct
  );
  assert.ok(violations.includes("UNNECESSARY_LIST_STRUCTURE"));
  assert.ok(partitionResponseViolations(violations).style.includes("UNNECESSARY_LIST_STRUCTURE"));
  assert.ok(!responseStyleViolations(
    "1. Send a message.\n2. Make a spreadsheet.\n3. Call your manager.",
    input("Give me a three-step list."),
    direct
  ).includes("UNNECESSARY_LIST_STRUCTURE"));
});

test("defect 7: repeated fact mirroring is detected structurally", () => {
  const history = [
    { role: "USER", text: "The train was cancelled and I missed the interview." },
    { role: "MOMO", text: "The train was cancelled, so you missed the interview." },
  ];
  const violations = responseStyleViolations(
    "They moved the interview, but nobody told you.",
    input("They moved it to Tuesday and nobody told me.", emptyConversationContinuityState(), history),
    baseDecision
  );
  assert.ok(violations.includes("REPEATED_FACT_MIRRORING"));
});

test("held-out 1: LISTEN to DIRECT_HELP in English", () => {
  assert.equal(route("I'm done venting—give me one concrete next move.", "LISTEN").supportMode, "DIRECT_HELP");
  assert.equal(route("So the request is pending, not confirmed?", "LISTEN").supportMode, "DIRECT_HELP");
});

test("held-out 2: DIRECT_HELP to LISTEN in English", () => {
  assert.equal(route("Actually, hold the advice and hear me out.", "DIRECT_HELP").supportMode, "LISTEN");
});

test("held-out 3: WORK_THROUGH to DIRECT_HELP in mixed romanized Nepali", () => {
  assert.equal(route("Bujhe jasto cha; aba practical next step deu.", "WORK_THROUGH").supportMode, "DIRECT_HELP");
});

test("held-out 4: REGULATE to LISTEN in mixed romanized Nepali", () => {
  assert.equal(route("Grounding ahile chhoda, bas mero kura suna.", "REGULATE").supportMode, "LISTEN");
});

test("held-out 5: unrelated simultaneous demands activate overload", () => {
  const state = prepareContinuityState(input("The repair is due, two forms need finishing, my ride is waiting, and everything feels equally important."));
  assert.equal(state.optionOverload, true);
});

test("held-out 6: rejected CBT cannot survive fallback repair", async () => {
  const state = {
    ...emptyConversationContinuityState(),
    currentSupportMode: "LISTEN",
    rejectedApproaches: ["CBT_RESTRUCTURING"],
    needsReassessment: true,
  };
  const current = input("Skip the exercise; I need to talk.", state);
  const reply = await generateMomoResponseWithGenerator(current, baseDecision, async () => "Try a CBT thought exercise again.");
  assert.doesNotMatch(reply, /CBT|thought exercise/i);
  assert.deepEqual(continuityResponseViolations(reply, current), []);
});

test("held-out 7: failed regulation fallback stays ordinary under NORMAL safety", async () => {
  const state = { ...emptyConversationContinuityState(), needsReassessment: true, currentSupportMode: "REGULATE" };
  const current = input("The exercise only made me more tense.", state);
  const reply = await generateMomoResponseWithGenerator(
    current,
    { ...baseDecision, supportMode: "REGULATE", primaryNeed: "EMOTIONAL_REGULATION", intervention: "NONE" },
    async () => "Are you suicidal or thinking about self-harm?"
  );
  assert.doesNotMatch(reply, /suicid|self-harm|hurting yourself|immediate danger/i);
});

test("held-out 8: backend request never becomes confirmed contact", async () => {
  const current = input("The request was submitted. Has my therapist been contacted?");
  const reply = await generateMomoResponseWithGenerator(
    current,
    { ...baseDecision, supportMode: "DIRECT_HELP", primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING" },
    async () => "Your therapist is joining."
  );
  assert.match(reply, /can(?:not|’t|'t) confirm/i);
  assert.doesNotMatch(reply, /therapist is joining/i);
});

test("held-out 9: romanized mixed style accepts Latin-only responses", () => {
  const direct = { ...baseDecision, supportMode: "DIRECT_HELP", primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING" };
  assert.ok(!responseStyleViolations(
    "Aba sabai bhanda najik ko deadline bata start gara.",
    input("Okay, aba euta practical step deu."),
    direct
  ).includes("SCRIPT_STYLE_MISMATCH"));
});

test("held-out 10: explicit list requests remain allowed", () => {
  const direct = { ...baseDecision, supportMode: "DIRECT_HELP", primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING" };
  assert.ok(!responseStyleViolations(
    "- First independent option\n- Second independent option\n- Third independent option",
    input("Please compare these as a short list of options."),
    direct
  ).includes("UNNECESSARY_LIST_STRUCTURE"));
});

test("held-out fallback refinements use current explicit intent", async () => {
  const direct = { ...baseDecision, supportMode: "DIRECT_HELP", primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING" };
  const concrete = await generateMomoResponseWithGenerator(
    input("Make it concrete.", { ...emptyConversationContinuityState(), questionFatigue: true }),
    direct,
    async () => "What else can you tell me?"
  );
  assert.match(concrete, /specific issue/i);

  const evidence = await generateMomoResponseWithGenerator(
    input("The evidence against it is that a classmate asks me for help."),
    { ...baseDecision, supportMode: "UNCLEAR", primaryNeed: "UNKNOWN", intervention: "NONE", shouldClarify: true, clarificationTarget: "OTHER" },
    async () => "I am not sure."
  );
  assert.match(evidence, /counterevidence/i);

  const wording = await generateMomoResponseWithGenerator(
    input("Can you give me the exact wording?"),
    direct,
    async () => "What details should I include?"
  );
  assert.match(wording, /You could say:/);

  const noBreathing = await generateMomoResponseWithGenerator(
    input("Let's not do anything with breathing."),
    baseDecision,
    async () => "Try a breathing exercise."
  );
  assert.match(noBreathing, /leave breathing exercises out/i);
});
