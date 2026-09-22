import { randomBytes } from "node:crypto";
import { getFirebaseAdminApp } from "@/src/server/firebaseAdmin";
export { CRYPTO_VERSION, encryptText, decryptText, type EncryptedPayload } from "@/src/lib/therapy/envelope";

function kmsKeyName(): string {
  const value = process.env.THERAPY_KMS_KEY_NAME;
  if (!value || !/^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/.test(value)) {
    throw new Error("THERAPY_KMS_KEY_NAME is not configured");
  }
  return value;
}

async function kms(method: "encrypt" | "decrypt", bytes: Buffer): Promise<Buffer> {
  const credential = getFirebaseAdminApp().options.credential;
  if (!credential) throw new Error("Firebase Admin credential is unavailable");
  const { access_token } = await credential.getAccessToken();
  const response = await fetch(`https://cloudkms.googleapis.com/v1/${kmsKeyName()}:${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ [method === "encrypt" ? "plaintext" : "ciphertext"]: bytes.toString("base64") }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`KMS ${method} failed (${response.status})`);
  const result = await response.json() as { ciphertext?: string; plaintext?: string };
  const encoded = method === "encrypt" ? result.ciphertext : result.plaintext;
  if (!encoded) throw new Error(`KMS ${method} returned no data`);
  return Buffer.from(encoded, "base64");
}

export async function newWrappedRelationshipKey(): Promise<{ wrappedDek: string; kmsKeyName: string }> {
  const dek = randomBytes(32);
  try {
    return { wrappedDek: (await kms("encrypt", dek)).toString("base64"), kmsKeyName: kmsKeyName() };
  } finally {
    dek.fill(0);
  }
}

export async function unwrapRelationshipKey(record: { wrappedDek: string; kmsKeyName: string }): Promise<Buffer> {
  if (record.kmsKeyName !== kmsKeyName()) throw new Error("Relationship key uses a different KMS key");
  const dek = await kms("decrypt", Buffer.from(record.wrappedDek, "base64"));
  if (dek.length !== 32) throw new Error("Invalid wrapped relationship key");
  return dek;
}
