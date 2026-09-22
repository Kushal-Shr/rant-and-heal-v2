import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const execute = process.argv.includes("--execute");
if (execute && !process.argv.includes("--ack-production-user-data")) {
  throw new Error("Migration requires --execute --ack-production-user-data after backup and production review");
}
const keyName = process.env.THERAPY_KMS_KEY_NAME;
if (execute && !keyName) throw new Error("THERAPY_KMS_KEY_NAME is required");
const credential = cert({ projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n") });
const app = getApps()[0] ?? initializeApp({ credential });
const db = getFirestore(app);

async function kms(method, bytes) {
  const { access_token } = await credential.getAccessToken();
  const response = await fetch(`https://cloudkms.googleapis.com/v1/${keyName}:${method}`, { method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ [method === "encrypt" ? "plaintext" : "ciphertext"]: bytes.toString("base64") }) });
  if (!response.ok) throw new Error(`KMS ${method} failed (${response.status})`);
  const data = await response.json();
  return Buffer.from(data[method === "encrypt" ? "ciphertext" : "plaintext"], "base64");
}

function encrypt(dek, text, aad) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  cipher.setAAD(Buffer.from(aad));
  return { ciphertext: Buffer.concat([cipher.update(text, "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64"),
    iv: iv.toString("base64"), cryptoVersion: 1 };
}
function decrypt(dek, data, aad) {
  const bytes = Buffer.from(data.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", dek, Buffer.from(data.iv, "base64"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString("utf8");
}

async function relationshipKey(relationshipId) {
  const ref = db.collection("therapy_keys").doc(relationshipId);
  let data = (await ref.get()).data();
  if (!data) {
    const fresh = randomBytes(32);
    try {
      const candidate = { wrappedDek: (await kms("encrypt", fresh)).toString("base64"), kmsKeyName: keyName,
        cryptoVersion: 1, createdAt: FieldValue.serverTimestamp() };
      try { await ref.create(candidate); } catch (error) { if (error.code !== 6) throw error; }
    } finally { fresh.fill(0); }
    data = (await ref.get()).data();
  }
  if (data.kmsKeyName !== keyName) throw new Error("Unexpected KMS key on relationship");
  return kms("decrypt", Buffer.from(data.wrappedDek, "base64"));
}

const failures = [];
const failedRelationships = [];
let candidates = 0;
let migrated = 0;
let missingKeys = 0;
const relationships = await db.collection("therapy_relationships").get();
for (const relationship of relationships.docs) {
  const messages = await relationship.ref.collection("messages").get();
  const pending = messages.docs.filter((doc) => typeof doc.data().text === "string");
  candidates += pending.length;
  const keyExists = (await db.collection("therapy_keys").doc(relationship.id).get()).exists;
  if (!keyExists) missingKeys += 1;
  if (!execute || (!pending.length && keyExists)) continue;
  let dek;
  try {
    dek = await relationshipKey(relationship.id);
    for (const message of pending) {
      try {
        const original = message.data();
        const aad = `${relationship.id}:message:${message.id}`;
        if (!original.ciphertext) {
          const encrypted = encrypt(dek, original.text, aad);
          await db.runTransaction(async (tx) => {
            const current = (await tx.get(message.ref)).data();
            if (!current?.text || current.ciphertext) return;
            tx.update(message.ref, { ...encrypted, relationshipId: relationship.id,
              senderUid: current.senderId, recipientUid: current.senderId === relationship.data().userId ? relationship.data().therapistId : relationship.data().userId,
              type: "TEXT" });
          });
        }
        const verified = (await message.ref.get()).data();
        if (!verified?.ciphertext || decrypt(dek, verified, aad) !== verified.text) throw new Error("Encrypted write verification failed");
        await message.ref.update({ text: FieldValue.delete(), senderId: FieldValue.delete() });
        migrated += 1;
      } catch { failures.push(`${relationship.id}/${message.id}`); }
    }
  } catch { failedRelationships.push(relationship.id); pending.forEach((message) => failures.push(`${relationship.id}/${message.id}`)); }
  finally { dek?.fill(0); }
}
console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", relationships: relationships.size, missingKeys, candidates, migrated, failedMessageIds: [...new Set(failures)], failedRelationshipIds: failedRelationships }));
if (failures.length || failedRelationships.length) process.exitCode = 1;
