import { collection, doc, getDocs, serverTimestamp, Timestamp, writeBatch } from "firebase/firestore";
import { db } from "@/src/config/firebase";
import { isLegacyJournal, prepareLegacyJournalMigration, type LegacyJournalRecord } from "./migrationPlan";

export interface JournalMigrationResult {
  migratedIds: string[];
  failedIds: string[];
}

export async function migrateLegacyJournalEntries(
  uid: string,
  key: CryptoKey
): Promise<JournalMigrationResult> {
  const snapshot = await getDocs(collection(db, "users", uid, "journals"));
  const result: JournalMigrationResult = { migratedIds: [], failedIds: [] };

  for (const item of snapshot.docs) {
    const data = item.data() as LegacyJournalRecord & { createdAt?: unknown };
    if (!isLegacyJournal(data)) continue;
    try {
      const createdAt = data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now();
      const updatedAt = serverTimestamp();
      const payload = await prepareLegacyJournalMigration({
        userId: uid,
        journalEntryId: item.id,
        data,
        key,
        localDate: createdAt.toDate(),
        createdAt,
        updatedAt,
      });
      if (!payload) continue;
      const batch = writeBatch(db);
      // Plaintext is removed only in the same atomic commit that creates both
      // its ciphertext replacement and safe metric. Failed commits are retryable.
      batch.set(item.ref, payload.journal);
      batch.set(doc(db, "users", uid, "journal_metrics", item.id), payload.metric);
      await batch.commit();
      result.migratedIds.push(item.id);
    } catch {
      result.failedIds.push(item.id);
    }
  }
  return result;
}
