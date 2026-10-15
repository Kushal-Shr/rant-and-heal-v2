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
import { MOOD_EMOTIONS, type MoodEmotionRating, type MoodSource } from "../lib/mood/schema";

const USER_COLLECTION = "users";
const HEALTH_METRICS_COLLECTION = "health_metrics";

export type CreateMoodEntryInput = {
  moodScore?: number;
  emotions?: MoodEmotionRating[];
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
  source?: MoodSource;
  usefulnessRating?: number;
  conversationId?: string;
  baselineCheckInId?: string;
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
  if (!input.moodScore && !input.emotions?.length) {
    throw new Error("Choose at least one emotion or an overall mood.");
  }
  if ((input.emotions?.length ?? 0) > 5) throw new Error("Choose up to 5 emotions.");
  const emotionNames = new Set<string>();
  for (const item of input.emotions ?? []) {
    if (!MOOD_EMOTIONS.includes(item.emotion)) throw new Error("Unsupported emotion.");
    if (emotionNames.has(item.emotion)) throw new Error("Each emotion can only be selected once.");
    emotionNames.add(item.emotion);
    if (item.intensity !== undefined && (!Number.isFinite(item.intensity) || item.intensity < 1 || item.intensity > 10)) {
      throw new Error("Emotion intensity must be between 1 and 10.");
    }
  }
  if ((input.note?.trim().length ?? 0) > 1000) throw new Error("Notes can be up to 1,000 characters.");
  if (input.contexts && input.contexts.length > 12) throw new Error("Choose up to 12 influences.");
  if (input.helpfulFactors && input.helpfulFactors.length > 10) throw new Error("Choose up to 10 helpful factors.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.localDate)) throw new Error("Invalid local date.");
  if (!input.timezone || input.timezone.length > 64) throw new Error("Invalid timezone.");
  if (input.usefulnessRating !== undefined && (!Number.isInteger(input.usefulnessRating) || input.usefulnessRating < 1 || input.usefulnessRating > 5)) {
    throw new Error("Usefulness must be between 1 and 5.");
  }
  if ((input.conversationId?.length ?? 0) > 128 || (input.baselineCheckInId?.length ?? 0) > 128) {
    throw new Error("Invalid linked check-in details.");
  }

  const optionalScores = Object.fromEntries(
    OPTIONAL_SCORE_KEYS.flatMap((key) => input[key] === undefined ? [] : [[key, input[key]]])
  );
  const docRef = await addDoc(healthMetricsCollection(uid), {
    userId: uid,
    ...(input.moodScore !== undefined ? { moodScore: input.moodScore } : {}),
    ...(input.emotions?.length ? { emotions: input.emotions.map((item) => ({
      emotion: item.emotion,
      ...(item.intensity !== undefined ? { intensity: item.intensity } : {}),
    })) } : {}),
    ...optionalScores,
    ...(input.contexts?.length ? { contexts: input.contexts } : {}),
    ...(input.helpfulFactors?.length ? { helpfulFactors: input.helpfulFactors } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    source: input.source ?? "MANUAL_CHECKIN",
    ...(input.usefulnessRating !== undefined ? { usefulnessRating: input.usefulnessRating } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.baselineCheckInId ? { baselineCheckInId: input.baselineCheckInId } : {}),
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
