import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionRelationship } from "../src/server/therapy/connectionTransitions.ts";

const base = {
  relationshipStatus: "PENDING",
  pointerStatus: "PENDING",
  isCurrentRelationship: true,
  actorIsPatient: false,
  actorIsTherapist: true,
  therapistIsVerified: true,
};

test("a verified therapist can accept only a current pending relationship", () => {
  assert.equal(canTransitionRelationship({ ...base, action: "ACCEPT" }), true);
  assert.equal(canTransitionRelationship({ ...base, action: "ACCEPT", relationshipStatus: "REVOKED", pointerStatus: "REVOKED" }), false);
  assert.equal(canTransitionRelationship({ ...base, action: "ACCEPT", isCurrentRelationship: false }), false);
});

test("a stale therapist cannot reactivate a revoked relationship", () => {
  assert.equal(canTransitionRelationship({
    ...base,
    action: "ACCEPT",
    relationshipStatus: "REVOKED",
    pointerStatus: "ACTIVE",
  }), false);
});

test("only a participant can revoke a pending or active relationship", () => {
  assert.equal(canTransitionRelationship({ ...base, action: "REVOKE", actorIsPatient: true, actorIsTherapist: false }), true);
  assert.equal(canTransitionRelationship({ ...base, action: "REVOKE", actorIsPatient: false, actorIsTherapist: false }), false);
  assert.equal(canTransitionRelationship({ ...base, action: "REVOKE", relationshipStatus: "REVOKED" }), false);
});
