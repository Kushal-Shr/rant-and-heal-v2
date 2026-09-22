import { randomBytes, timingSafeEqual } from "node:crypto";
import { cert } from "firebase-admin/app";

const keyName = process.env.THERAPY_KMS_KEY_NAME;
if (!keyName || !/^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/.test(keyName)) {
  throw new Error("THERAPY_KMS_KEY_NAME is missing or invalid");
}
const credential = cert({
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
});

async function kms(method, bytes) {
  const { access_token } = await credential.getAccessToken();
  const response = await fetch(`https://cloudkms.googleapis.com/v1/${keyName}:${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ [method === "encrypt" ? "plaintext" : "ciphertext"]: bytes.toString("base64") }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`KMS ${method} failed (${response.status})`);
  const result = await response.json();
  const encoded = result[method === "encrypt" ? "ciphertext" : "plaintext"];
  if (typeof encoded !== "string") throw new Error(`KMS ${method} returned no data`);
  return Buffer.from(encoded, "base64");
}

const sample = randomBytes(32);
try {
  const wrapped = await kms("encrypt", sample);
  const unwrapped = await kms("decrypt", wrapped);
  try {
    if (unwrapped.length !== sample.length || !timingSafeEqual(unwrapped, sample)) throw new Error("KMS round trip failed");
    process.stdout.write("Therapy KMS encrypt/decrypt check passed\n");
  } finally { unwrapped.fill(0); }
} finally { sample.fill(0); }
