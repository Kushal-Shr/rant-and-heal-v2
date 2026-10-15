import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { buildPermittedMomoAnalytics } from "@/src/lib/momo/analyticsExtraction";
import type { ConversationContinuityState } from "@/src/lib/momo/schemas";
import { parseMomoPrivacyPreferences } from "@/src/lib/momo/privacy";

export async function persistPermittedMomoAnalytics(options: {
  db: Firestore;
  userId: string;
  conversationId: string;
  eventId: string;
  messageText: string;
  previousContinuity?: ConversationContinuityState;
  nextContinuity: ConversationContinuityState;
}): Promise<void> {
  const {
    db, userId, conversationId, eventId, messageText,
    previousContinuity, nextContinuity,
  } = options;
  const userRef = db.collection("users").doc(userId);
  await db.runTransaction(async (transaction) => {
    const profile = await transaction.get(userRef);
    const preferences = parseMomoPrivacyPreferences(profile.data()?.momoPrivacyPreferences);
    const permitted = buildPermittedMomoAnalytics({
      messageText,
      previousContinuity,
      nextContinuity,
      preferences,
    });
    if (permitted.mood) {
      const scores = permitted.mood;
      transaction.set(userRef.collection("momo_mood_analytics").doc(eventId), {
        userId,
        conversationId,
        source: "MOMO_INFERRED",
        ...scores,
        schemaVersion: 1,
        timestamp: FieldValue.serverTimestamp(),
      });
    }
    if (permitted.outcome) {
      const outcome = permitted.outcome;
      transaction.set(userRef.collection("momo_outcome_analytics").doc(eventId), {
        userId,
        conversationId,
        source: "MOMO_INFERRED",
        approach: outcome.approach,
        outcome: outcome.outcome,
        goal: outcome.goal,
        schemaVersion: 1,
        timestamp: FieldValue.serverTimestamp(),
      });
    }
  });
}
