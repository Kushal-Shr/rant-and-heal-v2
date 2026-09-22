export interface VaultKdfConfig {
  algorithm: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
  salt: string;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
}

export interface VaultMetadata {
  version: 1;
  kdf: VaultKdfConfig;
  verification: EncryptedPayload;
  createdAt?: unknown;
}

export interface JournalPlaintextPayload {
  version: 1;
  title: string;
  body: string;
  legacyMoodTag?: string;
}
