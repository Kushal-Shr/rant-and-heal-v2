import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { newWrappedRelationshipKey } from "@/src/server/therapy/crypto";

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
    const keyRef = db.collection("therapy_keys").doc(relationshipId);
    const existingRelationship = await relationshipRef.get();
    const existingKey = await keyRef.get();
    if (existingRelationshipId && existingRelationship.exists && (pointer.status !== "ACTIVE" || existingKey.exists)) {
      return NextResponse.json({ ok: true, migrated: false });
    }
    const [oldMessages, relationshipMessages] = await Promise.all([
      pointerRef.collection("messages").limit(1).get(),
      relationshipRef.collection("messages").limit(1).get(),
    ]);
    if (!oldMessages.empty || !relationshipMessages.empty) {
      return NextResponse.json({ error: "Legacy messages require administrator migration before this chat can open." }, { status: 409 });
    }
    const keyRecord = pointer.status === "ACTIVE" && !existingKey.exists ? await newWrappedRelationshipKey() : null;

    const writer = db.bulkWriter();
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
    await writer.close();

    await db.runTransaction(async (transaction) => {
      const [currentPointer, currentRelationship, currentKey] = await Promise.all([
        transaction.get(pointerRef), transaction.get(relationshipRef), transaction.get(keyRef),
      ]);
      const current = currentPointer.data();
      if (!current || current.therapistId !== pointer.therapistId || current.status !== pointer.status ||
        (current.relationshipId && current.relationshipId !== relationshipId)) {
        throw new Error("Connection changed during migration");
      }
      if (!currentRelationship.exists) {
        transaction.create(relationshipRef, {
          ...current,
          userId: patientId,
          relationshipId,
          patientId,
          consent: {
            version: "legacy-import",
            disclosureHash: current.consentHash ?? "legacy-unavailable",
            scope: ["therapy-messages", "therapy-calls", "connection-status"],
            acceptedAt: current.requestedAt ?? FieldValue.serverTimestamp(),
          },
          migratedAt: FieldValue.serverTimestamp(),
        });
      }
      if (current.status === "ACTIVE" && !currentKey.exists) {
        if (!keyRecord) throw new Error("Connection encryption changed during migration");
        transaction.create(keyRef, { ...keyRecord, cryptoVersion: 1, createdAt: FieldValue.serverTimestamp() });
      }
      transaction.set(pointerRef, { relationshipId, migratedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(relationshipRef.collection("events").doc("legacy-import"), {
        type: "LEGACY_IMPORT", actorId: token.uid, createdAt: FieldValue.serverTimestamp(),
      });
    });

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
