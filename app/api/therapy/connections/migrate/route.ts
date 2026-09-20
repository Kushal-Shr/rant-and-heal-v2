import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";

export const runtime = "nodejs";
const schema = z.object({ patientId: z.string().trim().min(1).max(128) }).strict();

export async function POST(request: NextRequest) {
  try {
    const token = await verifyFirebaseBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "A valid patient ID is required" }, { status: 400 });

    const db = getAdminDb();
    const patientId = parsed.data.patientId;
    const pointerRef = db.collection("connections").doc(patientId);
    const pointerSnapshot = await pointerRef.get();
    const pointer = pointerSnapshot.data();
    if (!pointer) return NextResponse.json({ ok: true, migrated: false });
    if (token.uid !== patientId && token.uid !== pointer.therapistId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const existingRelationshipId =
      typeof pointer.relationshipId === "string" &&
      pointer.relationshipId.length > 0 &&
      !pointer.relationshipId.includes("/")
        ? pointer.relationshipId
        : null;
    const relationshipId = existingRelationshipId ?? `legacy_${patientId}`;
    const relationshipRef = db.collection("therapy_relationships").doc(relationshipId);
    const existingRelationship = await relationshipRef.get();
    if (existingRelationshipId && existingRelationship.exists) {
      return NextResponse.json({ ok: true, migrated: false });
    }
    if (!existingRelationship.exists) {
      await relationshipRef.set({
        ...pointer,
        relationshipId,
        patientId,
        consent: {
          version: "legacy-import",
          disclosureHash: pointer.consentHash ?? "legacy-unavailable",
          scope: ["therapy-messages", "therapy-calls", "connection-status"],
          acceptedAt: pointer.requestedAt ?? FieldValue.serverTimestamp(),
        },
        migratedAt: FieldValue.serverTimestamp(),
      });
    }

    const writer = db.bulkWriter();
    const oldMessages = await pointerRef.collection("messages").get();
    for (const item of oldMessages.docs) {
      writer.set(relationshipRef.collection("messages").doc(item.id), item.data());
    }
    const oldCalls = await pointerRef.collection("call_sessions").get();
    for (const item of oldCalls.docs) {
      const callRef = relationshipRef.collection("call_sessions").doc(item.id);
      const data = item.data();
      writer.set(callRef, {
        ...data,
        relationshipId,
        expiresAt: data.expiresAt ?? Timestamp.fromMillis(Date.now() + 2 * 60 * 1000),
      });
      const signals = await item.ref.collection("signals").get();
      for (const signal of signals.docs) {
        writer.set(callRef.collection("signals").doc(signal.id), signal.data());
      }
    }
    const oldState = await pointerRef.collection("call_state").doc("current").get();
    if (oldState.exists) {
      writer.set(relationshipRef.collection("call_state").doc("current"), {
        ...oldState.data(),
        expiresAt: oldState.data()?.expiresAt ?? Timestamp.now(),
      });
    }
    writer.set(pointerRef, { relationshipId, migratedAt: FieldValue.serverTimestamp() }, { merge: true });
    writer.set(relationshipRef.collection("events").doc("legacy-import"), {
      type: "LEGACY_IMPORT",
      actorId: token.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    await writer.close();

    const patient = await db.collection("users").doc(patientId).get();
    if (patient.exists) {
      const data = patient.data() ?? {};
      await db.collection("patient_profiles").doc(patientId).set({
        patientId,
        displayName: typeof data.displayName === "string" ? data.displayName.slice(0, 80) : "Patient",
        isIncognito: data.isIncognito === true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return NextResponse.json({ ok: true, migrated: true, relationshipId });
  } catch (error) {
    const detail = getErrorMessage(error);
    console.error("LEGACY THERAPY MIGRATION ERROR:", detail);
    return NextResponse.json({ error: "Could not migrate this connection yet." }, { status: 500 });
  }
}
