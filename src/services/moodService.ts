import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { MoodEntry } from "../types/database";

const USER_COLLECTION = "users";
const HEALTH_METRICS_COLLECTION = "health_metrics";

export type CreateMoodEntryInput = {
  moodScore: number;
  anxietyScore: number;
  energyScore: number;
  note?: string;
};

function healthMetricsCollection(uid: string) {
  return collection(db, USER_COLLECTION, uid, HEALTH_METRICS_COLLECTION);
}

export async function createMoodEntry(
  uid: string,
  input: CreateMoodEntryInput
): Promise<string> {
  const docRef = await addDoc(healthMetricsCollection(uid), {
    moodScore: input.moodScore,
    anxietyScore: input.anxietyScore,
    energyScore: input.energyScore,
    note: input.note?.trim() || "",
    createdAt: serverTimestamp(),
  });

  return docRef.id;
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
