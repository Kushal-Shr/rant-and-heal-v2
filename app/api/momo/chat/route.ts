import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { MomoAccessError, consumeQuota, requireOwnedSession } from "@/src/server/momo/access";
import { isGeminiBillingError } from "@/src/server/momo/gemini";
import { crisisReplyFor, recordMomoSafetyEvent } from "@/src/server/momo/safety";
import { classifySafetyRisk } from "@/src/server/safety/classifier";
import { notifySafetySupport } from "@/src/server/safety/notifications";
import { orchestrateMomoTurn } from "@/src/lib/momo/orchestrator";
import type { ConversationTurn } from "@/src/lib/momo/schemas";
import { evaluateDeterministicSafety } from "@/src/lib/safety/detector";
import { planMomoResponseWithInference } from "@/src/server/momo/planner";
import { generateMomoResponse } from "@/src/server/momo/responder";
import { logMomoRoutingDecision, logMomoSafetyBypass } from "@/src/server/momo/routingDebug";

export const runtime = "nodejs";
export const maxDuration = 30;
const HISTORY_LIMIT = 12;
const schema = z.object({
  userId: z.string().trim().min(1).max(128),
  sessionId: z.string().trim().min(1).max(128),
  requestId: z.string().uuid(),
  messageText: z.string().trim().min(1).max(4000),
}).strict();

interface StoredMessage {
  sender?: "USER" | "MOMO";
  text?: string;
  timestamp?: Timestamp | null;
  order?: number;
  provenance?: string;
}

function history(messages: StoredMessage[]): ConversationTurn[] {
  return messages
    .filter((item) =>
      typeof item.text === "string" &&
      item.text.trim().length > 0 &&
      !(item.sender === "MOMO" && item.provenance === "CLIENT_LIVE_TRANSCRIPT")
    )
    .sort((a, b) => {
      const time = (a.timestamp?.toMillis?.() ?? 0) - (b.timestamp?.toMillis?.() ?? 0);
      return time || (a.order ?? 0) - (b.order ?? 0);
    })
    .map((item) => ({
      role: item.sender === "MOMO" ? "MOMO" as const : "USER" as const,
      text: item.text!.trim(),
    }));
}

export async function POST(request: NextRequest) {
  let release: (() => Promise<void>) | null = null;
  try {
    const token = await verifyFirebaseBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid message request" }, { status: 400 });
    const { userId, sessionId, requestId, messageText } = parsed.data;
    if (token.uid !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const db = getAdminDb();
    const sessionRef = await requireOwnedSession(db, userId, sessionId);
    await consumeQuota({ db, userId, key: "momo_chat_minute", limit: 20, windowMs: 60_000 });
    const messagesRef = sessionRef.collection("messages");
    const requestRef = sessionRef.collection("requests").doc(requestId);
    let cachedReply: string | null = null;

    await db.runTransaction(async (transaction) => {
      const [sessionSnap, requestSnap] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(requestRef),
      ]);
      const currentRequest = requestSnap.data();
      if (currentRequest?.status === "COMPLETED" && typeof currentRequest.reply === "string") {
        cachedReply = currentRequest.reply;
        return;
      }
      const session = sessionSnap.data();
      const activeAge = session?.activeRequestAt instanceof Timestamp
        ? Date.now() - session.activeRequestAt.toMillis()
        : Number.POSITIVE_INFINITY;
      if (session?.activeRequestId && session.activeRequestId !== requestId && activeAge < 60_000) {
        throw new MomoAccessError("Another response is still being generated for this conversation.", 409);
      }
      transaction.set(requestRef, {
        status: "PROCESSING",
        messageText,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(sessionRef, {
        activeRequestId: requestId,
        activeRequestAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    if (cachedReply) return NextResponse.json({ message: cachedReply, cached: true });
    release = async () => {
      await db.runTransaction(async (transaction) => {
        const sessionSnap = await transaction.get(sessionRef);
        if (sessionSnap.data()?.activeRequestId === requestId) {
          transaction.set(sessionRef, {
            activeRequestId: FieldValue.delete(),
            activeRequestAt: FieldValue.delete(),
          }, { merge: true });
        }
        transaction.set(requestRef, { status: "FAILED", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
    };

    const snapshot = await messagesRef.orderBy("timestamp", "asc").limitToLast(HISTORY_LIMIT).get();
    const outcome = await orchestrateMomoTurn(
      { messageText, history: history(snapshot.docs.map((item) => item.data() as StoredMessage)) },
      {
        evaluateSafety: evaluateDeterministicSafety,
        plan: planMomoResponseWithInference,
        respond: generateMomoResponse,
        safetyResponse: (evaluation) => crisisReplyFor(evaluation.deterministic),
      }
    );
    const safety = outcome.safety.deterministic;
    const reply = outcome.message;
    if (outcome.decision) {
      logMomoRoutingDecision(outcome.decision);
    } else {
      logMomoSafetyBypass(outcome.safety.state);
    }
    if (outcome.kind === "SAFETY_RESPONSE") {
      await db.runTransaction(async (transaction) => {
        const sessionSnap = await transaction.get(sessionRef);
        if (sessionSnap.data()?.activeRequestId !== requestId) {
          throw new MomoAccessError("This response was superseded by a newer request.", 409);
        }
        transaction.set(requestRef, { status: "COMPLETED", reply, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        transaction.set(sessionRef, {
          activeRequestId: FieldValue.delete(),
          activeRequestAt: FieldValue.delete(),
        }, { merge: true });
      });
      release = null;
      after(async () => {
        try {
          const [eventId, model] = await Promise.all([
            recordMomoSafetyEvent({ db, userId, sessionId, userText: messageText, source: "TEXT", assessment: safety }),
            classifySafetyRisk(messageText),
          ]);
          if (model?.level === "IMMINENT" && model.category === safety.category) {
            const status = await notifySafetySupport({ eventId, category: safety.category, source: "TEXT", state: "IMMINENT_RULE_AND_MODEL_AGREE" });
            await db.collection("users").doc(userId).collection("safety_events").doc(eventId).update({
              supportNotificationStatus: status,
              supportNotificationUpdatedAt: FieldValue.serverTimestamp(),
            });
          }
        } catch (error) {
          console.error("MOMO SAFETY FOLLOW-UP ERROR:", getErrorMessage(error));
        }
      });
      return NextResponse.json({ message: reply, safety: { level: "IMMINENT", state: outcome.safety.state, category: safety.category } });
    }

    await db.runTransaction(async (transaction) => {
      const sessionSnap = await transaction.get(sessionRef);
      if (sessionSnap.data()?.activeRequestId !== requestId) {
        throw new MomoAccessError("This response was superseded by a newer request.", 409);
      }
      transaction.set(messagesRef.doc(`${requestId}-user`), {
        text: messageText, sender: "USER", source: "TEXT", provenance: "SERVER", order: 0, timestamp: FieldValue.serverTimestamp(),
      });
      transaction.set(messagesRef.doc(`${requestId}-momo`), {
        text: reply, sender: "MOMO", source: "TEXT", provenance: "SERVER", order: 1, timestamp: FieldValue.serverTimestamp(),
      });
      transaction.set(requestRef, { status: "COMPLETED", reply, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(sessionRef, {
        title: messageText.slice(0, 64),
        activeRequestId: FieldValue.delete(),
        activeRequestAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    release = null;
    return NextResponse.json({ message: reply });
  } catch (error) {
    if (release) await release().catch(() => undefined);
    if (error instanceof MomoAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    const detail = getErrorMessage(error);
    if (isGeminiBillingError(error)) {
      console.error("MOMO GEMINI BILLING ERROR:", detail);
      return NextResponse.json({
        error: "Momo is temporarily unavailable. Please try again later.",
        code: "AI_BILLING_REQUIRED",
      }, { status: 503 });
    }
    console.error("MOMO CHAT API ERROR:", detail);
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed to process message" : detail }, { status: 500 });
  }
}
