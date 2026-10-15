import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { MomoAccessError, consumeQuota, requireOwnedConversation } from "@/src/server/momo/access";
import { isGeminiBillingError } from "@/src/server/momo/gemini";
import { recordMomoSafetyEvent } from "@/src/server/momo/safety";
import { assessMomoTurnSafety } from "@/src/server/momo/turnSafety";
import { notifySafetySupport, safetySupportNotificationsEnabled } from "@/src/server/safety/notifications";
import { orchestrateMomoTurn } from "@/src/lib/momo/orchestrator";
import {
  conversationContinuityStateSchema,
  conversationTurnSchema,
} from "@/src/lib/momo/schemas";
import {
  finalizeContinuityState,
  parseConversationContinuityState,
  prepareContinuityState,
} from "@/src/lib/momo/continuity";
import { conversationParticipantFromProfile } from "@/src/lib/momo/identity";
import { safetyResponseFor } from "@/src/lib/safety/responses";
import { safetyEvaluationSchema } from "@/src/lib/safety/schemas";
import { shouldAttemptSafetySupportNotification } from "@/src/lib/safety/policy";
import { planMomoResponseWithInference } from "@/src/server/momo/planner";
import { generateMomoResponse } from "@/src/server/momo/responder";
import { logMomoRoutingDecision, logMomoSafetyBypass } from "@/src/server/momo/routingDebug";
import { persistPermittedMomoAnalytics } from "@/src/server/momo/analytics";

export const runtime = "nodejs";
export const maxDuration = 30;
const HISTORY_LIMIT = 12;
const schema = z.object({
  userId: z.string().trim().min(1).max(128),
  conversationId: z.string().trim().min(1).max(128),
  requestId: z.string().uuid(),
  messageText: z.string().trim().min(1).max(4000),
  history: z.array(conversationTurnSchema).max(HISTORY_LIMIT),
  continuityState: conversationContinuityStateSchema.optional(),
}).strict();

export async function POST(request: NextRequest) {
  let release: (() => Promise<void>) | null = null;
  try {
    const token = await verifyFirebaseBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid message request" }, { status: 400 });
    const { userId, conversationId, requestId, messageText } = parsed.data;
    const sessionId = conversationId;
    if (token.uid !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const db = getAdminDb();
    const sessionRef = await requireOwnedConversation(db, userId, conversationId);
    await consumeQuota({ db, userId, key: "momo_chat_minute", limit: 20, windowMs: 60_000 });
    const requestRef = sessionRef.collection("requests").doc(requestId);
    const userRef = db.collection("users").doc(userId);
    let storedSafetyEvaluation: unknown;
    let storedDisplayName: unknown;
    let storedIncognito: unknown;

    await db.runTransaction(async (transaction) => {
      const [sessionSnap, requestSnap, userSnap] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(requestRef),
        transaction.get(userRef),
      ]);
      const currentRequest = requestSnap.data();
      const session = sessionSnap.data();
      const userProfile = userSnap.data();
      storedSafetyEvaluation = session?.safetyEvaluation;
      storedDisplayName = userProfile?.displayName;
      storedIncognito = userProfile?.isIncognito;
      const activeAge = session?.activeRequestAt instanceof Timestamp
        ? Date.now() - session.activeRequestAt.toMillis()
        : Number.POSITIVE_INFINITY;
      if (currentRequest?.status === "PROCESSING" && activeAge < 60_000) {
        throw new MomoAccessError("This message is already being processed.", 409);
      }
      if (session?.activeRequestId && session.activeRequestId !== requestId && activeAge < 60_000) {
        throw new MomoAccessError("Another response is still being generated for this conversation.", 409);
      }
      transaction.set(requestRef, {
        status: "PROCESSING",
        requestKind: "MOMO_TEXT",
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(sessionRef, {
        activeRequestId: requestId,
        activeRequestAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

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

    const recentHistory = parsed.data.history.slice(-HISTORY_LIMIT);
    const previousContinuity = parsed.data.continuityState;
    const continuityState = prepareContinuityState(
      { messageText },
      parseConversationContinuityState(previousContinuity)
    );
    const participant = conversationParticipantFromProfile({
      displayName: storedDisplayName,
      isIncognito: storedIncognito,
      authAnonymous: token.firebase?.sign_in_provider === "anonymous",
    });
    const outcome = await orchestrateMomoTurn(
      {
        messageText, history: recentHistory, continuityState, participant,
        previousSafetyEvaluation: safetyEvaluationSchema.safeParse(storedSafetyEvaluation).data,
      },
      {
        evaluateSafety: (_messageText, input) => assessMomoTurnSafety(input!),
        plan: planMomoResponseWithInference,
        respond: generateMomoResponse,
        safetyResponse: (evaluation, input) => safetyResponseFor(evaluation, { messageText: input?.messageText }),
      }
    );
    const reply = outcome.message;
    if (outcome.decision) {
      logMomoRoutingDecision(outcome.decision);
    } else {
      logMomoSafetyBypass(outcome.safety.state);
    }
    if (outcome.kind === "SAFETY_RESPONSE") {
      const level = outcome.safety.state === "IMMINENT" || outcome.safety.state === "MEDICAL_EMERGENCY"
        ? "IMMINENT"
        : "CONCERNING";
      const safetyPayload = {
        level,
        state: outcome.safety.state,
        resolution: outcome.safety.resolution,
        assessmentStep: outcome.safety.assessmentStep,
        requiresHumanReview: outcome.safety.requiresHumanReview,
        reviewUrgency: outcome.safety.reviewUrgency,
        safetyTarget: outcome.safety.safetyTarget,
        ...(outcome.safety.deterministic.category ? { category: outcome.safety.deterministic.category } : {}),
      };
      await db.runTransaction(async (transaction) => {
        const sessionSnap = await transaction.get(sessionRef);
        if (sessionSnap.data()?.activeRequestId !== requestId) {
          throw new MomoAccessError("This response was superseded by a newer request.", 409);
        }
        transaction.set(requestRef, { status: "COMPLETED", responseKind: "SAFETY_RESPONSE", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        transaction.set(sessionRef, {
          safetyEvaluation: outcome.safety,
          activeRequestId: FieldValue.delete(),
          activeRequestAt: FieldValue.delete(),
        }, { merge: true });
      });
      release = null;
      after(async () => {
        try {
          const eventId = await recordMomoSafetyEvent({
            db, userId, sessionId, userText: messageText, source: "TEXT",
            evaluation: outcome.safety,
          });
          if (shouldAttemptSafetySupportNotification(outcome.safety) && safetySupportNotificationsEnabled()) {
            const eventRef = db.collection("users").doc(userId).collection("safety_events").doc(eventId);
            await eventRef.update({ supportNotificationStatus: "REQUESTED", supportNotificationUpdatedAt: FieldValue.serverTimestamp() });
            await eventRef.update({ supportNotificationStatus: "STARTED", supportNotificationUpdatedAt: FieldValue.serverTimestamp() });
            const status = await notifySafetySupport({
              eventId,
              category: outcome.safety.deterministic.category,
              safetyTarget: outcome.safety.safetyTarget,
              source: "TEXT",
              state: outcome.safety.state,
            });
            await eventRef.update({ supportNotificationStatus: status, supportNotificationUpdatedAt: FieldValue.serverTimestamp() });
          }
        } catch (error) {
          console.error("MOMO SAFETY FOLLOW-UP ERROR:", getErrorMessage(error));
        }
      });
      return NextResponse.json({ message: reply, continuityState, safety: safetyPayload }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const finalizedContinuity = finalizeContinuityState(
      continuityState,
      outcome.decision!,
      reply
    );
    await db.runTransaction(async (transaction) => {
      const sessionSnap = await transaction.get(sessionRef);
      if (sessionSnap.data()?.activeRequestId !== requestId) {
        throw new MomoAccessError("This response was superseded by a newer request.", 409);
      }
      transaction.set(requestRef, { status: "COMPLETED", responseKind: "MOMO_RESPONSE", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(sessionRef, {
        safetyEvaluation: outcome.safety,
        activeRequestId: FieldValue.delete(),
        activeRequestAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    release = null;
    after(async () => {
      await persistPermittedMomoAnalytics({
        db,
        userId,
        conversationId,
        eventId: requestId,
        messageText,
        previousContinuity,
        nextContinuity: finalizedContinuity.state,
      }).catch((error) => console.error("MOMO OPTIONAL ANALYTICS ERROR:", getErrorMessage(error)));
    });
    return NextResponse.json({ message: reply, continuityState: finalizedContinuity.state }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (release) await release().catch(() => undefined);
    if (error instanceof MomoAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    const detail = getErrorMessage(error);
    if (isGeminiBillingError(error)) {
      console.error("MOMO AI BILLING ERROR", { status: "AI_BILLING_REQUIRED" });
      return NextResponse.json({
        error: "Momo is temporarily unavailable. Please try again later.",
        code: "AI_BILLING_REQUIRED",
      }, { status: 503 });
    }
    console.error("MOMO CHAT API ERROR", {
      status: process.env.NODE_ENV === "production" ? "PROCESSING_FAILED" : detail,
    });
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed to process message" : detail }, { status: 500 });
  }
}
