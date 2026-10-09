import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { MomoAccessError, requireOwnedSession } from "@/src/server/momo/access";

export const runtime = "nodejs";

const schema = z.object({ sessionId: z.string().trim().min(1).max(128) }).strict();

export async function GET(request: NextRequest) {
  try {
    const token = await verifyFirebaseBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse({ sessionId: request.nextUrl.searchParams.get("sessionId") });
    if (!parsed.success) return NextResponse.json({ error: "A valid conversation is required." }, { status: 400 });
    const sessionRef = await requireOwnedSession(getAdminDb(), token.uid, parsed.data.sessionId);
    const voice = (await sessionRef.get()).data()?.liveVoice;
    if (!voice || typeof voice !== "object") {
      return NextResponse.json({ error: "Voice safety monitoring is unavailable." }, { status: 503 });
    }
    const heartbeatMillis = voice.monitorHeartbeatAt?.toMillis?.();
    return NextResponse.json({
      monitorStatus: voice.monitorStatus,
      safetyBlocked: voice.safetyBlocked === true,
      safetyState: typeof voice.safetyState === "string" ? voice.safetyState : "NORMAL",
      safetyTarget: typeof voice.safetyTarget === "string" ? voice.safetyTarget : "NONE",
      interruptVersion: typeof voice.interruptVersion === "number" ? voice.interruptVersion : 0,
      heartbeatAgeMs: typeof heartbeatMillis === "number" ? Math.max(0, Date.now() - heartbeatMillis) : null,
    });
  } catch (error) {
    if (error instanceof MomoAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("MOMO LIVE STATUS ERROR:", getErrorMessage(error));
    return NextResponse.json({ error: "Voice safety monitoring is unavailable." }, { status: 503 });
  }
}
