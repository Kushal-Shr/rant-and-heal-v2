"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";
import { getUserProfile } from "@/src/services/userService";
import { UserRole } from "@/src/types/database";

interface UseRequireRoleOptions {
  allowedRole: UserRole.USER | UserRole.THERAPIST;
  redirectTo: string;
}

export function useRequireRole({ allowedRole, redirectTo }: UseRequireRoleOptions) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [checkedRole, setCheckedRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      router.push("/auth/login");
      return;
    }

    let isActive = true;
    const uid = user.uid;

    async function checkUserRole() {
      setRoleLoading(true);
      try {
        const profile = await getUserProfile(uid);
        if (!isActive) {
          return;
        }

        const nextRole = profile?.role ?? null;
        setCheckedRole(nextRole);

        if (nextRole !== allowedRole) {
          router.push(redirectTo);
        }
      } catch (error) {
        console.error("Failed to fetch user profile for role guard:", error);
      } finally {
        if (isActive) {
          setRoleLoading(false);
        }
      }
    }

    checkUserRole();

    return () => {
      isActive = false;
    };
  }, [allowedRole, authLoading, redirectTo, router, user]);

  return {
    user,
    loading: authLoading || roleLoading,
    isAllowed: Boolean(user) && checkedRole === allowedRole,
  };
}
