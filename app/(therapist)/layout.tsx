"use client";

import React from "react";
import { Spinner } from "@/src/components/ui/Spinner";
import { useRequireRole } from "@/src/hooks/useRequireRole";
import { UserRole } from "@/src/types/database";

export default function TherapistLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAllowed } = useRequireRole({
    allowedRole: UserRole.THERAPIST,
    redirectTo: "/dashboard",
  });

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-brutalBg">
        <Spinner size="lg" label="Securing session..." />
      </div>
    );
  }

  if (!user || !isAllowed) {
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
