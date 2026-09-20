"use client";

import { useParams, useSearchParams } from "next/navigation";
import { TherapyCallRoom } from "@/src/components/shared/TherapyCallRoom";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import { usePatientConnection } from "@/src/hooks/usePatientConnection";
import { ConnectionStatus } from "@/src/types/database";

export default function TherapistSessionPage() {
  const { user } = useAuth();
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const sessionId = params?.sessionId ?? "";
  const patientUid = searchParams?.get("patientId") ?? "";
  const { connection, loading } = usePatientConnection(patientUid);

  if (!user?.uid || loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Spinner label="Resolving call" />
      </div>
    );
  }

  if (!patientUid) {
    return <p className="rounded-[1.5rem] bg-[#ffdad6] p-5 text-sm font-light leading-6 text-[#93000a]">Call session needs a patientId. Start calls from the patient roster.</p>;
  }

  if (!connection?.relationshipId || connection.status !== ConnectionStatus.ACTIVE || connection.therapistId !== user.uid) {
    return <p role="alert" className="rounded-[1.5rem] bg-[#ffdad6] p-5 text-sm font-light leading-6 text-[#93000a]">This call is no longer available.</p>;
  }
  return <TherapyCallRoom backHref="/patients" relationshipId={connection.relationshipId} sessionId={sessionId} />;
}
