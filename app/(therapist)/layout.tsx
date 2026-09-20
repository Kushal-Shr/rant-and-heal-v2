"use client";

import React from "react";
import { Spinner } from "@/src/components/ui/Spinner";
import { useRequireRole } from "@/src/hooks/useRequireRole";
import { UserRole } from "@/src/types/database";

export default function TherapistLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAllowed, error, retry } = useRequireRole({
    allowedRole: UserRole.THERAPIST,
    redirectTo: "/dashboard",
  });

  if (loading) {
    return (
      <div className="flex min-h-[70dvh] w-full items-center justify-center">
        <Spinner size="lg" label="Securing session..." />
      </div>
    );
  }

  if (error) return <div className="workspace"><div className="clay-card p-8" role="alert"><h1 className="text-xl font-medium text-[#325347]">Your space couldn’t load</h1><p className="mt-3 text-sm text-[#414845]">Please try again to securely open your workspace.</p><button className="clay-link mt-5" onClick={retry}>Try again</button></div></div>;

  if (!user || !isAllowed) {
    return null;
  }

  return (
    <div className="workspace">
      <div className="min-w-0">
        {children}
      </div>
    </div>
  );
}
