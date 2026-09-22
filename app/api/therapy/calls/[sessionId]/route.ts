import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { ConnectionStatus, TherapyCallStatus } from "@/src/types/database";

export const runtime = "nodejs";
const schema = z.object({
  relationshipId: z.string().trim().min(1).max(128),
  action: z.enum(["ANSWER", "DECLINE", "END"]),
}).strict();
const ACTIVE_LEASE_MS = 2 * 60 * 60 * 1000;

class CallError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const token = await verifyFirebaseBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { sessionId } = await context.params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!sessionId || !parsed.success) return NextResponse.json({ error: "Invalid call action" }, { status: 400 });

    const db = getAdminDb();
    const relationshipRef = db.collection("therapy_relationships").doc(parsed.data.relationshipId);
    const sessionRef = relationshipRef.collection("call_sessions").doc(sessionId);
    const lockRef = relationshipRef.collection("call_state").doc("current");
    await db.runTransaction(async (transaction) => {
      const [relationshipSnap, sessionSnap, lockSnap] = await Promise.all([
        transaction.get(relationshipRef),
        transaction.get(sessionRef),
        transaction.get(lockRef),
      ]);
      const relationship = relationshipSnap.data();
      const session = sessionSnap.data();
      const lock = lockSnap.data();
      if (!relationship || !session || session.relationshipId !== relationshipRef.id) throw new CallError("Call session was not found", 404);
      const pointer = (await transaction.get(db.collection("connections").doc(relationship.userId))).data();
      if (relationship.status !== ConnectionStatus.ACTIVE || pointer?.relationshipId !== relationshipRef.id || pointer.status !== ConnectionStatus.ACTIVE) throw new CallError("This relationship is no longer active", 409);
      if (token.uid !== session.patientId && token.uid !== session.therapistId) throw new CallError("Forbidden", 403);
      if (lock?.sessionId !== sessionId) throw new CallError("This call is no longer current", 409);

      if (parsed.data.action === "ANSWER") {
        const expiry = session.expiresAt instanceof Timestamp ? session.expiresAt.toMillis() : 0;
        if (session.status !== TherapyCallStatus.RINGING || token.uid !== session.recipientId || expiry <= Date.now()) throw new CallError("This call can no longer be answered", 409);
        const expiresAt = Timestamp.fromMillis(Date.now() + ACTIVE_LEASE_MS);
        transaction.update(sessionRef, { status: TherapyCallStatus.ACTIVE, answeredBy: token.uid, answeredAt: FieldValue.serverTimestamp(), expiresAt });
        transaction.set(lockRef, { sessionId, status: TherapyCallStatus.ACTIVE, expiresAt, updatedAt: FieldValue.serverTimestamp() });
        return;
      }
      if (parsed.data.action === "DECLINE") {
        if (session.status !== TherapyCallStatus.RINGING || token.uid !== session.recipientId) throw new CallError("This call can no longer be declined", 409);
        transaction.update(sessionRef, { status: TherapyCallStatus.DECLINED, declinedBy: token.uid, declinedAt: FieldValue.serverTimestamp() });
        transaction.set(lockRef, { sessionId, status: TherapyCallStatus.DECLINED, expiresAt: Timestamp.now(), updatedAt: FieldValue.serverTimestamp() });
        return;
      }
      if ([TherapyCallStatus.ENDED, TherapyCallStatus.DECLINED].includes(session.status)) return;
      if (![TherapyCallStatus.RINGING, TherapyCallStatus.ACTIVE].includes(session.status)) throw new CallError("This call cannot be ended", 409);
      transaction.update(sessionRef, { status: TherapyCallStatus.ENDED, endedBy: token.uid, endedAt: FieldValue.serverTimestamp() });
      transaction.set(lockRef, { sessionId, status: TherapyCallStatus.ENDED, expiresAt: Timestamp.now(), updatedAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CallError) return NextResponse.json({ error: error.message }, { status: error.status });
    const detail = getErrorMessage(error);
    console.error("THERAPY CALL ACTION API ERROR:", detail);
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Could not update the call" : detail }, { status: 500 });
  }
}
