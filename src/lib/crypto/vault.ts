import { base64ToBytes, bytesToBase64 } from "./encoding.ts";
import type { EncryptedPayload, JournalPlaintextPayload } from "./types.ts";

const JOURNAL_AAD_PREFIX = "rant-and-heal:journal:v1:";
const VERIFICATION_AAD = "rant-and-heal:vault-verification:v1";
const VERIFICATION_SENTINEL = "RANT_AND_HEAL_VAULT_OK_V1";

function browserCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable in this browser.");
  return globalThis.crypto;
}

async function encryptText(key: CryptoKey, plaintext: string, additionalData: string) {
  const cryptoApi = browserCrypto();
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const ciphertext = await cryptoApi.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(additionalData) },
    key,
    new TextEncoder().encode(plaintext)
  );
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) };
}

async function decryptText(key: CryptoKey, payload: EncryptedPayload, additionalData: string) {
  const plaintext = await browserCrypto().subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(payload.iv),
      additionalData: new TextEncoder().encode(additionalData),
    },
    key,
    base64ToBytes(payload.ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}

export function encryptJournalPayload(
  key: CryptoKey,
  payload: JournalPlaintextPayload,
  journalEntryId: string
): Promise<EncryptedPayload> {
  return encryptText(key, JSON.stringify(payload), `${JOURNAL_AAD_PREFIX}${journalEntryId}`);
}

export async function decryptJournalPayload(
  key: CryptoKey,
  payload: EncryptedPayload,
  journalEntryId: string
): Promise<JournalPlaintextPayload> {
  const decoded = JSON.parse(
    await decryptText(key, payload, `${JOURNAL_AAD_PREFIX}${journalEntryId}`)
  ) as Partial<JournalPlaintextPayload>;
  if (decoded.version !== 1 || typeof decoded.title !== "string" || typeof decoded.body !== "string") {
    throw new Error("The journal payload is invalid.");
  }
  if (decoded.legacyMoodTag !== undefined && typeof decoded.legacyMoodTag !== "string") {
    throw new Error("The journal payload is invalid.");
  }
  return decoded as JournalPlaintextPayload;
}

export function createVaultVerificationPayload(key: CryptoKey): Promise<EncryptedPayload> {
  return encryptText(key, VERIFICATION_SENTINEL, VERIFICATION_AAD);
}

export async function verifyVaultPassphrase(
  key: CryptoKey,
  verification: EncryptedPayload
): Promise<boolean> {
  try {
    return (await decryptText(key, verification, VERIFICATION_AAD)) === VERIFICATION_SENTINEL;
  } catch {
    return false;
  }
}
