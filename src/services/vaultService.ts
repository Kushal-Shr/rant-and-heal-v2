import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { createVaultKdfConfig, deriveVaultKey } from "../lib/crypto/keyDerivation";
import { createVaultVerificationPayload, verifyVaultPassphrase } from "../lib/crypto/vault";
import type { VaultMetadata } from "../lib/crypto/types";

function vaultMetadataRef(uid: string) {
  return doc(db, "users", uid, "vault", "config");
}

export async function getVaultMetadata(uid: string): Promise<VaultMetadata | null> {
  const snapshot = await getDoc(vaultMetadataRef(uid));
  return snapshot.exists() ? snapshot.data() as VaultMetadata : null;
}

export async function createVault(uid: string, passphrase: string): Promise<CryptoKey> {
  if ((await getDoc(vaultMetadataRef(uid))).exists()) throw new Error("This Vault already exists.");
  const kdf = createVaultKdfConfig();
  const key = await deriveVaultKey(passphrase, kdf);
  const verification = await createVaultVerificationPayload(key);
  await setDoc(vaultMetadataRef(uid), {
    version: 1,
    kdf,
    verification,
    createdAt: serverTimestamp(),
  });
  return key;
}

export async function unlockVault(metadata: VaultMetadata, passphrase: string): Promise<CryptoKey> {
  if (!Number.isInteger(metadata.kdf.iterations) || metadata.kdf.iterations < 210_000 || metadata.kdf.iterations > 2_000_000) {
    throw new Error("The Vault key derivation settings are invalid.");
  }
  const key = await deriveVaultKey(passphrase, metadata.kdf);
  if (!(await verifyVaultPassphrase(key, metadata.verification))) {
    throw new Error("That Vault passphrase is incorrect.");
  }
  return key;
}
