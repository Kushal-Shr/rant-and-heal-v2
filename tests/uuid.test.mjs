import assert from "node:assert/strict";
import test from "node:test";
import { createUuid } from "../src/lib/ids/uuid.ts";

test("createUuid returns distinct RFC 4122 version 4 identifiers", () => {
  const values = Array.from({ length: 100 }, () => createUuid());
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  assert.equal(new Set(values).size, values.length);
  assert.ok(values.every((value) => uuidV4.test(value)));
});
