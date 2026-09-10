import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { ConnectionStatus, TherapyCallStatus } from "@/src/types/database";

export const runtime = "nodejs";

interface CreateCallRequestBody {
  patientId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyFirebaseBearerToken(request);

    if (!decodedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as CreateCallRequestBody;
    const patientId = body.patientId?.trim();

    if (!patientId) {
      return NextResponse.json({ error: "A patient ID is required" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const connectionRef = adminDb.collection("connections").doc(patientId);
    const connectionSnapshot = await connectionRef.get();
    const connection = connectionSnapshot.data();

    if (
      !connectionSnapshot.exists ||
      connection?.status !== ConnectionStatus.ACTIVE ||
      (decodedToken.uid !== patientId && decodedToken.uid !== connection.therapistId)
    ) {
      return NextResponse.json({ error: "You cannot start a call for this connection" }, { status: 403 });
    }

    const callerId = decodedToken.uid;
    const recipientId = callerId === patientId ? connection.therapistId : patientId;
    const sessionRef = connectionRef.collection("call_sessions").doc();
    const callStateRef = connectionRef.collection("call_state").doc("current");

    await adminDb.runTransaction(async (transaction) => {
      const currentCallState = await transaction.get(callStateRef);
      const currentCall = currentCallState.data();

      if (
        currentCall?.sessionId &&
        (currentCall.status === TherapyCallStatus.RINGING || currentCall.status === TherapyCallStatus.ACTIVE)
      ) {
        const error = new Error("A call is already in progress");
        error.name = "CallAlreadyOpenError";
        throw error;
      }

      transaction.create(sessionRef, {
        patientId,
        therapistId: connection.therapistId,
        callerId,
        recipientId,
        status: TherapyCallStatus.RINGING,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.set(callStateRef, {
        sessionId: sessionRef.id,
        status: TherapyCallStatus.RINGING,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ sessionId: sessionRef.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "CallAlreadyOpenError") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const detail = getErrorMessage(error);
    console.error("THERAPY CALL CREATE API ERROR:", detail, error);

    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Could not start the call" : detail },
      { status: 500 }
    );
  }
}
