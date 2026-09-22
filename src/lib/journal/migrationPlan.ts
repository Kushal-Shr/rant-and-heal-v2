import type { EncryptedPayload } from "../crypto/types.ts";
import { encryptJournalPayload } from "../crypto/vault.ts";
import { buildJournalStoragePayload } from "./storagePayload.ts";
import type { JournalMetric } from "./schemas.ts";

export interface LegacyJournalRecord {
  title?: unknown;
  body?: unknown;
  moodTag?: unknown;
  ciphertext?: unknown;
  createdAt?: unknown;
}

export function isLegacyJournal(data: LegacyJournalRecord): data is LegacyJournalRecord & { title: string; body: string } {
  return typeof data.ciphertext !== "string" &&
    typeof data.title === "string" && typeof data.body === "string";
}

export async function prepareLegacyJournalMigration(args: {
  userId: string;
  journalEntryId: string;
  data: LegacyJournalRecord;
  key: CryptoKey;
  localDate: Date;
  createdAt: JournalMetric["createdAt"];
  updatedAt: JournalMetric["updatedAt"];
  encrypt?: (
    key: CryptoKey,
    payload: { version: 1; title: string; body: string; legacyMoodTag?: string },
    journalEntryId: string
  ) => Promise<EncryptedPayload>;
}) {
  if (!isLegacyJournal(args.data)) return null;
  const encrypted = await (args.encrypt ?? encryptJournalPayload)(args.key, {
    version: 1,
    title: args.data.title,
    body: args.data.body,
    ...(typeof args.data.moodTag === "string" && args.data.moodTag
      ? { legacyMoodTag: args.data.moodTag }
      : {}),
  }, args.journalEntryId);
  return buildJournalStoragePayload({
    userId: args.userId,
    journalEntryId: args.journalEntryId,
    encrypted,
    body: args.data.body,
    localDate: args.localDate,
    createdAt: args.createdAt,
    updatedAt: args.updatedAt,
  });
}
