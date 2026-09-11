import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { ConnectionStatus, TherapyCallStatus } from "@/src/types/database";

export const runtime = "nodejs";

type CallAction = "ANSWER" | "DECLINE" | "END";

interface CallActionRequestBody {
  patientId?: string;
  action?: CallAction;
}

class CallActionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const decodedToken = await verifyFirebaseBearerToken(request);
    if (!decodedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sessionId } = await context.params;
    const body = (await request.json()) as CallActionRequestBody;
    const patientId = body.patientId?.trim();
    if (!patientId || !sessionId || !body.action) {
      return NextResponse.json({ error: "A session ID, patient ID, and action are required" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const connectionRef = adminDb.collection("connections").doc(patientId);
    const sessionRef = connectionRef.collection("call_sessions").doc(sessionId);
    const callStateRef = connectionRef.collection("call_state").doc("current");

    await adminDb.runTransaction(async (transaction) => {
      const [connectionSnapshot, sessionSnapshot] = await Promise.all([
        transaction.get(connectionRef),
        transaction.get(sessionRef),
      ]);
      const connection = connectionSnapshot.data();
      const session = sessionSnapshot.data();

      if (!connection || connection.status !== ConnectionStatus.ACTIVE || !session) {
        throw new CallActionError("Call session was not found", 404);
      }
      if (decodedToken.uid !== session.patientId && decodedToken.uid !== session.therapistId) {
        throw new CallActionError("You are not a participant in this call", 403);
      }

      if (body.action === "ANSWER") {
        if (session.status !== TherapyCallStatus.RINGING || decodedToken.uid !== session.recipientId) {
          throw new CallActionError("This call can no longer be answered", 409);
        }
        transaction.update(sessionRef, {
          status: TherapyCallStatus.ACTIVE,
          answeredBy: decodedToken.uid,
          answeredAt: FieldValue.serverTimestamp(),
        });
        transaction.set(callStateRef, {
          sessionId,
          status: TherapyCallStatus.ACTIVE,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      if (body.action === "DECLINE") {
        if (session.status !== TherapyCallStatus.RINGING || decodedToken.uid !== session.recipientId) {
          throw new CallActionError("This call can no longer be declined", 409);
        }
        transaction.update(sessionRef, {
          status: TherapyCallStatus.DECLINED,
          declinedBy: decodedToken.uid,
          declinedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(callStateRef, {
          sessionId,
          status: TherapyCallStatus.DECLINED,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      // Either participant may hang up while the other tab is responding to
      // the session update. Ending is therefore intentionally idempotent.
      if (session.status === TherapyCallStatus.ENDED || session.status === TherapyCallStatus.DECLINED) {
        return;
      }
      if (session.status !== TherapyCallStatus.RINGING && session.status !== TherapyCallStatus.ACTIVE) {
        throw new CallActionError("This call cannot be ended", 409);
      }
      transaction.update(sessionRef, {
        status: TherapyCallStatus.ENDED,
        endedBy: decodedToken.uid,
        endedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(callStateRef, {
        sessionId,
        status: TherapyCallStatus.ENDED,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof CallActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const detail = getErrorMessage(error);
    console.error("THERAPY CALL ACTION API ERROR:", detail, error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Could not update the call" : detail },
      { status: 500 }
    );
  }
}
