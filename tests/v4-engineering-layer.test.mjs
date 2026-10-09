import assert from "node:assert/strict";
import test from "node:test";
import { orchestrateMomoTurn } from "../src/lib/momo/orchestrator.ts";
import { AI_MODEL_CONFIGS, AI_MODELS, THINKING_LEVELS } from "../src/lib/ai/models.ts";
import { planMomoResponse } from "../src/lib/momo/planner.ts";
import { momoDecisionSchema } from "../src/lib/momo/schemas.ts";
import { evaluateDeterministicSafety } from "../src/lib/safety/detector.ts";
import { safetyStateSchema } from "../src/lib/safety/schemas.ts";
import { weeklyReportSchema } from "../src/lib/reports/schemas.ts";
import {
  canTransitionRelationship,
  therapyRelationshipStatusSchema,
} from "../src/lib/therapy/relationships.ts";

const validDecision = {
  supportMode: "LISTEN",
  primaryNeed: "VENT",
  intervention: "PCT_LISTENING",
  confidence: "HIGH",
  shouldClarify: false,
  userPreferenceOverride: true,
  safetyState: "NORMAL",
};

test("V4 model registry and thinking levels match the centralized architecture", () => {
  assert.deepEqual(AI_MODELS, {
    MOMO_PLANNER: "gemini-3.8-flash",
    MOMO_RESPONSE: "gpt-5.6-luna",
    SAFETY_CLASSIFIER: "gemini-3.8-flash",
    SAFETY_SUPERVISOR: "gemini-3.8-flash",
    MOOD_EXTRACTION: "gemini-3.8-flash",
    SESSION_SUMMARY: "gemini-3.8-flash",
    THERAPY_NOTE: "gemini-3.8-flash",
    WEEKLY_REFLECTION: "gemini-3.8-flash",
    WEEKLY_THERAPY_SUMMARY: "gemini-3.8-flash",
    BACKGROUND_LIGHT: "gemini-3.5-flash-lite",
    VOICE: "gpt-live-1",
    TRANSCRIPTION: "gemini-3.5-transcribe",
    EMBEDDING: "gemini-embedding-2",
  });
  assert.deepEqual(AI_MODEL_CONFIGS.MOMO_RESPONSE, {
    provider: "openai",
    model: "gpt-5.6-luna",
  });
  assert.deepEqual(AI_MODEL_CONFIGS.MOMO_VOICE, {
    provider: "openai",
    model: "gpt-live-1",
  });
  assert.deepEqual(THINKING_LEVELS, {
    MOMO_PLANNER: "low",
    MOMO_RESPONSE: "medium",
    SAFETY_CLASSIFIER: "medium",
    SAFETY_SUPERVISOR: "high",
    MOOD_EXTRACTION: "low",
    SESSION_SUMMARY: "low",
    THERAPY_NOTE: "medium",
    WEEKLY_REFLECTION: "high",
    WEEKLY_THERAPY_SUMMARY: "high",
  });
});

test("MomoDecision accepts known routing values and rejects invalid support modes", () => {
  assert.deepEqual(momoDecisionSchema.parse(validDecision), validDecision);
  assert.equal(momoDecisionSchema.safeParse({ ...validDecision, supportMode: "THERAPIST_AGENT" }).success, false);
});

test("SafetyState accepts the normalized states and rejects unknown states", () => {
  for (const state of ["NORMAL", "CLARIFY", "SELF_HARM", "SUICIDAL", "IMMINENT", "MEDICAL_EMERGENCY"]) {
    assert.equal(safetyStateSchema.parse(state), state);
  }
  assert.equal(safetyStateSchema.safeParse("UNSAFE").success, false);
});

test("Momo orchestration bypasses planning and response generation for immediate safety", async () => {
  let planned = false;
  let responded = false;
  const result = await orchestrateMomoTurn(
    { messageText: "I am going to kill myself tonight", history: [] },
    {
      evaluateSafety: evaluateDeterministicSafety,
      plan: () => { planned = true; return validDecision; },
      respond: async () => { responded = true; return "normal response"; },
      safetyResponse: () => "fixed safety response",
    }
  );
  assert.equal(result.kind, "SAFETY_RESPONSE");
  assert.equal(result.safety.state, "IMMINENT");
  assert.equal(result.message, "fixed safety response");
  assert.equal(planned, false);
  assert.equal(responded, false);
});

test("Momo planner emits structured routing state without chain-of-thought", () => {
  const decision = planMomoResponse({ messageText: "Please just listen while I vent", history: [] }, "NORMAL");
  assert.equal(decision.supportMode, "LISTEN");
  assert.equal(decision.intervention, "PCT_LISTENING");
  assert.deepEqual(Object.keys(decision).sort(), [
    "confidence", "intervention", "primaryNeed", "safetyState", "shouldClarify", "supportMode", "userPreferenceOverride",
  ]);
});

test("relationship status schema and transition rules reject stale relationships", () => {
  assert.equal(therapyRelationshipStatusSchema.parse("ACTIVE"), "ACTIVE");
  assert.equal(therapyRelationshipStatusSchema.safeParse("PAUSED").success, false);
  assert.equal(canTransitionRelationship({
    action: "ACCEPT",
    relationshipStatus: "PENDING",
    pointerStatus: "PENDING",
    isCurrentRelationship: true,
    actorIsPatient: false,
    actorIsTherapist: true,
    therapistIsVerified: true,
  }), true);
  assert.equal(canTransitionRelationship({
    action: "ACCEPT",
    relationshipStatus: "PENDING",
    pointerStatus: "PENDING",
    isCurrentRelationship: false,
    actorIsPatient: false,
    actorIsTherapist: true,
    therapistIsVerified: true,
  }), false);
});

test("weekly report schema validates complete generated output", () => {
  const report = {
    therapy: {
      sessions: ["1 text session"],
      topicsDiscussed: ["Sleep routine"],
      userReportedConcerns: [],
      strategiesDiscussed: [],
      goalsAgreed: [],
      followUpItems: [],
    },
    reflection: {
      observations: ["You logged mood on three days."],
      supportiveReflection: "You kept checking in with yourself.",
      suggestedNextSteps: ["Consider another check-in next week."],
    },
  };
  assert.deepEqual(weeklyReportSchema.parse(report), report);
  assert.equal(weeklyReportSchema.safeParse({ ...report, reflection: { diagnosis: "anxiety" } }).success, false);
});
