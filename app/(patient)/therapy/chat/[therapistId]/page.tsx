"use client";

import { useParams } from "next/navigation";
import { TherapyChatRoom } from "@/src/components/shared/TherapyChatRoom";
import { useAuth } from "@/src/context/AuthContext";
import { TherapyMessageSenderRole } from "@/src/types/database";

export default function TherapyChatPage() {
  const { user } = useAuth();
  const params = useParams<{ therapistId: string }>();
  const therapistId = params?.therapistId ?? "";

  if (!user?.uid) {
    return null;
  }

  return (
    <TherapyChatRoom
      backHref="/therapy"
      callHrefForSession={(sessionId) => `/therapy/session/${sessionId}`}
      patientUid={user.uid}
      senderRole={TherapyMessageSenderRole.USER}
      subtitle={`Therapist ${therapistId.slice(0, 8)}`}
      therapistUid={therapistId}
      title="Therapist messages"
    />
  );
}
