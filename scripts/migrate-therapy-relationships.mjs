import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

// These scripts run directly with Node, outside Next.js. Load the same local
// environment files that `next dev` uses before reading Firebase credentials.
loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) {
  throw new Error("Firebase Admin environment variables are required.");
}

const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);
const connections = await db.collection("connections").get();
const therapistProfiles = await db.collection("therapists").get();
let migrated = 0;
let profilesUpdated = 0;

for (const connectionDoc of connections.docs) {
  const connection = connectionDoc.data();
  const existingRelationshipId =
    typeof connection.relationshipId === "string" &&
    connection.relationshipId.length > 0 &&
    !connection.relationshipId.includes("/")
      ? connection.relationshipId
      : null;
  const relationshipId = existingRelationshipId ?? `legacy_${connectionDoc.id}`;
  const relationshipRef = db.collection("therapy_relationships").doc(relationshipId);
  const relationshipExists = existingRelationshipId && (await relationshipRef.get()).exists;
  if (relationshipExists) continue;

  const action = existingRelationshipId ? "repair" : "migrate";
  console.log(`${apply ? "Applying" : "Would apply"} ${action} for ${connectionDoc.id} -> ${relationshipId}`);
  if (!apply) continue;

  const writer = db.bulkWriter();
  const relationship = {
    ...connection,
    relationshipId,
    patientId: connection.userId ?? connectionDoc.id,
    consent: {
      version: "legacy-import",
      disclosureHash: connection.consentHash ?? "legacy-unavailable",
      scope: ["therapy-messages", "therapy-calls", "connection-status"],
      acceptedAt: connection.requestedAt ?? FieldValue.serverTimestamp(),
    },
    migratedAt: FieldValue.serverTimestamp(),
  };
  writer.set(relationshipRef, relationship, { merge: true });

  const messages = await connectionDoc.ref.collection("messages").get();
  for (const message of messages.docs) writer.set(relationshipRef.collection("messages").doc(message.id), message.data());

  const callState = await connectionDoc.ref.collection("call_state").get();
  for (const state of callState.docs) {
    writer.set(relationshipRef.collection("call_state").doc(state.id), {
      ...state.data(),
      expiresAt: state.data().expiresAt ?? Timestamp.now(),
    });
  }

  const calls = await connectionDoc.ref.collection("call_sessions").get();
  for (const call of calls.docs) {
    const callRef = relationshipRef.collection("call_sessions").doc(call.id);
    writer.set(callRef, {
      ...call.data(),
      relationshipId,
      expiresAt: call.data().expiresAt ?? Timestamp.now(),
    });
    const signals = await call.ref.collection("signals").get();
    for (const signal of signals.docs) writer.set(callRef.collection("signals").doc(signal.id), signal.data());
  }

  const patient = await db.collection("users").doc(connectionDoc.id).get();
  const patientData = patient.data();
  if (patientData) {
    writer.set(db.collection("patient_profiles").doc(connectionDoc.id), {
      patientId: connectionDoc.id,
      displayName: typeof patientData.displayName === "string" ? patientData.displayName.slice(0, 80) : "Patient",
      isIncognito: patientData.isIncognito === true,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  writer.set(connectionDoc.ref, { relationshipId, migratedAt: FieldValue.serverTimestamp() }, { merge: true });
  writer.set(relationshipRef.collection("events").doc("legacy-import"), {
    type: "LEGACY_IMPORT",
    actorId: "migration",
    createdAt: FieldValue.serverTimestamp(),
  });
  await writer.close();
  migrated += 1;
}

const profileWriter = db.bulkWriter();
for (const profileDoc of therapistProfiles.docs) {
  const profile = profileDoc.data();
  if (typeof profile.verificationStatus === "string") continue;
  if (profile.isVerified !== true && profile.isVerified !== false) continue;

  const verificationStatus = profile.isVerified ? "VERIFIED" : "PENDING";
  console.log(`${apply ? "Applying" : "Would apply"} therapist status backfill for ${profileDoc.id} -> ${verificationStatus}`);
  if (!apply) continue;
  profileWriter.set(profileDoc.ref, { verificationStatus }, { merge: true });
  profilesUpdated += 1;
}
if (apply && profilesUpdated > 0) await profileWriter.close();

console.log(
  apply
    ? `Migrated ${migrated} connection(s) and backfilled ${profilesUpdated} therapist profile(s).`
    : "Dry run complete. Re-run with --apply after reviewing the output."
);
