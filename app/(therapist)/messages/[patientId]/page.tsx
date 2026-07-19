"use client";

import { useParams } from "next/navigation";
import { TherapyChatRoom } from "@/src/components/shared/TherapyChatRoom";
import { useAuth } from "@/src/context/AuthContext";
import { TherapyMessageSenderRole } from "@/src/types/database";

export default function TherapistMessagePage() {
  const { user } = useAuth();
  const params = useParams<{ patientId: string }>();
  const patientId = params?.patientId ?? "";

  if (!user?.uid) {
    return null;
  }

  return (
    <TherapyChatRoom
      backHref="/patients"
      callHrefForSession={(sessionId) => `/session/${sessionId}?patientId=${patientId}`}
      patientUid={patientId}
      senderRole={TherapyMessageSenderRole.THERAPIST}
      subtitle={`Patient ${patientId.slice(0, 8)}`}
      therapistUid={user.uid}
      title="Patient messages"
    />
  );
}
