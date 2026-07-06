"use client";

import React from "react";
import { Spinner } from "@/src/components/ui/Spinner";
import { EmergencyOverlay } from "@/src/components/layout/EmergencyOverlay";
import { useRequireRole } from "@/src/hooks/useRequireRole";
import { UserRole } from "@/src/types/database";

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAllowed } = useRequireRole({
    allowedRole: UserRole.USER,
    redirectTo: "/portal",
  });

  // Render centered spinner while loading auth state or checking role
  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-brutalBg">
        <Spinner size="lg" label="Securing session..." />
      </div>
    );
  }

  // If there's no authenticated user or if the user is a therapist, prevent flashing components
  if (!user || !isAllowed) {
    return null;
  }

  return (
    <>
      <div className="w-full h-full px-6 py-6">
        <div className="mx-auto max-w-6xl">
          {children}
        </div>
      </div>
      <EmergencyOverlay isOpen={false} />
    </>
  );
}
