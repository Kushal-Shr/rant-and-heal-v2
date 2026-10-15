import test from "node:test";
import assert from "node:assert/strict";
import { mergeMomoMessages } from "../src/lib/momo/messageView.ts";
import { setCallMediaEnabled } from "../src/lib/therapy/mediaControls.ts";

test("a user message remains visible while the response and encrypted snapshot are pending", () => {
  const saved = [{ id: "previous-momo", order: 1 }];
  const pending = { id: "request-user", order: 2, text: "Hello" };
  assert.deepEqual(mergeMomoMessages(saved, [pending]), [...saved, pending]);
  // An older Firestore snapshot must not erase the pending user turn.
  assert.deepEqual(mergeMomoMessages(saved, [pending]).at(-1), pending);
});

test("saved turns replace matching local turns without duplicate bubbles", () => {
  const local = [{ id: "r-user", order: 2 }, { id: "r-momo", order: 3 }];
  const saved = [{ id: "r-user", order: 4, persisted: true }, { id: "r-momo", order: 5, persisted: true }];
  assert.deepEqual(mergeMomoMessages(saved, local), saved);
  assert.deepEqual(mergeMomoMessages(saved, [...local, { id: "next-user", order: 6 }]), [...saved, { id: "next-user", order: 6 }]);
});

test("audio and video can be independently disabled and restored on the same live stream", () => {
  const audio = [{ enabled: true }, { enabled: true }];
  const video = [{ enabled: true }];
  const stream = { getAudioTracks: () => audio, getVideoTracks: () => video };
  setCallMediaEnabled(stream, "audio", false);
  assert.ok(audio.every((track) => !track.enabled));
  assert.equal(video[0].enabled, true);
  setCallMediaEnabled(stream, "video", false);
  assert.equal(video[0].enabled, false);
  setCallMediaEnabled(stream, "audio", true);
  assert.ok(audio.every((track) => track.enabled));
  assert.equal(video[0].enabled, false);
  setCallMediaEnabled(stream, "video", true);
  assert.equal(video[0].enabled, true);
});

test("media preferences can be changed before devices are available", () => {
  assert.doesNotThrow(() => setCallMediaEnabled(null, "audio", false));
  assert.doesNotThrow(() => setCallMediaEnabled({ getVideoTracks: () => [] }, "video", false));
});
