"use client";

import { useParams } from "next/navigation";
import { TherapyChatRoom } from "@/src/components/shared/TherapyChatRoom";
import { useAuth } from "@/src/context/AuthContext";
import { usePatientConnection } from "@/src/hooks/usePatientConnection";
import { Spinner } from "@/src/components/ui/Spinner";
import { ConnectionStatus, TherapyMessageSenderRole } from "@/src/types/database";

export default function TherapistMessagePage() {
  const { user } = useAuth();
  const params = useParams<{ patientId: string }>();
  const patientId = params?.patientId ?? "";
  const { connection, loading } = usePatientConnection(patientId);

  if (!user?.uid || loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Spinner label="Opening conversation" /></div>;
  }
  if (connection?.status === ConnectionStatus.ACTIVE && !connection.relationshipId) {
    return <p role="alert" className="rounded-[1.5rem] bg-[#ffdad6] p-5 text-sm text-[#93000a]">This older connection needs administrator migration before chat can open.</p>;
  }
  if (!connection?.relationshipId || connection.status !== ConnectionStatus.ACTIVE || connection.therapistId !== user.uid) {
    return <p role="alert" className="rounded-[1.5rem] bg-[#ffdad6] p-5 text-sm text-[#93000a]">This patient connection is no longer active.</p>;
  }

  return (
    <TherapyChatRoom
      backHref="/patients"
      callHrefForSession={(sessionId) => `/session/${sessionId}?patientId=${patientId}`}
      relationshipId={connection.relationshipId}
      senderRole={TherapyMessageSenderRole.THERAPIST}
      subtitle={`Patient ${patientId.slice(0, 8)}`}
      title="Patient messages"
    />
  );
}
