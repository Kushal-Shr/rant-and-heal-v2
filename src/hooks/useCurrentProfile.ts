"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/src/context/AuthContext";
import { observeUserProfile } from "@/src/services/userService";
import type { UserProfile } from "@/src/types/database";

// Bind the result to its owner so an account switch cannot reuse another role.
export function useCurrentProfile() {
  const { user, loading: authLoading } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    uid: string; attempt: number; profile: UserProfile | null; error: boolean;
  } | null>(null);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!user || authLoading) return;
    const uid = user.uid;
    return observeUserProfile(
      uid,
      (profile) => setResult({ uid, attempt, profile, error: false }),
      () => setResult({ uid, attempt, profile: null, error: true }),
    );
  }, [user, authLoading, attempt]);

  const current = user && result?.uid === user.uid && result.attempt === attempt ? result : null;
  return {
    user,
    profile: current?.profile ?? null,
    loading: authLoading || Boolean(user && !current),
    error: current?.error ?? false,
    retry,
  };
}
