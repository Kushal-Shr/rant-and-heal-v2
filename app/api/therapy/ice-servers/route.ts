import { NextResponse, type NextRequest } from "next/server";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { ConnectionStatus, TherapyCallStatus } from "@/src/types/database";
import { getTherapyIceServers } from "@/src/server/therapy/iceServers";

export const runtime = "nodejs";

interface IceServerRequestBody {
  patientId?: string;
  sessionId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyFirebaseBearerToken(request);
    if (!decodedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as IceServerRequestBody;
    const patientId = body.patientId?.trim();
    const sessionId = body.sessionId?.trim();
    if (!patientId || !sessionId) {
      return NextResponse.json({ error: "A patient ID and session ID are required" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const connectionRef = adminDb.collection("connections").doc(patientId);
    const [connectionSnapshot, sessionSnapshot] = await Promise.all([
      connectionRef.get(),
      connectionRef.collection("call_sessions").doc(sessionId).get(),
    ]);
    const connection = connectionSnapshot.data();
    const session = sessionSnapshot.data();

    if (
      !connection ||
      connection.status !== ConnectionStatus.ACTIVE ||
      !session ||
      (session.status !== TherapyCallStatus.RINGING && session.status !== TherapyCallStatus.ACTIVE) ||
      (decodedToken.uid !== session.patientId && decodedToken.uid !== session.therapistId)
    ) {
      return NextResponse.json({ error: "You cannot access relay settings for this call" }, { status: 403 });
    }

    return NextResponse.json({ iceServers: getTherapyIceServers() }, { status: 200 });
  } catch (error) {
    const detail = getErrorMessage(error);
    console.error("THERAPY ICE SERVER API ERROR:", detail, error);
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Could not prepare the call" : detail },
      { status: 500 }
    );
  }
}
