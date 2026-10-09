import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
await import("../scripts/momo-audit-loader.mjs");

const {
  emptyConversationContinuityState,
  prepareContinuityState,
} = await import("../src/lib/momo/continuity.ts");
const { buildMomoBehaviorPolicy } = await import("../src/lib/momo/responder.ts");
const { buildMomoVoiceInstructions } = await import("../src/lib/momo/live/policy.ts");
const { buildMomoLiveSessionRequest } = await import("../src/server/momo/liveSession.ts");
const { MOMO_SYSTEM_INSTRUCTION } = await import("../src/server/momo/persona.ts");

const decision = {
  supportMode: "WORK_THROUGH",
  primaryNeed: "UNDERSTAND",
  intervention: "PCT_EXPLORATION",
  confidence: "HIGH",
  shouldClarify: false,
  userPreferenceOverride: false,
  safetyState: "NORMAL",
};

function bootstrap(overrides = {}) {
  return {
    userId: "user-private",
    conversationId: "conversation-stable",
    history: [],
    continuityState: emptyConversationContinuityState(),
    participant: { isAnonymous: true },
    ...overrides,
  };
}

test("TEST 1 text → voice → text reuses one product conversation", async () => {
  const momoPage = await readFile(new URL("../app/(patient)/momo/page.tsx", import.meta.url), "utf8");
  const client = await readFile(new URL("../src/lib/momo/live/MomoLiveClient.ts", import.meta.url), "utf8");
  const chatRoute = await readFile(new URL("../app/api/momo/chat/route.ts", import.meta.url), "utf8");
  assert.match(momoPage, /<MomoVoiceCallPanel/);
  assert.match(momoPage, /onTranscriptDelta=\{handleLiveTranscriptDelta\}/);
  assert.doesNotMatch(momoPage, /href=\{`\/momo\/call\?conversationId=/);
  assert.match(client, /JSON\.stringify\(\{ conversationId: this\.options\.conversationId, sdp \}\)/);
  assert.match(chatRoute, /conversationId: z\.string/);
});

test("live call transcripts render as temporary user and Momo bubbles in the open chat", async () => {
  const momoPage = await readFile(new URL("../app/(patient)/momo/page.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../src/components/momo/MomoVoiceCallPanel.tsx", import.meta.url), "utf8");
  assert.match(momoPage, /liveTranscriptTurns\.map/);
  assert.match(momoPage, /Live call transcript/);
  assert.match(momoPage, /turn\.sender === "USER"/);
  assert.match(panel, /onTranscriptDelta\?\.\(sender, delta\)/);
});

test("TEST 2 text correction is present in the voice policy", () => {
  const state = prepareContinuityState(
    { messageText: "I'm not angry. I'm confused." },
    emptyConversationContinuityState(),
    new Date("2026-01-01T00:00:00.000Z")
  );
  const voice = buildMomoVoiceInstructions(MOMO_SYSTEM_INSTRUCTION, decision, {
    continuityState: state,
    recentUserText: "I'm not angry. I'm confused.",
  });
  assert.match(voice.instructions, /angry/i);
  assert.match(voice.instructions, /confused/i);
});

test("TEST 3 voice correction remains in the state consumed by later text", () => {
  const afterVoice = prepareContinuityState(
    { messageText: "Wait, that's not what I meant. I'm not upset about my manager. I'm confused." },
    emptyConversationContinuityState(),
    new Date("2026-01-01T00:00:00.000Z")
  );
  const textPolicy = buildMomoBehaviorPolicy(MOMO_SYSTEM_INSTRUCTION, decision, {
    conversationModality: "TEXT",
    continuityState: afterVoice,
    userMessageText: "Do you think I should talk to my manager?",
  });
  assert.match(textPolicy, /upset about my manager/i);
  assert.match(textPolicy, /confused/i);
});

test("TEST 4 text rejected intervention is present when voice starts", () => {
  const state = prepareContinuityState(
    { messageText: "Breathing exercises make me dizzy." },
    emptyConversationContinuityState(),
    new Date("2026-01-01T00:00:00.000Z")
  );
  const voice = buildMomoVoiceInstructions(MOMO_SYSTEM_INSTRUCTION, decision, {
    continuityState: state,
    recentUserText: "Breathing exercises make me dizzy.",
  });
  assert.ok(state.rejectedApproaches.includes("BREATHING"));
  assert.match(voice.instructions, /breathing/i);
  assert.match(voice.instructions, /worse|rejected|dizzy/i);
});

test("TEST 5 voice rejected intervention is present for later text", () => {
  const afterVoice = prepareContinuityState(
    { messageText: "Actually grounding isn't helping either." },
    emptyConversationContinuityState(),
    new Date("2026-01-01T00:00:00.000Z")
  );
  const textPolicy = buildMomoBehaviorPolicy(MOMO_SYSTEM_INSTRUCTION, decision, {
    conversationModality: "TEXT",
    continuityState: afterVoice,
    userMessageText: "I'm overwhelmed again.",
  });
  assert.ok(afterVoice.rejectedApproaches.includes("GROUNDING"));
  assert.match(textPolicy, /grounding/i);
});

test("TEST 6 safety during voice is written to the shared conversation state", async () => {
  const sideband = await readFile(new URL("../src/server/momo/liveSideband.ts", import.meta.url), "utf8");
  assert.match(sideband, /this\.sessionRef\.set\(\{ safetyEvaluation: evaluation \}/);
  assert.match(sideband, /sessionId: this\.bootstrap\.conversationId/);
  assert.doesNotMatch(sideband, /voiceSafetyState|voiceContinuityState/);
});

test("TEST 7 active text safety state hydrates the Live session silently", () => {
  const request = buildMomoLiveSessionRequest("v=0\r\n", bootstrap({
    safetyEvaluation: { state: "SUICIDAL", safetyTarget: "SELF" },
  }));
  const checkpoint = request.body.session.input[0];
  assert.equal(checkpoint.role, "developer");
  assert.equal(checkpoint.status, "completed");
  assert.match(checkpoint.content[0].text, /SUICIDAL/);
  assert.match(checkpoint.content[0].text, /SELF/);
  assert.match(checkpoint.content[0].text, /silent context/i);
});

test("TEST 8 reconnect creates a new provider connection for the same conversation", async () => {
  const route = await readFile(new URL("../app/api/momo/live-session/route.ts", import.meta.url), "utf8");
  const sideband = await readFile(new URL("../src/server/momo/liveSideband.ts", import.meta.url), "utf8");
  assert.match(route, /conversationId: z\.string/);
  assert.doesNotMatch(route, /already active/);
  assert.match(sideband, /replaceForReconnect/);
  assert.match(sideband, /conversationMonitorKey/);
  assert.match(sideband, /connectionId: this\.providerSessionId/);
  assert.match(sideband, /liveVoice\?\.connectionId !== this\.providerSessionId/);
});

test("TEST 9 ending a call returns to the same chat without resetting continuity", async () => {
  const panel = await readFile(new URL("../src/components/momo/MomoVoiceCallPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /router\.push\(`\/momo\?conversationId=/);
  assert.doesNotMatch(panel, /continuityState\s*[:=]\s*(?:null|undefined|\{\})/);
});

test("TEST 10 partial transcripts are not persisted as duplicate messages", async () => {
  const sideband = await readFile(new URL("../src/server/momo/liveSideband.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sideband, /persistAssistantTranscript/);
  assert.equal((sideband.match(/doc\(`\$\{messageId\}-momo`\)/g) ?? []).length, 1);
  assert.match(sideband, /provenance: "SERVER_LIVE_SIDEBAND"/);
});

test("TEST 11 refresh after voice restores the requested conversation", async () => {
  const momoPage = await readFile(new URL("../app/(patient)/momo/page.tsx", import.meta.url), "utf8");
  const callPage = await readFile(new URL("../app/(patient)/momo/call/page.tsx", import.meta.url), "utf8");
  assert.match(momoPage, /get\("conversationId"\)/);
  assert.match(momoPage, /sessions", conversationId, "messages"/);
  assert.doesNotMatch(callPage, /addDoc|Voice conversation/);
});

test("TEST 12 mixed text and voice messages share stable chronological ordering", async () => {
  const textRoute = await readFile(new URL("../app/api/momo/chat/route.ts", import.meta.url), "utf8");
  const sideband = await readFile(new URL("../src/server/momo/liveSideband.ts", import.meta.url), "utf8");
  const momoPage = await readFile(new URL("../app/(patient)/momo/page.tsx", import.meta.url), "utf8");
  for (const source of [textRoute, sideband]) {
    assert.match(source, /order: 0/);
    assert.match(source, /order: 1/);
    assert.match(source, /FieldValue\.serverTimestamp\(\)/);
  }
  assert.match(momoPage, /return time \|\| left\.order - right\.order/);
});

test("bounded completed history resumes the existing topic without replaying it", () => {
  const history = [
    { role: "USER", text: "My coworker got credit for most of my work." },
    { role: "MOMO", text: "Did your coworker say anything when that happened?" },
    { role: "USER", text: "My manager assumed he led it." },
  ];
  const request = buildMomoLiveSessionRequest("v=0\r\n", bootstrap({ history }));
  const priorMessages = request.body.session.input.slice(1);
  assert.deepEqual(priorMessages.map((item) => item.status), ["completed", "completed", "completed"]);
  assert.deepEqual(priorMessages.map((item) => item.content[0].text), history.map((item) => item.text));
  assert.ok(priorMessages.length <= 12);
});
