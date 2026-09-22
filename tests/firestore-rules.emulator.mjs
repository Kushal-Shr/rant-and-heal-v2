import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";

const projectId = "demo-rant-and-heal";
const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
let environment;

before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { rules } });
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users/patient-1/journals/entry-1"), {
      userId: "patient-1",
      ciphertext: "encrypted-value",
      iv: "AAAAAAAAAAAAAAAA",
      cryptoVersion: 1,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, "users/patient-1/journal_metrics/entry-1"), {
      userId: "patient-1",
      journalEntryId: "entry-1",
      behavior: { lengthBucket: "SHORT", timeOfDay: "MORNING", localDate: "2026-09-21", wasEdited: false },
      schemaVersion: 1,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    await setDoc(doc(db, "connections/patient-1"), {
      userId: "patient-1", therapistId: "therapist-1", status: "ACTIVE",
    });
    await setDoc(doc(db, "weekly_reports/report-1"), {
      userId: "patient-1", sharedWithTherapist: true, metrics: { entryCount: 1 },
    });
  });
});

after(async () => {
  await environment?.cleanup();
});

test("patient can read encrypted journals but therapist cannot", async () => {
  const patientDb = environment.authenticatedContext("patient-1").firestore();
  const therapistDb = environment.authenticatedContext("therapist-1").firestore();
  await assertSucceeds(getDoc(doc(patientDb, "users/patient-1/journals/entry-1")));
  await assertFails(getDoc(doc(therapistDb, "users/patient-1/journals/entry-1")));
});

test("patient can read raw metrics but therapist cannot", async () => {
  const patientDb = environment.authenticatedContext("patient-1").firestore();
  const therapistDb = environment.authenticatedContext("therapist-1").firestore();
  await assertSucceeds(getDoc(doc(patientDb, "users/patient-1/journal_metrics/entry-1")));
  await assertFails(getDoc(doc(therapistDb, "users/patient-1/journal_metrics/entry-1")));
});

test("shared report requires active relationship and revoked therapist loses access", async () => {
  const therapistDb = environment.authenticatedContext("therapist-1").firestore();
  await assertSucceeds(getDoc(doc(therapistDb, "weekly_reports/report-1")));
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "connections/patient-1"), {
      userId: "patient-1", therapistId: "therapist-1", status: "REVOKED",
    });
  });
  await assertFails(getDoc(doc(therapistDb, "weekly_reports/report-1")));
});

test("rules reject legacy plaintext journal creates", async () => {
  const patientDb = environment.authenticatedContext("patient-1").firestore();
  await assertFails(setDoc(doc(patientDb, "users/patient-1/journals/plaintext"), {
    title: "private title", body: "private body", moodTag: "private tag",
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  }));
});

test("rules permit owner ciphertext and metric writes only", async () => {
  const patientDb = environment.authenticatedContext("patient-1").firestore();
  const otherDb = environment.authenticatedContext("patient-2").firestore();
  const encrypted = {
    userId: "patient-1", ciphertext: "encrypted-value", iv: "AAAAAAAAAAAAAAAA", cryptoVersion: 1,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(doc(patientDb, "users/patient-1/journals/entry-2"), encrypted));
  await assertFails(setDoc(doc(otherDb, "users/patient-1/journals/entry-3"), encrypted));
  assert.equal(Object.hasOwn(encrypted, "body"), false);
});
