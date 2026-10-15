import { randomBytes, timingSafeEqual } from "node:crypto";
import { cert } from "firebase-admin/app";

const keys = [
  ["conversation", process.env.MOMO_CONVERSATION_KMS_KEY_NAME],
  ["safety", process.env.MOMO_SAFETY_KMS_KEY_NAME],
];
const keyPattern = /^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/;
for (const [domain, keyName] of keys) {
  if (!keyName || !keyPattern.test(keyName)) {
    throw new Error(`MOMO_${domain === "conversation" ? "CONVERSATION" : "SAFETY"}_KMS_KEY_NAME is missing or invalid`);
  }
}
if (keys[0][1] === keys[1][1]) throw new Error("Momo conversation and safety KMS keys must be distinct");

const credential = cert({
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
});

async function kms(method, bytes, keyName) {
  const { access_token } = await credential.getAccessToken();
  const response = await fetch(`https://cloudkms.googleapis.com/v1/${keyName}:${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ [method === "encrypt" ? "plaintext" : "ciphertext"]: bytes.toString("base64") }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Momo ${method} check failed for ${keyName.split("/").at(-1)} (${response.status})`);
  const result = await response.json();
  const encoded = result[method === "encrypt" ? "ciphertext" : "plaintext"];
  if (typeof encoded !== "string") throw new Error(`Momo ${method} check returned no data`);
  return Buffer.from(encoded, "base64");
}

for (const [domain, keyName] of keys) {
  const sample = randomBytes(32);
  try {
    const wrapped = await kms("encrypt", sample, keyName);
    const unwrapped = await kms("decrypt", wrapped, keyName);
    try {
      if (unwrapped.length !== sample.length || !timingSafeEqual(unwrapped, sample)) {
        throw new Error(`Momo ${domain} KMS round trip failed`);
      }
      process.stdout.write(`Momo ${domain} KMS encrypt/decrypt check passed\n`);
    } finally {
      unwrapped.fill(0);
    }
  } finally {
    sample.fill(0);
  }
}
