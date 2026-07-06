import { GoogleGenAI, Modality } from "@google/genai";
import { NextResponse, type NextRequest } from "next/server";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getRequiredEnv, MOMO_LIVE_MODEL } from "@/src/server/momo/gemini";
import { MOMO_SYSTEM_INSTRUCTION } from "@/src/server/momo/persona";

export const runtime = "nodejs";

interface LiveTokenRequestBody {
  sessionId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyFirebaseBearerToken(request);

    if (!decodedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as LiveTokenRequestBody;
    const sessionId = body.sessionId?.trim();
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
    const detail = getErrorMessage(error);
    console.error("MOMO LIVE TOKEN ERROR:", detail, error);

    return NextResponse.json(
      {
        error: process.env.NODE_ENV === "production" ? "Failed to create live token" : detail,
      },
      { status: 500 }
    );
  }
}
