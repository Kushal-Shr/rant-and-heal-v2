import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const CRYPTO_VERSION = 1;
export type EncryptedPayload = { ciphertext: string; iv: string; cryptoVersion: 1 };

export function encryptText(key: Buffer, plaintext: string, aad: string): EncryptedPayload {
  if (key.length !== 32) throw new Error("Invalid relationship key");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return { ciphertext: encrypted.toString("base64"), iv: iv.toString("base64"), cryptoVersion: 1 };
}

export function decryptText(key: Buffer, payload: EncryptedPayload, aad: string): string {
  if (key.length !== 32 || payload.cryptoVersion !== 1) throw new Error("Invalid encrypted payload");
  const iv = Buffer.from(payload.iv, "base64");
  const bytes = Buffer.from(payload.ciphertext, "base64");
  if (iv.length !== 12 || bytes.length < 17) throw new Error("Invalid encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString("utf8");
}
