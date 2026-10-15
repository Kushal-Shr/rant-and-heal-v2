import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const execute = process.argv.includes("--execute");
if (execute && !process.argv.includes("--ack-production-user-data")) {
  throw new Error("Migration requires --execute --ack-production-user-data after backup and production review");
}
const conversationKmsKeyName = process.env.MOMO_CONVERSATION_KMS_KEY_NAME;
const safetyKmsKeyName = process.env.MOMO_SAFETY_KMS_KEY_NAME;
if (execute && (!conversationKmsKeyName || !safetyKmsKeyName)) {
  throw new Error("MOMO_CONVERSATION_KMS_KEY_NAME and MOMO_SAFETY_KMS_KEY_NAME are required");
}
const credential = cert({
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
});
const app = getApps()[0] ?? initializeApp({ credential });
const db = getFirestore(app);

async function kms(method, bytes, keyName) {
  const { access_token } = await credential.getAccessToken();
  const response = await fetch(`https://cloudkms.googleapis.com/v1/${keyName}:${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ [method === "encrypt" ? "plaintext" : "ciphertext"]: bytes.toString("base64") }),
  });
  if (!response.ok) throw new Error(`KMS ${method} failed (${response.status})`);
  const data = await response.json();
  return Buffer.from(data[method === "encrypt" ? "ciphertext" : "plaintext"], "base64");
}

function encrypt(dek, text, aad) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  cipher.setAAD(Buffer.from(aad));
  return {
    ciphertext: Buffer.concat([cipher.update(text, "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64"),
    iv: iv.toString("base64"),
    algorithm: "AES-256-GCM",
    cryptoVersion: 1,
  };
}

function decrypt(dek, payload, aad) {
  const bytes = Buffer.from(payload.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", dek, Buffer.from(payload.iv, "base64"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString("utf8");
}

function keyId(userId, conversationId) {
  return Buffer.from(`${userId}\0${conversationId}`).toString("base64url");
}

async function conversationDek(userId, conversationId) {
  const ref = db.collection("momo_conversation_keys").doc(keyId(userId, conversationId));
  let data = (await ref.get()).data();
  if (!data) {
    const fresh = randomBytes(32);
    try {
      const record = {
        userId,
        conversationId,
        wrappedDek: (await kms("encrypt", fresh, conversationKmsKeyName)).toString("base64"),
        kmsKeyName: conversationKmsKeyName,
        cryptoVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
      };
      try { await ref.create(record); } catch (error) { if (error.code !== 6) throw error; }
    } finally { fresh.fill(0); }
    data = (await ref.get()).data();
  }
  if (data.kmsKeyName !== conversationKmsKeyName) throw new Error("Unexpected conversation KMS key");
  return kms("decrypt", Buffer.from(data.wrappedDek, "base64"), conversationKmsKeyName);
}

function messageAad(userId, conversationId, messageId, role, modality) {
  return ["rant-and-heal:momo-message:v1", userId, conversationId, messageId, role, modality].join(":");
}

async function migrateMessage(userId, session, message, dek) {
  const original = message.data();
  if (typeof original.text !== "string") return false;
  const role = original.sender === "MOMO" ? "assistant" : "user";
  const modality = original.modality === "VOICE" || original.source === "VOICE" ? "voice" : "text";
  const aad = messageAad(userId, session.id, message.id, role, modality);
  const encryptedContent = original.encryptedContent ?? encrypt(dek, original.text, aad);
  await message.ref.set({
    userId,
    conversationId: session.id,
    role,
    modality,
    encryptedContent,
    messageSequence: Number.isInteger(original.messageSequence) ? original.messageSequence
      : (original.timestamp?.toMillis?.() ?? Date.now()) * 10 + (original.order ?? 0),
    createdAt: original.createdAt ?? original.timestamp ?? Timestamp.now(),
  }, { merge: true });
  const verified = (await message.ref.get()).data();
  if (decrypt(dek, verified.encryptedContent, aad) !== original.text) {
    throw new Error("Message round-trip verification failed");
  }
  await message.ref.set({
    text: FieldValue.delete(), sender: FieldValue.delete(), source: FieldValue.delete(),
    provenance: FieldValue.delete(), order: FieldValue.delete(), timestamp: FieldValue.delete(),
    continuityMetadata: FieldValue.delete(),
  }, { merge: true });
  return true;
}

const failures = [];
let sessionsSeen = 0;
let sessionsCandidates = 0;
let messageCandidates = 0;
let continuityCandidates = 0;
let requestCacheCandidates = 0;
let messagesMigrated = 0;
let continuityMigrated = 0;
let requestCachesCleaned = 0;
const users = await db.collection("users").get();
for (const user of users.docs) {
  const sessions = await user.ref.collection("sessions").get();
  for (const session of sessions.docs) {
    sessionsSeen += 1;
    const [messages, requests] = await Promise.all([
      session.ref.collection("messages").get(),
      session.ref.collection("requests").get(),
    ]);
    const data = session.data();
    const sessionMessageCandidates = messages.docs.filter((item) => typeof item.data().text === "string").length;
    const sessionRequestCandidates = requests.docs.filter((item) =>
      typeof item.data().messageText === "string" || typeof item.data().reply === "string"
    ).length;
    const narrativeTitle = typeof data.title === "string" &&
      !["Conversation", "New Conversation"].includes(data.title);
    const candidate = sessionMessageCandidates > 0 || Boolean(data.continuityState) ||
      Boolean(data.summary) || narrativeTitle || sessionRequestCandidates > 0;
    if (candidate) {
      sessionsCandidates += 1;
      messageCandidates += sessionMessageCandidates;
      if (data.continuityState) continuityCandidates += 1;
      requestCacheCandidates += sessionRequestCandidates;
    }
    if (!candidate || !execute) continue;
    let dek;
    try {
      dek = await conversationDek(user.id, session.id);
      for (const message of messages.docs) {
        if (await migrateMessage(user.id, session, message, dek)) messagesMigrated += 1;
      }
      if (data.continuityState) {
        const aad = `rant-and-heal:momo-continuity:v1:${user.id}:${session.id}`;
        const encryptedContinuity = data.encryptedContinuity ?? encrypt(dek, JSON.stringify(data.continuityState), aad);
        await session.ref.set({ encryptedContinuity, cryptoVersion: 1 }, { merge: true });
        const verified = (await session.ref.get()).data();
        if (decrypt(dek, verified.encryptedContinuity, aad) !== JSON.stringify(data.continuityState)) {
          throw new Error("Continuity round-trip verification failed");
        }
        await session.ref.set({ continuityState: FieldValue.delete() }, { merge: true });
        continuityMigrated += 1;
      }
      for (const request of requests.docs) {
        const cached = request.data();
        if (typeof cached.messageText !== "string" && typeof cached.reply !== "string") continue;
        const userMessage = await session.ref.collection("messages").doc(`${request.id}-user`).get();
        const momoMessage = await session.ref.collection("messages").doc(`${request.id}-momo`).get();
        if (typeof cached.messageText === "string" && !userMessage.exists) {
          const fake = { id: `${request.id}-user`, ref: userMessage.ref, data: () => ({ text: cached.messageText, sender: "USER", modality: "TEXT", timestamp: cached.updatedAt }) };
          await migrateMessage(user.id, session, fake, dek);
          messagesMigrated += 1;
        }
        if (typeof cached.reply === "string" && !momoMessage.exists) {
          const fake = { id: `${request.id}-momo`, ref: momoMessage.ref, data: () => ({ text: cached.reply, sender: "MOMO", modality: "TEXT", timestamp: cached.updatedAt, order: 1 }) };
          await migrateMessage(user.id, session, fake, dek);
          messagesMigrated += 1;
        }
        await request.ref.set({ messageText: FieldValue.delete(), reply: FieldValue.delete() }, { merge: true });
        requestCachesCleaned += 1;
      }
      await session.ref.set({
        title: "Conversation",
        summary: FieldValue.delete(),
        migrationVersion: 1,
        migrationVerifiedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      failures.push(`${user.id}/${session.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      dek?.fill(0);
    }
  }
}

const safetyCases = await db.collection("safety_cases").get();
const safetyExcerptCandidates = safetyCases.docs.filter((item) =>
  typeof item.data().relevantUserText === "string"
).length;
let safetyExcerptsMigrated = 0;
for (const safetyCase of safetyCases.docs) {
  const data = safetyCase.data();
  if (typeof data.relevantUserText !== "string") continue;
  if (!execute) continue;
  const dek = randomBytes(32);
  try {
    const binding = typeof data.sourceEventId === "string" ? data.sourceEventId : safetyCase.id;
    const encryptedSafetyExcerpt = encrypt(dek, data.relevantUserText, `rant-and-heal:momo-safety:v1:${binding}`);
    const wrappedSafetyDek = (await kms("encrypt", dek, safetyKmsKeyName)).toString("base64");
    await safetyCase.ref.set({
      encryptedSafetyExcerpt, wrappedSafetyDek, safetyKmsKeyName, safetyExcerptEventId: binding,
    }, { merge: true });
    const verified = (await safetyCase.ref.get()).data();
    const unwrapped = await kms("decrypt", Buffer.from(verified.wrappedSafetyDek, "base64"), safetyKmsKeyName);
    try {
      if (decrypt(unwrapped, verified.encryptedSafetyExcerpt, `rant-and-heal:momo-safety:v1:${binding}`) !== data.relevantUserText) {
        throw new Error("Safety excerpt round-trip verification failed");
      }
    } finally { unwrapped.fill(0); }
    await safetyCase.ref.set({ relevantUserText: FieldValue.delete(), migrationVersion: 1 }, { merge: true });
    safetyExcerptsMigrated += 1;
  } catch (error) {
    failures.push(`safety_cases/${safetyCase.id}: ${error instanceof Error ? error.message : "unknown error"}`);
  } finally { dek.fill(0); }
}

console.log(JSON.stringify({
  mode: execute ? "execute" : "dry-run",
  users: users.size,
  sessionsSeen,
  sessionsCandidates,
  messageCandidates,
  continuityCandidates,
  requestCacheCandidates,
  safetyExcerptCandidates,
  messagesMigrated,
  continuityMigrated,
  requestCachesCleaned,
  safetyExcerptsMigrated,
  failures,
}));
if (failures.length) process.exitCode = 1;
