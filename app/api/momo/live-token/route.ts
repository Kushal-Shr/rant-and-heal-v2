import { GoogleGenAI, Modality } from "@google/genai";
import { NextResponse, type NextRequest } from "next/server";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getRequiredEnv, isGeminiBillingError, MOMO_LIVE_MODEL } from "@/src/server/momo/gemini";
import { MOMO_SYSTEM_INSTRUCTION } from "@/src/server/momo/persona";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { MomoAccessError, consumeQuota, requireOwnedSession } from "@/src/server/momo/access";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ sessionId: z.string().trim().min(1).max(128) }).strict();

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyFirebaseBearerToken(request);

    if (!decodedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "A valid conversation is required" }, { status: 400 });
    const sessionId = parsed.data.sessionId;
    const adminDb = getAdminDb();
    await requireOwnedSession(adminDb, decodedToken.uid, sessionId);
    await consumeQuota({ db: adminDb, userId: decodedToken.uid, key: "momo_live_ten_minutes", limit: 5, windowMs: 10 * 60_000 });
    const gemini = new GoogleGenAI({
      apiKey: getRequiredEnv("GEMINI_API_KEY"),
    });

    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const ephemeralToken = await gemini.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: MOMO_LIVE_MODEL,
          config: {
            sessionResumption: {},
            temperature: 0.7,
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: MOMO_SYSTEM_INSTRUCTION,
          },
        },
        httpOptions: {
          apiVersion: "v1alpha",
        },
      },
    });

    return NextResponse.json({
      token: ephemeralToken.name,
      model: MOMO_LIVE_MODEL,
      sessionId: sessionId ?? null,
    });
  } catch (error) {
    if (error instanceof MomoAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const detail = getErrorMessage(error);
    if (isGeminiBillingError(error)) {
      console.error("MOMO LIVE GEMINI BILLING ERROR:", detail);
      return NextResponse.json({
        error: "Momo voice is temporarily unavailable. Please try again later.",
        code: "AI_BILLING_REQUIRED",
      }, { status: 503 });
    }
    console.error("MOMO LIVE TOKEN ERROR:", detail, error);

    return NextResponse.json(
      {
        error: process.env.NODE_ENV === "production" ? "Failed to create live token" : detail,
      },
      { status: 500 }
    );
  }
}
