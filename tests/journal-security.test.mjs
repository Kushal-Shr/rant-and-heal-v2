import assert from "node:assert/strict";
import test from "node:test";
import { deriveVaultKey } from "../src/lib/crypto/keyDerivation.ts";
import {
  createVaultVerificationPayload,
  decryptJournalPayload,
  encryptJournalPayload,
  verifyVaultPassphrase,
} from "../src/lib/crypto/vault.ts";
import {
  isUsableCachedVaultKeyRecord,
  VAULT_TRUST_DURATION_MS,
} from "../src/lib/crypto/vaultKeyCache.ts";
import {
  getJournalLengthBucket,
  getJournalTimeOfDay,
  createJournalMetricData,
} from "../src/lib/journal/metrics.ts";
import { buildJournalStoragePayload } from "../src/lib/journal/storagePayload.ts";
import { prepareLegacyJournalMigration } from "../src/lib/journal/migrationPlan.ts";
import { aggregateJournalMetricRecords, aggregateWeeklyJournalMetrics } from "../src/lib/reports/sources/journalMetrics.ts";
import {
  assertJournalMetricsArePrivacySafe,
  buildWeeklySupportSummaryRequest,
} from "../src/lib/reports/weeklySupportSummary.ts";

const kdf = {
  algorithm: "PBKDF2",
  hash: "SHA-256",
  iterations: 1_000,
  salt: btoa("0123456789abcdef0123456789abcdef"),
};

async function keyFor(passphrase = "correct horse battery staple") {
  return deriveVaultKey(passphrase, kdf);
}

test("journal plaintext round-trips and the derived key is non-extractable", async () => {
  const key = await keyFor();
  const plaintext = { version: 1, title: "Private title", body: "Private body" };
  const encrypted = await encryptJournalPayload(key, plaintext, "entry-1");
  assert.deepEqual(await decryptJournalPayload(key, encrypted, "entry-1"), plaintext);
  assert.equal(key.extractable, false);
  assert.equal(JSON.stringify(key), "{}");
  await assert.rejects(() => crypto.subtle.exportKey("raw", key));
});

test("trusted-browser cache records expire after fourteen days and remain user-scoped", async () => {
  const key = await keyFor();
  const now = Date.now();
  const record = { uid: "user-1", key, expiresAt: now + VAULT_TRUST_DURATION_MS, version: 1 };
  assert.equal(VAULT_TRUST_DURATION_MS, 14 * 24 * 60 * 60 * 1000);
  assert.equal(isUsableCachedVaultKeyRecord(record, "user-1", now), true);
  assert.equal(isUsableCachedVaultKeyRecord(record, "user-2", now), false);
  assert.equal(isUsableCachedVaultKeyRecord(record, "user-1", record.expiresAt), false);
  assert.equal(JSON.stringify(record).includes("correct horse battery staple"), false);
});

test("wrong passphrases and tampered ciphertext fail authentication", async () => {
  const key = await keyFor();
  const wrongKey = await keyFor("a different passphrase");
  const verification = await createVaultVerificationPayload(key);
  assert.equal(await verifyVaultPassphrase(key, verification), true);
  assert.equal(await verifyVaultPassphrase(wrongKey, verification), false);

  const encrypted = await encryptJournalPayload(key, { version: 1, title: "t", body: "secret" }, "entry-2");
  const bytes = Uint8Array.from(atob(encrypted.ciphertext), (character) => character.charCodeAt(0));
  bytes[0] ^= 1;
  const tampered = { ...encrypted, ciphertext: btoa(String.fromCharCode(...bytes)) };
  await assert.rejects(() => decryptJournalPayload(key, tampered, "entry-2"));
});

test("each encryption has a unique 96-bit IV and different ciphertext", async () => {
  const key = await keyFor();
  const value = { version: 1, title: "same", body: "same" };
  const first = await encryptJournalPayload(key, value, "entry-3");
  const second = await encryptJournalPayload(key, value, "entry-3");
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(atob(first.iv).length, 12);
});

test("storage payload separates ciphertext from coarse metrics with no plaintext", async () => {
  const key = await keyFor();
  const body = "a uniquely private sentence";
  const encrypted = await encryptJournalPayload(key, { version: 1, title: "hidden heading", body }, "entry-4");
  const payload = buildJournalStoragePayload({
    userId: "user-1",
    journalEntryId: "entry-4",
    encrypted,
    body,
    localDate: new Date(2026, 8, 21, 23, 30),
    createdAt: "created",
    updatedAt: "updated",
    userReported: { emotions: ["ANXIOUS"], contexts: ["ACADEMIC"], intent: "UNDERSTAND" },
  });
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes(body), false);
  assert.equal(serialized.includes("hidden heading"), false);
  assert.deepEqual(Object.keys(payload.journal).sort(), ["ciphertext", "createdAt", "cryptoVersion", "iv", "updatedAt", "userId"]);
  assert.equal(payload.metric.behavior.lengthBucket, "SHORT");
  assert.equal(payload.metric.behavior.timeOfDay, "LATE_NIGHT");
  assert.deepEqual(payload.metric.userReported, { emotions: ["ANXIOUS"], contexts: ["ACADEMIC"], intent: "UNDERSTAND" });
});

test("metric thresholds and local time buckets are deterministic and do no semantic inference", () => {
  assert.equal(getJournalLengthBucket("word ".repeat(100)), "SHORT");
  assert.equal(getJournalLengthBucket("word ".repeat(101)), "MEDIUM");
  assert.equal(getJournalLengthBucket("word ".repeat(401)), "LONG");
  assert.equal(getJournalTimeOfDay(new Date(2026, 0, 1, 5)), "MORNING");
  assert.equal(getJournalTimeOfDay(new Date(2026, 0, 1, 12)), "AFTERNOON");
  assert.equal(getJournalTimeOfDay(new Date(2026, 0, 1, 17)), "EVENING");
  assert.equal(getJournalTimeOfDay(new Date(2026, 0, 1, 2)), "LATE_NIGHT");
  const metric = createJournalMetricData({
    userId: "u", journalEntryId: "e", body: "I feel depressed and anxious because of school",
    localDate: new Date(2026, 0, 1, 12), createdAt: "c", updatedAt: "u",
  });
  assert.equal(JSON.stringify(metric).match(/depress|anxious|school/gi), null);
  assert.equal(metric.userReported, undefined);
  const partial = createJournalMetricData({
    userId: "u", journalEntryId: "e2", body: "brief note",
    localDate: new Date(2026, 0, 1, 12), createdAt: "c", updatedAt: "u",
    userReported: { contexts: ["PERSONAL"] },
  });
  assert.deepEqual(partial.userReported, { contexts: ["PERSONAL"] });
  assert.equal(JSON.stringify(partial).includes("undefined"), false);
});

test("legacy migration planning is idempotent, retryable, and preserves input on failure", async () => {
  const key = await keyFor();
  const legacy = { title: "old title", body: "old private body", moodTag: "free text" };
  const before = structuredClone(legacy);
  const args = {
    userId: "u", journalEntryId: "legacy-1", data: legacy, key,
    localDate: new Date(2026, 0, 2, 9), createdAt: "c", updatedAt: "u",
  };
  const first = await prepareLegacyJournalMigration(args);
  assert(first);
  assert.deepEqual(legacy, before);
  assert.equal(JSON.stringify(first).includes("old private body"), false);
  assert.equal(first.metric.userReported, undefined);
  assert.equal(await prepareLegacyJournalMigration({ ...args, data: first.journal }), null);
  const retry = await prepareLegacyJournalMigration(args);
  assert.notEqual(retry.journal.ciphertext, first.journal.ciphertext);
  await assert.rejects(() => prepareLegacyJournalMigration({
    ...args,
    encrypt: async () => { throw new Error("encryption failed"); },
  }));
  assert.deepEqual(legacy, before);
});

test("weekly aggregation counts metrics only and handles missing user labels", () => {
  const result = aggregateJournalMetricRecords([
    { behavior: { lengthBucket: "SHORT", timeOfDay: "MORNING", localDate: "2026-09-14", wasEdited: false }, userReported: { emotions: ["CALM"], contexts: ["WORK"], intent: "REFLECT" } },
    { behavior: { lengthBucket: "MEDIUM", timeOfDay: "LATE_NIGHT", localDate: "2026-09-15", wasEdited: true } },
    { behavior: { lengthBucket: "LONG", timeOfDay: "LATE_NIGHT", localDate: "2026-09-17", wasEdited: false }, userReported: { emotions: ["CALM", "HAPPY"] } },
  ]);
  assert.equal(result.entryCount, 3);
  assert.equal(result.writingDays, 3);
  assert.equal(result.consecutiveJournalingDays, 2);
  assert.deepEqual(result.timeOfDay, { morning: 1, afternoon: 0, evening: 0, lateNight: 2 });
  assert.deepEqual(result.lengthDistribution, { short: 1, medium: 1, long: 1 });
  assert.deepEqual(result.userReported.emotions, { CALM: 2, HAPPY: 1 });
});

test("weekly reader queries only journal_metrics with an exact half-open date range", async () => {
  const calls = [];
  const fakeSnapshot = { docs: [{ data: () => ({ behavior: { lengthBucket: "SHORT", timeOfDay: "MORNING", localDate: "2026-09-14", wasEdited: false } }) }] };
  const query = {
    where(field, operator, value) { calls.push(["where", field, operator, value]); return this; },
    async get() { calls.push(["get"]); return fakeSnapshot; },
  };
  const fakeDb = {
    collection(name) {
      calls.push(["collection", name]);
      return { doc(id) { calls.push(["doc", id]); return { collection(child) { calls.push(["collection", child]); return query; } }; } };
    },
  };
  const start = new Date("2026-09-14T00:00:00.000Z");
  const end = new Date("2026-09-21T00:00:00.000Z");
  const result = await aggregateWeeklyJournalMetrics(fakeDb, "user-1", start, end);
  assert.equal(result.entryCount, 1);
  assert.deepEqual(calls, [
    ["collection", "users"], ["doc", "user-1"], ["collection", "journal_metrics"],
    ["where", "createdAt", ">=", start], ["where", "createdAt", "<", end], ["get"],
  ]);
  assert.equal(JSON.stringify(calls).includes('"journals"'), false);
});

test("Gemini weekly request contains only aggregate journal metrics", () => {
  const journalMetrics = aggregateJournalMetricRecords([]);
  const request = buildWeeklySupportSummaryRequest({
    moodTrackerData: [], momoSessionSummaries: [], therapistReviewedNotes: [], objectiveAppActivity: {}, journalMetrics,
  });
  const serialized = JSON.stringify(request);
  assert.equal(request.model, "gemini-3.8-flash");
  assert.equal(serialized.includes("a uniquely private sentence"), false);
  for (const forbidden of ['"ciphertext"', '"body"', '"title"', '"embeddings"']) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.throws(() => assertJournalMetricsArePrivacySafe({ ...journalMetrics, ciphertext: "x" }));
});
