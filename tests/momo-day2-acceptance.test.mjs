import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { orchestrateMomoTurn } from "../src/lib/momo/orchestrator.ts";
import {
  planMomoResponse,
  planMomoResponseWithModel,
} from "../src/lib/momo/planner.ts";
import { MOMO_BOUNDARIES_PROMPT } from "../src/lib/momo/prompts/boundaries.ts";
import { MOMO_CORE_PROMPT } from "../src/lib/momo/prompts/core.ts";
import { MOMO_PCT_PROMPT } from "../src/lib/momo/prompts/pct.ts";
import {
  composeMomoSystemInstruction,
  momoDecisionInstruction,
} from "../src/lib/momo/responder.ts";
import { evaluateDeterministicSafety } from "../src/lib/safety/detector.ts";
import {
  logMomoRoutingDecision,
  logMomoSafetyBypass,
  routingDebugMetadata,
} from "../src/server/momo/routingDebug.ts";

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
const baseInstruction = [MOMO_CORE_PROMPT, MOMO_PCT_PROMPT, MOMO_BOUNDARIES_PROMPT].join("\n\n");

function decision(overrides = {}) {
  return {
    supportMode: "LISTEN",
    primaryNeed: "VENT",
    intervention: "PCT_LISTENING",
    confidence: "HIGH",
    shouldClarify: false,
    userPreferenceOverride: true,
    safetyState: "NORMAL",
    ...overrides,
  };
}

describe("explicit preference", () => {
  test("current-turn rejection of CBT beats contradictory recent context and inference", async () => {
    let modelCalled = false;
    const result = await planMomoResponseWithModel(input(
      "I don't want to do a thought exercise. I just want to talk.",
      [
        { role: "USER", text: "Help me challenge this thought." },
        { role: "MOMO", text: "What evidence supports it?" },
      ]
    ), "NORMAL", async () => {
      modelCalled = true;
      return inference({ intervention: "CBT_RESTRUCTURING" });
    });

    assert.equal(modelCalled, false);
    assert.equal(result.supportMode, "LISTEN");
    assert.equal(result.intervention, "PCT_LISTENING");
    assert.equal(result.userPreferenceOverride, true);
  });

  test("explicit work-through, CBT, direct-help, and regulation phrases route deterministically", () => {
    const work = planMomoResponse(input("Can you help me work through this?"), "NORMAL");
    const cbt = planMomoResponse(input("Can you help me challenge this thought?"), "NORMAL");
    const direct = planMomoResponse(input("Stop asking me questions."), "NORMAL");
    const regulate = planMomoResponse(input("I need to calm down before we talk about this."), "NORMAL");

    assert.deepEqual([work.supportMode, work.intervention], ["WORK_THROUGH", "PCT_EXPLORATION"]);
    assert.deepEqual([cbt.supportMode, cbt.intervention], ["WORK_THROUGH", "CBT_RESTRUCTURING"]);
    assert.equal(direct.supportMode, "DIRECT_HELP");
    assert.equal(regulate.supportMode, "REGULATE");
  });
});

describe("implicit inference", () => {
  test("mocked structured output passes through validation and normalization", async () => {
    const request = input(
      "I failed the exam and now I keep thinking I'm going to fail my entire degree. I want to understand why my brain jumps there.",
      [{ role: "MOMO", text: "What part of the result is weighing on you most?" }]
    );
    let receivedInput;
    const result = await planMomoResponseWithModel(request, "NORMAL", async (received) => {
      receivedInput = received;
      return inference({
        supportMode: "WORK_THROUGH",
        primaryNeed: "COGNITIVE_SUPPORT",
        intervention: "CBT_RESTRUCTURING",
        confidence: "HIGH",
      });
    });

    assert.deepEqual(receivedInput, request);
    assert.equal(result.supportMode, "WORK_THROUGH");
    assert.equal(result.intervention, "CBT_RESTRUCTURING");
    assert.equal(result.userPreferenceOverride, false);
  });

  test("implicit uncertainty produces one support-preference clarification", async () => {
    const result = await planMomoResponseWithModel(
      input("Everything is just a lot. I don't even know what I need."),
      "NORMAL",
      async () => inference({
        supportMode: "UNCLEAR",
        primaryNeed: "UNKNOWN",
        intervention: "NONE",
        confidence: "MEDIUM",
        shouldClarify: true,
        clarificationTarget: "SUPPORT_PREFERENCE",
      })
    );

    assert.equal(result.supportMode, "UNCLEAR");
    assert.equal(result.shouldClarify, true);
    assert.equal(result.clarificationTarget, "SUPPORT_PREFERENCE");
  });
});

describe("intervention choice", () => {
  test("WORK_THROUGH accepts exploration or CBT without equating the two", () => {
    const exploration = planMomoResponse(input("This keeps happening."), "NORMAL", inference());
    const cbt = planMomoResponse(input("This keeps happening."), "NORMAL", inference({
      primaryNeed: "COGNITIVE_SUPPORT",
      intervention: "CBT_RESTRUCTURING",
    }));

    assert.equal(exploration.intervention, "PCT_EXPLORATION");
    assert.equal(cbt.intervention, "CBT_RESTRUCTURING");
  });

  test("LISTEN normalizes contradictory CBT inference back to listening", () => {
    const result = planMomoResponse(input("People keep trying to fix me."), "NORMAL", inference({
      supportMode: "LISTEN",
      primaryNeed: "VENT",
      intervention: "CBT_RESTRUCTURING",
    }));
    assert.equal(result.supportMode, "LISTEN");
    assert.equal(result.intervention, "PCT_LISTENING");
  });
});

describe("clarification and failure fallback", () => {
  test("invalid, incomplete, extra-field, and contradictory model outputs fail safely", async () => {
    const invalidOutputs = [
      { ...inference(), supportMode: "DIAGNOSE" },
      { supportMode: "LISTEN" },
      { ...inference(), diagnosis: "depression" },
      { ...inference(), rationale: "hidden reasoning" },
      { ...inference(), shouldClarify: false, clarificationTarget: "GOAL" },
      { ...inference(), supportMode: "UNCLEAR", shouldClarify: false, clarificationTarget: null },
    ];

    for (const output of invalidOutputs) {
      const result = await planMomoResponseWithModel(input("This is a lot."), "NORMAL", async () => output);
      assert.equal(result.supportMode, "UNCLEAR");
      assert.equal(result.confidence, "LOW");
      assert.equal(result.clarificationTarget, "SUPPORT_PREFERENCE");
    }
  });

  test("malformed JSON and model exceptions do not crash planning", async () => {
    for (const infer of [
      async () => JSON.parse("{not-json"),
      async () => { throw new Error("model unavailable"); },
    ]) {
      const result = await planMomoResponseWithModel(input("This is a lot."), "NORMAL", infer);
      assert.equal(result.supportMode, "UNCLEAR");
      assert.equal(result.clarificationTarget, "SUPPORT_PREFERENCE");
    }
  });
});

describe("question fatigue and transitions", () => {
  test("question fatigue produces direct help without another required interrogation", () => {
    const result = planMomoResponse(input(
      "Why do you keep asking me questions? Just give me an answer.",
      [
        { role: "MOMO", text: "What makes that feel true?" },
        { role: "USER", text: "I keep comparing myself." },
        { role: "MOMO", text: "When did that start?" },
      ]
    ), "NORMAL");

    assert.equal(result.supportMode, "DIRECT_HELP");
    assert.equal(result.userPreferenceOverride, true);
    assert.match(momoDecisionInstruction(result), /practical, organized help before asking/i);
    assert.match(momoDecisionInstruction(result), /Do not respond with another unnecessary question/i);
  });

  test("LISTEN transitions to WORK_THROUGH when the current user asks to understand the pattern", () => {
    const result = planMomoResponse(input(
      "Can we figure out why this keeps happening?",
      [
        { role: "USER", text: "I just want to talk." },
        { role: "MOMO", text: "Being dismissed after all that effort really hurt." },
      ]
    ), "NORMAL");

    assert.equal(result.supportMode, "WORK_THROUGH");
    assert.equal(result.intervention, "PCT_EXPLORATION");
    assert.equal(result.userPreferenceOverride, true);
  });
});

describe("responder modes and PCT boundaries", () => {
  test("each support mode contributes its required deterministic response constraints", () => {
    const instructions = {
      LISTEN: momoDecisionInstruction(decision()),
      WORK_THROUGH: momoDecisionInstruction(decision({
        supportMode: "WORK_THROUGH", primaryNeed: "UNDERSTAND", intervention: "PCT_EXPLORATION",
      })),
      DIRECT_HELP: momoDecisionInstruction(decision({
        supportMode: "DIRECT_HELP", primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING",
      })),
      REGULATE: momoDecisionInstruction(decision({
        supportMode: "REGULATE", primaryNeed: "EMOTIONAL_REGULATION", intervention: "RELAXATION",
      })),
      UNCLEAR: momoDecisionInstruction(decision({
        supportMode: "UNCLEAR", primaryNeed: "UNKNOWN", intervention: "NONE",
        confidence: "LOW", shouldClarify: true, clarificationTarget: "SUPPORT_PREFERENCE",
        userPreferenceOverride: false,
      })),
    };

    assert.match(instructions.LISTEN, /Reflect the specific situation/);
    assert.match(instructions.LISTEN, /Do not give advice, challenge thoughts, or introduce an exercise/);
    assert.match(instructions.WORK_THROUGH, /exploring it collaboratively/);
    assert.match(instructions.WORK_THROUGH, /one useful question or one useful perspective/);
    assert.match(instructions.DIRECT_HELP, /practical, organized help before asking/);
    assert.match(instructions.DIRECT_HELP, /without taking over a major life decision/);
    assert.match(instructions.REGULATE, /Reduce cognitive load and pause analysis or cognitive challenging/);
    assert.match(instructions.REGULATE, /do not improvise a full multi-step relaxation protocol/);
    assert.match(instructions.UNCLEAR, /Ask exactly one natural question/);
    assert.match(instructions.UNCLEAR, /SUPPORT_PREFERENCE/);
  });

  test("PCT and clinical boundaries remain in composed instructions across modes", () => {
    for (const route of [
      decision(),
      decision({ supportMode: "WORK_THROUGH", primaryNeed: "COGNITIVE_SUPPORT", intervention: "CBT_RESTRUCTURING" }),
      decision({ supportMode: "DIRECT_HELP", primaryNeed: "PRACTICAL_HELP", intervention: "PROBLEM_SOLVING" }),
      decision({ supportMode: "REGULATE", primaryNeed: "EMOTIONAL_REGULATION", intervention: "RELAXATION" }),
    ]) {
      const prompt = composeMomoSystemInstruction(baseInstruction, route);
      assert.match(prompt, /nonjudgmental/);
      assert.match(prompt, /respect the user's agency/);
      assert.match(prompt, /do not claim human feelings, memories, or lived experience/);
      assert.match(prompt, /do not diagnose/);
      assert.match(prompt, /instead of assuming/);
      assert.match(prompt, /before understanding the situation and acknowledging the emotion/);
    }
  });

  test("direct help preserves the user's final decision", () => {
    const prompt = composeMomoSystemInstruction(baseInstruction, decision({
      supportMode: "DIRECT_HELP",
      primaryNeed: "PRACTICAL_HELP",
      intervention: "PROBLEM_SOLVING",
    }));
    assert.match(prompt, /do not make major life decisions for the user/);
    assert.match(prompt, /help them consider options and retain agency/);
    assert.doesNotMatch(prompt, /tell the user whether to drop out/i);
  });
});

describe("safety precedence", () => {
  test("an immediate safety turn bypasses planner and normal responder after ordinary context", async () => {
    let planned = false;
    let responded = false;
    const result = await orchestrateMomoTurn(input(
      "I've decided I'm going to kill myself tonight.",
      [
        { role: "USER", text: "I failed my exam and feel useless." },
        { role: "MOMO", text: "We can look at what this result is making you believe." },
      ]
    ), {
      evaluateSafety: evaluateDeterministicSafety,
      plan: () => { planned = true; return decision(); },
      respond: async () => { responded = true; return "ordinary CBT response"; },
      safetyResponse: () => "safety response",
    });

    assert.equal(result.kind, "SAFETY_RESPONSE");
    assert.equal(result.safety.state, "IMMINENT");
    assert.equal(result.decision, null);
    assert.equal(planned, false);
    assert.equal(responded, false);
  });

  test("a safety-constrained state cannot be overwritten by model routing", async () => {
    let modelCalled = false;
    const result = await planMomoResponseWithModel(input("Let's do CBT."), "IMMINENT", async () => {
      modelCalled = true;
      return inference({ intervention: "CBT_RESTRUCTURING" });
    });

    assert.equal(modelCalled, false);
    assert.equal(result.safetyState, "IMMINENT");
    assert.equal(result.intervention, "PROFESSIONAL_SUPPORT");
  });
});

describe("multilingual explicit routing", () => {
  test("obvious Nepali and romanized-Nepali work-through and regulation requests remain deterministic", () => {
    assert.equal(planMomoResponse(input("यो बुझ्न मद्दत गर।"), "NORMAL").supportMode, "WORK_THROUGH");
    assert.equal(planMomoResponse(input("मलाई शान्त हुन मद्दत गर।"), "NORMAL").supportMode, "REGULATE");
    assert.equal(planMomoResponse(input("Malai yo bujhna madat gara."), "NORMAL").supportMode, "WORK_THROUGH");
    assert.equal(planMomoResponse(input("Malai shanta huna madat gara."), "NORMAL").supportMode, "REGULATE");
  });
});

describe("development routing diagnostics", () => {
  test("development logging contains routing metadata only", () => {
    const calls = [];
    const route = decision();
    const logged = logMomoRoutingDecision(route, {
      environment: { NODE_ENV: "development", MOMO_DEBUG_ROUTING: "true" },
      log: (label, metadata) => calls.push({ label, metadata }),
    });

    assert.equal(logged, true);
    assert.deepEqual(calls, [{ label: "MOMO ROUTING", metadata: routingDebugMetadata(route) }]);
    assert.deepEqual(Object.keys(calls[0].metadata).sort(), [
      "clarificationTarget", "confidence", "intervention", "primaryNeed", "safetyState",
      "shouldClarify", "supportMode", "userPreferenceOverride",
    ]);
    assert.equal(JSON.stringify(calls).includes("messageText"), false);
    assert.equal(JSON.stringify(calls).includes("therapy"), false);
  });

  test("routing debug is disabled by default and always disabled in production", () => {
    const calls = [];
    const log = (label, metadata) => calls.push({ label, metadata });
    assert.equal(logMomoRoutingDecision(decision(), {
      environment: { NODE_ENV: "development" }, log,
    }), false);
    assert.equal(logMomoRoutingDecision(decision(), {
      environment: { NODE_ENV: "production", MOMO_DEBUG_ROUTING: "true" }, log,
    }), false);
    assert.equal(calls.length, 0);
  });

  test("safety bypass debug contains no conversation text", () => {
    const calls = [];
    assert.equal(logMomoSafetyBypass("IMMINENT", {
      environment: { NODE_ENV: "development", MOMO_DEBUG_ROUTING: "true" },
      log: (label, metadata) => calls.push({ label, metadata }),
    }), true);
    assert.deepEqual(calls, [{
      label: "MOMO ROUTING",
      metadata: { safetyState: "IMMINENT", bypassedNormalPlanner: true },
    }]);
  });
});
