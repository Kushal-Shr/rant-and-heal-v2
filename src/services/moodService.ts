import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { MoodEntry } from "../types/database";
import type { HelpfulFactor, MoodContext } from "../lib/mood/schema";

const USER_COLLECTION = "users";
const HEALTH_METRICS_COLLECTION = "health_metrics";

export type CreateMoodEntryInput = {
  moodScore: number;
  anxietyScore?: number;
  energyScore?: number;
  stressScore?: number;
  sleepQualityScore?: number;
  focusScore?: number;
  socialConnectionScore?: number;
  physicalWellbeingScore?: number;
  contexts?: MoodContext[];
  helpfulFactors?: HelpfulFactor[];
  note?: string;
  timezone: string;
  localDate: string;
};

const OPTIONAL_SCORE_KEYS = [
  "anxietyScore",
  "energyScore",
  "stressScore",
  "sleepQualityScore",
  "focusScore",
  "socialConnectionScore",
  "physicalWellbeingScore",
] as const;

function healthMetricsCollection(uid: string) {
  return collection(db, USER_COLLECTION, uid, HEALTH_METRICS_COLLECTION);
}

export async function createMoodEntry(
  uid: string,
  input: CreateMoodEntryInput
): Promise<string> {
  for (const value of [input.moodScore, ...OPTIONAL_SCORE_KEYS.map((key) => input[key])]) {
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 1 || value > 10) {
      throw new Error("Mood scores must be between 1 and 10.");
    }
  }
  if ((input.note?.trim().length ?? 0) > 1000) throw new Error("Notes can be up to 1,000 characters.");
  if (input.contexts && input.contexts.length > 12) throw new Error("Choose up to 12 influences.");
  if (input.helpfulFactors && input.helpfulFactors.length > 10) throw new Error("Choose up to 10 helpful factors.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate)) throw new Error("Invalid local date.");
  if (!input.timezone || input.timezone.length > 64) throw new Error("Invalid timezone.");

  const optionalScores = Object.fromEntries(
    OPTIONAL_SCORE_KEYS.flatMap((key) => input[key] === undefined ? [] : [[key, input[key]]])
  );
  const docRef = await addDoc(healthMetricsCollection(uid), {
    userId: uid,
    moodScore: input.moodScore,
    ...optionalScores,
    ...(input.contexts?.length ? { contexts: input.contexts } : {}),
    ...(input.helpfulFactors?.length ? { helpfulFactors: input.helpfulFactors } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    timezone: input.timezone,
    localDate: input.localDate,
    schemaVersion: 2,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function listMoodEntriesInRange(
  uid: string,
  days = 90,
  entryLimit = 500
): Promise<MoodEntry[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const entriesQuery = query(
    healthMetricsCollection(uid),
    where("createdAt", ">=", Timestamp.fromDate(cutoff)),
    orderBy("createdAt", "desc"),
    limit(entryLimit)
  );
  const snapshot = await getDocs(entriesQuery);
  return snapshot.docs.map((entryDoc) => ({
    id: entryDoc.id,
    ...(entryDoc.data() as Omit<MoodEntry, "id">),
  }));
}

export async function listMoodEntries(
  uid: string,
  entryLimit = 7
): Promise<MoodEntry[]> {
  const entriesQuery = query(
    healthMetricsCollection(uid),
    orderBy("createdAt", "desc"),
    limit(entryLimit)
  );
  const snapshot = await getDocs(entriesQuery);

  return snapshot.docs.map((entryDoc) => ({
    id: entryDoc.id,
    ...(entryDoc.data() as Omit<MoodEntry, "id">),
  }));
}
