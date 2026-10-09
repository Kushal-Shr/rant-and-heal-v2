import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
await import("../scripts/momo-audit-loader.mjs");

const { AI_MODEL_CONFIGS } = await import("../src/lib/ai/models.ts");
const { emptyConversationContinuityState } = await import("../src/lib/momo/continuity.ts");
const { buildMomoBehaviorPolicy } = await import("../src/lib/momo/responder.ts");
const { buildMomoVoiceInstructions, MOMO_VOICE_DELIVERY_OVERLAY } = await import("../src/lib/momo/live/policy.ts");
const { isRecoverableLiveModerationStop } = await import("../src/lib/momo/live/errors.ts");
const { MOMO_SYSTEM_INSTRUCTION } = await import("../src/server/momo/persona.ts");
const {
  OPENAI_LIVE_SESSION_ENDPOINT,
  assertMomoVoiceModel,
  buildMomoLiveSessionRequest,
  momoLiveOfferSchema,
  stableSafetyIdentifier,
} = await import("../src/server/momo/liveSession.ts");

const decision = {
  supportMode: "LISTEN",
  primaryNeed: "VENT",
  intervention: "PCT_LISTENING",
  confidence: "HIGH",
  shouldClarify: false,
  userPreferenceOverride: true,
  safetyState: "NORMAL",
};
const continuityState = {
  ...emptyConversationContinuityState(),
  currentSupportMode: "LISTEN",
  currentGoal: "BE_HEARD",
  explicitPreferences: ["NO_ADVICE"],
  rejectedApproaches: ["BREATHING"],
  questionFatigue: true,
};
const bootstrap = {
  userId: "firebase-user-123",
  sessionId: "conversation-123",
  history: [{ role: "USER", text: "Don't give me advice, just listen." }],
  continuityState,
  participant: { isAnonymous: true },
};

test("gpt-live-1 is registered and runtime drift is rejected", () => {
  assert.deepEqual(AI_MODEL_CONFIGS.MOMO_VOICE, { provider: "openai", model: "gpt-live-1" });
  assert.doesNotThrow(() => assertMomoVoiceModel(AI_MODEL_CONFIGS.MOMO_VOICE));
  assert.throws(() => assertMomoVoiceModel({ provider: "openai", model: "gpt-realtime" }), /gpt-live-1/);
});

test("text and voice use the exact same canonical behavioral policy source", () => {
  const textPolicy = buildMomoBehaviorPolicy(MOMO_SYSTEM_INSTRUCTION, decision, {
    conversationModality: "TEXT",
    continuityState,
    participant: bootstrap.participant,
    userMessageText: bootstrap.history[0].text,
  });
  const voice = buildMomoVoiceInstructions(MOMO_SYSTEM_INSTRUCTION, decision, {
    continuityState,
    participant: bootstrap.participant,
    recentUserText: bootstrap.history[0].text,
  });
  assert.equal(voice.sharedPolicy, textPolicy);
  assert.equal(voice.instructions, `${textPolicy}\n\n${MOMO_VOICE_DELIVERY_OVERLAY}`);
  for (const sharedRule of [
    "MOMO CONVERSATION CONTRACT",
    "GROUNDING CONTRACT",
    "Use person-centered communication",
    "Explicit interaction preferences: no advice",
    "breathing",
    "Question fatigue is active",
    "Never claim an external action or handoff succeeded without backend confirmation",
  ]) {
    assert.match(textPolicy, new RegExp(sharedRule, "i"), sharedRule);
  }
});

test("voice-only overlay is limited to delivery, interruption, and delegation", () => {
  assert.match(MOMO_VOICE_DELIVERY_OVERLAY, /short spoken sentences/i);
  assert.match(MOMO_VOICE_DELIVERY_OVERLAY, /Stop speaking immediately/i);
  assert.match(MOMO_VOICE_DELIVERY_OVERLAY, /Do not read Markdown syntax aloud/i);
  assert.match(MOMO_VOICE_DELIVERY_OVERLAY, /Delegate every substantive support response/i);
  assert.doesNotMatch(MOMO_VOICE_DELIVERY_OVERLAY, /cognitive restructuring|person-centered communication/i);
});

test("Live request uses the current server-negotiated WebRTC path with bounded state", () => {
  const request = buildMomoLiveSessionRequest("v=0\r\nmock-offer", bootstrap);
  assert.equal(OPENAI_LIVE_SESSION_ENDPOINT, "https://api.openai.com/v1/live/sessions");
  assert.equal(request.body.session.model, "gpt-live-1");
  assert.equal(request.body.transport.type, "webrtc");
  assert.equal(request.body.transport.sdp, "v=0\r\nmock-offer");
  assert.deepEqual(request.body.session.delegation, { type: "client" });
  assert.equal(request.body.session.store, false);
  assert.equal(request.body.session.input.length, 1);
  const serialized = JSON.stringify(request.body).toLowerCase();
  for (const forbidden of ["journal", "embedding", "therapist-private", "chain-of-thought", "firebase-user-123"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("SDP offer validation preserves the browser offer byte-for-byte", () => {
  const offer = "v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\na=ice-ufrag:test\r\n";
  assert.equal(momoLiveOfferSchema.parse(offer), offer);
  assert.equal(momoLiveOfferSchema.parse(offer).endsWith("\r\n"), true);
  assert.equal(momoLiveOfferSchema.safeParse("  \r\n").success, false);
});

test("a stopped moderated generation is recoverable without ending the Live call", () => {
  assert.equal(isRecoverableLiveModerationStop({
    type: "invalid_request_error",
    code: "generation_stopped",
    message: "The generation was stopped due to moderation.",
  }), true);
  assert.equal(isRecoverableLiveModerationStop({
    type: "server_error",
    code: "session_failed",
    message: "The Live session failed.",
  }), false);
});

test("provider safety identifier is stable, one-way, and does not expose Firebase UID", () => {
  const first = stableSafetyIdentifier("firebase-user-123", "test-secret");
  const second = stableSafetyIdentifier("firebase-user-123", "test-secret");
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first.includes("firebase-user-123"), false);
  assert.notEqual(first, stableSafetyIdentifier("firebase-user-456", "test-secret"));
});

test("trusted sideband owns safety interruption and voice fails closed", async () => {
  const sideband = await readFile(new URL("../src/server/momo/liveSideband.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("../src/lib/momo/live/MomoLiveClient.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/momo/live-session/route.ts", import.meta.url), "utf8");
  assert.match(sideband, /session\.input_transcript\.delta/);
  assert.match(sideband, /assessMomoTurnSafety/);
  assert.match(sideband, /Stop ordinary speech immediately/);
  assert.match(sideband, /safetyResponseFor/);
  assert.match(sideband, /recordMomoSafetyEvent/);
  assert.match(sideband, /enforceBackendActionTruthfulness/);
  assert.match(sideband, /truthfulness_interrupt/);
  assert.match(sideband, /monitorStatus:\s*"FAILED"/);
  assert.match(sideband, /session\.close/);
  assert.match(client, /interruptPlayback/);
  assert.match(client, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(route, /FEATURE_FLAGS\.MOMO_VOICE/);
  assert.match(route, /attachMomoLiveSideband/);
  assert.ok(route.indexOf("attachMomoLiveSideband") < route.lastIndexOf("return NextResponse.json"));
});

test("voice remains release-disabled by default", async () => {
  const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(example, /^ENABLE_MOMO_VOICE=false$/m);
});
