"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";
import { Spinner } from "@/src/components/ui/Spinner";
import { getUserProfile } from "@/src/services/userService";
import { UserRole } from "@/src/types/database";

export default function TherapistLayout({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [roleLoading, setRoleLoading] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/auth/login");
      return;
    }

    const checkUserRole = async () => {
      setRoleLoading(true);
      try {
        const profile = await getUserProfile(user.uid);
        if (profile) {
          setUserRole(profile.role);
          if (profile.role !== UserRole.THERAPIST) {
            router.push("/dashboard");
          }
        }
      } catch (error) {
        console.error("Failed to fetch user profile for therapist role guard:", error);
      } finally {
        setRoleLoading(false);
      }
    };

    checkUserRole();
  }, [user, authLoading, router]);

  if (authLoading || roleLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-brutalBg">
        <Spinner size="lg" label="Securing session..." />
      </div>
    );
  }

  if (!user || userRole !== UserRole.THERAPIST) {
    return null;
  }

  return (
    <div className="w-full h-full px-6 py-6">
      <div className="mx-auto max-w-6xl">
        {children}
      </div>
    </div>
  );
}
