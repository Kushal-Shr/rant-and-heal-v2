import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { decryptJournalPayload, encryptJournalPayload } from "../lib/crypto/vault";
import { createJournalMetricData, getJournalLengthBucket } from "../lib/journal/metrics";
import { buildJournalStoragePayload } from "../lib/journal/storagePayload";
import {
  JOURNAL_CRYPTO_VERSION,
  type DecryptedJournalEntry,
  type EncryptedJournalEntry,
  type JournalMetric,
  type JournalUserReported,
} from "../lib/journal/schemas";

const USERS = "users";
const JOURNALS = "journals";
const METRICS = "journal_metrics";

export interface JournalEntryInput {
  title: string;
  body: string;
  userReported?: JournalUserReported;
}

function journalsCollection(uid: string) {
  return collection(db, USERS, uid, JOURNALS);
}

function metricsCollection(uid: string) {
  return collection(db, USERS, uid, METRICS);
}

function journalDocument(uid: string, entryId: string) {
  return doc(db, USERS, uid, JOURNALS, entryId);
}

function metricDocument(uid: string, entryId: string) {
  return doc(db, USERS, uid, METRICS, entryId);
}

export async function createJournalEntry(
  uid: string,
  key: CryptoKey,
  input: JournalEntryInput
): Promise<string> {
  const journalRef = doc(journalsCollection(uid));
  const encrypted = await encryptJournalPayload(key, {
    version: 1,
    title: input.title.trim(),
    body: input.body.trim(),
  }, journalRef.id);
  const timestamp = serverTimestamp();
  const payload = buildJournalStoragePayload({
    userId: uid,
    journalEntryId: journalRef.id,
    encrypted,
    body: input.body,
    localDate: new Date(),
    createdAt: timestamp,
    updatedAt: timestamp,
    userReported: input.userReported,
  });

  const batch = writeBatch(db);
  batch.set(journalRef, payload.journal);
  batch.set(metricDocument(uid, journalRef.id), payload.metric);
  await batch.commit();
  return journalRef.id;
}

export async function listJournalEntries(
  uid: string,
  key: CryptoKey,
  entryLimit = 50
): Promise<DecryptedJournalEntry[]> {
  const [journalSnapshot, metricSnapshot] = await Promise.all([
    getDocs(query(journalsCollection(uid), orderBy("createdAt", "desc"), limit(entryLimit))),
    getDocs(metricsCollection(uid)),
  ]);
  const metrics = new Map(metricSnapshot.docs.map((item) => [
    item.id,
    item.data() as Omit<JournalMetric, "id">,
  ]));

  return Promise.all(journalSnapshot.docs
    .filter((item) => typeof item.data().ciphertext === "string")
    .map(async (item) => {
      const encrypted = item.data() as Omit<EncryptedJournalEntry, "id">;
      const plaintext = await decryptJournalPayload(key, encrypted, item.id);
      return {
        id: item.id,
        title: plaintext.title,
        body: plaintext.body,
        legacyMoodTag: plaintext.legacyMoodTag,
        createdAt: encrypted.createdAt,
        updatedAt: encrypted.updatedAt,
        userReported: metrics.get(item.id)?.userReported,
        metric: metrics.get(item.id) ? { id: item.id, ...metrics.get(item.id)! } : undefined,
      };
    }));
}

export async function listRecentJournalMetrics(uid: string, entryLimit = 3): Promise<JournalMetric[]> {
  const snapshot = await getDocs(query(metricsCollection(uid), orderBy("createdAt", "desc"), limit(entryLimit)));
  return snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<JournalMetric, "id">) }));
}

export async function updateJournalEntry(
  uid: string,
  entryId: string,
  key: CryptoKey,
  input: JournalEntryInput,
  originalCreatedAt: EncryptedJournalEntry["createdAt"],
  originalBehavior: Pick<JournalMetric["behavior"], "timeOfDay" | "localDate">
): Promise<void> {
  const encrypted = await encryptJournalPayload(key, {
    version: 1,
    title: input.title.trim(),
    body: input.body.trim(),
  }, entryId);
  const updatedAt = serverTimestamp();
  const metric = createJournalMetricData({
    userId: uid,
    journalEntryId: entryId,
    body: input.body,
    localDate: new Date(),
    createdAt: originalCreatedAt,
    updatedAt,
    wasEdited: true,
    userReported: input.userReported,
  });
  metric.behavior.timeOfDay = originalBehavior.timeOfDay;
  metric.behavior.localDate = originalBehavior.localDate;

  const batch = writeBatch(db);
  batch.update(journalDocument(uid, entryId), {
    ...encrypted,
    cryptoVersion: JOURNAL_CRYPTO_VERSION,
    updatedAt,
  });
  batch.set(metricDocument(uid, entryId), metric);
  await batch.commit();
}

export async function deleteJournalEntry(uid: string, entryId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(journalDocument(uid, entryId));
  batch.delete(metricDocument(uid, entryId));
  await batch.commit();
}

export function legacyMetricPreview(body: string, createdAt: Timestamp | undefined) {
  const date = createdAt?.toDate() ?? new Date();
  return { lengthBucket: getJournalLengthBucket(body), localDate: date };
}
