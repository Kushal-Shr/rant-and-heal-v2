import type { Firestore, Timestamp } from "firebase-admin/firestore";

export interface WeeklyJournalMetrics {
  entryCount: number;
  writingDays: number;
  consecutiveJournalingDays: number;
  timeOfDay: { morning: number; afternoon: number; evening: number; lateNight: number };
  lengthDistribution: { short: number; medium: number; long: number };
  editedEntries: number;
  userReported: {
    emotions: Record<string, number>;
    contexts: Record<string, number>;
    intents: Record<string, number>;
  };
}

export interface StoredJournalMetric {
  createdAt?: Timestamp;
  behavior?: {
    lengthBucket?: string;
    timeOfDay?: string;
    localDate?: string;
    wasEdited?: boolean;
  };
  userReported?: {
    emotions?: unknown;
    contexts?: unknown;
    intent?: unknown;
  };
}

function increment(target: Record<string, number>, value: unknown) {
  if (typeof value === "string" && value.length <= 32) target[value] = (target[value] ?? 0) + 1;
}

function longestConsecutiveRun(dateKeys: Set<string>): number {
  if (!dateKeys.size) return 0;
  const days = [...dateKeys]
    .map((value) => Date.parse(`${value}T00:00:00Z`))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  let longest = 1;
  let current = 1;
  for (let index = 1; index < days.length; index += 1) {
    if (days[index] - days[index - 1] === 86_400_000) current += 1;
    else if (days[index] !== days[index - 1]) current = 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

export function aggregateJournalMetricRecords(records: StoredJournalMetric[]): WeeklyJournalMetrics {
  const aggregate: WeeklyJournalMetrics = {
    entryCount: records.length,
    writingDays: 0,
    consecutiveJournalingDays: 0,
    timeOfDay: { morning: 0, afternoon: 0, evening: 0, lateNight: 0 },
    lengthDistribution: { short: 0, medium: 0, long: 0 },
    editedEntries: 0,
    userReported: { emotions: {}, contexts: {}, intents: {} },
  };
  const writingDays = new Set<string>();
  for (const record of records) {
    const behavior = record.behavior;
    if (behavior?.localDate) writingDays.add(behavior.localDate);
    if (behavior?.timeOfDay === "MORNING") aggregate.timeOfDay.morning += 1;
    if (behavior?.timeOfDay === "AFTERNOON") aggregate.timeOfDay.afternoon += 1;
    if (behavior?.timeOfDay === "EVENING") aggregate.timeOfDay.evening += 1;
    if (behavior?.timeOfDay === "LATE_NIGHT") aggregate.timeOfDay.lateNight += 1;
    if (behavior?.lengthBucket === "SHORT") aggregate.lengthDistribution.short += 1;
    if (behavior?.lengthBucket === "MEDIUM") aggregate.lengthDistribution.medium += 1;
    if (behavior?.lengthBucket === "LONG") aggregate.lengthDistribution.long += 1;
    if (behavior?.wasEdited === true) aggregate.editedEntries += 1;
    if (Array.isArray(record.userReported?.emotions)) {
      record.userReported.emotions.forEach((value) => increment(aggregate.userReported.emotions, value));
    }
    if (Array.isArray(record.userReported?.contexts)) {
      record.userReported.contexts.forEach((value) => increment(aggregate.userReported.contexts, value));
    }
    increment(aggregate.userReported.intents, record.userReported?.intent);
  }
  aggregate.writingDays = writingDays.size;
  aggregate.consecutiveJournalingDays = longestConsecutiveRun(writingDays);
  return aggregate;
}

/**
 * Security invariant: weekly insights query journal_metrics only. This module
 * must never query, import, decrypt, or accept users/{uid}/journals documents.
 */
export async function aggregateWeeklyJournalMetrics(
  db: Firestore,
  uid: string,
  startInclusive: Date,
  endExclusive: Date
): Promise<WeeklyJournalMetrics> {
  const snapshot = await db.collection("users").doc(uid).collection("journal_metrics")
    .where("createdAt", ">=", startInclusive)
    .where("createdAt", "<", endExclusive)
    .get();
  return aggregateJournalMetricRecords(snapshot.docs.map((item) => item.data() as StoredJournalMetric));
}
