import { base64ToBytes, bytesToBase64 } from "../crypto/encoding.ts";

export const MOMO_CRYPTO_VERSION = 1 as const;
export const MOMO_CRYPTO_ALGORITHM = "AES-256-GCM" as const;

export type MomoMessageRole = "user" | "assistant";
export type MomoMessageModality = "text" | "voice";

export interface EncryptedMomoContent {
  ciphertext: string;
  iv: string;
  algorithm: typeof MOMO_CRYPTO_ALGORITHM;
  cryptoVersion: typeof MOMO_CRYPTO_VERSION;
}

export interface MomoMessageBinding {
  userId: string;
  conversationId: string;
  messageId: string;
  role: MomoMessageRole;
  modality: MomoMessageModality;
}

function webCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable.");
  return globalThis.crypto;
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

function continuityAad(userId: string, conversationId: string): string {
  return `rant-and-heal:momo-continuity:v1:${userId}:${conversationId}`;
}

async function encryptWithAad(key: CryptoKey, plaintext: string, aad: string): Promise<EncryptedMomoContent> {
  const cryptoApi = webCrypto();
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const ciphertext = await cryptoApi.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    algorithm: MOMO_CRYPTO_ALGORITHM,
    cryptoVersion: MOMO_CRYPTO_VERSION,
  };
}

async function decryptWithAad(key: CryptoKey, payload: EncryptedMomoContent, aad: string): Promise<string> {
  if (payload.algorithm !== MOMO_CRYPTO_ALGORITHM || payload.cryptoVersion !== MOMO_CRYPTO_VERSION) {
    throw new Error("Unsupported Momo encryption format.");
  }
  const plaintext = await webCrypto().subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(payload.iv),
      additionalData: new TextEncoder().encode(aad),
    },
    key,
    base64ToBytes(payload.ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}

export async function importMomoConversationKey(base64Key: string): Promise<CryptoKey> {
  const bytes = base64ToBytes(base64Key);
  if (bytes.byteLength !== 32) throw new Error("Invalid Momo conversation key.");
  return webCrypto().subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function encryptMomoMessage(
  key: CryptoKey,
  plaintext: string,
  binding: MomoMessageBinding
): Promise<EncryptedMomoContent> {
  if (!plaintext) throw new Error("Momo message content cannot be empty.");
  return encryptWithAad(key, plaintext, messageAad(binding));
}

export function decryptMomoMessage(
  key: CryptoKey,
  payload: EncryptedMomoContent,
  binding: MomoMessageBinding
): Promise<string> {
  return decryptWithAad(key, payload, messageAad(binding));
}

export function encryptMomoContinuity(
  key: CryptoKey,
  value: unknown,
  userId: string,
  conversationId: string
): Promise<EncryptedMomoContent> {
  return encryptWithAad(key, JSON.stringify(value), continuityAad(userId, conversationId));
}

export async function decryptMomoContinuity<T>(
  key: CryptoKey,
  payload: EncryptedMomoContent,
  userId: string,
  conversationId: string
): Promise<T> {
  return JSON.parse(await decryptWithAad(key, payload, continuityAad(userId, conversationId))) as T;
}
