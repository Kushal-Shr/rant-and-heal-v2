import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const {
  decryptMomoMessage,
  encryptMomoMessage,
  importMomoConversationKey,
} = await import("../src/lib/momo/storageCrypto.ts");
const {
  buildPermittedMomoAnalytics,
  extractStructuredMoodScores,
  newlyRecordedOutcome,
} = await import("../src/lib/momo/analyticsExtraction.ts");
const { DEFAULT_MOMO_PRIVACY_PREFERENCES } = await import("../src/lib/momo/privacy.ts");
const { assessMomoSafety, combineSafetyAssessments } = await import("../src/lib/safety/detector.ts");

const binding = {
  userId: "user-a",
  conversationId: "conversation-a",
  messageId: "message-a",
  role: "user",
  modality: "text",
};

test("Momo AES-GCM ciphertext decrypts only with the authorized key and bound metadata", async () => {
  const key = await importMomoConversationKey(randomBytes(32).toString("base64"));
  const wrongKey = await importMomoConversationKey(randomBytes(32).toString("base64"));
  const payload = await encryptMomoMessage(key, "private disclosure", binding);
  assert.equal(payload.algorithm, "AES-256-GCM");
  assert.equal(payload.cryptoVersion, 1);
  assert.equal(await decryptMomoMessage(key, payload, binding), "private disclosure");
  await assert.rejects(() => decryptMomoMessage(wrongKey, payload, binding));
  await assert.rejects(() => decryptMomoMessage(key, payload, { ...binding, conversationId: "conversation-b" }));
});

test("Momo AES-GCM detects ciphertext modification and uses unique nonces", async () => {
  const key = await importMomoConversationKey(randomBytes(32).toString("base64"));
  const first = await encryptMomoMessage(key, "same text", binding);
  const second = await encryptMomoMessage(key, "same text", binding);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  const bytes = Buffer.from(first.ciphertext, "base64");
  bytes[0] ^= 1;
  await assert.rejects(() => decryptMomoMessage(key, { ...first, ciphertext: bytes.toString("base64") }, binding));
});

test("mood extraction stores only explicit structured 1-10 scores", () => {
  assert.deepEqual(
    extractStructuredMoodScores("My mood is 4/10 and stress is 8 out of 10."),
    { moodScore: 4, stressScore: 8 }
  );
  assert.equal(extractStructuredMoodScores("I hate my professor and my relationship ended."), null);
});

test("outcome extraction emits only a newly added allow-listed continuity record", () => {
  const record = { approach: "BREATHING", outcome: "WORSE", goal: "REGULATE", recordedAt: "2026-10-14T12:00:00.000Z" };
  const base = { recentInterventions: [] };
  assert.deepEqual(newlyRecordedOutcome(base, { recentInterventions: [record] }), record);
  assert.equal(newlyRecordedOutcome({ recentInterventions: [record] }, { recentInterventions: [record] }), null);
  assert.deepEqual(DEFAULT_MOMO_PRIVACY_PREFERENCES, {
    moodTrendAnalyticsEnabled: false,
    outcomeAnalyticsEnabled: false,
  });
});

test("mood and outcome analytics obey independent explicit consent", () => {
  const record = { approach: "BREATHING", outcome: "HELPED", goal: "REGULATE", recordedAt: "2026-10-14T12:00:00.000Z" };
  const common = {
    messageText: "My mood is 3/10.",
    previousContinuity: { recentInterventions: [] },
    nextContinuity: { recentInterventions: [record] },
  };

  assert.deepEqual(buildPermittedMomoAnalytics({
    ...common,
    preferences: { moodTrendAnalyticsEnabled: false, outcomeAnalyticsEnabled: false },
  }), { mood: null, outcome: null });
  assert.deepEqual(buildPermittedMomoAnalytics({
    ...common,
    preferences: { moodTrendAnalyticsEnabled: true, outcomeAnalyticsEnabled: false },
  }), { mood: { moodScore: 3 }, outcome: null });
  assert.deepEqual(buildPermittedMomoAnalytics({
    ...common,
    preferences: { moodTrendAnalyticsEnabled: false, outcomeAnalyticsEnabled: true },
  }), { mood: null, outcome: record });
});

test("mandatory safety still detects explicit suicidal intent with analytics consent off", () => {
  const analytics = buildPermittedMomoAnalytics({
    messageText: "I want to kill myself.",
    previousContinuity: { recentInterventions: [] },
    nextContinuity: { recentInterventions: [] },
    preferences: { moodTrendAnalyticsEnabled: false, outcomeAnalyticsEnabled: false },
  });
  const safety = combineSafetyAssessments(assessMomoSafety("I want to kill myself."));
  assert.deepEqual(analytics, { mood: null, outcome: null });
  assert.equal(safety.state, "SUICIDAL");
  assert.equal(safety.requiresHumanReview, true);
});

test("text and voice persistence contain no plaintext content fallback", async () => {
  const [chatRoute, transcriptRoute, sideband, liveSession, audioRecorder, page, rules] = await Promise.all([
    readFile(new URL("../app/api/momo/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/momo/transcript/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/server/momo/liveSideband.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/server/momo/liveSession.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/momo/audio/AudioRecorder.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/(patient)/momo/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(chatRoute, /transaction\.set\(messagesRef/);
  assert.doesNotMatch(chatRoute, /messageText,\s*updatedAt/);
  assert.match(page, /persistEncryptedMomoTurn/);
  assert.match(transcriptRoute, /encryptedContent/);
  assert.doesNotMatch(transcriptRoute, /\n\s*text,\s*\n\s*sender/);
  assert.match(sideband, /encryptMomoMessageForStorage/);
  assert.doesNotMatch(sideband, /\n\s*text:\s*messageText/);
  assert.match(liveSession, /store:\s*false/);
  assert.doesNotMatch(audioRecorder, /localStorage|indexedDB|firebase|fetch\(/);
  assert.match(rules, /validEncryptedMessage/);
  assert.match(rules, /request\.resource\.data\.encryptedContent/);
});

test("mandatory safety is independent of analytics consent and excerpts are encrypted", async () => {
  const [chatRoute, analytics, safety, cases] = await Promise.all([
    readFile(new URL("../app/api/momo/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/server/momo/analytics.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/server/momo/safety.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/server/safety/cases.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(chatRoute.indexOf("orchestrateMomoTurn") < chatRoute.lastIndexOf("persistPermittedMomoAnalytics"));
  assert.ok(analytics.indexOf("transaction.get(userRef)") < analytics.lastIndexOf("buildPermittedMomoAnalytics"));
  assert.match(safety, /encryptSafetyExcerpt/);
  assert.doesNotMatch(cases, /relevantUserText:\s*userText/);
  assert.match(cases, /decryptSafetyExcerpt/);
});
