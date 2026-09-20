import assert from "node:assert/strict";
import test from "node:test";
import { assessMomoSafety } from "../src/server/momo/safetyAssessment.ts";

test("detects direct current self-harm intent", () => {
  const assessment = assessMomoSafety("I am going to hurt myself");
  assert.equal(assessment.level, "IMMINENT");
  assert.equal(assessment.category, "SELF_HARM");
});

test("does not classify an explicit negation as imminent", () => {
  assert.equal(assessMomoSafety("I do not want to hurt myself.").level, "SAFE");
  assert.equal(assessMomoSafety("I would never hurt myself.").level, "SAFE");
});

test("retains Nepali and romanized Nepali detection", () => {
  assert.equal(assessMomoSafety("मलाई आत्महत्या गर्ने सोच छ").level, "IMMINENT");
  assert.equal(assessMomoSafety("malai aatmahatya garna man cha").level, "IMMINENT");
});
