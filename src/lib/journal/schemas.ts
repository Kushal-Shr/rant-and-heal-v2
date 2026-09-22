import type { ServerTime } from "@/src/types/database";

export const JOURNAL_CRYPTO_VERSION = 1 as const;
export const JOURNAL_METRICS_SCHEMA_VERSION = 1 as const;

export const JOURNAL_EMOTIONS = [
  "ANXIOUS", "SAD", "ANGRY", "LONELY", "CALM", "HAPPY", "OVERWHELMED", "OTHER",
] as const;
export const JOURNAL_CONTEXTS = [
  "ACADEMIC", "FAMILY", "RELATIONSHIP", "WORK", "HEALTH", "FINANCIAL", "PERSONAL", "SOCIAL", "OTHER",
] as const;
export const JOURNAL_INTENTS = [
  "VENT", "UNDERSTAND", "MAKE_DECISION", "CALM_DOWN", "REFLECT", "OTHER",
] as const;

export type JournalEmotion = (typeof JOURNAL_EMOTIONS)[number];
export type JournalContext = (typeof JOURNAL_CONTEXTS)[number];
export type JournalIntent = (typeof JOURNAL_INTENTS)[number];
export type JournalLengthBucket = "SHORT" | "MEDIUM" | "LONG";
export type JournalTimeOfDay = "MORNING" | "AFTERNOON" | "EVENING" | "LATE_NIGHT";

export interface JournalUserReported {
  emotions?: JournalEmotion[];
  contexts?: JournalContext[];
  intent?: JournalIntent;
}

export interface EncryptedJournalEntry {
  id?: string;
  userId: string;
  ciphertext: string;
  iv: string;
  cryptoVersion: typeof JOURNAL_CRYPTO_VERSION;
  createdAt: ServerTime;
  updatedAt: ServerTime;
}

export interface JournalMetric {
  id?: string;
  userId: string;
  journalEntryId: string;
  createdAt: ServerTime;
  updatedAt: ServerTime;
  behavior: {
    lengthBucket: JournalLengthBucket;
    timeOfDay: JournalTimeOfDay;
    localDate: string;
    wasEdited: boolean;
  };
  userReported?: JournalUserReported;
  schemaVersion: typeof JOURNAL_METRICS_SCHEMA_VERSION;
}

export interface DecryptedJournalEntry {
  id: string;
  title: string;
  body: string;
  legacyMoodTag?: string;
  createdAt: ServerTime;
  updatedAt: ServerTime;
  userReported?: JournalUserReported;
  metric?: JournalMetric;
}
