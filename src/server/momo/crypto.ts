import { randomBytes } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getFirebaseAdminApp } from "@/src/server/firebaseAdmin";
import {
  decryptText,
  encryptText,
  type EncryptedPayload,
} from "@/src/lib/therapy/envelope";
import type { MomoMessageBinding } from "@/src/lib/momo/storageCrypto";

const KEY_COLLECTION = "momo_conversation_keys";

function configuredKeyName(domain: "conversation" | "safety"): string {
  const envName = domain === "conversation" ? "MOMO_CONVERSATION_KMS_KEY_NAME" : "MOMO_SAFETY_KMS_KEY_NAME";
  const value = process.env[envName];
  if (!value || !/^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/.test(value)) {
    throw new Error(`${envName} is not configured`);
  }
  return value;
}

async function kms(method: "encrypt" | "decrypt", bytes: Buffer, keyName: string): Promise<Buffer> {
  const credential = getFirebaseAdminApp().options.credential;
  if (!credential) throw new Error("Firebase Admin credential is unavailable");
  const { access_token } = await credential.getAccessToken();
  const response = await fetch(`https://cloudkms.googleapis.com/v1/${keyName}:${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ [method === "encrypt" ? "plaintext" : "ciphertext"]: bytes.toString("base64") }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Momo KMS ${method} failed (${response.status})`);
  const result = await response.json() as { ciphertext?: string; plaintext?: string };
  const encoded = method === "encrypt" ? result.ciphertext : result.plaintext;
  if (!encoded) throw new Error(`Momo KMS ${method} returned no data`);
  return Buffer.from(encoded, "base64");
}

function conversationKeyId(userId: string, conversationId: string): string {
  return Buffer.from(`${userId}\0${conversationId}`).toString("base64url");
}

export async function conversationDek(db: Firestore, userId: string, conversationId: string): Promise<Buffer> {
  const keyName = configuredKeyName("conversation");
  const ref = db.collection(KEY_COLLECTION).doc(conversationKeyId(userId, conversationId));
  let record = (await ref.get()).data();
  if (!record) {
    const dek = randomBytes(32);
    try {
      const wrappedDek = (await kms("encrypt", dek, keyName)).toString("base64");
      await ref.create({
        userId,
        conversationId,
        wrappedDek,
        kmsKeyName: keyName,
        cryptoVersion: 1,
        createdAt: new Date(),
      }).catch(async (error: unknown) => {
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
        if (code !== "6" && code !== "already-exists") throw error;
      });
    } finally {
      dek.fill(0);
    }
    record = (await ref.get()).data();
  }
  if (!record || record.userId !== userId || record.conversationId !== conversationId ||
      record.kmsKeyName !== keyName || record.cryptoVersion !== 1 || typeof record.wrappedDek !== "string") {
    throw new Error("Invalid Momo conversation key record");
  }
  const dek = await kms("decrypt", Buffer.from(record.wrappedDek, "base64"), keyName);
  if (dek.length !== 32) throw new Error("Invalid Momo conversation data key");
  return dek;
}

function messageAad(binding: MomoMessageBinding): string {
  return [
    "rant-and-heal:momo-message:v1",
    binding.userId,
    binding.conversationId,
    binding.messageId,
    binding.role,
    binding.modality,
  ].join(":");
}

export function encryptMomoMessageForStorage(
  dek: Buffer,
  plaintext: string,
  binding: MomoMessageBinding
) {
  return {
    ...encryptText(dek, plaintext, messageAad(binding)),
    algorithm: "AES-256-GCM" as const,
  };
}

export function decryptMomoMessageFromStorage(
  dek: Buffer,
  payload: EncryptedPayload,
  binding: MomoMessageBinding
): string {
  return decryptText(dek, payload, messageAad(binding));
}

export function encryptMomoContinuityForStorage(
  dek: Buffer,
  value: unknown,
  userId: string,
  conversationId: string
) {
  return {
    ...encryptText(
      dek,
      JSON.stringify(value),
      `rant-and-heal:momo-continuity:v1:${userId}:${conversationId}`
    ),
    algorithm: "AES-256-GCM" as const,
  };
}

export interface EncryptedSafetyExcerpt extends EncryptedPayload {
  algorithm: "AES-256-GCM";
}

export interface SafetyExcerptEnvelope {
  encryptedSafetyExcerpt: EncryptedSafetyExcerpt;
  wrappedSafetyDek: string;
  safetyKmsKeyName: string;
}

export async function encryptSafetyExcerpt(plaintext: string, caseBinding: string): Promise<SafetyExcerptEnvelope> {
  const keyName = configuredKeyName("safety");
  const dek = randomBytes(32);
  try {
    return {
      encryptedSafetyExcerpt: {
        ...encryptText(dek, plaintext, `rant-and-heal:momo-safety:v1:${caseBinding}`),
        algorithm: "AES-256-GCM",
      },
      wrappedSafetyDek: (await kms("encrypt", dek, keyName)).toString("base64"),
      safetyKmsKeyName: keyName,
    };
  } finally {
    dek.fill(0);
  }
}

export async function decryptSafetyExcerpt(
  record: SafetyExcerptEnvelope,
  caseBinding: string
): Promise<string> {
  const keyName = configuredKeyName("safety");
  if (record.safetyKmsKeyName !== keyName) throw new Error("Safety excerpt uses a different KMS key");
  const dek = await kms("decrypt", Buffer.from(record.wrappedSafetyDek, "base64"), keyName);
  try {
    return decryptText(dek, record.encryptedSafetyExcerpt, `rant-and-heal:momo-safety:v1:${caseBinding}`);
  } finally {
    dek.fill(0);
  }
}

export { encryptText, decryptText, type EncryptedPayload };
