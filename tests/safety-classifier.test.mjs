import assert from "node:assert/strict";
import test from "node:test";

await import("../scripts/momo-audit-loader.mjs");
const {
  DEFAULT_SAFETY_CLASSIFIER_TIMEOUT_MS,
  resolveSafetyClassifierTimeoutMs,
} = await import("../src/server/safety/classifier.ts");

test("safety classifier timeout allows normal medium-thinking latency", () => {
  assert.equal(DEFAULT_SAFETY_CLASSIFIER_TIMEOUT_MS, 10_000);
  assert.equal(resolveSafetyClassifierTimeoutMs(""), 10_000);
  assert.equal(resolveSafetyClassifierTimeoutMs("4000"), 4_000);
  assert.equal(resolveSafetyClassifierTimeoutMs("15000"), 15_000);
  assert.equal(resolveSafetyClassifierTimeoutMs("30000"), 30_000);
});

test("safety classifier timeout rejects unsafe or malformed overrides", () => {
  for (const configured of ["3999", "30001", "0", "10.5", "not-a-number"]) {
    assert.equal(resolveSafetyClassifierTimeoutMs(configured), 10_000, configured);
  }
});
