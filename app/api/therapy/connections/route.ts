import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  THERAPY_CONSENT_DISCLOSURE,
  THERAPY_CONSENT_SCOPE,
  THERAPY_CONSENT_VERSION,
} from "@/src/lib/therapy/consent";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { ConnectionStatus, TherapyCallStatus, UserRole } from "@/src/types/database";
import { canTransitionRelationship } from "@/src/server/therapy/connectionTransitions";
import { newWrappedRelationshipKey, unwrapRelationshipKey } from "@/src/server/therapy/crypto";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("REQUEST"),
    therapistId: z.string().trim().min(1).max(128),
    consentAccepted: z.literal(true),
    consentVersion: z.literal(THERAPY_CONSENT_VERSION),
  }).strict(),
  z.object({ action: z.literal("ACCEPT"), relationshipId: z.string().trim().min(1).max(128) }).strict(),
  z.object({ action: z.literal("REJECT"), relationshipId: z.string().trim().min(1).max(128) }).strict(),
  z.object({ action: z.literal("REVOKE"), relationshipId: z.string().trim().min(1).max(128) }).strict(),
  z.object({ action: z.literal("CONSENT_AI"), relationshipId: z.string().trim().min(1).max(128), consentAccepted: z.literal(true), consentVersion: z.literal(THERAPY_CONSENT_VERSION) }).strict(),
]);

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await verifyFirebaseBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid connection request" }, { status: 400 });

    const db = getAdminDb();
    const body = parsed.data;
    if (body.action === "REQUEST") {
      const relationshipRef = db.collection("therapy_relationships").doc();
      const pointerRef = db.collection("connections").doc(token.uid);
      const userRef = db.collection("users").doc(token.uid);
      const therapistRef = db.collection("therapists").doc(body.therapistId);
      const sharedProfileRef = db.collection("patient_profiles").doc(token.uid);
      const eventRef = relationshipRef.collection("events").doc();
      const disclosureHash = createHash("sha256").update(THERAPY_CONSENT_DISCLOSURE).digest("hex");

      await db.runTransaction(async (transaction) => {
        const [pointerSnap, userSnap, therapistSnap] = await Promise.all([
          transaction.get(pointerRef),
          transaction.get(userRef),
          transaction.get(therapistRef),
        ]);
        const pointer = pointerSnap.data();
        const patient = userSnap.data();
        const therapist = therapistSnap.data();
        if (!patient || patient.role !== UserRole.USER) throw new HttpError("Only patient accounts can request a therapist", 403);
        if (!therapist?.isVerified || therapist.verificationStatus !== "VERIFIED") {
          throw new HttpError("This therapist is not currently verified", 409);
        }
        if (pointer?.status === ConnectionStatus.PENDING || pointer?.status === ConnectionStatus.ACTIVE) {
          throw new HttpError("You already have a therapist connection in progress", 409);
        }

        const record = {
          relationshipId: relationshipRef.id,
          userId: token.uid,
          patientId: token.uid,
          therapistId: body.therapistId,
          status: ConnectionStatus.PENDING,
          consentHash: disclosureHash,
          consent: {
            version: THERAPY_CONSENT_VERSION,
            disclosureHash,
            scope: [...THERAPY_CONSENT_SCOPE],
            acceptedAt: FieldValue.serverTimestamp(),
          },
          requestedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        transaction.create(relationshipRef, record);
        transaction.set(pointerRef, record);
        transaction.set(sharedProfileRef, {
          patientId: token.uid,
          displayName: typeof patient.displayName === "string" ? patient.displayName.slice(0, 80) : "Patient",
          isIncognito: patient.isIncognito === true,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.create(eventRef, {
          type: "CONSENT_ACCEPTED",
          actorId: token.uid,
          version: THERAPY_CONSENT_VERSION,
          disclosureHash,
          scope: [...THERAPY_CONSENT_SCOPE],
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      return NextResponse.json({ relationshipId: relationshipRef.id }, { status: 201 });
    }

    const relationshipRef = db.collection("therapy_relationships").doc(body.relationshipId);
    await db.runTransaction(async (transaction) => {
      const relationshipSnap = await transaction.get(relationshipRef);
      const relationship = relationshipSnap.data();
      if (!relationship) throw new HttpError("Connection was not found", 404);
      const pointerRef = db.collection("connections").doc(relationship.userId);
      const pointerSnap = await transaction.get(pointerRef);
      const pointer = pointerSnap.data();
      if (pointer?.relationshipId !== relationshipRef.id) throw new HttpError("This connection is no longer current", 409);

      if (body.action === "CONSENT_AI") {
        if (token.uid !== relationship.userId || relationship.status !== ConnectionStatus.ACTIVE || pointer.status !== ConnectionStatus.ACTIVE) throw new HttpError("Consent can only be updated by the connected patient", 403);
        const disclosureHash = createHash("sha256").update(THERAPY_CONSENT_DISCLOSURE).digest("hex");
        const update = { consentHash: disclosureHash, consent: { version: THERAPY_CONSENT_VERSION,
          disclosureHash, scope: [...THERAPY_CONSENT_SCOPE], acceptedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() };
        transaction.update(relationshipRef, update);
        transaction.update(pointerRef, update);
        transaction.create(relationshipRef.collection("events").doc(), { type: "CONSENT_AI", actorId: token.uid,
          version: THERAPY_CONSENT_VERSION, disclosureHash, scope: [...THERAPY_CONSENT_SCOPE], createdAt: FieldValue.serverTimestamp() });
        return;
      }

      let therapistVerified = true;
      if (body.action === "ACCEPT" || body.action === "REJECT") {
        const therapistSnap = await transaction.get(db.collection("therapists").doc(token.uid));
        therapistVerified = therapistSnap.data()?.isVerified === true;
      }

      const callStateRef = relationshipRef.collection("call_state").doc("current");
      const callStateSnap = body.action === "REVOKE" ? await transaction.get(callStateRef) : null;
      const callState = callStateSnap?.data();
      const sessionRef =
        callState?.sessionId && [TherapyCallStatus.RINGING, TherapyCallStatus.ACTIVE].includes(callState.status)
          ? relationshipRef.collection("call_sessions").doc(callState.sessionId)
          : null;
      const sessionSnap = sessionRef ? await transaction.get(sessionRef) : null;
      const allowed = canTransitionRelationship({
        action: body.action,
        relationshipStatus: relationship.status,
        pointerStatus: pointer.status,
        isCurrentRelationship: pointer.relationshipId === relationshipRef.id,
        actorIsPatient: token.uid === relationship.userId,
        actorIsTherapist: token.uid === relationship.therapistId,
        therapistIsVerified: therapistVerified,
      });
      if (!allowed) throw new HttpError("This relationship transition is not allowed", 409);

      if (body.action === "ACCEPT") {
        const keyRef = db.collection("therapy_keys").doc(relationshipRef.id);
        const keySnap = await transaction.get(keyRef);
        try {
          if (keySnap.exists) {
            const key = keySnap.data();
            const dek = await unwrapRelationshipKey({ wrappedDek: key!.wrappedDek, kmsKeyName: key!.kmsKeyName });
            dek.fill(0);
          } else {
            const keyRecord = await newWrappedRelationshipKey();
            transaction.create(keyRef, { ...keyRecord, cryptoVersion: 1, createdAt: FieldValue.serverTimestamp() });
          }
        } catch {
          throw new HttpError("Therapy encryption is unavailable. Ask the administrator to configure Cloud KMS before accepting.", 503);
        }
      }

      if (body.action === "ACCEPT" || body.action === "REJECT") {
        const status = body.action === "ACCEPT" ? ConnectionStatus.ACTIVE : ConnectionStatus.REJECTED;
        const update = {
          status,
          respondedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          ...(status === ConnectionStatus.ACTIVE ? { connectedAt: FieldValue.serverTimestamp() } : {}),
        };
        transaction.update(relationshipRef, update);
        transaction.update(pointerRef, update);
      } else {
        const update = {
          status: ConnectionStatus.REVOKED,
          revokedBy: token.uid,
          revokedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        transaction.update(relationshipRef, update);
        transaction.update(pointerRef, update);
        if (sessionRef && sessionSnap?.exists) {
          transaction.update(sessionRef, {
            status: TherapyCallStatus.ENDED,
            endedBy: token.uid,
            endedAt: FieldValue.serverTimestamp(),
            endReason: "RELATIONSHIP_REVOKED",
          });
          transaction.set(callStateRef, {
            sessionId: sessionRef.id,
            status: TherapyCallStatus.ENDED,
            expiresAt: Timestamp.fromMillis(Date.now()),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
      transaction.create(relationshipRef.collection("events").doc(), {
        type: body.action,
        actorId: token.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    const detail = getErrorMessage(error);
    console.error("THERAPY CONNECTION API ERROR:", detail);
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Could not update connection" : detail },
      { status: 500 }
    );
  }
}
