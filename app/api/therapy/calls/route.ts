import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { ConnectionStatus, TherapyCallStatus } from "@/src/types/database";

export const runtime = "nodejs";
const schema = z.object({ relationshipId: z.string().trim().min(1).max(128) }).strict();
const RINGING_LEASE_MS = 2 * 60 * 1000;

class CallError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function POST(request: NextRequest) {
  try {
    const token = await verifyFirebaseBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "A valid relationship ID is required" }, { status: 400 });

    const db = getAdminDb();
    const relationshipRef = db.collection("therapy_relationships").doc(parsed.data.relationshipId);
    const sessionRef = relationshipRef.collection("call_sessions").doc();
    const lockRef = relationshipRef.collection("call_state").doc("current");
    const now = Date.now();
    const expiresAt = Timestamp.fromMillis(now + RINGING_LEASE_MS);

    await db.runTransaction(async (transaction) => {
      const [relationshipSnap, lockSnap] = await Promise.all([
        transaction.get(relationshipRef),
        transaction.get(lockRef),
      ]);
      const relationship = relationshipSnap.data();
      const lock = lockSnap.data();
      const pointer = relationship?.userId ? (await transaction.get(db.collection("connections").doc(relationship.userId))).data() : null;
      if (
        !relationship ||
        relationship.status !== ConnectionStatus.ACTIVE ||
        pointer?.relationshipId !== relationshipRef.id || pointer.status !== ConnectionStatus.ACTIVE ||
        (token.uid !== relationship.userId && token.uid !== relationship.therapistId)
      ) throw new CallError("You cannot start a call for this relationship", 403);

      const lockExpiry = lock?.expiresAt instanceof Timestamp ? lock.expiresAt.toMillis() : 0;
      if (
        lock?.sessionId &&
        [TherapyCallStatus.RINGING, TherapyCallStatus.ACTIVE].includes(lock.status) &&
        lockExpiry > now
      ) throw new CallError("A call is already in progress", 409);

      const staleSessionRef =
        lock?.sessionId &&
        [TherapyCallStatus.RINGING, TherapyCallStatus.ACTIVE].includes(lock.status) &&
        lockExpiry <= now
          ? relationshipRef.collection("call_sessions").doc(lock.sessionId)
          : null;
      const staleSession = staleSessionRef ? await transaction.get(staleSessionRef) : null;

      const recipientId = token.uid === relationship.userId ? relationship.therapistId : relationship.userId;
      if (staleSessionRef && staleSession?.exists) {
        transaction.update(staleSessionRef, {
          status: TherapyCallStatus.ENDED,
          endedAt: FieldValue.serverTimestamp(),
          endReason: "LEASE_EXPIRED",
        });
      }
      transaction.create(sessionRef, {
        relationshipId: relationshipRef.id,
        patientId: relationship.userId,
        therapistId: relationship.therapistId,
        callerId: token.uid,
        recipientId,
        status: TherapyCallStatus.RINGING,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
      });
      transaction.set(lockRef, {
        sessionId: sessionRef.id,
        status: TherapyCallStatus.RINGING,
        expiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return NextResponse.json({ sessionId: sessionRef.id }, { status: 201 });
  } catch (error) {
    if (error instanceof CallError) return NextResponse.json({ error: error.message }, { status: error.status });
    const detail = getErrorMessage(error);
    console.error("THERAPY CALL CREATE API ERROR:", detail);
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Could not start the call" : detail }, { status: 500 });
  }
}
