"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import type { VaultMetadata } from "../lib/crypto/types";
import { verifyVaultPassphrase } from "../lib/crypto/vault";
import {
  cacheVaultKey,
  deleteCachedVaultKey,
  getCachedVaultKey,
  VAULT_TRUST_DURATION_MS,
} from "../lib/crypto/vaultKeyCache";
import {
  createVault as createVaultRecord,
  getVaultMetadata,
  unlockVault as unlockVaultRecord,
} from "../services/vaultService";

type VaultState = "LOADING" | "NOT_CREATED" | "LOCKED" | "UNLOCKED";

interface VaultContextValue {
  state: VaultState;
  key: CryptoKey | null;
  createVault(passphrase: string): Promise<CryptoKey>;
  unlockVault(passphrase: string): Promise<CryptoKey>;
  lockVault(): Promise<void>;
}

const VaultContext = createContext<VaultContextValue | undefined>(undefined);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid ?? null;
  const previousUid = useRef<string | null>(null);
  const [metadata, setMetadata] = useState<VaultMetadata | null>(null);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [trustedUntil, setTrustedUntil] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    void Promise.resolve().then(async () => {
      setLoading(true);
      setKey(null);
      setTrustedUntil(null);

      const oldUid = previousUid.current;
      previousUid.current = uid;
      if (oldUid && oldUid !== uid) {
        await deleteCachedVaultKey(oldUid).catch(() => undefined);
      }
      if (!uid) {
        if (active) {
          setMetadata(null);
          setLoading(false);
        }
        return;
      }

      const vaultMetadata = await getVaultMetadata(uid);
      let cachedKey: CryptoKey | null = null;
      let cachedExpiry: number | null = null;
      if (vaultMetadata) {
        const cached = await getCachedVaultKey(uid).catch(() => null);
        cachedKey = cached?.key ?? null;
        cachedExpiry = cached?.expiresAt ?? null;
        if (cachedKey && !(await verifyVaultPassphrase(cachedKey, vaultMetadata.verification))) {
          await deleteCachedVaultKey(uid).catch(() => undefined);
          cachedKey = null;
          cachedExpiry = null;
        }
      }
      if (active) {
        setMetadata(vaultMetadata);
        setKey(cachedKey);
        setTrustedUntil(cachedExpiry);
        setLoading(false);
      }
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [authLoading, uid]);

  useEffect(() => {
    if (!key || !trustedUntil) return;
    const remaining = Math.max(0, trustedUntil - Date.now());
    const timeout = window.setTimeout(() => {
      setKey(null);
      setTrustedUntil(null);
      if (uid) void deleteCachedVaultKey(uid).catch(() => undefined);
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [key, trustedUntil, uid]);

  const value = useMemo<VaultContextValue>(() => ({
    state: loading ? "LOADING" : key ? "UNLOCKED" : metadata ? "LOCKED" : "NOT_CREATED",
    key,
    async createVault(passphrase: string) {
      if (!uid) throw new Error("Sign in is required.");
      const createdKey = await createVaultRecord(uid, passphrase);
      setMetadata(await getVaultMetadata(uid));
      setKey(createdKey);
      setTrustedUntil(await cacheVaultKey(uid, createdKey).catch(() => Date.now() + VAULT_TRUST_DURATION_MS));
      return createdKey;
    },
    async unlockVault(passphrase: string) {
      if (!uid || !metadata) throw new Error("Create your Vault first.");
      const unlockedKey = await unlockVaultRecord(metadata, passphrase);
      setKey(unlockedKey);
      setTrustedUntil(await cacheVaultKey(uid, unlockedKey).catch(() => Date.now() + VAULT_TRUST_DURATION_MS));
      return unlockedKey;
    },
    async lockVault() {
      setKey(null);
      setTrustedUntil(null);
      if (uid) await deleteCachedVaultKey(uid).catch(() => undefined);
    },
  }), [key, loading, metadata, uid]);

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) throw new Error("useVault must be used within a VaultProvider");
  return context;
}
