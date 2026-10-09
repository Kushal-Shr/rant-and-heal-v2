import assert from "node:assert/strict";
import test from "node:test";
import { AI_MODEL_CONFIGS, AI_MODELS, THINKING_LEVELS } from "../src/lib/ai/models.ts";
await import("../scripts/momo-audit-loader.mjs");
const {
  buildGeminiResponseRequest,
  buildOpenAIResponseRequest,
  generateMomoTextWithProvider,
  assertMomoResponseModel,
  resolveMomoTextConfig,
} = await import("../src/server/momo/textProvider.ts");

const request = {
  instructions: "EXACT EXISTING MOMO INSTRUCTION\nSecond line.",
  history: [
    { role: "USER", text: "Earlier user message" },
    { role: "MOMO", text: "Earlier Momo response" },
  ],
  messageText: "Current user message",
};

test("only the Momo response model changes provider and model", () => {
  assert.deepEqual(AI_MODEL_CONFIGS, {
    MOMO_RESPONSE: { provider: "openai", model: "gpt-5.6-luna" },
  });
  assert.equal(AI_MODELS.MOMO_RESPONSE, "gpt-5.6-luna");
  for (const role of [
    "MOMO_PLANNER", "SAFETY_CLASSIFIER", "SAFETY_SUPERVISOR", "MOOD_EXTRACTION",
    "SESSION_SUMMARY", "THERAPY_NOTE", "WEEKLY_REFLECTION", "WEEKLY_THERAPY_SUMMARY",
    "VOICE", "TRANSCRIPTION", "EMBEDDING",
  ]) assert.match(AI_MODELS[role], /^gemini-/i, role);
  assert.equal(THINKING_LEVELS.MOMO_RESPONSE, "medium");
});

test("provider selection defaults to OpenAI and has an explicit Gemini rollback", () => {
  assert.deepEqual(resolveMomoTextConfig({}), {
    provider: "openai",
    model: "gpt-5.6-luna",
  });
  assert.deepEqual(resolveMomoTextConfig({ MOMO_TEXT_PROVIDER: "gemini" }), {
    provider: "gemini",
    model: "gemini-3.8-flash",
  });
  assert.deepEqual(resolveMomoTextConfig({ MOMO_TEXT_PROVIDER: "gemini", GEMINI_MODEL: "gemini-test" }), {
    provider: "gemini",
    model: "gemini-test",
  });
  assert.throws(() => resolveMomoTextConfig({ MOMO_TEXT_PROVIDER: "other" }), /openai or gemini/);
  assert.doesNotThrow(() => assertMomoResponseModel({ provider: "openai", model: "gpt-5.6-luna" }));
  assert.throws(
    () => assertMomoResponseModel({ provider: "openai", model: "gpt-5.1" }),
    /must use gpt-5\.6-luna; received gpt-5\.1/
  );
});

test("Responses API mapping preserves instructions and bounded conversation exactly", () => {
  const mapped = buildOpenAIResponseRequest(request);
  assert.equal(mapped.model, "gpt-5.6-luna");
  assert.equal(mapped.instructions, request.instructions);
  assert.equal(mapped.store, false);
  assert.deepEqual(mapped.reasoning, { effort: "medium" });
  assert.deepEqual(mapped.input, [
    { role: "user", content: "Earlier user message" },
    { role: "assistant", content: "Earlier Momo response" },
    { role: "user", content: "Current user message" },
  ]);
  assert.equal("tools" in mapped, false);
  assert.equal("previous_response_id" in mapped, false);
});

test("Gemini rollback maps the same semantic input through the previous request shape", () => {
  const mapped = buildGeminiResponseRequest(request, "gemini-3.8-flash");
  assert.equal(mapped.model, "gemini-3.8-flash");
  assert.equal(mapped.config.systemInstruction, request.instructions);
  assert.deepEqual(mapped.contents, [
    { role: "user", parts: [{ text: "Earlier user message" }] },
    { role: "model", parts: [{ text: "Earlier Momo response" }] },
    { role: "user", parts: [{ text: "Current user message" }] },
  ]);
});

test("a selected provider failure is propagated without cross-provider fallback", async () => {
  let openaiCalls = 0;
  let geminiCalls = 0;
  await assert.rejects(
    generateMomoTextWithProvider(request, { provider: "openai", model: "gpt-5.6-luna" }, {
      openai: async () => { openaiCalls += 1; throw new Error("provider unavailable"); },
      gemini: async () => { geminiCalls += 1; return "must not run"; },
    }),
    /provider unavailable/
  );
  assert.equal(openaiCalls, 1);
  assert.equal(geminiCalls, 0);
});

test("provider output remains the same normalized text contract", async () => {
  const output = await generateMomoTextWithProvider(
    request,
    { provider: "openai", model: "gpt-5.6-luna" },
    { openai: async () => "Momo reply", gemini: async () => "unused" }
  );
  assert.equal(output, "Momo reply");
  await assert.rejects(
    generateMomoTextWithProvider(
      request,
      { provider: "openai", model: "gpt-5.6-luna" },
      { openai: async () => "", gemini: async () => "unused" }
    ),
    /empty Momo response/
  );
});
