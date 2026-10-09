import { Timestamp } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { FEATURE_FLAGS } from "@/src/config/features";
import { conversationParticipantFromProfile } from "@/src/lib/momo/identity";
import type { ConversationTurn } from "@/src/lib/momo/schemas";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { MomoAccessError, consumeQuota, requireOwnedSession } from "@/src/server/momo/access";
import { getRequiredEnv } from "@/src/server/momo/gemini";
import {
  createMomoLiveSession,
  momoLiveOfferSchema,
  parseLiveBootstrapState,
  stableSafetyIdentifier,
} from "@/src/server/momo/liveSession";
import { attachMomoLiveSideband } from "@/src/server/momo/liveSideband";

export const runtime = "nodejs";
export const maxDuration = 30;

const HISTORY_LIMIT = 12;
const schema = z.object({
  sessionId: z.string().trim().min(1).max(128),
  sdp: momoLiveOfferSchema,
}).strict();

interface StoredMessage {
  sender?: "USER" | "MOMO";
  text?: string;
  provenance?: string;
  timestamp?: Timestamp | null;
  order?: number;
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
    .slice(-HISTORY_LIMIT)
    .map((item) => ({
      role: item.sender === "MOMO" ? "MOMO" as const : "USER" as const,
      text: item.text!.trim(),
    }));
}

export async function POST(request: NextRequest) {
  try {
    if (!FEATURE_FLAGS.MOMO_VOICE) {
      return NextResponse.json(
        { error: "Momo voice is not enabled for this trial.", code: "FEATURE_DISABLED" },
        { status: 503 }
      );
    }
    const token = await verifyFirebaseBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid conversation and SDP offer are required." }, { status: 400 });
    }

    const db = getAdminDb();
    const sessionRef = await requireOwnedSession(db, token.uid, parsed.data.sessionId);
    await consumeQuota({
      db,
      userId: token.uid,
      key: "momo_live_ten_minutes",
      limit: 5,
      windowMs: 10 * 60_000,
    });
    const [sessionSnapshot, userSnapshot, messagesSnapshot] = await Promise.all([
      sessionRef.get(),
      db.collection("users").doc(token.uid).get(),
      sessionRef.collection("messages").orderBy("timestamp", "asc").limitToLast(HISTORY_LIMIT).get(),
    ]);
    const session = sessionSnapshot.data();
    const profile = userSnapshot.data();
    const priorVoice = session?.liveVoice;
    const priorHeartbeat = priorVoice?.monitorHeartbeatAt?.toMillis?.();
    if (priorVoice?.monitorStatus === "ACTIVE" &&
        typeof priorHeartbeat === "number" && Date.now() - priorHeartbeat < 15_000) {
      throw new MomoAccessError("A monitored Momo voice call is already active.", 409);
    }
    const bootstrap = parseLiveBootstrapState({
      userId: token.uid,
      sessionId: parsed.data.sessionId,
      history: history(messagesSnapshot.docs.map((doc) => doc.data() as StoredMessage)),
      continuityState: session?.continuityState,
      safetyEvaluation: session?.safetyEvaluation,
      participant: conversationParticipantFromProfile({
        displayName: profile?.displayName,
        isIncognito: profile?.isIncognito,
        authAnonymous: token.firebase?.sign_in_provider === "anonymous",
      }),
    });
    const apiKey = getRequiredEnv("OPENAI_API_KEY");
    const safetyIdentifier = stableSafetyIdentifier(
      token.uid,
      getRequiredEnv("MOMO_SAFETY_IDENTIFIER_SECRET")
    );
    const live = await createMomoLiveSession({
      apiKey,
      safetyIdentifier,
      offerSdp: parsed.data.sdp,
      bootstrap,
    });

    // Voice fails closed: do not return the SDP answer until the trusted
    // backend is attached and able to observe/steer this exact session.
    await attachMomoLiveSideband({
      providerSessionId: live.session.id,
      apiKey,
      safetyIdentifier,
      bootstrap,
    });

    return NextResponse.json({
      session: { id: live.session.id },
      transport: live.transport,
      model: "gpt-live-1",
    }, { status: 201 });
  } catch (error) {
    if (error instanceof MomoAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const detail = getErrorMessage(error);
    console.error("MOMO LIVE SESSION ERROR:", detail);
    return NextResponse.json({
      error: process.env.NODE_ENV === "production"
        ? "Momo voice could not start with safety monitoring."
        : detail,
    }, { status: 503 });
  }
}
