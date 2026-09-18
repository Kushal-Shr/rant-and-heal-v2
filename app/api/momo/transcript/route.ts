import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { assessMomoSafety, recordMomoSafetyEvent } from "@/src/server/momo/safety";
import { classifySafetyRisk } from "@/src/server/safety/classifier";
import { notifySafetySupport } from "@/src/server/safety/notifications";

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

    const adminDb = getAdminDb();
    const safetyAssessment = sender === "USER" ? assessMomoSafety(text) : { level: "SAFE" as const, matchedSignals: [] };

    if (safetyAssessment.level === "IMMINENT") {
      const [eventId, modelAssessment] = await Promise.all([
        recordMomoSafetyEvent({
          db: adminDb,
          userId,
          sessionId,
          userText: text,
          source: "VOICE",
          assessment: safetyAssessment,
        }),
        classifySafetyRisk(text),
      ]);
      const hasClassifierAgreement = modelAssessment?.level === "IMMINENT" &&
        modelAssessment.category === safetyAssessment.category;

      if (hasClassifierAgreement) {
        const notificationStatus = await notifySafetySupport({
          eventId,
          category: safetyAssessment.category,
          source: "VOICE",
          state: "IMMINENT_RULE_AND_MODEL_AGREE",
        });
        await adminDb.collection("users").doc(userId).collection("safety_events").doc(eventId).update({
          supportNotificationStatus: notificationStatus,
          supportNotificationUpdatedAt: FieldValue.serverTimestamp(),
        });
      }

      return NextResponse.json(
        {
          ok: true,
          safety: {
            level: safetyAssessment.level,
            category: safetyAssessment.category,
          },
        },
        { status: 200 }
      );
    }

    const sessionRef = adminDb.collection("users").doc(userId).collection("sessions").doc(sessionId);
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
