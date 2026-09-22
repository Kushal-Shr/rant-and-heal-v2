import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");

test("journal rules accept ciphertext schema and reject legacy plaintext fields on final documents", () => {
  assert.match(rules, /match \/journals\/\{entryId\}/);
  assert.match(rules, /validEncryptedJournal/);
  assert.match(rules, /'userId', 'ciphertext', 'iv', 'cryptoVersion', 'createdAt', 'updatedAt'/);
  assert.match(rules, /request\.resource\.data\.keys\(\)\.hasOnly/);
});

test("raw journal metrics remain owner-only", () => {
  const section = rules.slice(rules.indexOf("match /journal_metrics"), rules.indexOf("match /patient_profiles"));
  assert.match(section, /allow read: if owner\(userId\)/);
  assert.doesNotMatch(section, /currentTherapist|activeReportTherapist/);
  assert.match(section, /getAfter\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\/journals\/\$\(entryId\)\)/);
});

test("weekly report sharing requires an active current therapist relationship", () => {
  const section = rules.slice(rules.indexOf("match /weekly_reports"), rules.indexOf("match /therapy_relationships"));
  assert.match(section, /sharedWithTherapist == true/);
  assert.match(section, /activeReportTherapist\(resource\.data\.userId, resource\.data\.relationshipId\)/);
  assert.match(rules, /status == 'ACTIVE'/);
});
