"use client";

import { useParams } from "next/navigation";
import { TherapyCallRoom } from "@/src/components/shared/TherapyCallRoom";
import { useAuth } from "@/src/context/AuthContext";
import { usePatientConnection } from "@/src/hooks/usePatientConnection";
import { Spinner } from "@/src/components/ui/Spinner";
import { ConnectionStatus } from "@/src/types/database";

export default function TherapySessionPage() {
  const { user } = useAuth();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId ?? "";
  const { connection, loading } = usePatientConnection(user?.uid ?? "");

  if (!user?.uid || loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Spinner label="Resolving call" /></div>;
  }
  if (!connection?.relationshipId || connection.status !== ConnectionStatus.ACTIVE) {
    return <p role="alert" className="rounded-[1.5rem] bg-[#ffdad6] p-5 text-sm text-[#93000a]">This call is no longer available.</p>;
  }
  return <TherapyCallRoom backHref="/therapy" relationshipId={connection.relationshipId} sessionId={sessionId} />;
}
