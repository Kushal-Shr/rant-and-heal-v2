import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { encryptText, decryptText } from "../src/lib/therapy/envelope.ts";
import { canAccessRelationship } from "../src/lib/therapy/accessPolicy.ts";
import { noteContentSchema } from "../src/lib/therapy/notes.ts";
import { buildWeeklyTherapyRequest, isReviewedTherapyNote } from "../src/lib/reports/therapyWeekly.ts";

test("relationship encryption authenticates ciphertext, key and context", () => {
  const key = randomBytes(32);
  const first = encryptText(key, "sensitive therapy text", "rel-a:message:one");
  const second = encryptText(key, "sensitive therapy text", "rel-a:message:one");
  assert.equal(decryptText(key, first, "rel-a:message:one"), "sensitive therapy text");
  assert.notEqual(first.iv, second.iv);
  assert.equal(JSON.stringify(first).includes("sensitive therapy text"), false);
  assert.throws(() => decryptText(randomBytes(32), first, "rel-a:message:one"));
  assert.throws(() => decryptText(key, first, "rel-b:message:one"));
  const bytes = Buffer.from(first.ciphertext, "base64"); bytes[0] ^= 1;
  assert.throws(() => decryptText(key, { ...first, ciphertext: bytes.toString("base64") }, "rel-a:message:one"));
});

test("relationship authorization limits active membership and current pointer", () => {
  const base = { actorUid: "patient", patientUid: "patient", therapistUid: "therapist-a", relationshipId: "rel-a",
    status: "ACTIVE", pointerRelationshipId: "rel-a", pointerStatus: "ACTIVE", role: "either" };
  assert.equal(canAccessRelationship(base), true);
  assert.equal(canAccessRelationship({ ...base, actorUid: "therapist-a" }), true);
  assert.equal(canAccessRelationship({ ...base, actorUid: "therapist-b" }), false);
  assert.equal(canAccessRelationship({ ...base, status: "REVOKED" }), false);
  assert.equal(canAccessRelationship({ ...base, actorUid: "therapist-a", pointerRelationshipId: "rel-b" }), false);
  assert.equal(canAccessRelationship({ ...base, actorUid: "therapist-a", role: "patient" }), false);
});

test("strict AI note validation and weekly summary source", () => {
  const content = { summary: "The user reported exam stress", userReportedConcerns: ["Exam stress"], topicsDiscussed: ["Studying"],
    strategiesDiscussed: ["Short study blocks"], goalsAgreed: ["Try shorter blocks"], followUpItems: ["Review next week"],
    evidence: [{ kind: "USER_REPORTED", statement: "The user reported exam stress" }] };
  assert.deepEqual(noteContentSchema.parse(content), content);
  assert.equal(noteContentSchema.safeParse({ ...content, diagnosis: "ADHD" }).success, false);
  assert.equal(noteContentSchema.safeParse({ ...content, evidence: [{ kind: "DIAGNOSIS", statement: "ADHD" }] }).success, false);
  const request = buildWeeklyTherapyRequest([{ source: "TEXT_CHAT", content }]);
  assert.ok(JSON.stringify(request).includes("Try shorter blocks"));
  assert.equal(JSON.stringify(request).includes("ciphertext"), false);
  assert.equal(isReviewedTherapyNote({ status: "THERAPIST_REVIEWED", source: "TEXT_CHAT" }), true);
  assert.equal(isReviewedTherapyNote({ status: "THERAPIST_REVIEWED", source: "VIDEO_CALL" }), true);
  assert.equal(isReviewedTherapyNote({ status: "THERAPIST_REVIEWED", source: "VOICE_CALL" }), true);
  assert.equal(isReviewedTherapyNote({ status: "AI_DRAFT", source: "TEXT_CHAT" }), false);
});
