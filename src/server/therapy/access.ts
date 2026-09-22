import type { DecodedIdToken } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { canAccessRelationship } from "@/src/lib/therapy/accessPolicy";
import { THERAPY_CONSENT_VERSION } from "@/src/lib/therapy/consent";

export class TherapyAccessError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function requireRelationship(token: DecodedIdToken, relationshipId: string, role: "patient" | "therapist" | "either" = "either") {
  const db = getAdminDb();
  const ref = db.collection("therapy_relationships").doc(relationshipId);
  const snap = await ref.get();
  const data = snap.data();
  if (!data) throw new TherapyAccessError("Relationship unavailable", 403);
  const pointer = (await db.collection("connections").doc(data.userId).get()).data();
  if (!canAccessRelationship({ actorUid: token.uid, patientUid: data.userId, therapistUid: data.therapistId,
    relationshipId, status: data.status, pointerRelationshipId: pointer?.relationshipId,
    pointerStatus: pointer?.status, role })) throw new TherapyAccessError("Forbidden", 403);
  const lastMessageAt = data.lastMessageAt;
  const messageVersion = typeof data.lastMessageId === "string" ? data.lastMessageId :
    lastMessageAt instanceof Timestamp ? `${lastMessageAt.seconds}.${lastMessageAt.nanoseconds}` : "empty";
  return { ref, patientUid: data.userId as string, therapistUid: data.therapistId as string, messageVersion };
}

export async function relationshipDek(relationshipId: string): Promise<Buffer> {
  const key = (await getAdminDb().collection("therapy_keys").doc(relationshipId).get()).data();
  if (!key?.wrappedDek || !key?.kmsKeyName) throw new TherapyAccessError("Relationship encryption is not initialized", 503);
  const { unwrapRelationshipKey } = await import("./crypto");
  return unwrapRelationshipKey({ wrappedDek: key.wrappedDek, kmsKeyName: key.kmsKeyName });
}

export async function requireAiConsent(relationshipId: string) {
  const data = (await getAdminDb().collection("therapy_relationships").doc(relationshipId).get()).data();
  if (data?.consent?.version !== THERAPY_CONSENT_VERSION) throw new TherapyAccessError("Patient consent for AI notes is required", 403);
}
