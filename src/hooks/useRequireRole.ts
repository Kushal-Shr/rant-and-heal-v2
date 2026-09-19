"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentProfile } from "@/src/hooks/useCurrentProfile";
import { UserRole } from "@/src/types/database";

interface UseRequireRoleOptions {
  allowedRole: UserRole.USER | UserRole.THERAPIST;
  redirectTo: string;
}

export function useRequireRole({ allowedRole, redirectTo }: UseRequireRoleOptions) {
  const state = useCurrentProfile();
  const { user, profile, loading, error } = state;
  const router = useRouter();
  useEffect(() => {
    if (loading || error) return;
    if (!user) {
      router.replace(allowedRole === UserRole.THERAPIST ? "/auth/provider/login" : "/auth/login");
    } else if (!profile) {
      router.replace("/auth/onboarding-patient");
    } else if (profile.role !== allowedRole) {
      router.replace(profile.role === UserRole.USER || profile.role === UserRole.THERAPIST ? redirectTo : "/");
    }
  }, [allowedRole, error, loading, profile, redirectTo, router, user]);

  return { ...state, isAllowed: Boolean(user) && profile?.role === allowedRole };
}
