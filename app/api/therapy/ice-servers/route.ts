import { NextResponse, type NextRequest } from "next/server";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { ConnectionStatus, TherapyCallStatus } from "@/src/types/database";
import { getTherapyIceServers } from "@/src/server/therapy/iceServers";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";

const schema = z.object({
  relationshipId: z.string().trim().min(1).max(128),
  sessionId: z.string().trim().min(1).max(128),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyFirebaseBearerToken(request);
    if (!decodedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "A relationship ID and session ID are required" }, { status: 400 });
    const { relationshipId, sessionId } = parsed.data;

    const adminDb = getAdminDb();
    const relationshipRef = adminDb.collection("therapy_relationships").doc(relationshipId);
    const [relationshipSnapshot, sessionSnapshot] = await Promise.all([
      relationshipRef.get(),
      relationshipRef.collection("call_sessions").doc(sessionId).get(),
    ]);
    const relationship = relationshipSnapshot.data();
    const session = sessionSnapshot.data();

    if (
      !relationship ||
      relationship.status !== ConnectionStatus.ACTIVE ||
      !session ||
      session.relationshipId !== relationshipId ||
      !(session.expiresAt instanceof Timestamp) ||
      session.expiresAt.toMillis() <= Date.now() ||
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
