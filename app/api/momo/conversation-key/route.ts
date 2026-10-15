import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { MomoAccessError, consumeQuota, requireOwnedConversation } from "@/src/server/momo/access";
import { conversationDek } from "@/src/server/momo/crypto";

export const runtime = "nodejs";

const schema = z.object({ conversationId: z.string().trim().min(1).max(128) }).strict();

export async function POST(request: NextRequest) {
  try {
    const token = await verifyFirebaseBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid conversation key request" }, { status: 400 });
    const db = getAdminDb();
    await requireOwnedConversation(db, token.uid, parsed.data.conversationId);
    await consumeQuota({ db, userId: token.uid, key: "momo_key_minute", limit: 30, windowMs: 60_000 });
    const dek = await conversationDek(db, token.uid, parsed.data.conversationId);
    try {
      return NextResponse.json({
        key: dek.toString("base64"),
        algorithm: "AES-256-GCM",
        cryptoVersion: 1,
      }, { headers: { "Cache-Control": "no-store" } });
    } finally {
      dek.fill(0);
    }
  } catch (error) {
    if (error instanceof MomoAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    const configurationMissing = error instanceof Error && error.message.includes("_KMS_KEY_NAME is not configured");
    console.error("MOMO CONVERSATION KEY ERROR", {
      status: configurationMissing ? "KMS_NOT_CONFIGURED" : error instanceof Error ? error.name : "UNKNOWN",
    });
    return NextResponse.json({
      error: configurationMissing && process.env.NODE_ENV !== "production"
        ? "Momo encryption is not configured in the local server environment."
        : "Conversation encryption is unavailable",
      code: configurationMissing ? "MOMO_KMS_NOT_CONFIGURED" : "MOMO_KEY_UNAVAILABLE",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
