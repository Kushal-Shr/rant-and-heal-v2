import { FieldValue } from "firebase-admin/firestore";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { MomoAccessError, consumeQuota, requireOwnedSession } from "@/src/server/momo/access";
import { assessMomoSafety, recordMomoSafetyEvent } from "@/src/server/momo/safety";
import { combineSafetyAssessments } from "@/src/lib/safety/detector";
import { safetyResponseFor } from "@/src/lib/safety/responses";
import { shouldAttemptSafetySupportNotification } from "@/src/lib/safety/policy";
import { notifySafetySupport, safetySupportNotificationsEnabled } from "@/src/server/safety/notifications";

export const runtime = "nodejs";
const schema = z.object({
  userId: z.string().trim().min(1).max(128),
  sessionId: z.string().trim().min(1).max(128),
  requestId: z.string().uuid(),
  sender: z.enum(["USER", "MOMO"]),
  text: z.string().trim().min(1).max(8000),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const token = await verifyFirebaseBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid transcript request" }, { status: 400 });
    const { userId, sessionId, requestId, sender, text } = parsed.data;
    if (token.uid !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const db = getAdminDb();
    const sessionRef = await requireOwnedSession(db, userId, sessionId);
    await consumeQuota({ db, userId, key: "momo_transcript_minute", limit: 60, windowMs: 60_000 });
    const safety = sender === "USER" ? assessMomoSafety(text) : assessMomoSafety("");

    if (safety.level === "IMMINENT") {
      const evaluation = combineSafetyAssessments(safety);
      const responseText = safetyResponseFor(evaluation, { messageText: text, language: safety.language });
      after(async () => {
        try {
          const eventId = await recordMomoSafetyEvent({
            db, userId, sessionId, userText: text, source: "VOICE", evaluation, responseText,
          });
          if (shouldAttemptSafetySupportNotification(evaluation) && safetySupportNotificationsEnabled()) {
            const eventRef = db.collection("users").doc(userId).collection("safety_events").doc(eventId);
            await eventRef.update({ supportNotificationStatus: "REQUESTED", supportNotificationUpdatedAt: FieldValue.serverTimestamp() });
            await eventRef.update({ supportNotificationStatus: "STARTED", supportNotificationUpdatedAt: FieldValue.serverTimestamp() });
            const status = await notifySafetySupport({ eventId, category: safety.category, source: "VOICE", state: evaluation.state });
            await eventRef.update({ supportNotificationStatus: status, supportNotificationUpdatedAt: FieldValue.serverTimestamp() });
          }
        } catch (error) {
          console.error("MOMO VOICE SAFETY FOLLOW-UP ERROR:", getErrorMessage(error));
        }
      });
      return NextResponse.json({ ok: true, safety: { level: "IMMINENT", category: safety.category } });
    }

    const batch = db.batch();
    const messageRef = sessionRef.collection("messages").doc(requestId);
    batch.set(messageRef, {
      text,
      sender,
      source: "VOICE",
      provenance: "CLIENT_LIVE_TRANSCRIPT",
      timestamp: FieldValue.serverTimestamp(),
    });
    batch.set(sessionRef, { updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
    return NextResponse.json({ ok: true, messageId: messageRef.id });
  } catch (error) {
    if (error instanceof MomoAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    const detail = getErrorMessage(error);
    console.error("MOMO TRANSCRIPT API ERROR:", detail);
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed to save transcript" : detail }, { status: 500 });
  }
}
