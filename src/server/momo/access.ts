import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";

export class MomoAccessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function requireOwnedSession(db: Firestore, userId: string, sessionId: string) {
  const sessionRef = db.collection("users").doc(userId).collection("sessions").doc(sessionId);
  const snapshot = await sessionRef.get();
  if (!snapshot.exists) throw new MomoAccessError("Conversation was not found", 404);
  return sessionRef;
}

export async function consumeQuota(options: {
  db: Firestore;
  userId: string;
  key: string;
  limit: number;
  windowMs: number;
}) {
  const { db, userId, key, limit, windowMs } = options;
  const ref = db.collection("users").doc(userId).collection("usage").doc(key);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    const now = Date.now();
    const windowStart = data?.windowStart instanceof Timestamp ? data.windowStart.toMillis() : 0;
    const reset = !windowStart || now - windowStart >= windowMs;
    const count = reset ? 0 : typeof data?.count === "number" ? data.count : 0;
    if (count >= limit) throw new MomoAccessError("Too many requests. Please wait a moment and try again.", 429);
    transaction.set(ref, {
      count: count + 1,
      windowStart: reset ? Timestamp.fromMillis(now) : data?.windowStart,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
