import { randomBytes } from "node:crypto";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const relationshipId = process.argv.find((part) => part.startsWith("--relationship="))?.slice("--relationship=".length);
const execute = process.argv.includes("--execute");
if (!relationshipId || !/^[A-Za-z0-9_-]{1,128}$/.test(relationshipId)) {
  throw new Error("Provide --relationship=<relationshipId>");
}
const keyName = process.env.THERAPY_KMS_KEY_NAME;
if (!keyName || !/^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/.test(keyName)) {
  throw new Error("THERAPY_KMS_KEY_NAME is missing or invalid");
}

const credential = cert({
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
});
const db = getFirestore(initializeApp({ credential }));
const relationshipRef = db.collection("therapy_relationships").doc(relationshipId);
const keyRef = db.collection("therapy_keys").doc(relationshipId);
const contentQueries = ["messages", "session_notes", "weekly_therapy_summaries", "weekly_reflections"]
  .map((name) => relationshipRef.collection(name).select("createdAt").limit(1));

async function kmsEncrypt(dek) {
  const { access_token } = await credential.getAccessToken();
  const response = await fetch(`https://cloudkms.googleapis.com/v1/${keyName}:encrypt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ plaintext: dek.toString("base64") }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`KMS encrypt failed (${response.status})`);
  const result = await response.json();
  if (typeof result.ciphertext !== "string") throw new Error("KMS returned no ciphertext");
  return result.ciphertext;
}

async function inspect() {
  const [relationshipSnap, keySnap, ...contentSnaps] = await Promise.all([
    relationshipRef.get(), keyRef.get(), ...contentQueries.map((query) => query.get()),
  ]);
  const relationship = relationshipSnap.data();
  if (!relationship || relationship.status !== "ACTIVE") throw new Error("Relationship is not active");
  const pointer = (await db.collection("connections").doc(relationship.userId).get()).data();
  if (pointer?.relationshipId !== relationshipId || pointer.status !== "ACTIVE") throw new Error("Relationship is not current");
  if (keySnap.exists) return "already-initialized";
  if (contentSnaps.some((snapshot) => !snapshot.empty)) throw new Error("Relationship has content; review migration before initializing a key");
  return "eligible";
}

const state = await inspect();
if (!execute || state === "already-initialized") {
  console.log(JSON.stringify({ relationshipId, mode: execute ? "execute" : "dry-run", state }));
  process.exit(0);
}

const dek = randomBytes(32);
try {
  const wrappedDek = await kmsEncrypt(dek);
  await db.runTransaction(async (transaction) => {
    const [relationshipSnap, keySnap, ...contentSnaps] = await Promise.all([
      transaction.get(relationshipRef), transaction.get(keyRef), ...contentQueries.map((query) => transaction.get(query)),
    ]);
    const relationship = relationshipSnap.data();
    if (!relationship || relationship.status !== "ACTIVE") throw new Error("Relationship is no longer active");
    const pointer = (await transaction.get(db.collection("connections").doc(relationship.userId))).data();
    if (pointer?.relationshipId !== relationshipId || pointer.status !== "ACTIVE") throw new Error("Relationship is no longer current");
    if (contentSnaps.some((snapshot) => !snapshot.empty)) throw new Error("Relationship acquired content; no key was created");
    if (!keySnap.exists) transaction.create(keyRef, { wrappedDek, kmsKeyName: keyName, cryptoVersion: 1, createdAt: FieldValue.serverTimestamp() });
  });
} finally { dek.fill(0); }

const key = (await keyRef.get()).data();
if (!key?.wrappedDek || key.kmsKeyName !== keyName) throw new Error("Relationship key verification failed");
console.log(JSON.stringify({ relationshipId, mode: "execute", state: "initialized" }));
