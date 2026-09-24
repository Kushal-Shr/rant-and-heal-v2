import assert from "node:assert/strict";
import test from "node:test";
import { planMomoResponse } from "../src/lib/momo/planner.ts";
import { momoDecisionInstruction } from "../src/lib/momo/responder.ts";

const input = (messageText, history = []) => ({ messageText, history });
const inference = (overrides = {}) => ({
  supportMode: "WORK_THROUGH",
  primaryNeed: "UNDERSTAND",
  intervention: "PCT_EXPLORATION",
  confidence: "MEDIUM",
  shouldClarify: false,
  clarificationTarget: null,
  ...overrides,
});

test("explicit listening preferences deterministically override contradictory inference", () => {
  for (const message of [
    "I just need to vent.",
    "Please don't give me advice.",
    "I don't want to do a thought exercise.",
  ]) {
    const decision = planMomoResponse(input(message), "NORMAL", inference({ supportMode: "DIRECT_HELP" }));
    assert.equal(decision.supportMode, "LISTEN");
    assert.equal(decision.intervention, "PCT_LISTENING");
    assert.equal(decision.userPreferenceOverride, true);
  }
});

test("implicit listening can be selected through schema-validated inference", () => {
  const decision = planMomoResponse(
    input("Everyone keeps telling me what I should do. I'm tired of people trying to fix everything."),
    "NORMAL",
    inference({ supportMode: "LISTEN", primaryNeed: "VENT", intervention: "PCT_LISTENING", confidence: "HIGH" })
  );
  assert.equal(decision.supportMode, "LISTEN");
  assert.equal(decision.userPreferenceOverride, false);
});

test("work-through routing keeps intervention selection separate", () => {
  const exploration = planMomoResponse(input("Can you help me understand why this keeps happening?"), "NORMAL");
  assert.equal(exploration.supportMode, "WORK_THROUGH");
  assert.equal(exploration.intervention, "PCT_EXPLORATION");

  assert.equal(
    planMomoResponse(input("Can we actually work through this?"), "NORMAL").supportMode,
    "WORK_THROUGH"
  );

  const cognitive = planMomoResponse(
    input("I keep thinking everyone at university thinks I'm stupid. Can you help me challenge that thought?"),
    "NORMAL"
  );
  assert.equal(cognitive.supportMode, "WORK_THROUGH");
  assert.equal(cognitive.intervention, "CBT_RESTRUCTURING");
});

test("direct-help requests and question fatigue route away from more questioning", () => {
  for (const message of [
    "Why do you keep asking me questions? Just give me an answer.",
    "Just tell me what I can actually do tomorrow.",
    "Stop asking me questions.",
  ]) {
    const decision = planMomoResponse(input(message), "NORMAL");
    assert.equal(decision.supportMode, "DIRECT_HELP");
    assert.equal(decision.intervention, "PROBLEM_SOLVING");
    assert.match(momoDecisionInstruction(decision), /Do not respond with another unnecessary question/);
  }
});

test("high activation routes to regulation without coupling it to cognitive work", () => {
  const decision = planMomoResponse(
    input("My heart is racing and I can't focus on anything you're saying."),
    "NORMAL",
    inference({
      supportMode: "REGULATE",
      primaryNeed: "EMOTIONAL_REGULATION",
      intervention: "RELAXATION",
      confidence: "HIGH",
    })
  );
  assert.equal(decision.supportMode, "REGULATE");
  assert.equal(decision.intervention, "RELAXATION");
  assert.match(momoDecisionInstruction(decision), /pause analysis or cognitive challenging/i);
});

test("unclear routing identifies a concrete clarification target", () => {
  const decision = planMomoResponse(input("I don't even know what I need right now."), "NORMAL");
  assert.equal(decision.supportMode, "UNCLEAR");
  assert.equal(decision.shouldClarify, true);
  assert.equal(decision.clarificationTarget, "SUPPORT_PREFERENCE");
  assert.equal(decision.confidence, "LOW");
  assert.match(momoDecisionInstruction(decision), /Ask exactly one natural question/);
});

test("rejecting CBT on a later turn stops it immediately", () => {
  const decision = planMomoResponse(input(
    "I don't want to do a thought exercise anymore. I just need to vent.",
    [
      { role: "USER", text: "Can you help me challenge this thought?" },
      { role: "MOMO", text: "What evidence seems to support it?" },
    ]
  ), "NORMAL", inference({ intervention: "CBT_RESTRUCTURING" }));
  assert.equal(decision.supportMode, "LISTEN");
  assert.equal(decision.intervention, "PCT_LISTENING");
  assert.equal(decision.userPreferenceOverride, true);
});

test("a new explicit preference changes mode instead of locking the conversation", () => {
  const listening = planMomoResponse(input("I just need to rant."), "NORMAL");
  assert.equal(listening.supportMode, "LISTEN");

  const direct = planMomoResponse(input(
    "Okay. What do you think I should actually do?",
    [
      { role: "USER", text: "I just need to rant." },
      { role: "MOMO", text: "You put a lot into this and still felt dismissed." },
    ]
  ), "NORMAL");
  assert.equal(direct.supportMode, "DIRECT_HELP");
});

test("invalid model output fails safely instead of inventing a confident interpretation", () => {
  const decision = planMomoResponse(input("Everything is too much."), "NORMAL", {
    supportMode: "DIAGNOSE_DEPRESSION",
  });
  assert.equal(decision.supportMode, "UNCLEAR");
  assert.equal(decision.confidence, "LOW");
  assert.equal(decision.clarificationTarget, "SUPPORT_PREFERENCE");
});

test("safety policy overrides explicit CBT or support preferences", () => {
  const decision = planMomoResponse(input("Let's do CBT."), "SELF_HARM", inference({
    supportMode: "WORK_THROUGH",
    intervention: "CBT_RESTRUCTURING",
  }));
  assert.equal(decision.primaryNeed, "PROFESSIONAL_SUPPORT");
  assert.equal(decision.intervention, "PROFESSIONAL_SUPPORT");
  assert.equal(decision.shouldClarify, true);
  assert.equal(decision.userPreferenceOverride, false);
});

test("explicit Nepali and romanized Nepali preferences route deterministically", () => {
  assert.equal(planMomoResponse(input("मलाई बस सुनिदिनु, सल्लाह नदिनु।"), "NORMAL").supportMode, "LISTEN");
  assert.equal(planMomoResponse(input("Malai sallah nadinu, bas sunidinu."), "NORMAL").supportMode, "LISTEN");
  assert.equal(planMomoResponse(input("Prasna nasodha, sidhai bhana."), "NORMAL").supportMode, "DIRECT_HELP");
});
