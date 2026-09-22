import type { EncryptedPayload } from "../crypto/types.ts";
import { createJournalMetricData } from "./metrics.ts";
import { JOURNAL_CRYPTO_VERSION, type JournalMetric, type JournalUserReported } from "./schemas.ts";

export function buildJournalStoragePayload(args: {
  userId: string;
  journalEntryId: string;
  encrypted: EncryptedPayload;
  body: string;
  localDate: Date;
  createdAt: JournalMetric["createdAt"];
  updatedAt: JournalMetric["updatedAt"];
  wasEdited?: boolean;
  userReported?: JournalUserReported;
}) {
  return {
    journal: {
      userId: args.userId,
      ...args.encrypted,
      cryptoVersion: JOURNAL_CRYPTO_VERSION,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
    },
    metric: createJournalMetricData(args),
  };
}
