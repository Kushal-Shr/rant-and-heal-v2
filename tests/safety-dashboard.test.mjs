import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionSafetyCase,
  safetyCaseAssignmentDecision,
  safetyCasePersistenceDecision,
  safetyCaseSchema,
  sortSafetyActions,
  sortSafetyCases,
  statusConfirmsHumanConnection,
} from "../src/lib/safety/cases.ts";
import { enforceBackendActionTruthfulness } from "../src/lib/safety/actionTruthfulness.ts";
import { safetyReviewerRoleFromClaims } from "../src/lib/safety/reviewerAuth.ts";

const validCase = {
  id: "case-1",
  userId: "user-1",
  sessionId: "session-1",
  currentState: "SUICIDAL",
  status: "OPEN",
  trigger: "SUICIDAL_IDEATION",
  relevantUserText: "I am thinking about dying.",
  safetyTarget: "SELF",
  reviewUrgency: "URGENT",
  assessmentStatus: "ASSESSING",
  assessmentStep: "CHECK_CURRENT_IMMEDIACY",
  source: "TEXT",
  sourceEventId: "event-1",
  latestSafetyEventId: "event-1",
  policyVersion: "research-draft",
  createdAt: "2026-09-26T12:00:00.000Z",
  updatedAt: "2026-09-26T12:00:00.000Z",
  actions: [],
};

test("workflow transitions are explicit and separate from SafetyState", () => {
  const valid = [
    ["OPEN", "ACKNOWLEDGED"],
    ["ACKNOWLEDGED", "HUMAN_CONNECTED"],
    ["ACKNOWLEDGED", "EXTERNAL_HANDOFF"],
    ["HUMAN_CONNECTED", "EXTERNAL_HANDOFF"],
    ["HUMAN_CONNECTED", "RESOLVED"],
    ["EXTERNAL_HANDOFF", "RESOLVED"],
  ];
  for (const [from, to] of valid) assert.equal(canTransitionSafetyCase(from, to), true, `${from} -> ${to}`);
  for (const [from, to] of [
    ["OPEN", "RESOLVED"],
    ["OPEN", "HUMAN_CONNECTED"],
    ["ACKNOWLEDGED", "RESOLVED"],
    ["RESOLVED", "ACKNOWLEDGED"],
  ]) assert.equal(canTransitionSafetyCase(from, to), false, `${from} -/-> ${to}`);

  const parsed = safetyCaseSchema.parse(validCase);
  assert.equal(parsed.currentState, "SUICIDAL");
  assert.equal(parsed.status, "OPEN");
});

test("authorization requires an explicit safety reviewer or admin claim", () => {
  assert.equal(safetyReviewerRoleFromClaims({}), null);
  assert.equal(safetyReviewerRoleFromClaims({ role: "USER" }), null);
  assert.equal(safetyReviewerRoleFromClaims({ role: "THERAPIST" }), null);
  assert.equal(safetyReviewerRoleFromClaims({ safetyReviewer: true }), "SAFETY_REVIEWER");
  assert.equal(safetyReviewerRoleFromClaims({ admin: true }), "ADMIN");
});

test("review-required events create or update one active session case", () => {
  assert.equal(safetyCasePersistenceDecision(false), "NONE");
  assert.equal(safetyCasePersistenceDecision(true), "CREATE");
  assert.equal(safetyCasePersistenceDecision(true, "OPEN"), "UPDATE");
  assert.equal(safetyCasePersistenceDecision(true, "ACKNOWLEDGED"), "UPDATE");
  assert.equal(safetyCasePersistenceDecision(true, "HUMAN_CONNECTED"), "UPDATE");
  assert.equal(safetyCasePersistenceDecision(true, "EXTERNAL_HANDOFF"), "UPDATE");
  assert.equal(safetyCasePersistenceDecision(true, "RESOLVED"), "CREATE");
});

test("assignment compare-and-set never silently overwrites another reviewer", () => {
  let owner;
  const first = safetyCaseAssignmentDecision(owner, "reviewer-a");
  if (first === "CLAIMED") owner = "reviewer-a";
  const racingSecond = safetyCaseAssignmentDecision(owner, "reviewer-b");
  if (racingSecond === "CLAIMED") owner = "reviewer-b";
  assert.equal(first, "CLAIMED");
  assert.equal(racingSecond, "CONFLICT");
  assert.equal(owner, "reviewer-a");
  assert.equal(safetyCaseAssignmentDecision(owner, "reviewer-a"), "ALREADY_OWNED");
});

test("attempt and failure never imply confirmed human connection or handoff", () => {
  assert.equal(statusConfirmsHumanConnection("OPEN"), false);
  assert.equal(statusConfirmsHumanConnection("ACKNOWLEDGED"), false);
  assert.equal(statusConfirmsHumanConnection("HUMAN_CONNECTED"), true);
  assert.equal(canTransitionSafetyCase("ACKNOWLEDGED", "HUMAN_CONNECTED"), true);
  assert.equal(canTransitionSafetyCase("OPEN", "HUMAN_CONNECTED"), false);
});

test("queue ordering prioritizes unresolved urgency before resolved cases", () => {
  const cases = [
    { status: "RESOLVED", reviewUrgency: "IMMEDIATE", createdAt: "2026-09-20T00:00:00.000Z" },
    { status: "OPEN", reviewUrgency: "ROUTINE", createdAt: "2026-09-21T00:00:00.000Z" },
    { status: "ACKNOWLEDGED", reviewUrgency: "IMMEDIATE", createdAt: "2026-09-22T00:00:00.000Z" },
    { status: "OPEN", reviewUrgency: "URGENT", createdAt: "2026-09-23T00:00:00.000Z" },
  ];
  assert.deepEqual(sortSafetyCases(cases).map((item) => [item.status, item.reviewUrgency]), [
    ["ACKNOWLEDGED", "IMMEDIATE"],
    ["OPEN", "URGENT"],
    ["OPEN", "ROUTINE"],
    ["RESOLVED", "IMMEDIATE"],
  ]);
});

test("audit actions are ordered in memory without requiring a Firestore orderBy query", () => {
  const actions = [
    { id: "second", createdAt: "2026-09-26T12:01:00.000Z" },
    { id: "first", createdAt: "2026-09-26T12:00:00.000Z" },
    { id: "third-b", createdAt: "2026-09-26T12:02:00.000Z" },
    { id: "third-a", createdAt: "2026-09-26T12:02:00.000Z" },
  ];
  assert.deepEqual(sortSafetyActions(actions).map((item) => item.id), ["first", "second", "third-a", "third-b"]);
});

test("safety case payload is minimum-context and excludes protected data", () => {
  const parsed = safetyCaseSchema.parse(validCase);
  assert.equal(parsed.relevantUserText, validCase.relevantUserText);
  for (const forbidden of [
    "journalPlaintext", "journalEmbeddings", "journalSemanticSummary", "journalInferredRisk",
    "therapyHistory", "therapistMessages", "completeTranscript", "chainOfThought", "modelRationale",
  ]) assert.equal(Object.hasOwn(parsed, forbidden), false, forbidden);
});

test("attempted or failed backend actions cannot produce success language", () => {
  for (const status of ["REQUESTED", "STARTED", "FAILED"]) {
    const output = enforceBackendActionTruthfulness(
      "They have been contacted. A professional is connected. A reviewer has taken over.",
      { HUMAN_REVIEWER: status }
    );
    assert.doesNotMatch(output, /have been contacted|professional is connected|reviewer has taken over/i);
    assert.match(output, /can.t confirm/i);
  }
  const confirmed = enforceBackendActionTruthfulness("A professional is connected.", { HUMAN_REVIEWER: "CONFIRMED" });
  assert.match(confirmed, /professional is connected/i);
  assert.doesNotMatch(
    enforceBackendActionTruthfulness("Emergency services have been contacted.", { EMERGENCY_SERVICES: "STARTED" }),
    /emergency services have been contacted/i
  );
});

test("truthfulness filtering preserves valid paragraph and line structure", () => {
  const response = "First paragraph.\n\nSecond paragraph with  two intentional spaces.\nLine two.";
  assert.equal(enforceBackendActionTruthfulness(response), response);
});

test("truthfulness filtering preserves harmless streaming whitespace byte-for-byte", () => {
  for (const fragment of ["Hey. ", "Hey, what's up?\n", "How's it going  "]) {
    assert.equal(enforceBackendActionTruthfulness(fragment), fragment);
  }
});
