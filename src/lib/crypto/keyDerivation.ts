import { base64ToBytes, bytesToBase64 } from "./encoding.ts";
import type { VaultKdfConfig } from "./types.ts";

export const VAULT_KDF_ITERATIONS = 600_000;

function browserCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable in this browser.");
  return globalThis.crypto;
}

export function createVaultKdfConfig(): VaultKdfConfig {
  const salt = browserCrypto().getRandomValues(new Uint8Array(32));
  return {
    algorithm: "PBKDF2",
    hash: "SHA-256",
    iterations: VAULT_KDF_ITERATIONS,
    salt: bytesToBase64(salt),
  };
}

export async function deriveVaultKey(
  passphrase: string,
  kdf: VaultKdfConfig
): Promise<CryptoKey> {
  if (!passphrase) throw new Error("A Vault passphrase is required.");
  if (kdf.algorithm !== "PBKDF2" || kdf.hash !== "SHA-256") {
    throw new Error("Unsupported Vault key derivation configuration.");
  }

  const cryptoApi = browserCrypto();
  const material = await cryptoApi.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Non-extractable by design: Web Crypto can use the key but cannot export
  // its raw bytes. A trusted browser may structured-clone it into IndexedDB.
  return cryptoApi.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: kdf.hash,
      iterations: kdf.iterations,
      salt: base64ToBytes(kdf.salt),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
