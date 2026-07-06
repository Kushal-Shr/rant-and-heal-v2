import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";

export const runtime = "nodejs";

interface TranscriptRequestBody {
  userId?: string;
  sessionId?: string;
  sender?: "USER" | "MOMO";
  text?: string;
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyFirebaseBearerToken(request);

    if (!decodedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as TranscriptRequestBody;
    const userId = body.userId?.trim();
    const sessionId = body.sessionId?.trim();
    const text = body.text?.trim();
    const sender = body.sender;

    if (!userId || !sessionId || !text || (sender !== "USER" && sender !== "MOMO")) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (decodedToken.uid !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sessionRef = getAdminDb().collection("users").doc(userId).collection("sessions").doc(sessionId);
    const messageRef = await sessionRef.collection("messages").add({
      text,
      sender,
      source: "VOICE",
      timestamp: FieldValue.serverTimestamp(),
    });

    await sessionRef.set(
      {
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, messageId: messageRef.id }, { status: 200 });
  } catch (error) {
    const detail = getErrorMessage(error);
    console.error("MOMO TRANSCRIPT API ERROR:", detail, error);

    return NextResponse.json(
      {
        error: process.env.NODE_ENV === "production" ? "Failed to save transcript" : detail,
      },
      { status: 500 }
    );
  }
}
