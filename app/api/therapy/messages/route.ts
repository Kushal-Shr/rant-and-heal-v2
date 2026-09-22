import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { requireRelationship, relationshipDek, TherapyAccessError } from "@/src/server/therapy/access";
import { decryptText, encryptText, type EncryptedPayload } from "@/src/server/therapy/crypto";

export const runtime = "nodejs";
const messageSchema = z.object({ relationshipId: z.string().min(1).max(128), text: z.string().trim().min(1).max(4000) }).strict();

function errorResponse(error: unknown) {
  if (error instanceof TherapyAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: "Therapy messages are unavailable" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const token = await verifyFirebaseBearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const relationshipId = request.nextUrl.searchParams.get("relationshipId") ?? "";
  if (!relationshipId || relationshipId.length > 128) return NextResponse.json({ error: "Invalid relationship" }, { status: 400 });
  try {
    const relationship = await requireRelationship(token, relationshipId);
    const etag = `"${relationship.messageVersion}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
    }
    const snapshot = await relationship.ref.collection("messages").orderBy("createdAt", "desc").limit(100).get();
    const dek = await relationshipDek(relationshipId);
    try {
      const messages = snapshot.docs.reverse().map((doc) => {
        const data = doc.data();
        if (!data.ciphertext || !data.iv || data.cryptoVersion !== 1 || data.text !== undefined) {
          throw new TherapyAccessError("Legacy messages require migration", 503);
        }
        const text = decryptText(dek, data as EncryptedPayload, `${relationshipId}:message:${doc.id}`);
        return { id: doc.id, text, senderId: data.senderUid, senderRole: data.senderRole,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : null };
      });
      return NextResponse.json({ messages }, { headers: { ETag: etag, "Cache-Control": "no-store" } });
    } finally { dek.fill(0); }
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  const token = await verifyFirebaseBearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = messageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  try {
    const { relationshipId, text } = parsed.data;
    const relationship = await requireRelationship(token, relationshipId);
    const messageRef = relationship.ref.collection("messages").doc();
    const dek = await relationshipDek(relationshipId);
    let encrypted: EncryptedPayload;
    try { encrypted = encryptText(dek, text, `${relationshipId}:message:${messageRef.id}`); }
    finally { dek.fill(0); }
    const db = relationship.ref.firestore;
    await db.runTransaction(async (tx) => {
      const [relSnap, pointerSnap] = await Promise.all([
        tx.get(relationship.ref), tx.get(db.collection("connections").doc(relationship.patientUid)),
      ]);
      if (relSnap.data()?.status !== "ACTIVE" || pointerSnap.data()?.relationshipId !== relationshipId || pointerSnap.data()?.status !== "ACTIVE") {
        throw new TherapyAccessError("Relationship unavailable", 403);
      }
      tx.create(messageRef, { relationshipId, senderUid: token.uid,
        recipientUid: token.uid === relationship.patientUid ? relationship.therapistUid : relationship.patientUid,
        senderRole: token.uid === relationship.patientUid ? "USER" : "THERAPIST",
        type: "TEXT", ...encrypted, createdAt: Timestamp.now() });
      tx.update(relationship.ref, { lastMessageAt: Timestamp.now(), lastMessageId: messageRef.id, updatedAt: Timestamp.now() });
    });
    return NextResponse.json({ id: messageRef.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
