import {
  JOURNAL_METRICS_SCHEMA_VERSION,
  type JournalMetric,
  type JournalUserReported,
  type JournalLengthBucket,
  type JournalTimeOfDay,
} from "./schemas.ts";

// Deliberately coarse thresholds: no exact length is persisted.
export const JOURNAL_LENGTH_THRESHOLDS = { shortMaxWords: 100, mediumMaxWords: 400 } as const;

export function countWordsLocally(text: string): number {
  const normalized = text.trim();
  return normalized ? normalized.split(/\s+/u).length : 0;
}

export function getJournalLengthBucket(text: string): JournalLengthBucket {
  const wordCount = countWordsLocally(text);
  if (wordCount <= JOURNAL_LENGTH_THRESHOLDS.shortMaxWords) return "SHORT";
  if (wordCount <= JOURNAL_LENGTH_THRESHOLDS.mediumMaxWords) return "MEDIUM";
  return "LONG";
}

export function getJournalTimeOfDay(date: Date): JournalTimeOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "MORNING";
  if (hour >= 12 && hour < 17) return "AFTERNOON";
  if (hour >= 17 && hour < 22) return "EVENING";
  return "LATE_NIGHT";
}

export function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeUserReported(
  value?: JournalUserReported
): JournalUserReported | undefined {
  if (!value) return undefined;
  const emotions = value.emotions?.length ? [...new Set(value.emotions)] : undefined;
  const contexts = value.contexts?.length ? [...new Set(value.contexts)] : undefined;
  const intent = value.intent;
  if (!emotions && !contexts && !intent) return undefined;
  const normalized: JournalUserReported = {};
  if (emotions) normalized.emotions = emotions;
  if (contexts) normalized.contexts = contexts;
  if (intent) normalized.intent = intent;
  return normalized;
}

export function createJournalMetricData(args: {
  userId: string;
  journalEntryId: string;
  body: string;
  localDate: Date;
  createdAt: JournalMetric["createdAt"];
  updatedAt: JournalMetric["updatedAt"];
  wasEdited?: boolean;
  userReported?: JournalUserReported;
}): Omit<JournalMetric, "id"> {
  const metric: Omit<JournalMetric, "id"> = {
    userId: args.userId,
    journalEntryId: args.journalEntryId,
    createdAt: args.createdAt,
    updatedAt: args.updatedAt,
    behavior: {
      lengthBucket: getJournalLengthBucket(args.body),
      timeOfDay: getJournalTimeOfDay(args.localDate),
      localDate: getLocalDateKey(args.localDate),
      wasEdited: args.wasEdited ?? false,
    },
    schemaVersion: JOURNAL_METRICS_SCHEMA_VERSION,
  };
  const userReported = normalizeUserReported(args.userReported);
  if (userReported) metric.userReported = userReported;
  return metric;
}
