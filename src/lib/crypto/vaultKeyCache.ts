export const VAULT_TRUST_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

const DATABASE_NAME = "rant-and-heal-vault";
const DATABASE_VERSION = 1;
const STORE_NAME = "trusted-keys";

interface CachedVaultKeyRecord {
  uid: string;
  key: CryptoKey;
  expiresAt: number;
  version: 1;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Trusted-browser storage is unavailable."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "uid" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open trusted-browser storage."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Trusted-browser storage failed."));
  });
}

export function isUsableCachedVaultKeyRecord(
  value: unknown,
  uid: string,
  now = Date.now()
): value is CachedVaultKeyRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CachedVaultKeyRecord>;
  return record.version === 1 &&
    record.uid === uid &&
    record.key instanceof CryptoKey &&
    record.key.extractable === false &&
    record.key.algorithm.name === "AES-GCM" &&
    typeof record.expiresAt === "number" && record.expiresAt > now;
}

export async function cacheVaultKey(uid: string, key: CryptoKey): Promise<number> {
  if (key.extractable) throw new Error("Extractable Vault keys cannot be trusted on this browser.");
  const expiresAt = Date.now() + VAULT_TRUST_DURATION_MS;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    await requestResult(transaction.objectStore(STORE_NAME).put({
      uid,
      key,
      expiresAt,
      version: 1,
    } satisfies CachedVaultKeyRecord));
  } finally {
    database.close();
  }
  return expiresAt;
}

export async function getCachedVaultKey(uid: string): Promise<Pick<CachedVaultKeyRecord, "key" | "expiresAt"> | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const value = await requestResult(store.get(uid));
    if (isUsableCachedVaultKeyRecord(value, uid)) return { key: value.key, expiresAt: value.expiresAt };
    await requestResult(store.delete(uid));
    return null;
  } finally {
    database.close();
  }
}

export async function deleteCachedVaultKey(uid: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  try {
    await requestResult(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(uid));
  } finally {
    database.close();
  }
}
