import { NextResponse, type NextRequest } from "next/server";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getAdminAuth, getAdminDb } from "@/src/server/firebaseAdmin";
import { ConnectionStatus } from "@/src/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

async function documents(query: FirebaseFirestore.Query) {
  const snapshot = await query.get();
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function GET(request: NextRequest) {
  const token = await verifyFirebaseBearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getAdminDb();
  const userRef = db.collection("users").doc(token.uid);
  const [profile, sessions, journalMetrics, health, relationshipSnapshot] = await Promise.all([
    userRef.get(),
    userRef.collection("sessions").get(),
    documents(userRef.collection("journal_metrics")),
    documents(userRef.collection("health_metrics")),
    db.collection("therapy_relationships").where("userId", "==", token.uid).get(),
  ]);
  const conversations = await Promise.all(sessions.docs.map(async (session) => ({
    id: session.id,
    ...session.data(),
    messages: await documents(session.ref.collection("messages").orderBy("timestamp", "asc")),
  })));
  const relationships = await Promise.all(relationshipSnapshot.docs.map(async (relationship) => ({
    id: relationship.id,
    ...relationship.data(),
    messages: await documents(relationship.ref.collection("messages").orderBy("createdAt", "asc")),
    calls: await documents(relationship.ref.collection("call_sessions").orderBy("createdAt", "asc")),
    events: await documents(relationship.ref.collection("events").orderBy("createdAt", "asc")),
  })));
  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    profile: profile.data() ?? null,
    journalContent: "Encrypted journal content is intentionally excluded from server-generated exports. Export it from the unlocked Vault in a future client-side export flow.",
    journalMetrics,
    healthMetrics: health,
    momoConversations: conversations,
    therapyRelationships: relationships,
  }, {
    headers: { "Content-Disposition": `attachment; filename="rant-and-heal-export-${token.uid}.json"` },
  });
}

export async function DELETE(request: NextRequest) {
  const token = await verifyFirebaseBearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!token.auth_time || Math.floor(Date.now() / 1000) - token.auth_time > 5 * 60) {
    return NextResponse.json({ error: "Please sign in again before deleting your account." }, { status: 401 });
  }
  const db = getAdminDb();
  const relationshipSnapshot = await db.collection("therapy_relationships").where("userId", "==", token.uid).get();
  if (relationshipSnapshot.docs.some((item) =>
    [ConnectionStatus.PENDING, ConnectionStatus.ACTIVE].includes(item.data().status)
  )) {
    return NextResponse.json({ error: "End your therapist connection before deleting your account." }, { status: 409 });
  }
  await Promise.all(relationshipSnapshot.docs.map(async (item) => {
    await db.recursiveDelete(item.ref);
    await db.collection("therapy_keys").doc(item.id).delete();
  }));
  await Promise.all([
    db.recursiveDelete(db.collection("users").doc(token.uid)),
    db.collection("patient_profiles").doc(token.uid).delete(),
    db.recursiveDelete(db.collection("connections").doc(token.uid)),
  ]);
  await getAdminAuth().deleteUser(token.uid);
  return NextResponse.json({ ok: true });
}
